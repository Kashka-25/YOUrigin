import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteRemoteSync } from './supabase';

function fakeClient(fail?: string) {
  const calls: string[] = [];
  const client = {
    from: (table: string) => ({
      delete: () => ({
        eq: async (col: string, val: string) => {
          calls.push(`${table}:${col}=${val}`);
          return { error: fail === table ? { message: `${table} refused` } : null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe('starting sync over', () => {
  it("clears only this account's encrypted copy, then its passphrase check", async () => {
    const { client, calls } = fakeClient();
    await deleteRemoteSync(client, 'u1');
    expect(calls).toEqual(['yourigin_records:user_id=u1', 'yourigin_sync_keys:user_id=u1']);
  });

  it('keeps the passphrase check if the copy could not be cleared', async () => {
    const { client, calls } = fakeClient('yourigin_records');
    await expect(deleteRemoteSync(client, 'u1')).rejects.toThrow('yourigin_records refused');
    expect(calls).toEqual(['yourigin_records:user_id=u1']);
  });
});
