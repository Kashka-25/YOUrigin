import type Dexie from 'dexie';
import { open, seal } from './crypto';
import type { Outbox, OutboxEntry } from './outbox';
import { runRemote, SYNC_TABLES, type SyncTable } from './tracking';
import { newId } from '../domain/text';

export interface RemoteRow {
  tbl: string;
  id: string;
  updated_at: number;
  deleted: boolean;
  payload: string | null;
  iv: string | null;
  rev: number;
}

export type PushRow = Omit<RemoteRow, 'rev'>;

/** The server side, abstracted so it can be faked in tests. */
export interface SyncTransport {
  push(rows: PushRow[]): Promise<void>;
  pull(afterRev: number, limit: number): Promise<RemoteRow[]>;
}

export interface SyncCursor {
  get(): Promise<number>;
  set(rev: number): Promise<void>;
}

const PUSH_BATCH = 200;
const PUSH_MAX_CHARS = 3_000_000;
const PULL_PAGE = 500;

type Rec = Record<string, unknown> & { id: string };

/**
 * Two-way sync for one device:
 *  1. pull: apply everything newer than our cursor (skipping records with a
 *     newer unpushed local change), resolving unique-name clashes deterministically;
 *  2. push: send every outbox record — its current value, or a tombstone if it
 *     no longer exists — encrypted, with last-write-wins on the server.
 */
export class SyncEngine {
  constructor(
    private db: Dexie,
    private outbox: Outbox,
    private transport: SyncTransport,
    private key: CryptoKey,
    private cursor: SyncCursor,
  ) {}

  /** First sync on a device: queue every existing record, timestamped by its own last edit. */
  async seed(): Promise<void> {
    for (const tbl of SYNC_TABLES) {
      const rows = (await this.db.table(tbl).toArray()) as Rec[];
      const byAt = new Map<number, string[]>();
      for (const r of rows) {
        const at = Number(r.updatedAt ?? r.createdAt ?? 1);
        byAt.set(at, [...(byAt.get(at) ?? []), r.id]);
      }
      for (const [at, ids] of byAt) this.outbox.mark(tbl, ids, at);
    }
  }

  async syncOnce(): Promise<{ pulled: number; pushed: number }> {
    const pulled = await this.pull();
    const pushed = await this.push();
    return { pulled, pushed };
  }

  async push(): Promise<number> {
    const pending = this.outbox.snapshot();
    let count = 0;
    for (let i = 0; i < pending.length; i += PUSH_BATCH) {
      const batch = pending.slice(i, i + PUSH_BATCH);
      const rows = await this.buildRows(batch);
      // Images make rows large: send in requests of at most ~3 MB.
      let chunk: PushRow[] = [];
      let size = 0;
      for (const r of rows) {
        const n = (r.payload?.length ?? 0) + 200;
        if (chunk.length && size + n > PUSH_MAX_CHARS) {
          await this.transport.push(chunk);
          chunk = [];
          size = 0;
        }
        chunk.push(r);
        size += n;
      }
      if (chunk.length) await this.transport.push(chunk);
      this.outbox.settle(batch);
      count += rows.length;
    }
    return count;
  }

  private async buildRows(batch: OutboxEntry[]): Promise<PushRow[]> {
    const rows: PushRow[] = [];
    const byTable = new Map<string, OutboxEntry[]>();
    for (const e of batch) byTable.set(e.tbl, [...(byTable.get(e.tbl) ?? []), e]);
    for (const [tbl, entries] of byTable) {
      const values = (await this.db.table(tbl).bulkGet(entries.map((e) => e.id))) as (Rec | undefined)[];
      for (const [i, e] of entries.entries()) {
        const v = values[i];
        if (v) {
          const s = await seal(this.key, v);
          rows.push({ tbl, id: e.id, updated_at: e.at, deleted: false, payload: s.payload, iv: s.iv });
        } else {
          rows.push({ tbl, id: e.id, updated_at: e.at, deleted: true, payload: null, iv: null });
        }
      }
    }
    return rows;
  }

  async pull(): Promise<number> {
    let after = await this.cursor.get();
    let total = 0;
    for (;;) {
      const page = await this.transport.pull(after, PULL_PAGE);
      if (!page.length) break;
      await this.apply(page);
      after = page[page.length - 1].rev;
      await this.cursor.set(after);
      total += page.length;
      if (page.length < PULL_PAGE) break;
    }
    return total;
  }

