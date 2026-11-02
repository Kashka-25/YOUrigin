import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';
import type { PushRow, RemoteRow, SyncTransport } from './engine';
import type { KeyInfo } from './crypto';

let clientPromise: Promise<SupabaseClient> | null = null;

/** Loaded on demand so people who never turn on sync don't download it. */
export function getClient(): Promise<SupabaseClient> {
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'yourigin.auth', detectSessionInUrl: false },
    }),
  );
  return clientPromise;
}

export class SupabaseTransport implements SyncTransport {
  constructor(private client: SupabaseClient) {}

  async push(rows: PushRow[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await this.client.rpc('yourigin_push', { rows });
    if (error) throw new Error(error.message);
  }

  async pull(afterRev: number, limit: number): Promise<RemoteRow[]> {
    const { data, error } = await this.client
      .from('yourigin_records')
      .select('tbl,id,updated_at,deleted,payload,iv,rev')
      .gt('rev', afterRev)
      .order('rev', { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ ...r, updated_at: Number(r.updated_at), rev: Number(r.rev) })) as RemoteRow[];
  }
}

export async function fetchKeyInfo(client: SupabaseClient): Promise<KeyInfo | null> {
  const { data, error } = await client.from('yourigin_sync_keys').select('salt,verifier,verifier_iv').maybeSingle();
  if (error) throw new Error(error.message);
  return data as KeyInfo | null;
}

/**
 * Forgotten passphrase: removes this account's encrypted copy and its
 * passphrase check from the server, so a new passphrase can be chosen.
 * Row-level security limits both deletes to the signed-in account.
 */
export async function deleteRemoteSync(client: SupabaseClient, userId: string): Promise<void> {
  const records = await client.from('yourigin_records').delete().eq('user_id', userId);
  if (records.error) throw new Error(records.error.message);
  const key = await client.from('yourigin_sync_keys').delete().eq('user_id', userId);
  if (key.error) throw new Error(key.error.message);
}

export async function saveKeyInfo(client: SupabaseClient, info: KeyInfo): Promise<void> {
  const { error } = await client.from('yourigin_sync_keys').insert(info);
  if (error) {
    // RLS rejects accounts that are not on the allowlist.
    if (/row-level security/i.test(error.message)) throw new Error('This account is not allowed to use YOUrigin sync.');
    throw new Error(error.message);
  }
}
