import { beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { db, YOUriginDB } from './db';
import { exportBackup, replaceWithBackup } from './backup';
import { addPortfolioItems, createPortfolio, deletePortfolio, duplicatePortfolio, updatePortfolio } from './portfolios';
import { headingItem } from '../portfolio/model';
import { newId } from '../domain/text';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('portfolio records', () => {
  it('a new portfolio is a private draft', async () => {
    const id = await createPortfolio('creative', 'Ana');
    expect(await db.portfolios.get(id)).toMatchObject({ purpose: 'creative', ownerName: 'Ana', visibility: 'unlisted', publication: null });
  });

  it('edits and added items keep the draft’s identity', async () => {
    const id = await createPortfolio('professional');
    await updatePortfolio(id, { title: 'For Acme' });
    await addPortfolioItems(id, [headingItem('Writing')]);
    const p = await db.portfolios.get(id);
    expect(p?.title).toBe('For Acme');
    expect(p?.items.map((i) => i.heading)).toEqual(['Selected work', 'Writing']);
  });

  it('a copy of a published portfolio is a fresh private draft with new item ids', async () => {
    const id = await createPortfolio('business');
    await db.portfolios.update(id, {
      publication: { remoteId: 'r', shareToken: 'secret', status: 'live', visibility: 'unlisted', publishedAt: 1, publishedHash: 'h', expiresAt: null, passwordSet: false },
    });
    const copyId = await duplicatePortfolio(id);
    const [orig, copy] = await Promise.all([db.portfolios.get(id), db.portfolios.get(copyId)]);
    expect(copy?.publication).toBeNull();
    expect(JSON.stringify(copy)).not.toContain('secret');
    expect(copy?.items[0].id).not.toBe(orig?.items[0].id);
  });

  it('a published portfolio can’t be deleted until it is unpublished', async () => {
    const id = await createPortfolio('personal');
    await db.portfolios.update(id, {
      publication: { remoteId: 'r', shareToken: 't', status: 'live', visibility: 'unlisted', publishedAt: 1, publishedHash: 'h', expiresAt: null, passwordSet: false },
    });
    await expect(deletePortfolio(id)).rejects.toThrow(/Unpublish/);
    await db.portfolios.update(id, { publication: null });
    await deletePortfolio(id);
    expect(await db.portfolios.get(id)).toBeUndefined();
  });

  it('are kept in backups', async () => {
    const id = await createPortfolio('creative', 'Ana');
    const backup = await exportBackup();
    await replaceWithBackup({ ...backup, tables: { ...backup.tables, portfolios: [] } });
    expect(await db.portfolios.get(id)).toBeUndefined();
    await replaceWithBackup(backup);
    expect((await db.portfolios.get(id))?.ownerName).toBe('Ana');
  });

  it('upgrading from version 4 keeps everything and adds an empty portfolios table', async () => {
    const name = `upgrade-${newId()}`;
    const old = new Dexie(name);
    old.version(40).stores({ content: 'id, status, type, createdAt, updatedAt, *tagIds, *projectIds', projects: 'id, updatedAt, status, category', books: 'id, updatedAt, *projectIds' });
    await old.open();
    await old.table('content').add({ id: 'keep', body: 'still here' });
    old.close();
    const upgraded = new YOUriginDB(name);
    await upgraded.open();
    expect((await upgraded.content.get('keep'))?.body).toBe('still here');
    expect(await upgraded.portfolios.count()).toBe(0);
    upgraded.close();
  });
});
