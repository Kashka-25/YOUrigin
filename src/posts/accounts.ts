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
 * The accounts every device starts with. Editing one saves a row with the same id, which
 * then syncs, so two devices never make two copies of the same account.
 */
export const DEFAULT_ACCOUNTS: PostAccount[] = [
  { id: MAIN_ACCOUNT, name: 'Free the dream', handle: '_freethedream_', createdAt: 0, updatedAt: 0 },
  { id: POETRY_ACCOUNT, name: 'Poetry', handle: '', createdAt: 1, updatedAt: 0 },
];

export function accountOf(p: Pick<Post, 'account'>): string {
  return p.account || MAIN_ACCOUNT;
}

/** The starting accounts with any saved edits laid over them, plus accounts added since, in the order made. */
export function mergeAccounts(saved: PostAccount[]): PostAccount[] {
  const byId = new Map(DEFAULT_ACCOUNTS.map((a) => [a.id, a]));
  for (const a of saved) byId.set(a.id, a);
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
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