  private async apply(rows: RemoteRow[]): Promise<void> {
    // Later revisions of the same record supersede earlier ones in a page.
    const latest = new Map<string, RemoteRow>();
    for (const r of rows) latest.set(`${r.tbl}\u0000${r.id}`, r);

    const puts = new Map<SyncTable, Rec[]>();
    const deletes = new Map<SyncTable, string[]>();
    const unpushedLocalEdit = new Set<string>();
    for (const r of latest.values()) {
      if (!(SYNC_TABLES as readonly string[]).includes(r.tbl)) continue;
      const tbl = r.tbl as SyncTable;
      const local = this.outbox.get(tbl, r.id);
      if (local && local.at > r.updated_at) continue; // our unpushed change is newer
      if (local) {
        unpushedLocalEdit.add(r.id);
        this.outbox.drop(tbl, r.id);
      }
      if (r.deleted || !r.payload || !r.iv) {
        deletes.set(tbl, [...(deletes.get(tbl) ?? []), r.id]);
      } else {
        const value = await open<Rec>(this.key, { payload: r.payload, iv: r.iv });
        puts.set(tbl, [...(puts.get(tbl) ?? []), value]);
      }
    }

    await this.resolveClashes(puts);
    await this.preserveOverwrittenWording(puts.get('content') ?? [], unpushedLocalEdit);

    await runRemote(this.db, [...SYNC_TABLES], async () => {
      for (const tbl of SYNC_TABLES) {
        const ids = deletes.get(tbl);
        if (ids?.length) await this.db.table(tbl).bulkDelete(ids);
      }
      for (const tbl of SYNC_TABLES) {
        const recs = puts.get(tbl);
        if (!recs?.length) continue;
        try {
          await this.db.table(tbl).bulkPut(recs);
        } catch {
          // A uniqueness clash we could not resolve: apply what we can, one by one.
          for (const r of recs) await this.db.table(tbl).put(r).catch(() => undefined);
        }
      }
    });
  }

  /**
   * Tag names and (book, piece) pairs are unique. If two devices created the
   * "same" thing offline with different ids, the lower id wins on both devices:
   * the losing local record is merged away with normal (synced) writes, and a
   * losing incoming record is dropped — its own device will merge it later.
   */
  private async resolveClashes(puts: Map<SyncTable, Rec[]>): Promise<void> {
    const tags = puts.get('tags');
    if (tags?.length) {
      const keep: Rec[] = [];
      for (const t of tags) {
        const local = (await this.db.table('tags').where('name').equals(String(t.name)).first()) as Rec | undefined;
        if (!local || local.id === t.id) keep.push(t);
        else if (t.id < local.id) {
          await this.mergeTag(local.id, t.id);
          keep.push(t);
        }
      }
      puts.set('tags', keep);
    }
    const entries = puts.get('entries');
    if (entries?.length) {
      const keep: Rec[] = [];
      for (const e of entries) {
        const local = (await this.db
          .table('entries')
          .where('[bookId+contentId]')
          .equals([String(e.bookId), String(e.contentId)])
          .first()) as Rec | undefined;
        if (!local || local.id === e.id) keep.push(e);
        else if (e.id < local.id) {
          await this.db.table('entries').delete(local.id);
          keep.push(e);
        }
      }
      puts.set('entries', keep);
    }
  }

  /**
   * Writing is never silently lost: if an incoming version replaces different
   * local wording, the local wording is saved to the piece's History first.
   * An unpushed local edit is always kept; otherwise at most one snapshot per
   * piece every 10 minutes, so passively received updates don't flood History.
   */
  private async preserveOverwrittenWording(incoming: Rec[], unpushed: Set<string>): Promise<void> {
    if (!incoming.length) return;
    const locals = (await this.db.table('content').bulkGet(incoming.map((r) => r.id))) as (Rec | undefined)[];
    for (const [i, remote] of incoming.entries()) {
      const local = locals[i];
      if (!local || (local.body === remote.body && local.title === remote.title)) continue;
      const recent = (await this.db.table('revisions').where('contentId').equals(local.id).toArray()) as Rec[];
      const latest = recent.reduce((m, r) => Math.max(m, Number(r.createdAt)), 0);
      if (recent.some((r) => r.body === local.body && r.title === local.title)) continue;
      if (!unpushed.has(local.id) && Date.now() - latest < 10 * 60 * 1000) continue;
      await this.db.table('revisions').add({
        id: newId(),
        contentId: local.id,
        title: local.title,
        body: local.body,
        createdAt: Date.now(),
      });
    }
  }

  /** Re-point local pieces from one tag to another, then remove the old tag (both synced). */
  private async mergeTag(fromId: string, toId: string): Promise<void> {
    await this.db.transaction('rw', this.db.table('tags'), this.db.table('content'), async () => {
      const items = (await this.db.table('content').where('tagIds').equals(fromId).toArray()) as Rec[];
      const now = Date.now();
      for (const i of items) {
        const tagIds = [...new Set((i.tagIds as string[]).map((t) => (t === fromId ? toId : t)))];
        await this.db.table('content').update(i.id, { tagIds, updatedAt: now });
      }
      await this.db.table('tags').delete(fromId);
    });
  }
}
