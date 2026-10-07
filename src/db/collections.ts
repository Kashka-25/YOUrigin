import { db } from './db';
import type { RelationshipKind } from '../domain/types';
import { newId } from '../domain/text';

export async function createCollection(name: string, contentIds: string[] = [], description = ''): Promise<string> {
  const id = newId();
  const now = Date.now();
  await db.collections.add({
    id,
    name: name.trim() || 'Untitled collection',
    description,
    contentIds: [...new Set(contentIds)],
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/** Returns an undo function. */
export async function addToCollection(id: string, contentIds: string[]): Promise<() => Promise<void>> {
  const before = await db.collections.get(id);
  if (!before) throw new Error('Collection not found');
  await db.collections.update(id, {
    contentIds: [...new Set([...before.contentIds, ...contentIds])],
    updatedAt: Date.now(),
  });
  return async () => {
    await db.collections.put(before);
  };
}

export async function removeFromCollection(id: string, contentIds: string[]): Promise<void> {
  const c = await db.collections.get(id);
  if (!c) return;
  const drop = new Set(contentIds);
  await db.collections.update(id, { contentIds: c.contentIds.filter((x) => !drop.has(x)), updatedAt: Date.now() });
}

export async function updateCollection(id: string, patch: { name?: string; description?: string }): Promise<void> {
  await db.collections.update(id, { ...patch, updatedAt: Date.now() });
}

/** Removes the grouping only; the pieces remain in the Library. */
export async function deleteCollection(id: string): Promise<void> {
  await db.collections.delete(id);
}

// ---- relationships ---------------------------------------------------------

export async function linkContent(fromId: string, toId: string, kind: RelationshipKind = 'related'): Promise<void> {
  if (fromId === toId) return;
  const exists = await db.relationships
    .where('fromId')
    .anyOf([fromId, toId])
    .filter((r) => (r.fromId === fromId && r.toId === toId) || (r.fromId === toId && r.toId === fromId))
    .first();
  if (exists) return;
  const now = Date.now();
  await db.relationships.add({ id: newId(), fromId, toId, kind, note: '', createdAt: now, updatedAt: now });
}

export async function unlink(id: string): Promise<void> {
  await db.relationships.delete(id);
}
