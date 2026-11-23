import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import JSZip from 'jszip';
import { db, SCHEMA_VERSION, YOUriginDB } from './db';
import { createPost } from './posts';
import { attachMediaToPosts, fillMedia, removeMediaIfUnused, saveClip, withMediaFiles, type MediaSavers } from './postMedia';
import { exportBackup } from './backup';
import { SYNC_TABLES } from '../sync/tracking';
import { collectImportFiles, findMedia, mediaKey } from '../io/postMedia';
import { draftsToPosts, parsePostDrafts } from '../io/importPosts';
import { newId } from '../domain/text';
import type { PostMedia } from '../posts/model';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const jpg = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], name, { type: 'image/jpeg' });
const mp4 = (name: string) => new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], name, { type: 'video/mp4' });

/** Stand-ins for storing pictures and videos (the browser does the real decoding). */
function fakeSavers() {
  const calls = { image: [] as string[], clip: [] as string[] };
  const savers: MediaSavers = {
    image: async (f) => {
      calls.image.push(f.name);
      return `asset-${f.name}`;
    },
    clip: async (f) => {
      calls.clip.push(f.name);
      return { clipId: `clip-${f.name}`, posterAssetId: `still-${f.name}` };
    },
  };
  return { savers, calls };
}

const drafts = JSON.stringify({
  kind: 'post-drafts',
  version: 1,
  posts: [
    { key: 'a', format: 'carousel', world: 'healing', caption: 'Invented', media: [{ name: 'a-01.jpg' }, { name: 'a-02.jpg' }] },
    { key: 'b', format: 'reel', world: 'coco-making', caption: 'Invented', media: ['b-reel.mp4'] },
    { key: 'c', format: 'single-image', world: 'healing', caption: 'Invented', media: ['shared.jpg', 'not-picked.jpg'] },
    { key: 'd', format: 'single-image', world: 'healing', caption: 'Invented', media: ['Shared.JPG'] },
  ],
});

describe('picking media with drafts', () => {
  it('sorts picked files into the drafts file and media, matching names by file name only', async () => {
    const { drafts: found, media } = await collectImportFiles([new File([drafts], 'drafts.json', { type: 'application/json' }), jpg('a-01.jpg'), mp4('b-reel.mp4'), new File(['x'], 'notes.txt')]);
    expect(found.map((f) => f.name)).toEqual(['drafts.json']);
    expect([...media.keys()]).toEqual(['a-01.jpg', 'b-reel.mp4']);
    expect(findMedia(media, 'To post/2026-11-23/A-01.JPG')?.name).toBe('a-01.jpg');
    expect(mediaKey('C:\\To post\\x\\Slide-1.jpg')).toBe('slide-1.jpg');
  });

  it('opens a .zip holding the drafts file and its media in folders', async () => {
    const zip = new JSZip();
    zip.file('Claude - posts/yourigin-drafts.json', drafts);
    zip.file('Claude - posts/a/a-01.jpg', new Uint8Array([1, 2, 3]));
    zip.file('Claude - posts/b/b-reel.mp4', new Uint8Array([4, 5, 6]));
    zip.file('__MACOSX/a/._a-01.jpg', new Uint8Array([9]));
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const { drafts: found, media } = await collectImportFiles([new File([bytes.buffer as ArrayBuffer], 'posts.zip', { type: 'application/zip' })]);
    expect(found.map((f) => f.name)).toEqual(['yourigin-drafts.json']);
    expect([...media.keys()].sort()).toEqual(['a-01.jpg', 'b-reel.mp4']);
    expect(media.get('b-reel.mp4')?.type).toBe('video/mp4');
  });
});

