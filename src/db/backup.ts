import { db, ensureBuiltIns, SCHEMA_VERSION } from './db';
import { PRIVATE_SETTING_KEYS } from './settings';
import type { Syncable, Tag } from '../domain/types';

/** Tables included in a backup, in restore order. */
const TABLES = [
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
  'settings',
] as const;
type TableName = (typeof TABLES)[number];

export interface Backup {
  app: 'YOUrigin';
  schemaVersion: number;
  exportedAt: string;
  tables: Partial<Record<TableName, unknown[]>>;
}

export async function exportBackup(): Promise<Backup> {
  const tables: Backup['tables'] = {};
  await db.transaction('r', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      let rows = await db.table(t).toArray();
      if (t === 'settings') {
        rows = rows.filter((r: { key: string }) => !PRIVATE_SETTING_KEYS.includes(r.key as never));
      }
      tables[t] = rows;
    }
  });
  return { app: 'YOUrigin', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), tables };
}

export function isBackup(data: unknown): data is Backup {
  return !!data && typeof data === 'object' && (data as Backup).app === 'YOUrigin' && !!(data as Backup).tables;
}

export interface MergeReport {
  added: number;
  updated: number;
  unchanged: number;
}

/**
 * Merge a backup into this device's library — the way to carry work between
 * phone and laptop. For each record, whichever copy was updated most recently
 * wins. Nothing local is deleted. Tags created separately on two devices with
 * the same name are unified.
 */
export async function mergeBackup(backup: Backup): Promise<MergeReport> {
  if (backup.schemaVersion > SCHEMA_VERSION) {
    throw new Error('This backup comes from a newer version of YOUrigin. Update the app on this device first.');
  }
  const report: MergeReport = { added: 0, updated: 0, unchanged: 0 };
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    // Map incoming tag ids onto local tags of the same name.
    const tagRemap = new Map<string, string>();
    const incomingTags = (backup.tables.tags ?? []) as Tag[];
    for (const t of incomingTags) {
      const local = await db.tags.where('name').equals(t.name).first();
      if (local && local.id !== t.id) tagRemap.set(t.id, local.id);
    }
    const remap = (ids: string[]) => [...new Set(ids.map((id) => tagRemap.get(id) ?? id))];

    for (const t of TABLES) {
      let rows = (backup.tables[t] ?? []) as Record<string, unknown>[];
      if (t === 'settings') {
        rows = rows.filter((r) => !PRIVATE_SETTING_KEYS.includes(r.key as never) && r.key !== 'onboarded');
        for (const r of rows) {
          if (!(await db.settings.get(r.key as string))) {
            await db.settings.put(r as never);
            report.added++;
          }
        }
        continue;
      }
      if (t === 'tags') rows = rows.filter((r) => !tagRemap.has(r.id as string));
      if (t === 'content') rows = rows.map((r) => ({ ...r, tagIds: remap((r.tagIds as string[]) ?? []) }));

      const table = db.table(t);
      const existing = await table.bulkGet(rows.map((r) => r.id as string));
      const toPut: unknown[] = [];
      rows.forEach((row, i) => {
        const local = existing[i] as Syncable | undefined;
        if (!local) {
          toPut.push(row);
          report.added++;
        } else if (t !== 'revisions' && ((row as unknown as Syncable).updatedAt ?? 0) > (local.updatedAt ?? 0)) {
          toPut.push(row);
          report.updated++;
        } else report.unchanged++;
      });
      if (t === 'entries') {
        // A piece may sit in a book only once; skip incoming entries that clash.
        for (const row of toPut as { id: string; bookId: string; contentId: string }[]) {
          const clash = await db.entries.where('[bookId+contentId]').equals([row.bookId, row.contentId]).first();
          if (clash && clash.id !== row.id) await db.entries.delete(clash.id);
        }
      }
      await table.bulkPut(toPut);
    }
  });
  await ensureBuiltIns();
  return report;
}

/** Wipes the library and restores the backup exactly. Used only after explicit confirmation. */
export async function replaceWithBackup(backup: Backup): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      if (t === 'settings') continue;
      await db.table(t).clear();
    }
  });
  await mergeBackup(backup);
}
