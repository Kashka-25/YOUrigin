import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { createMany } from './content';
import { addToBook } from './books';
import { shrinkImage, type ShrunkImage } from '../io/images';
import { newId } from '../domain/text';
import type { Asset } from '../domain/types';

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,image/svg+xml';

/** Shrinks and stores an image. Returns the stored asset plus size savings. */
export async function saveImage(file: File): Promise<{ asset: Asset; shrunk: ShrunkImage }> {
  const shrunk = await shrinkImage(file);
  const now = Date.now();
  const asset: Asset = {
    id: newId(),
    name: file.name,
    mime: shrunk.mime,
    dataUrl: shrunk.dataUrl,
    width: shrunk.width,
    height: shrunk.height,
    bytes: shrunk.bytes,
    createdAt: now,
    updatedAt: now,
  };
  await db.assets.add(asset);
  return { asset, shrunk };
}

/**
 * Adds images as pieces in the Library (type "Image"; the caption lives in the
 * body). Optionally places them in a book's tray. Returns content ids and the
 * total bytes before/after shrinking.
 */
export async function addImagePieces(files: File[], bookId?: string): Promise<{ ids: string[]; before: number; after: number }> {
  let before = 0;
  let after = 0;
  const saved: { asset: Asset; name: string }[] = [];
  for (const f of files) {
    const { asset, shrunk } = await saveImage(f);
    before += shrunk.originalBytes;
    after += shrunk.bytes;
    saved.push({ asset, name: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() });
  }
  const ids = await createMany(
    saved.map((s) => ({ title: s.name, body: '', type: 'image' as const, status: 'polished' as const, source: { kind: 'import' as const } })),
  );
  await db.transaction('rw', db.content, async () => {
    for (const [i, id] of ids.entries()) await db.content.update(id, { assetId: saved[i].asset.id, imageLayout: 'full-page' });
  });
  if (bookId) await addToBook(bookId, ids, null);
  return { ids, before, after };
}

/** Removes an asset only if nothing (a piece, a cover, a section opener) still uses it. */
export async function removeAssetIfUnused(assetId: string | undefined): Promise<void> {
  if (!assetId) return;
  const used =
    (await db.content.filter((c) => c.assetId === assetId).count()) +
    (await db.books.filter((b) => b.coverAssetId === assetId).count()) +
    (await db.sections.filter((s) => s.imageAssetId === assetId).count());
  if (!used) await db.assets.delete(assetId);
}

export function useAsset(id: string | undefined): Asset | undefined {
  return useLiveQuery(() => (id ? db.assets.get(id) : undefined), [id]);
}

export function useAllAssets(): Asset[] | undefined {
  return useLiveQuery(() => db.assets.orderBy('updatedAt').reverse().toArray(), []);
}