describe('media for posts', () => {
  it('imported drafts get their pictures and videos; a file shared by two posts is stored once', async () => {
    const { savers, calls } = fakeSavers();
    const files = new Map([jpg('a-01.jpg'), jpg('a-02.jpg'), mp4('b-reel.mp4'), jpg('shared.jpg')].map((f) => [mediaKey(f.name), f]));
    const posts = await withMediaFiles(draftsToPosts(parsePostDrafts(drafts)), files, savers);
    expect(posts[0].media).toEqual([{ kind: 'asset', assetId: 'asset-a-01.jpg' }, { kind: 'asset', assetId: 'asset-a-02.jpg' }]);
    expect(posts[1].media).toEqual([{ kind: 'clip', name: 'b-reel.mp4', clipId: 'clip-b-reel.mp4', posterAssetId: 'still-b-reel.mp4' }]);
    // the file that wasn't picked stays a file name, in its place
    expect(posts[2].media).toEqual([{ kind: 'asset', assetId: 'asset-shared.jpg' }, { kind: 'file', name: 'not-picked.jpg' }]);
    expect(posts[3].media).toEqual([{ kind: 'asset', assetId: 'asset-shared.jpg' }]);
    expect(calls.image.filter((n) => n === 'shared.jpg')).toHaveLength(1);
  });

  it('without media picked, drafts keep their file names', async () => {
    const posts = await withMediaFiles(draftsToPosts(parsePostDrafts(drafts)), new Map(), fakeSavers().savers);
    expect(posts[0].media).toEqual([{ kind: 'file', name: 'a-01.jpg' }, { kind: 'file', name: 'a-02.jpg' }]);
  });

  it('media added later fills posts already here that name it, keeping their order', async () => {
    const id = await createPost({ media: [{ kind: 'file', name: 'one.jpg' }, { kind: 'asset', assetId: 'kept' }, { kind: 'file', name: 'two.mp4' }] });
    const other = await createPost({ media: [{ kind: 'file', name: 'elsewhere.jpg' }] });
    const { savers } = fakeSavers();
    const r = await attachMediaToPosts(new Map([jpg('one.jpg'), mp4('two.mp4')].map((f) => [mediaKey(f.name), f])), savers);
    expect(r).toEqual({ posts: 1, files: 2, placed: 2 });
    expect((await db.posts.get(id))?.media).toEqual([
      { kind: 'asset', assetId: 'asset-one.jpg' },
      { kind: 'asset', assetId: 'kept' },
      { kind: 'clip', name: 'two.mp4', clipId: 'clip-two.mp4', posterAssetId: 'still-two.mp4' },
    ]);
    expect((await db.posts.get(other))?.media).toEqual([{ kind: 'file', name: 'elsewhere.jpg' }]);
  });

  it('fillMedia leaves media that is already stored alone', async () => {
    const media: PostMedia[] = [{ kind: 'asset', assetId: 'x' }];
    expect(await fillMedia(media, new Map([['x', jpg('x')]]), fakeSavers().savers)).toEqual({ media, filled: 0 });
  });
});

describe('videos', () => {
  it('a video is kept on this device, never synced or backed up, and removed once no post uses it', async () => {
    const { clipId, posterAssetId } = await saveClip(mp4('reel.mp4'), async () => ({ width: 1080, height: 1920, duration: 19, poster: null }));
    expect(posterAssetId).toBeUndefined();
    const stored = await db.clips.get(clipId);
    expect(stored).toMatchObject({ name: 'reel.mp4', mime: 'video/mp4', width: 1080, height: 1920, duration: 19 });
    expect(SYNC_TABLES).not.toContain('clips');
    expect(Object.keys((await exportBackup()).tables)).not.toContain('clips');

    const media: PostMedia = { kind: 'clip', clipId, name: 'reel.mp4' };
    const id = await createPost({ media: [media] });
    await removeMediaIfUnused(media);
    expect(await db.clips.get(clipId)).toBeTruthy();
    await db.posts.update(id, { media: [] });
    await removeMediaIfUnused(media);
    expect(await db.clips.get(clipId)).toBeUndefined();
  });

  it('upgrading from version 6 keeps posts and adds an empty clips table', async () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(7);
    const name = `upgrade-${newId()}`;
    const old = new Dexie(name);
    old.version(60).stores({ posts: 'id, updatedAt, status, scheduledAt, world, *pieceIds', assets: 'id, updatedAt' });
    await old.open();
    await old.table('posts').add({ id: 'p1', caption: 'still here', media: [{ kind: 'file', name: 'x.jpg' }] });
    old.close();
    const upgraded = new YOUriginDB(name);
    await upgraded.open();
    expect((await upgraded.posts.get('p1'))?.caption).toBe('still here');
    expect(await upgraded.clips.count()).toBe(0);
    upgraded.close();
    await Dexie.delete(name);
  });
});

