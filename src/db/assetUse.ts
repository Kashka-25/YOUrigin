import { db } from './db';

/** True if a piece, Work cover, Project cover, section opener or post (an image or a video's still frame) still uses the asset. */
export async function assetInUse(assetId: string): Promise<boolean> {
  const used =
    (await db.content.filter((c) => c.assetId === assetId || !!c.processAssetIds?.includes(assetId)).count()) +
    (await db.books.filter((b) => b.coverAssetId === assetId).count()) +
    (await db.projects.filter((project) => project.coverAssetId === assetId).count()) +
    (await db.sections.filter((s) => s.imageAssetId === assetId).count()) +
    (await db.posts.filter((p) => p.media.some((m) => (m.kind === 'asset' && m.assetId === assetId) || (m.kind === 'clip' && m.posterAssetId === assetId))).count());
  return used > 0;
}
