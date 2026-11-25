import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { db, SCHEMA_VERSION, YOUriginDB } from './db';
import { exportBackup, replaceWithBackup } from './backup';
import { createPost, deletePost, importedDraftKeys, linkPiece, movePostInFeed, putMediaBack, savePostDrafts, setPostStatus, takeOutMedia, unlinkPiece } from './posts';
import { createContent } from './content';
import { SYNC_TABLES } from '../sync/tracking';
import { draftsToPosts, parsePostDrafts, resolvePostDrafts } from '../io/importPosts';
import { feedOrder, fromDateTime } from '../posts/model';
import { newId } from '../domain/text';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const sample = () => readFileSync(resolve(__dirname, '../../docs/samples/post-drafts.sample.json'), 'utf8');

describe('posts', () => {
  it('a new post is an idea made by you', async () => {
    const id = await createPost();
    expect(await db.posts.get(id)).toMatchObject({ status: 'idea', origin: { kind: 'cassidy' }, pieceIds: [], deletedAt: null });
  });

  it('links to a piece without copying it, and moves through every status', async () => {
    const pieceId = await createContent({ title: 'Sample poem', body: 'A line about the sea', type: 'poem', status: 'seed', tagNames: [] });
    const id = await createPost({ format: 'quote-card', hook: 'A line about the sea' });
    await linkPiece(id, pieceId);
    await linkPiece(id, pieceId);
    expect((await db.posts.get(id))?.pieceIds).toEqual([pieceId]);
    expect(JSON.stringify(await db.posts.get(id))).not.toContain('Sample poem');

    for (const s of ['draft', 'approved', 'posted'] as const) await setPostStatus(id, s);
    const posted = await db.posts.get(id);
    expect(posted?.status).toBe('posted');
    expect(posted?.approvedAt).toBeTypeOf('number');
    expect(posted?.postedAt).toBeTypeOf('number');
    await setPostStatus(id, 'draft');
    expect(await db.posts.get(id)).toMatchObject({ status: 'draft', approvedAt: null, postedAt: null });

    await unlinkPiece(id, pieceId);
    expect((await db.posts.get(id))?.pieceIds).toEqual([]);
    expect((await db.content.get(pieceId))?.body).toBe('A line about the sea');
  });

  it('rearranging the grid swaps planned times', async () => {
    const a = await createPost({ scheduledAt: fromDateTime('2026-11-23', '19:00'), format: 'reel' });
    const b = await createPost({ scheduledAt: fromDateTime('2026-11-24', '19:00'), format: 'reel' });
    const feed = feedOrder(await db.posts.toArray());
    await movePostInFeed(feed, a, 0);
    expect((await db.posts.get(a))?.scheduledAt).toBe(fromDateTime('2026-11-24', '19:00'));
    expect((await db.posts.get(b))?.scheduledAt).toBe(fromDateTime('2026-11-23', '19:00'));
  });

  it('sync end-to-end encrypted with everything else, and are kept in backups', async () => {
    expect(SYNC_TABLES).toContain('posts');
    const id = await createPost({ caption: 'kept' });
    const backup = await exportBackup();
    await replaceWithBackup({ ...backup, tables: { ...backup.tables, posts: [] } });
    expect(await db.posts.get(id)).toBeUndefined();
    await replaceWithBackup(backup);
    expect((await db.posts.get(id))?.caption).toBe('kept');
  });

  it('set aside posts can be found again', async () => {
    const id = await createPost();
    await deletePost(id);
    expect((await db.posts.get(id))?.deletedAt).toBeTypeOf('number');
  });

  it('upgrading from version 5 keeps everything and adds an empty posts table', async () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(6);
    const name = `upgrade-${newId()}`;
    const old = new Dexie(name);
    old.version(50).stores({
      content: 'id, status, type, createdAt, updatedAt, *tagIds, *projectIds',
      projects: 'id, updatedAt, status, category',
      books: 'id, updatedAt, *projectIds',
      portfolios: 'id, updatedAt',
    });
    await old.open();
    await old.table('content').add({ id: 'keep', body: 'still here' });
    await old.table('portfolios').add({ id: 'folio', updatedAt: 1 });
    old.close();
    const upgraded = new YOUriginDB(name);
    await upgraded.open();
    expect((await upgraded.content.get('keep'))?.body).toBe('still here');
    expect(await upgraded.portfolios.get('folio')).toBeTruthy();
    expect(await upgraded.posts.count()).toBe(0);
    upgraded.close();
    await Dexie.delete(name);
  });
});