describe('ideas and the format media suggests', () => {
  it('a video makes a Reel, several pictures a carousel, one picture a single image; quote cards and Stories stay', async () => {
    const { formatForMedia } = await import('../posts/model');
    const pic: PostMedia = { kind: 'asset', assetId: 'p' };
    const vid: PostMedia = { kind: 'clip', clipId: 'v', name: 'v.mp4' };
    expect(formatForMedia([pic], 'single-image')).toBe('single-image');
    expect(formatForMedia([pic, pic], 'single-image')).toBe('carousel');
    expect(formatForMedia([pic], 'carousel')).toBe('single-image');
    expect(formatForMedia([vid], 'carousel')).toBe('reel');
    expect(formatForMedia([pic, pic], 'reel')).toBe('reel');
    expect(formatForMedia([pic, pic], 'quote-card')).toBe('quote-card');
    expect(formatForMedia([vid], 'story')).toBe('story');
    expect(formatForMedia([], 'carousel')).toBe('carousel');
  });

  it('each photo or video kept as an idea becomes its own undated Idea, newest first, in the order picked', async () => {
    const { addIdeas } = await import('./postMedia');
    const n = await addIdeas([jpg('one.jpg'), mp4('two.mp4'), new File(['x'], 'notes.txt')], fakeSavers().savers);
    expect(n).toBe(2);
    const ideas = (await db.posts.toArray()).sort((a, b) => b.createdAt - a.createdAt);
    expect(ideas.map((p) => [p.status, p.scheduledAt, p.format, p.media[0].kind])).toEqual([
      ['idea', null, 'single-image', 'asset'],
      ['idea', null, 'reel', 'clip'],
    ]);
  });

  it('combining ideas puts their media in one post, in the order chosen, and sets the others aside', async () => {
    const { combinePosts } = await import('./posts');
    const a = await createPost({ media: [{ kind: 'asset', assetId: 'a' }], notes: 'first' });
    const b = await createPost({ media: [{ kind: 'asset', assetId: 'b' }], caption: 'Invented words', hashtags: ['#one'] });
    const c = await createPost({ media: [{ kind: 'asset', assetId: 'c' }], hashtags: ['#one', '#two'], notes: 'third' });
    expect(await combinePosts([c, a, b])).toBe(c);
    const combined = await db.posts.get(c);
    expect(combined?.media.map((m) => (m.kind === 'asset' ? m.assetId : ''))).toEqual(['c', 'a', 'b']);
    expect(combined).toMatchObject({ format: 'carousel', caption: 'Invented words', hashtags: ['#one', '#two'], notes: 'third\n\nfirst', deletedAt: null });
    expect((await db.posts.get(a))?.deletedAt).toBeTypeOf('number');
    expect((await db.posts.get(b))?.deletedAt).toBeTypeOf('number');
  });
});

describe('a video imported on another device', () => {
  it('can be added on this device under the same id, so the post plays here and nothing synced changes', async () => {
    const { addClipOnThisDevice } = await import('./postMedia');
    const id = await createPost({ media: [{ kind: 'clip', clipId: 'from-phone', name: 'reel.mp4', posterAssetId: 'still' }] });
    const before = await db.posts.get(id);
    expect(await db.clips.get('from-phone')).toBeUndefined();
    await addClipOnThisDevice('from-phone', mp4('reel.mp4'), async () => ({ width: 1080, height: 1920, duration: 56, poster: null }));
    expect(await db.clips.get('from-phone')).toMatchObject({ name: 'reel.mp4', duration: 56 });
    expect(await db.posts.get(id)).toEqual(before);
  });
});

describe('a video cover', () => {
  it('a new cover replaces the old one on that video only, and says which picture it replaced', async () => {
    const { withCover } = await import('./postMedia');
    const media: PostMedia[] = [
      { kind: 'asset', assetId: 'slide' },
      { kind: 'clip', clipId: 'v', name: 'reel.mp4', posterAssetId: 'old-still' },
    ];
    expect(withCover(media, 1, 'new-cover')).toEqual({
      media: [{ kind: 'asset', assetId: 'slide' }, { kind: 'clip', clipId: 'v', name: 'reel.mp4', posterAssetId: 'new-cover' }],
      replaced: 'old-still',
    });
    // not a video: nothing changes
    expect(withCover(media, 0, 'new-cover')).toEqual({ media });
    // a video without a cover yet gets one, with nothing to replace
    expect(withCover([{ kind: 'clip', clipId: 'v', name: 'reel.mp4' }], 0, 'first')).toEqual({ media: [{ kind: 'clip', clipId: 'v', name: 'reel.mp4', posterAssetId: 'first' }] });
  });
});

