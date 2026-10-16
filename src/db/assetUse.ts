import { db } from './db';

/** True if a piece (its picture or a process shot), a cover or a section opener still uses the asset. */
export async function assetInUse(assetId: string): Promise<boolean> {
  const used =
    (await db.content.filter((c) => c.assetId === assetId || !!c.processAssetIds?.includes(assetId)).count()) +
    (await db.books.filter((b) => b.coverAssetId === assetId).count()) +
    (await db.sections.filter((s) => s.imageAssetId === assetId).count());
  return used > 0;
}
