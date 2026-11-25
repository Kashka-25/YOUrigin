import type { Post, PostEdit } from './model';

// Edit requests: Cassidy types what to change on a post; Claude reads them, makes the
// change and marks each one done with a short note. The list lives on the post itself.

/** Requests still waiting, oldest first (the order they were asked). */
export function openEdits(p: Pick<Post, 'edits'>): PostEdit[] {
  return (p.edits ?? []).filter((e) => !e.doneAt).sort((a, b) => a.createdAt - b.createdAt);
}

/** Requests already done, newest first. */
export function doneEdits(p: Pick<Post, 'edits'>): PostEdit[] {
  return (p.edits ?? []).filter((e) => !!e.doneAt).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
}

/** Live posts with at least one waiting request, the longest-waiting first. */
export function postsWithOpenEdits<T extends Pick<Post, 'edits' | 'deletedAt'>>(posts: T[]): T[] {
  const oldest = (p: T) => openEdits(p)[0]?.createdAt ?? Infinity;
  return posts.filter((p) => !p.deletedAt && openEdits(p).length > 0).sort((a, b) => oldest(a) - oldest(b));
}

/** Short summary for the post editor's row: how many are waiting. */
export function editsSummary(p: Pick<Post, 'edits'>): string {
  const n = openEdits(p).length;
  if (n) return `${n} waiting`;
  return doneEdits(p).length ? 'All done' : 'None';
}
