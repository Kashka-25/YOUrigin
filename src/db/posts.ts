import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { formatForMedia, moveInFeed, moveStatus, newPost, type Post, type PostStatus } from '../posts/model';

// Posts live on this device and sync end-to-end encrypted like everything else.
// These are the only functions that write them.

export function usePosts(): Post[] | undefined {
  return useLiveQuery(() => db.posts.filter((p) => !p.deletedAt).toArray(), []);
}

export function usePost(id: string | undefined): Post | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.posts.get(id)) ?? null) : null), [id]);
}

export async function createPost(patch: Partial<Post> = {}): Promise<string> {
  const p = newPost(patch);
  await db.posts.add(p);
  return p.id;
}

export type PostPatch = Partial<Omit<Post, 'id' | 'createdAt' | 'updatedAt' | 'origin'>>;

export async function updatePost(id: string, patch: PostPatch): Promise<void> {
  await db.posts.update(id, { ...patch, updatedAt: Date.now() });
}

export async function setPostStatus(id: string, status: PostStatus): Promise<void> {
  await db.transaction('rw', db.posts, async () => {
    const post = await db.posts.get(id);
    if (!post) throw new Error('This post no longer exists.');
    await db.posts.update(id, { ...moveStatus(post, status), updatedAt: Date.now() });
  });
}

export async function linkPiece(id: string, pieceId: string): Promise<void> {
  await db.transaction('rw', db.posts, async () => {
    const post = await db.posts.get(id);
    if (!post || post.pieceIds.includes(pieceId)) return;
    await db.posts.update(id, { pieceIds: [...post.pieceIds, pieceId], updatedAt: Date.now() });
  });
}

export async function unlinkPiece(id: string, pieceId: string): Promise<void> {
  await db.transaction('rw', db.posts, async () => {
    const post = await db.posts.get(id);
    if (!post) return;
    await db.posts.update(id, { pieceIds: post.pieceIds.filter((p) => p !== pieceId), updatedAt: Date.now() });
  });
}

/** Moves a post to another place in the feed grid; posts in between take the freed times. */
export async function movePostInFeed(feed: Post[], postId: string, toIndex: number): Promise<number> {
  const changes = moveInFeed(feed, postId, toIndex);
  if (!changes.length) return 0;
  const now = Date.now();
  await db.transaction('rw', db.posts, async () => {
    for (const c of changes) await db.posts.update(c.id, { scheduledAt: c.scheduledAt, updatedAt: now });
  });
  return changes.length;
}

/** Sets a post aside; it can be brought back. */
export async function deletePost(id: string): Promise<void> {
  await updatePost(id, { deletedAt: Date.now() });
}

export async function restorePost(id: string): Promise<void> {
  await updatePost(id, { deletedAt: null });
}

/**
 * Draft keys already here, so the same file never adds a post twice. A post
 * set aside doesn't count: setting a draft aside and importing it again brings
 * back a fresh copy (the set-aside one stays set aside).
 */
export async function importedDraftKeys(): Promise<Set<string>> {
  const all = await db.posts.toArray();
  return new Set(all.flatMap((p) => (p.origin.kind === 'claude' && !p.deletedAt ? [p.origin.draftKey] : [])));
}

/** Saves reviewed drafts. Skips any whose key is already here and not set aside, so nothing edited is overwritten. */
export async function savePostDrafts(posts: Post[]): Promise<number> {
  return db.transaction('rw', db.posts, async () => {
    const keys = await importedDraftKeys();
    const fresh = posts.filter((p) => p.origin.kind !== 'claude' || !keys.has(p.origin.draftKey));
    await db.posts.bulkAdd(fresh.map((p) => ({ ...p, status: 'draft' as const, approvedAt: null, postedAt: null })));
    return fresh.length;
  });
}

/**
 * Combines posts (usually ideas) into the first one, in the order given: its
 * media gains the others' media, the format follows the media (several pictures
 * make a carousel), empty words are filled from the others, and the others are
 * set aside so they can be brought back. Returns the combined post's id.
 */
export async function combinePosts(ids: string[]): Promise<string | null> {
  if (ids.length < 2) return ids[0] ?? null;
  return db.transaction('rw', db.posts, async () => {
    const posts = (await db.posts.bulkGet(ids)).filter((p): p is Post => !!p && !p.deletedAt);
    if (posts.length < 2) return posts[0]?.id ?? null;
    const [first, ...rest] = posts;
    const pick = (k: 'hook' | 'caption' | 'cta' | 'altText') => first[k].trim() || rest.find((p) => p[k].trim())?.[k] || '';
    const media = posts.flatMap((p) => p.media);
    const now = Date.now();
    await db.posts.update(first.id, {
      media,
      format: formatForMedia(media, first.format),
      hook: pick('hook'),
      caption: pick('caption'),
      cta: pick('cta'),
      altText: pick('altText'),
      hashtags: [...new Set(posts.flatMap((p) => p.hashtags))],
      pieceIds: [...new Set(posts.flatMap((p) => p.pieceIds))],
      notes: posts.map((p) => p.notes.trim()).filter(Boolean).join('\n\n'),
      updatedAt: now,
    });
    for (const p of rest) await db.posts.update(p.id, { deletedAt: now, updatedAt: now });
    return first.id;
  });
}

/** The live (not set aside) post each imported draft key belongs to. */
export async function postsByDraftKey(): Promise<Map<string, string>> {
  const all = await db.posts.toArray();
  return new Map(all.flatMap((p) => (p.origin.kind === 'claude' && !p.deletedAt ? [[p.origin.draftKey, p.id] as const] : [])));
}
