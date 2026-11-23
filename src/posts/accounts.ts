import type { Syncable } from '../domain/types';
import type { Post } from './model';

/**
 * Instagram accounts a post can belong to. Each post belongs to one; the Posts page shows
 * one account at a time, so each has its own calendar, board, ideas and profile grid.
 * Posts made before accounts existed have no `account` and belong to the main one.
 */
export interface PostAccount extends Syncable {
  /** What Cassidy calls it in YOUrigin. */
  name: string;
  /** The Instagram @handle, without the @ (may be empty until it is chosen). */
  handle: string;
}

export const MAIN_ACCOUNT = 'main';
export const POETRY_ACCOUNT = 'poetry';

/**
 * The account every new device starts with: one, unnamed, so anyone can make it theirs.
 * It cannot be removed, because posts with no `account` belong to it. Editing it saves a
 * row with the same id, which then syncs, so two devices never make two copies of it.
 */
export const DEFAULT_ACCOUNTS: PostAccount[] = [{ id: MAIN_ACCOUNT, name: 'My account', handle: '', createdAt: 0, updatedAt: 0 }];

/**
 * What the first version of accounts started every device with. Devices that already had
 * posts keep these as saved rows (database v11), so Cassidy's accounts stay as they were.
 */
export const FIRST_ACCOUNTS: PostAccount[] = [
  { id: MAIN_ACCOUNT, name: 'Free the dream', handle: '_freethedream_', createdAt: 0, updatedAt: 1 },
  { id: POETRY_ACCOUNT, name: 'Poetry', handle: '', createdAt: 1, updatedAt: 1 },
];

export function accountOf(p: Pick<Post, 'account'>): string {
  return p.account || MAIN_ACCOUNT;
}

/**
 * The starting account with any saved edits laid over it, plus accounts added since, in the
 * order made. `inUse` lists the accounts posts belong to: one with no saved row (removed on
 * another device, or not synced here yet) still appears, so no post is ever hidden.
 */
export function mergeAccounts(saved: PostAccount[], inUse: Iterable<string> = []): PostAccount[] {
  const byId = new Map(DEFAULT_ACCOUNTS.map((a) => [a.id, a]));
  for (const a of saved) byId.set(a.id, a);
  for (const id of inUse) {
    if (!byId.has(id)) byId.set(id, { id, name: id === POETRY_ACCOUNT ? 'Poetry' : 'Other account', handle: '', createdAt: Number.MAX_SAFE_INTEGER, updatedAt: 0 });
  }
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}

/** Every account but the main one can be removed; its posts move elsewhere first. */
export function canRemoveAccount(id: string): boolean {
  return id !== MAIN_ACCOUNT;
}

/** "@_freethedream_", or the name while there is no handle yet. */
export function accountLabel(a: Pick<PostAccount, 'name' | 'handle'>): string {
  return a.handle.trim() ? `@${a.handle.trim()}` : a.name;
}

/** "@ my.handle " → "my.handle": Instagram handles are letters, numbers, dots and underscores. */
export function cleanHandle(input: string): string {
  return input
    .trim()
    .replace(/^@+/, '')
    .replace(/[^A-Za-z0-9._]/g, '')
    .toLowerCase()
    .slice(0, 30);
}

const SHOWN_KEY = 'yourigin.posts.account';

/** The account the Posts page is showing on this device; new posts go there. */
export function shownAccount(): string {
  try {
    return localStorage.getItem(SHOWN_KEY) || MAIN_ACCOUNT;
  } catch {
    return MAIN_ACCOUNT;
  }
}

export function rememberShownAccount(id: string): void {
  try {
    localStorage.setItem(SHOWN_KEY, id);
  } catch {
    /* private mode */
  }
}

/** Ideas written for the poetry account: their notes start with "Poem idea:". */
export function isPoemIdea(p: Pick<Post, 'notes' | 'account' | 'deletedAt'>): boolean {
  return !p.deletedAt && accountOf(p) === MAIN_ACCOUNT && /^\s*poem idea:/i.test(p.notes);
}
