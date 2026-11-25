import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { newId } from '../domain/text';
import { MAIN_ACCOUNT, accountOf, canRemoveAccount, cleanHandle, isPoemIdea, mergeAccounts, rememberShownAccount, shownAccount, type PostAccount } from '../posts/accounts';

/** The accounts posts belong to, so an account with posts always shows, saved row or not. */
async function accountsInUse(): Promise<Set<string>> {
  const inUse = new Set<string>();
  await db.posts.each((p) => {
    if (!p.deletedAt) inUse.add(accountOf(p));
  });
  return inUse;
}

async function allAccounts(): Promise<PostAccount[]> {
  return mergeAccounts(await db.postAccounts.toArray(), await accountsInUse());
}

/** Every Instagram account, the main one first. */
export function usePostAccounts(): PostAccount[] | undefined {
  return useLiveQuery(allAccounts, []);
}

/** Renames an account or changes its @handle. A blank name keeps the old one. */
export async function saveAccount(id: string, edit: { name?: string; handle?: string }): Promise<void> {
  const current = (await allAccounts()).find((a) => a.id === id);
  if (!current) return;
  const name = edit.name?.trim() || current.name;
  const handle = edit.handle === undefined ? current.handle : cleanHandle(edit.handle);
  // An account shown only because posts belong to it gets its place in the order now.
  const createdAt = current.createdAt === Number.MAX_SAFE_INTEGER ? Date.now() : current.createdAt;
  await db.postAccounts.put({ ...current, name, handle, createdAt, updatedAt: Date.now() });
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

/**
 * Removes an account. Its posts (set-aside ones too) move to `moveTo` first, so nothing is
 * lost or hidden. The main account stays. Returns how many posts moved.
 */
export async function removeAccount(id: string, moveTo: string = MAIN_ACCOUNT): Promise<number> {
  if (!canRemoveAccount(id) || id === moveTo) return 0;
  return db.transaction('rw', db.posts, db.postAccounts, async () => {
    const ids = await db.posts.filter((p) => accountOf(p) === id).primaryKeys();
    const moved = await movePostsToAccount(ids, moveTo);
    await db.postAccounts.delete(id);
    return moved;
  }).then((moved) => {
    // New posts go to the account being shown, so stop showing this one.
    if (shownAccount() === id) rememberShownAccount(moveTo);
    return moved;
  });
}

/** Ids of the ideas written for the poetry account that still sit in the main one. */
export function usePoemIdeasToMove(): string[] | undefined {
  return useLiveQuery(() => db.posts.filter(isPoemIdea).primaryKeys(), []);
}