describe('importing drafts', () => {
  it('the documented sample file lands as drafts linked to pieces by title', async () => {
    const pieceId = await createContent({ title: 'The Lantern Shore', body: 'Sample words only', type: 'poem', status: 'seed', tagNames: [] });
    const file = resolvePostDrafts(parsePostDrafts(sample(), 'post-drafts.sample.json'), await db.content.toArray(), await importedDraftKeys());
    expect(file.drafts.length).toBeGreaterThanOrEqual(3);
    const saved = await savePostDrafts(draftsToPosts(file));
    expect(saved).toBe(file.drafts.length);
    const posts = await db.posts.toArray();
    expect(posts.every((p) => p.status === 'draft' && p.origin.kind === 'claude')).toBe(true);
    expect(posts.some((p) => p.pieceIds.includes(pieceId))).toBe(true);
  });

  it('a draft that says it is approved still arrives as a draft', async () => {
    const text = JSON.stringify({ kind: 'post-drafts', version: 1, posts: [{ key: 'k1', status: 'approved', format: 'Reel', world: 'Music & Sound', caption: 'Invented caption' }] });
    const file = resolvePostDrafts(parsePostDrafts(text), [], new Set());
    await savePostDrafts(draftsToPosts(file));
    expect((await db.posts.toArray())[0]).toMatchObject({ status: 'draft', format: 'reel', world: 'music-sound', approvedAt: null });
  });

  it('importing the same file again adds nothing and leaves edits alone', async () => {
    const text = JSON.stringify({ kind: 'post-drafts', posts: [{ key: 'same', caption: 'Invented first words' }] });
    await savePostDrafts(draftsToPosts(resolvePostDrafts(parsePostDrafts(text), [], new Set())));
    const [post] = await db.posts.toArray();
    await db.posts.update(post.id, { caption: 'My own words now' });

    const again = resolvePostDrafts(parsePostDrafts(text), [], await importedDraftKeys());
    expect(again.drafts[0]).toMatchObject({ duplicate: true, include: false });
    expect(await savePostDrafts(draftsToPosts({ ...again, drafts: again.drafts.map((d) => ({ ...d, duplicate: false, include: true })) }))).toBe(0);
    expect(await db.posts.count()).toBe(1);
    expect((await db.posts.get(post.id))?.caption).toBe('My own words now');
  });

  it('a draft set aside can be imported again; the set-aside copy stays aside', async () => {
    const text = JSON.stringify({ kind: 'post-drafts', posts: [{ key: 'again', caption: 'Invented words' }] });
    await savePostDrafts(draftsToPosts(resolvePostDrafts(parsePostDrafts(text), [], await importedDraftKeys())));
    const [old] = await db.posts.toArray();
    await deletePost(old.id);

    const again = resolvePostDrafts(parsePostDrafts(text), [], await importedDraftKeys());
    expect(again.drafts[0]).toMatchObject({ duplicate: false, include: true });
    expect(await savePostDrafts(draftsToPosts(again))).toBe(1);
    const live = (await db.posts.toArray()).filter((p) => !p.deletedAt);
    expect(live).toHaveLength(1);
    expect(live[0].id).not.toBe(old.id);
    expect((await db.posts.get(old.id))?.deletedAt).toBeTypeOf('number');

    // and once it's back, the same file adds nothing more
    const third = resolvePostDrafts(parsePostDrafts(text), [], await importedDraftKeys());
    expect(third.drafts[0]).toMatchObject({ duplicate: true, include: false });
  });

  it('never creates pieces, and says which titles it couldn’t find', async () => {
    const text = JSON.stringify({ kind: 'post-drafts', posts: [{ key: 'x', caption: 'c', pieces: [{ title: 'Not in the library' }] }] });
    const file = resolvePostDrafts(parsePostDrafts(text), [], new Set());
    expect(file.drafts[0].warnings.join(' ')).toMatch(/Not in the library/);
    await savePostDrafts(draftsToPosts(file));
    expect(await db.content.count()).toBe(0);
  });

  it('turns away files that aren’t drafts', () => {
    expect(() => parsePostDrafts('not json')).toThrow(/JSON/);
    expect(() => parsePostDrafts(JSON.stringify({ app: 'YOUrigin', tables: {} }))).toThrow(/post drafts/);
    expect(() => parsePostDrafts(JSON.stringify({ kind: 'post-drafts', version: 9, posts: [] }))).toThrow(/newer/);
  });

  it('notes unknown formats, worlds and dates instead of failing', () => {
    const text = JSON.stringify({ kind: 'post-drafts', posts: [{ format: 'hologram', world: 'Space', date: '2026-13-40', caption: 'c' }] });
    const d = parsePostDrafts(text).drafts[0];
    expect(d).toMatchObject({ format: 'single-image', world: 'healing', scheduledAt: null });
    expect(d.warnings).toHaveLength(3);
  });
});

