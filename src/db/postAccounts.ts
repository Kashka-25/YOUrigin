import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { newId } from '../domain/text';
import { accountOf, cleanHandle, isPoemIdea, mergeAccounts, type PostAccount } from '../posts/accounts';

/** Every Instagram account, the starting ones first. */
export function usePostAccounts(): PostAccount[] | undefined {
  return useLiveQuery(() => db.postAccounts.toArray().then(mergeAccounts), []);
}

/** Renames an account or changes its @handle. A blank name keeps the old one. */
export async function saveAccount(id: string, edit: { name?: string; handle?: string }): Promise<void> {
  const current = mergeAccounts(await db.postAccounts.toArray()).find((a) => a.id === id);
  if (!current) return;
  const name = edit.name?.trim() || current.name;
  const handle = edit.handle === undefined ? current.handle : cleanHandle(edit.handle);
  await db.postAccounts.put({ ...current, name, handle, createdAt: current.createdAt || Date.now(), updatedAt: Date.now() });
}

export async function addAccount(name: string, handle = ''): Promise<string> {
  const id = newId();
  const now = Date.now();
  await db.postAccounts.add({ id, name: name.trim() || 'New account', handle: cleanHandle(handle), createdAt: now, updatedAt: now });
  return id;
}

/** Moves posts to another account. Their dates, words and pictures stay as they are. Returns how many moved. */
export async function movePostsToAccount(ids: string[], account: string): Promise<number> {
  return db.transaction('rw', db.posts, async () => {
    const now = Date.now();
    let moved = 0;
    for (const p of await db.posts.bulkGet(ids)) {
      if (!p || accountOf(p) === account) continue;
      await db.posts.update(p.id, { account, updatedAt: now });
      moved++;
    }
    return moved;
  });
}

/** Ids of the ideas written for the poetry account that still sit in the main one. */
export function usePoemIdeasToMove(): string[] | undefined {
  return useLiveQuery(() => db.posts.filter(isPoemIdea).primaryKeys(), []);
}
