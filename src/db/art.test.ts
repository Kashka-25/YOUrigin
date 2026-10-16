import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns } from './db';
import { createMany, purgeContent, updateContent } from './content';
import { assetInUse } from './assetUse';
import { removeAssetIfUnused } from './assets';
import { exportBackup, replaceWithBackup } from './backup';
import { artCaption } from '../components/art/art';
import type { Asset } from '../domain/types';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
});

const asset = (id: string): Asset => ({ id, name: id, mime: 'image/png', dataUrl: 'data:,', width: 1, height: 1, bytes: 1, createdAt: 1, updatedAt: 1 });

async function artwork() {
  await db.assets.bulkAdd([asset('final'), asset('sketch'), asset('wip')]);
  const [id] = await createMany([{ title: 'Tide', body: '', type: 'image', status: 'polished' }]);
  await db.content.update(id, { assetId: 'final' });
  await updateContent(id, { processAssetIds: ['sketch', 'wip'], art: { medium: 'Ink', size: 'A4' }, inspiration: false });
  return id;
}

describe('artworks', () => {
  it('keeps progress shots while the artwork uses them', async () => {
    await artwork();
    expect(await assetInUse('sketch')).toBe(true);
    await removeAssetIfUnused('wip');
    expect(await db.assets.get('wip')).toBeDefined();
  });

  it('removes the picture and its progress shots when the artwork is deleted for good', async () => {
    const id = await artwork();
    await purgeContent([id]);
    expect(await db.assets.count()).toBe(0);
  });

  it('keeps artwork details through a backup', async () => {
    const id = await artwork();
    await replaceWithBackup(await exportBackup());
    const item = (await db.content.get(id))!;
    expect(item.art).toEqual({ medium: 'Ink', size: 'A4' });
    expect(item.processAssetIds).toEqual(['sketch', 'wip']);
  });

  it('writes a short caption from the details', () => {
    expect(artCaption({ art: { medium: 'Oil on canvas', size: ' 60×80cm ', madeOn: '2026' } })).toBe('Oil on canvas · 60×80cm · 2026');
    expect(artCaption({ inspiration: true })).toBe('Inspiration');
    expect(artCaption({})).toBe('');
  });
});
