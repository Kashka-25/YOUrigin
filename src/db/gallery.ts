import { db } from './db';
import { addImagePieces } from './assets';
import { createMany } from './content';
import { createPost } from './posts';
import { isImageFile, isVideoFile } from '../io/postMedia';
import { defaultSavers, type MediaSavers } from './postMedia';
import { formatForMedia, type PostMedia } from '../posts/model';
import type { ContentItem } from '../domain/types';

/** A Gallery name from a file name: "IMG_2041.jpg" → "IMG 2041". */
const nameOf = (f: File) => f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Shared';

/**
 * Photos and videos shared in from the phone (or picked) land in the Gallery as pieces.
 * A video is kept on this device (too large to sync) with its still frame as the picture,
 * which does sync; the piece remembers the video by `clipId`.
 */
export async function addToGallery(files: File[], savers: MediaSavers = defaultSavers): Promise<{ ids: string[]; images: number; videos: number }> {
  const images = files.filter((f) => isImageFile(f) && !isVideoFile(f));
  const videos = files.filter((f) => isVideoFile(f));
  const ids: string[] = [];
  if (images.length) ids.push(...(await addImagePieces(images)).ids);
  for (const f of videos) {
    const { clipId, posterAssetId } = await savers.clip(f);
    const [id] = await createMany([{ title: nameOf(f), body: '', type: 'image', status: 'polished', source: { kind: 'import' } }]);
    await db.content.update(id, { clipId, ...(posterAssetId ? { assetId: posterAssetId } : {}), imageLayout: 'full-page' });
    ids.push(id);
  }
  return { ids, images: images.length, videos: videos.length };
}

/** The same picture or video, as post media: nothing is copied. */
export function galleryMedia(item: Pick<ContentItem, 'title' | 'assetId' | 'clipId'>): PostMedia | null {
  if (item.clipId) return { kind: 'clip', clipId: item.clipId, name: item.title || 'Video', ...(item.assetId ? { posterAssetId: item.assetId } : {}) };
  if (item.assetId) return { kind: 'asset', assetId: item.assetId };
  return null;
}

/** Each chosen Gallery piece becomes its own post idea, pointing at the same media. Returns how many. */
export async function ideasFromGallery(itemIds: string[]): Promise<number> {
  const items = (await db.content.bulkGet(itemIds)).filter((i): i is ContentItem => !!i && !i.deletedAt);
  let n = 0;
  for (const item of items) {
    const m = galleryMedia(item);
    if (!m) continue;
    await createPost({ status: 'idea', media: [m], format: formatForMedia([m], 'single-image'), pieceIds: [item.id] });
    n++;
  }
  return n;
}
