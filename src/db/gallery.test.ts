import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns } from './db';
import { addToGallery, carouselFromGallery, galleryMedia, ideasFromGallery } from './gallery';
import { createMany } from './content';
import { isArtwork } from '../components/art/art';
import type { MediaSavers } from './postMedia';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
});

const mp4 = (name: string) => new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])], name, { type: 'video/mp4' });
const savers: MediaSavers = {
  image: async (f) => `asset-${f.name}`,
  clip: async (f) => ({ clipId: `clip-${f.name}`, posterAssetId: `still-${f.name}` }),
};

describe('Gallery for shared photos and videos', () => {
  it('keeps a shared video in the Gallery as a piece with its still frame', async () => {
    const { ids, videos } = await addToGallery([mp4('IMG_2041.mp4')], savers);
    expect(videos).toBe(1);
    const item = (await db.content.get(ids[0]))!;
    expect(item).toMatchObject({ type: 'image', title: 'IMG 2041', clipId: 'clip-IMG_2041.mp4', assetId: 'still-IMG_2041.mp4' });
    expect(isArtwork(item)).toBe(true);
  });

  it('turns Gallery pieces into post ideas that point at the same media', async () => {
    const { ids: [video] } = await addToGallery([mp4('dance.mp4')], savers);
    const [photo] = await createMany([{ title: 'Sunset', body: '', type: 'image', status: 'polished', source: { kind: 'import' } }]);
    await db.content.update(photo, { assetId: 'asset-sunset' });

    expect(await ideasFromGallery([photo, video])).toBe(2);
    const posts = await db.posts.toArray();
    expect(posts.every((p) => p.status === 'idea')).toBe(true);
    const media = posts.flatMap((p) => p.media);
    expect(media).toContainEqual({ kind: 'asset', assetId: 'asset-sunset' });
    expect(media).toContainEqual({ kind: 'clip', clipId: 'clip-dance.mp4', name: 'dance', posterAssetId: 'still-dance.mp4' });
    // Nothing copied: still two pieces, and no new pictures or videos stored.
    expect(await db.content.count()).toBe(2);
    expect(posts.find((p) => p.media[0].kind === 'clip')?.format).toBe('reel');
  });

  it('makes no media from a piece with neither picture nor video', () => {
    expect(galleryMedia({ title: 'x' })).toBeNull();
  });

  it('makes one carousel from several pieces, slides in the order chosen', async () => {
    const ids = await createMany(['One', 'Two', 'Three'].map((title) => ({ title, body: '', type: 'image' as const, status: 'polished' as const, source: { kind: 'import' as const } })));
    for (const [i, id] of ids.entries()) await db.content.update(id, { assetId: `pic-${i + 1}` });
    const postId = await carouselFromGallery([ids[2], ids[0], ids[1]]);
    const post = (await db.posts.get(postId!))!;
    expect(post.format).toBe('carousel');
    expect(post.status).toBe('idea');
    expect(post.media).toEqual([{ kind: 'asset', assetId: 'pic-3' }, { kind: 'asset', assetId: 'pic-1' }, { kind: 'asset', assetId: 'pic-2' }]);
    expect(post.pieceIds).toEqual([ids[2], ids[0], ids[1]]);
    expect(await db.posts.count()).toBe(1);
  });
});