describe('redrawn pictures', () => {
  it('re-importing swaps in the new pictures, keeps every word, and tidies away old pictures', async () => {
    const { updatePictures } = await import('./postMedia');
    const { postsByDraftKey } = await import('./posts');
    const { draftsToPosts, parsePostDrafts } = await import('../io/importPosts');
    const text = JSON.stringify({ kind: 'post-drafts', posts: [{ key: 'realms', format: 'carousel', caption: 'Invented first words', date: '2026-11-25', time: '19:00', media: ['a-1.jpg', 'a-2.jpg'] }] });
    const [post] = draftsToPosts(parsePostDrafts(text));
    await db.posts.add({ ...post, media: [{ kind: 'asset', assetId: 'old-1' }, { kind: 'asset', assetId: 'old-2' }] });
    await db.assets.bulkAdd(['old-1', 'old-2'].map((id) => ({ id, name: id, mime: 'image/jpeg', dataUrl: 'data:,', width: 1, height: 1, bytes: 1, createdAt: 1, updatedAt: 1 })));
    // Cassidy edits the words and approves it
    await db.posts.update(post.id, { caption: 'My own words', hook: 'My hook', status: 'approved' });

    const id = (await postsByDraftKey()).get('realms');
    expect(id).toBe(post.id);
    const files = new Map([jpg('a-1.jpg'), jpg('a-2.jpg'), jpg('a-3.jpg')].map((f) => [mediaKey(f.name), f]));
    const names = [{ name: 'a-1.jpg' }, { name: 'a-2.jpg' }, { name: 'a-3.jpg' }];
    expect(await updatePictures(id!, names, files, fakeSavers().savers)).toBe(true);

    const after = await db.posts.get(post.id);
    expect(after?.media.map((m) => (m.kind === 'asset' ? m.assetId : ''))).toEqual(['asset-a-1.jpg', 'asset-a-2.jpg', 'asset-a-3.jpg']);
    expect(after).toMatchObject({ caption: 'My own words', hook: 'My hook', status: 'approved', format: 'carousel', scheduledAt: post.scheduledAt });
    expect(await db.assets.get('old-1')).toBeUndefined();
    expect(await db.assets.get('old-2')).toBeUndefined();
  });

  it('keeps words placed on a picture when that picture is redrawn', async () => {
    const { updatePictures } = await import('./postMedia');
    const { newTextLayer } = await import('../posts/textLayers');
    const words = [{ ...newTextLayer({ font: 'cinzel' }), text: 'Seven realms' }];
    const id = await createPost({ media: [{ kind: 'asset', assetId: 'was-1', text: words }, { kind: 'asset', assetId: 'was-2' }] });
    const files = new Map([jpg('b-1.jpg'), jpg('b-2.jpg')].map((f) => [mediaKey(f.name), f]));
    expect(await updatePictures(id, [{ name: 'b-1.jpg' }, { name: 'b-2.jpg' }], files, fakeSavers().savers)).toBe(true);
    const after = (await db.posts.get(id))!;
    expect(after.media[0]).toEqual({ kind: 'asset', assetId: 'asset-b-1.jpg', text: words });
    expect(after.media[1]).toEqual({ kind: 'asset', assetId: 'asset-b-2.jpg' });
  });

  it('changes nothing when none of the named pictures were picked', async () => {
    const { updatePictures } = await import('./postMedia');
    const id = await createPost({ media: [{ kind: 'asset', assetId: 'keep' }] });
    expect(await updatePictures(id, [{ name: 'missing.jpg' }], new Map(), fakeSavers().savers)).toBe(false);
    expect((await db.posts.get(id))?.media).toEqual([{ kind: 'asset', assetId: 'keep' }]);
  });
});
