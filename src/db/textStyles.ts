import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { newId } from '../domain/text';
import type { TextLook, TextStyle } from '../posts/textLayers';

/** Signature styles for words on pictures, oldest first (the order they were made). */
export function useTextStyles(): TextStyle[] | undefined {
  return useLiveQuery(() => db.textStyles.toArray().then((all) => all.sort((a, b) => a.createdAt - b.createdAt)), []);
}

/** Saves a look under a name. Saving again under the same name updates that style. */
export async function saveTextStyle(name: string, look: TextLook): Promise<string> {
  const clean = name.trim() || 'My style';
  const now = Date.now();
  const same = (await db.textStyles.toArray()).find((s) => s.name.toLocaleLowerCase() === clean.toLocaleLowerCase());
  if (same) {
    await db.textStyles.update(same.id, { look, updatedAt: now });
    return same.id;
  }
  const id = newId();
  await db.textStyles.add({ id, name: clean, look, createdAt: now, updatedAt: now });
  return id;
}

export async function renameTextStyle(id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (clean) await db.textStyles.update(id, { name: clean, updatedAt: Date.now() });
}

export async function deleteTextStyle(id: string): Promise<void> {
  await db.textStyles.delete(id);
}
