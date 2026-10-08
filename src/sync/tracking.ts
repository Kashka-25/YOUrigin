import Dexie, { type DBCore, type DBCoreMutateRequest, type DBCoreTable } from 'dexie';
import type { Outbox } from './outbox';

/** Tables that sync between devices. Settings stay per-device on purpose. */
export const SYNC_TABLES = [
  'tagFamilies',
  'tags',
  'content',
  'collections',
  'templates',
  'books',
  'sections',
  'entries',
  'relationships',
  'suggestions',
  'revisions',
  'assets',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];
const SYNCED = new Set<string>(SYNC_TABLES);

const REMOTE = '__youriginRemote';

/**
 * Runs `fn` in a read-write transaction whose writes are NOT recorded as local
 * changes — used when applying changes that arrived from the server.
 */
export async function runRemote<T>(db: Dexie, tables: string[], fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', tables, async (tx) => {
    (tx.idbtrans as unknown as Record<string, boolean>)[REMOTE] = true;
    return fn();
  });
}

/**
 * Dexie middleware that records every local add/put/delete on synced tables
 * into the outbox. Deletes become tombstones simply by the record being absent
 * when the outbox is pushed.
 */
export function installChangeTracking(db: Dexie, outbox: Outbox, isEnabled: () => boolean): void {
  db.use({
    stack: 'dbcore',
    name: 'yourigin-change-tracking',
    create(down: DBCore): DBCore {
      return {
        ...down,
        table(name: string): DBCoreTable {
          const table = down.table(name);
          if (!SYNCED.has(name)) return table;
          return {
            ...table,
            async mutate(req: DBCoreMutateRequest) {
              const remote = (req.trans as unknown as Record<string, boolean>)[REMOTE];
              if (remote || !isEnabled()) return table.mutate(req);

              let rangeKeys: string[] = [];
              if (req.type === 'deleteRange') {
                const found = await table.query({
                  trans: req.trans,
                  values: false,
                  query: { index: table.schema.primaryKey, range: req.range },
                });
                rangeKeys = found.result as string[];
              }

              const res = await table.mutate(req);
              const at = Date.now();
              const ok = (i: number) => !res.failures[i];
              let ids: string[] = [];
              if (req.type === 'add' || req.type === 'put') {
                const keys = (res.results ?? req.keys ?? []) as string[];
                ids = keys.filter((k, i) => k != null && ok(i));
              } else if (req.type === 'delete') {
                ids = (req.keys as string[]).filter((_, i) => ok(i));
              } else if (req.type === 'deleteRange') {
                ids = rangeKeys;
              }
              outbox.mark(name, ids.map(String), at);
              return res;
            },
          };
        },
      };
    },
  });
}
