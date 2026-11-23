import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, SCHEMA_VERSION, YOUriginDB } from './db';
import { addAccount, movePostsToAccount, saveAccount } from './postAccounts';
import { createPost } from './posts';
import { addIdeas } from './postMedia';
import { exportBackup } from './backup';
import { SYNC_TABLES } from '../sync/tracking';
import { MAIN_ACCOUNT, POETRY_ACCOUNT, accountOf, isPoemIdea, mergeAccounts, rememberShownAccount } from '../posts/accounts';
import { newId } from '../domain/text';

beforeEach(async () => {
  await db.postAccounts.clear();
  await db.posts.clear();
  rememberShownAccount(MAIN_ACCOUNT);
});

describe('accounts in the database', () => {
  it('naming the Poetry account saves it under its own id, with a clean handle', async () => {
    await saveAccount(POETRY_ACCOUNT, { name: ' Quiet lines ', handle: '@Quiet.Lines' });
    const all = mergeAccounts(await db.postAccounts.toArray());
    expect(all).toHaveLength(2);
    expect(all[1]).toMatchObject({ id: POETRY_ACCOUNT, name: 'Quiet lines', handle: 'quiet.lines' });
    await saveAccount(POETRY_ACCOUNT, { name: '  ' });
    expect((await db.postAccounts.get(POETRY_ACCOUNT))?.name).toBe('Quiet lines');
  });

  it('adds another account after the starting ones', async () => {
    const id = await addAccount('Music', '@songs');
    expect(mergeAccounts(await db.postAccounts.toArray()).map((a) => a.id)).toEqual([MAIN_ACCOUNT, POETRY_ACCOUNT, id]);
  });

  it('new posts and ideas go on the account being shown', async () => {
    rememberShownAccount(POETRY_ACCOUNT);
    const id = await createPost();
    expect((await db.posts.get(id))?.account).toBe(POETRY_ACCOUNT);
    await addIdeas([new File(['x'], 'sky.png', { type: 'image/png' })], { image: async () => 'asset-1', clip: async () => ({ clipId: 'c' }) });
    const ideas = await db.posts.filter((p) => p.status === 'idea').toArray();
    expect(ideas.map(accountOf)).toEqual([POETRY_ACCOUNT, POETRY_ACCOUNT]);
    expect(accountOf((await db.posts.get(await createPost({ account: MAIN_ACCOUNT })))!)).toBe(MAIN_ACCOUNT);
  });

  it('moves posts between accounts and keeps everything else', async () => {
    const a = await createPost({ notes: 'Poem idea: tide', scheduledAt: 123 });
    const b = await createPost({ notes: 'Travel carousel' });
    expect(isPoemIdea((await db.posts.get(a))!)).toBe(true);
    expect(await movePostsToAccount([a, b], POETRY_ACCOUNT)).toBe(2);
    expect(await movePostsToAccount([a], POETRY_ACCOUNT)).toBe(0);
    const moved = (await db.posts.get(a))!;
    expect(moved).toMatchObject({ account: POETRY_ACCOUNT, scheduledAt: 123, notes: 'Poem idea: tide' });
    expect(isPoemIdea(moved)).toBe(false);
  });

  it('sync to every device and are kept in backups', async () => {
    expect(SYNC_TABLES).toContain('postAccounts');
    expect(SYNC_TABLES).toContain('posts');
    await saveAccount(POETRY_ACCOUNT, { handle: 'lines' });
    expect((await exportBackup()).tables.postAccounts).toHaveLength(1);
  });

  it('upgrading from version 9 keeps every post where it was', async () => {
    expect(SCHEMA_VERSION).toBe(10);
    const name = `upgrade-${newId()}`;
    const old = new Dexie(name);
    old.version(90).stores({ posts: 'id, updatedAt, status, scheduledAt, world, *pieceIds', textStyles: 'id, updatedAt' });
    await old.open();
    await old.table('posts').add({ id: 'keep', updatedAt: 1, status: 'draft', scheduledAt: null, world: 'healing', pieceIds: [] });
    old.close();
    const upgraded = new YOUriginDB(name);
    await upgraded.open();
    const kept = (await upgraded.posts.get('keep'))!;
    expect(kept.status).toBe('draft');
    expect(accountOf(kept)).toBe(MAIN_ACCOUNT);
    expect(await upgraded.postAccounts.count()).toBe(0);
    upgraded.close();
    await Dexie.delete(name);
  });
});
