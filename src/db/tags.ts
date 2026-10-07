import { db } from './db';
import { newId, normaliseTagName } from '../domain/text';
import { suggestedFamilyFor } from '../domain/constants';

/** Returns name -> id for every name, creating missing tags. Must be safe to
 *  call inside an outer transaction that includes db.tags. */
export async function ensureTags(names: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const clean = [...new Set(names.map(normaliseTagName).filter(Boolean))];
  if (!clean.length) return out;
  const existing = await db.tags.where('name').anyOf(clean).toArray();
  for (const t of existing) out.set(t.name, t.id);
  const now = Date.now();
  const missing = clean.filter((n) => !out.has(n));
  if (missing.length) {
    const created = missing.map((name) => ({
      id: newId(),
      name,
      familyId: suggestedFamilyFor(name),
      createdAt: now,
      updatedAt: now,
    }));
    await db.tags.bulkAdd(created);
    for (const t of created) out.set(t.name, t.id);
  }
  // Callers pass raw names (maybe "#Water"); map those too.
  for (const raw of names) {
    const n = normaliseTagName(raw);
    if (out.has(n)) out.set(raw, out.get(n)!);
  }
  return out;
}

/** Rename; if another tag already has the new name, the two are merged. */
export async function renameTag(id: string, newName: string): Promise<'renamed' | 'merged'> {
  const name = normaliseTagName(newName);
  if (!name) throw new Error('Tag name cannot be empty');
  return db.transaction('rw', db.tags, db.content, async () => {
    const clash = await db.tags.where('name').equals(name).first();
    if (clash && clash.id !== id) {
      const items = await db.content.where('tagIds').equals(id).toArray();
      const now = Date.now();
      for (const i of items) {
        const tagIds = [...new Set(i.tagIds.map((t) => (t === id ? clash.id : t)))];
        await db.content.update(i.id, { tagIds, updatedAt: now });
      }
      await db.tags.delete(id);
      return 'merged';
    }
    await db.tags.update(id, { name, updatedAt: Date.now() });
    return 'renamed';
  });
}

/** Removes the tag from every piece. The writing itself is untouched. */
export async function deleteTag(id: string): Promise<void> {
  await db.transaction('rw', db.tags, db.content, async () => {
    const items = await db.content.where('tagIds').equals(id).toArray();
    const now = Date.now();
    for (const i of items) {
      await db.content.update(i.id, { tagIds: i.tagIds.filter((t) => t !== id), updatedAt: now });
    }
    await db.tags.delete(id);
  });
}

export async function setTagFamily(id: string, familyId: string | null): Promise<void> {
  await db.tags.update(id, { familyId, updatedAt: Date.now() });
}

export async function createFamily(name: string): Promise<string> {
  const id = newId();
  const now = Date.now();
  const order = await db.tagFamilies.count();
  await db.tagFamilies.add({ id, name: name.trim(), order, createdAt: now, updatedAt: now });
  return id;
}

export async function renameFamily(id: string, name: string): Promise<void> {
  await db.tagFamilies.update(id, { name: name.trim(), updatedAt: Date.now() });
}

export async function deleteFamily(id: string): Promise<void> {
  await db.transaction('rw', db.tagFamilies, db.tags, async () => {
    const now = Date.now();
    await db.tags.where('familyId').equals(id).modify({ familyId: null, updatedAt: now });
    await db.tagFamilies.delete(id);
  });
}
