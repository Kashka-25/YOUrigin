import { db } from './db';
import { ensureTags } from './tags';
import type { ContentItem, ContentSource, ContentType, Status } from '../domain/types';
import { newId } from '../domain/text';

export interface NewContent {
  body: string;
  title?: string;
  type: ContentType;
  status: Status;
  tagNames?: string[];
  notes?: string;
  source?: ContentSource;
}

export async function createContent(input: NewContent): Promise<string> {
  const ids = await createMany([input]);
  return ids[0];
}

/** Bulk create in one transaction — used by capture-split and file import. */
export async function createMany(inputs: NewContent[]): Promise<string[]> {
  return db.transaction('rw', db.content, db.tags, async () => {
    const allNames = [...new Set(inputs.flatMap((i) => i.tagNames ?? []))];
    const nameToId = await ensureTags(allNames);
    const base = Date.now();
    const items: ContentItem[] = inputs.map((i, n) => ({
      id: newId(),
      title: i.title ?? '',
      body: i.body,
      type: i.type,
      status: i.status,
      tagIds: [...new Set((i.tagNames ?? []).map((t) => nameToId.get(t)!).filter(Boolean))],
      notes: i.notes ?? '',
      source: i.source ?? { kind: 'capture' },
      keepUnassigned: false,
      archived: false,
      deletedAt: null,
      // Stagger timestamps so bulk imports keep their order when sorted.
      createdAt: base + n,
      updatedAt: base + n,
    }));
    await db.content.bulkAdd(items);
    return items.map((i) => i.id);
  });
}

export type ContentPatch = Partial<
  Pick<ContentItem, 'title' | 'body' | 'type' | 'status' | 'notes' | 'tagIds' | 'keepUnassigned' | 'archived'>
>;

export async function updateContent(id: string, patch: ContentPatch): Promise<void> {
  await db.content.update(id, { ...patch, updatedAt: Date.now() });
}

const REVISION_INTERVAL = 10 * 60 * 1000;

/** Keeps a history of earlier wording. Called before edits are written so the
 *  previous text is always recoverable. At most one snapshot per 10 minutes
 *  unless `force` is set (e.g. before accepting an AI rewrite). */
export async function snapshotRevision(id: string, force = false): Promise<void> {
  const item = await db.content.get(id);
  if (!item) return;
  const last = await db.revisions.where('contentId').equals(id).reverse().sortBy('createdAt');
  const latest = last[0];
  if (latest && latest.body === item.body && latest.title === item.title) return;
  if (!force && latest && Date.now() - latest.createdAt < REVISION_INTERVAL) return;
  await db.revisions.add({ id: newId(), contentId: id, title: item.title, body: item.body, createdAt: Date.now() });
}

// ---- bulk operations (each returns an undo function) -----------------------

export type Undo = () => Promise<void>;

async function withSnapshot(ids: string[], mutate: (items: ContentItem[]) => ContentItem[]): Promise<Undo> {
  const before = (await db.content.bulkGet(ids)).filter((x): x is ContentItem => !!x);
  const now = Date.now();
  const after = mutate(structuredClone(before)).map((i) => ({ ...i, updatedAt: now }));
  await db.content.bulkPut(after);
  return async () => {
    await db.content.bulkPut(before);
  };
}

export async function addTagsToItems(ids: string[], tagNames: string[]): Promise<Undo> {
  const map = await ensureTags(tagNames);
  const tagIds = [...map.values()];
  return withSnapshot(ids, (items) =>
    items.map((i) => ({ ...i, tagIds: [...new Set([...i.tagIds, ...tagIds])] })),
  );
}

export async function removeTagFromItems(ids: string[], tagId: string): Promise<Undo> {
  return withSnapshot(ids, (items) => items.map((i) => ({ ...i, tagIds: i.tagIds.filter((t) => t !== tagId) })));
}

export async function setStatus(ids: string[], status: Status): Promise<Undo> {
  return withSnapshot(ids, (items) => items.map((i) => ({ ...i, status })));
}

export async function setType(ids: string[], type: ContentType): Promise<Undo> {
  return withSnapshot(ids, (items) => items.map((i) => ({ ...i, type })));
}

export async function setArchived(ids: string[], archived: boolean): Promise<Undo> {
  return withSnapshot(ids, (items) => items.map((i) => ({ ...i, archived })));
}

export async function setKeepUnassigned(ids: string[], keep: boolean): Promise<Undo> {
  return withSnapshot(ids, (items) => items.map((i) => ({ ...i, keepUnassigned: keep })));
}

/** Soft delete — moves to Trash. Nothing is lost until the Trash is emptied. */
export async function moveToTrash(ids: string[]): Promise<Undo> {
  const at = Date.now();
  return withSnapshot(ids, (items) => items.map((i) => ({ ...i, deletedAt: at })));
}

export async function restoreFromTrash(ids: string[]): Promise<void> {
  await withSnapshot(ids, (items) => items.map((i) => ({ ...i, deletedAt: null })));
}

/** Permanent removal of content and every reference to it. Only reachable
 *  from the Trash (or undoing a capture) and always behind confirmation. */
export async function purgeContent(ids: string[]): Promise<void> {
  await db.transaction(
    'rw',
    [db.content, db.entries, db.relationships, db.suggestions, db.revisions, db.collections],
    async () => {
      await db.content.bulkDelete(ids);
      await db.entries.where('contentId').anyOf(ids).delete();
      await db.relationships.where('fromId').anyOf(ids).delete();
      await db.relationships.where('toId').anyOf(ids).delete();
      await db.suggestions.where('contentId').anyOf(ids).delete();
      await db.revisions.where('contentId').anyOf(ids).delete();
      const cols = await db.collections.where('contentIds').anyOf(ids).toArray();
      const gone = new Set(ids);
      for (const c of cols) {
        await db.collections.update(c.id, {
          contentIds: c.contentIds.filter((x) => !gone.has(x)),
          updatedAt: Date.now(),
        });
      }
    },
  );
}

/** Store an AI-assisted rewrite as a *new* piece linked to the original. */
export async function saveVariant(originalId: string, body: string, provider: string): Promise<string> {
  const original = await db.content.get(originalId);
  if (!original) throw new Error('Original not found');
  const id = await createContent({
    body,
    title: original.title ? `${original.title} (variant)` : '',
    type: original.type,
    status: original.status,
    notes: `Variant drafted with ${provider} from “${original.title || original.body.slice(0, 40)}”.`,
    source: { kind: 'ai-variant', derivedFromId: originalId },
  });
  await db.content.update(id, { tagIds: original.tagIds });
  const now = Date.now();
  await db.relationships.add({
    id: newId(),
    fromId: id,
    toId: originalId,
    kind: 'variant',
    note: '',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}