describe('taking slides out of a post', () => {
  const ids = (m: { kind: string; assetId?: string }[]) => m.map((x) => x.assetId ?? x.kind);
  const carousel = () =>
    createPost({
      status: 'draft',
      world: 'worlds-stories',
      account: 'poetry',
      caption: 'Words that stay put',
      media: ['a', 'b', 'c', 'd'].map((assetId) => ({ kind: 'asset' as const, assetId, ...(assetId === 'b' ? { text: [] } : {}) })),
      format: 'carousel',
    });

  it('sends each chosen slide back to Ideas as its own post, in the same world and account', async () => {
    const id = await carousel();
    const made = await takeOutMedia(id, [3, 1], 'ideas', 1000);
    expect(made).toHaveLength(2);
    const post = await db.posts.get(id);
    expect(ids(post!.media)).toEqual(['a', 'c']);
    expect(post).toMatchObject({ format: 'carousel', caption: 'Words that stay put', status: 'draft' });
    const ideas = (await db.posts.bulkGet(made)).map((p) => p!);
    expect(ideas.map((p) => ids(p.media))).toEqual([['b'], ['d']]);
    for (const p of ideas) expect(p).toMatchObject({ status: 'idea', scheduledAt: null, format: 'single-image', world: 'worlds-stories', account: 'poetry', caption: '' });
    // Ideas show newest first: the first slide taken out shows first.
    expect(ideas[0].createdAt).toBeGreaterThan(ideas[1].createdAt);
  });

  it('makes the chosen slides into their own carousel, and one left behind makes a single picture', async () => {
    const id = await carousel();
    const [made, ...more] = await takeOutMedia(id, [0, 2, 3], 'new-post');
    expect(more).toEqual([]);
    expect(await db.posts.get(made)).toMatchObject({ status: 'idea', format: 'carousel', world: 'worlds-stories', account: 'poetry' });
    expect(ids((await db.posts.get(made))!.media)).toEqual(['a', 'c', 'd']);
    expect(await db.posts.get(id)).toMatchObject({ format: 'single-image', media: [{ kind: 'asset', assetId: 'b', text: [] }] });
  });

  it('moves slides without copying them, and undo puts everything back', async () => {
    const id = await carousel();
    const before = (await db.posts.get(id))!;
    const made = await takeOutMedia(id, [0, 1], 'ideas');
    const all = (await db.posts.toArray()).flatMap((p) => ids(p.media));
    expect(all.sort()).toEqual(['a', 'b', 'c', 'd']);
    await putMediaBack(id, before, made);
    expect(await db.posts.get(id)).toMatchObject({ media: before.media, format: 'carousel' });
    for (const m of made) expect((await db.posts.get(m))?.deletedAt).toBeTypeOf('number');
  });

  it('changes nothing when no slides are chosen or the post is gone', async () => {
    const id = await carousel();
    expect(await takeOutMedia(id, [], 'ideas')).toEqual([]);
    expect(await takeOutMedia(id, [9], 'new-post')).toEqual([]);
    expect(await takeOutMedia('missing', [0], 'ideas')).toEqual([]);
    expect(await db.posts.count()).toBe(1);
  });
});
