import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';
import { DEMO, DEMO_OFFLINE_MESSAGE } from '../demo/mode';
import type { PushRow, RemoteRow, SyncTransport } from './engine';
import type { KeyInfo } from './crypto';

let clientPromise: Promise<SupabaseClient> | null = null;

/** Loaded on demand so people who never turn on sync don't download it. */
export function getClient(): Promise<SupabaseClient> {
  // The demo never talks to a server: sync, Showcase, publishing and edit notes all come through here.
  if (DEMO) return Promise.reject(new Error(DEMO_OFFLINE_MESSAGE));
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

  /**
   * Fetches the next records in two light steps, so no single query is heavy
   * enough to hit the database's statement timeout (pictures make records large):
   *  1. what changed, without the encrypted content;
   *  2. the content, in small groups by revision (pictures in smaller ones),
   *     halving a group that still times out.
   * A page stops early once it holds about PULL_PAGE_CHARS of content, so a
   * phone never holds hundreds of pictures at once; the engine asks again.
   */
  async pull(afterRev: number, limit: number): Promise<RemoteRow[]> {
    const { data, error } = await this.client
      .from('yourigin_records')
      .select('tbl,id,updated_at,deleted,iv,rev')
      .gt('rev', afterRev)
      .order('rev', { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    const meta = (data ?? []).map((r) => ({ ...r, updated_at: Number(r.updated_at), rev: Number(r.rev) })) as Omit<RemoteRow, 'payload'>[];

    const out: RemoteRow[] = [];
    let chars = 0;
    let i = 0;
    while (i < meta.length && chars < PULL_PAGE_CHARS) {
      const group: typeof meta = [];
      let weight = 0;
      while (i < meta.length) {
        const m = meta[i];
        const w = m.deleted ? 0 : (HEAVY_TABLES.has(m.tbl) ? HEAVY_WEIGHT : 1);
        if (group.length && weight + w > GROUP_WEIGHT) break;
        group.push(m);
        weight += w;
        i++;
      }
      const live = group.filter((m) => !m.deleted);
      const payloads = live.length ? await this.payloads(live.map((m) => m.rev)) : new Map<number, string>();
      for (const m of group) {
        if (m.deleted) {
          out.push({ ...m, payload: null });
          continue;
        }
        const payload = payloads.get(m.rev);
        // Changed again between the two steps: its newer revision comes in a later page.
        if (payload === undefined) continue;
        out.push({ ...m, payload });
        chars += payload.length;
      }
    }
    return out;
  }

  /** Content for these revisions (ascending), splitting the request if the database runs out of time. */
  private async payloads(revs: number[]): Promise<Map<number, string>> {
    const { data, error } = await this.client
      .from('yourigin_records')
      .select('rev,payload')
      .gte('rev', revs[0])
      .lte('rev', revs[revs.length - 1])
      .order('rev', { ascending: true });
    if (error) {
      if (revs.length > 1 && isTimeout(error)) {
        const mid = Math.ceil(revs.length / 2);
        const [a, b] = [await this.payloads(revs.slice(0, mid)), await this.payloads(revs.slice(mid))];
        return new Map([...a, ...b]);
      }
      throw new Error(error.message);
    }
    const wanted = new Set(revs);
    const out = new Map<number, string>();
    for (const r of (data ?? []) as { rev: number | string; payload: string | null }[]) {
      const rev = Number(r.rev);
      if (wanted.has(rev) && r.payload !== null) out.set(rev, r.payload);
    }
    return out;
  }
}

/** Tables whose records carry pictures, so their content is fetched a few at a time. */
const HEAVY_TABLES = new Set(['assets']);
const HEAVY_WEIGHT = 8;
/** About 40 ordinary records, or 5 pictures, per content request. */
const GROUP_WEIGHT = 40;
/** A page holds at most about this much encrypted content (characters of base64). */
const PULL_PAGE_CHARS = 24_000_000;

function isTimeout(error: { message?: string; code?: string }): boolean {
  return error.code === '57014' || /statement timeout/i.test(error.message ?? '');
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
  // Video pieces are locked with the old passphrase too.
  const { deleteAllCloudClips } = await import('./clipSync');
  await deleteAllCloudClips(client, userId);
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
