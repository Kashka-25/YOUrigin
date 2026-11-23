import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, SCHEMA_VERSION, YOUriginDB } from './db';
import { deleteTextStyle, renameTextStyle, saveTextStyle } from './textStyles';
import { exportBackup } from './backup';
import { SYNC_TABLES } from '../sync/tracking';
import { lookOf, newTextLayer } from '../posts/textLayers';
import { newId } from '../domain/text';

beforeEach(async () => {
  await db.textStyles.clear();
});

describe('signature styles', () => {
  it('saves a named look, and saving the same name again updates it', async () => {
    const gold = lookOf(newTextLayer({ font: 'cinzel', colour: '#d4a85a' }));
    const id = await saveTextStyle('  YOU gold ', gold);
    expect(await db.textStyles.get(id)).toMatchObject({ name: 'YOU gold', look: gold });
    const cream = { ...gold, colour: '#f6efe2' };
    expect(await saveTextStyle('you GOLD', cream)).toBe(id);
    expect(await db.textStyles.count()).toBe(1);
    expect((await db.textStyles.get(id))?.look.colour).toBe('#f6efe2');
  });

  it('keeps only the look: never words or a place on a picture', async () => {
    const id = await saveTextStyle('Quote', lookOf({ ...newTextLayer(), text: 'private words', x: 0.2, y: 0.8 }));
    const saved = (await db.textStyles.get(id))!;
    expect(JSON.stringify(saved)).not.toContain('private words');
    expect(saved.look).not.toHaveProperty('x');
  });

  it('renames (ignoring a blank name) and removes', async () => {
    const id = await saveTextStyle('One', lookOf(newTextLayer()));
    await renameTextStyle(id, '   ');
    expect((await db.textStyles.get(id))?.name).toBe('One');
    await renameTextStyle(id, 'Headline');
    expect((await db.textStyles.get(id))?.name).toBe('Headline');
    await deleteTextStyle(id);
    expect(await db.textStyles.get(id)).toBeUndefined();
  });

  it('sync to every device and are kept in backups', async () => {
    expect(SYNC_TABLES).toContain('textStyles');
    await saveTextStyle('Backed up', lookOf(newTextLayer()));
    expect((await exportBackup()).tables.textStyles).toHaveLength(1);
  });

  it('upgrading from version 8 keeps everything and adds the styles table', async () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(9);
    const name = `upgrade-${newId()}`;
    const old = new Dexie(name);
    old.version(80).stores({ posts: 'id, updatedAt, status, scheduledAt, world, *pieceIds', clipInfo: 'id, updatedAt' });
    await old.open();
    await old.table('posts').add({ id: 'keep', updatedAt: 1, status: 'draft', scheduledAt: null, world: 'healing', pieceIds: [] });
    old.close();
    const upgraded = new YOUriginDB(name);
    await upgraded.open();
    expect((await upgraded.posts.get('keep'))?.status).toBe('draft');
    expect(await upgraded.textStyles.count()).toBe(0);
    upgraded.close();
    await Dexie.delete(name);
  });
});
