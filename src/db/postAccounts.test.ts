import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, SCHEMA_VERSION, YOUriginDB } from './db';
import { addAccount, movePostsToAccount, removeAccount, saveAccount } from './postAccounts';
import { createPost } from './posts';
import { addIdeas } from './postMedia';
import { exportBackup } from './backup';
import { SYNC_TABLES, installChangeTracking } from '../sync/tracking';
import { Outbox } from '../sync/outbox';
import { FIRST_ACCOUNTS, MAIN_ACCOUNT, POETRY_ACCOUNT, accountOf, isPoemIdea, mergeAccounts, rememberShownAccount, shownAccount } from '../posts/accounts';
import { newId } from '../domain/text';

beforeEach(async () => {
  await db.postAccounts.clear();
  await db.posts.clear();
  rememberShownAccount(MAIN_ACCOUNT);
});

describe('accounts in the database', () => {
  it('naming the Poetry account saves it under its own id, with a clean handle', async () => {
    await db.postAccounts.bulkAdd(FIRST_ACCOUNTS);
    await saveAccount(POETRY_ACCOUNT, { name: ' Quiet lines ', handle: '@Quiet.Lines' });
    const all = mergeAccounts(await db.postAccounts.toArray());
    expect(all).toHaveLength(2);
    expect(all[1]).toMatchObject({ id: POETRY_ACCOUNT, name: 'Quiet lines', handle: 'quiet.lines' });
    await saveAccount(POETRY_ACCOUNT, { name: '  ' });
    expect((await db.postAccounts.get(POETRY_ACCOUNT))?.name).toBe('Quiet lines');
  });

  it('adds another account after the starting one', async () => {
    const id = await addAccount('Music', '@songs');
    expect(mergeAccounts(await db.postAccounts.toArray()).map((a) => a.id)).toEqual([MAIN_ACCOUNT, id]);
  });

  it('renaming the main account keeps it first', async () => {
    await addAccount('Music');
    await saveAccount(MAIN_ACCOUNT, { name: 'Studio', handle: 'studio' });
    const all = mergeAccounts(await db.postAccounts.toArray());
    expect(all[0]).toMatchObject({ id: MAIN_ACCOUNT, name: 'Studio', handle: 'studio', createdAt: 0 });
  });

  it('an account with posts but no saved row can still be named', async () => {
    await createPost({ account: POETRY_ACCOUNT });
    await saveAccount(POETRY_ACCOUNT, { name: 'Lines' });
    const saved = (await db.postAccounts.get(POETRY_ACCOUNT))!;
    expect(saved.name).toBe('Lines');
    expect(saved.createdAt).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('removing an account moves all its posts, set-aside ones too, and keeps the main one', async () => {
    const music = await addAccount('Music');
    const a = await createPost({ account: music });
    const b = await createPost({ account: music, deletedAt: 5 });
    const c = await createPost();
    rememberShownAccount(music);
    expect(await removeAccount(music)).toBe(2);
    expect((await db.posts.bulkGet([a, b, c])).map((p) => accountOf(p!))).toEqual([MAIN_ACCOUNT, MAIN_ACCOUNT, MAIN_ACCOUNT]);
    expect(await db.postAccounts.get(music)).toBeUndefined();
    expect(shownAccount()).toBe(MAIN_ACCOUNT);
    expect(await removeAccount(MAIN_ACCOUNT)).toBe(0);
    expect(mergeAccounts(await db.postAccounts.toArray()).map((x) => x.id)).toEqual([MAIN_ACCOUNT]);
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
    await saveAccount(MAIN_ACCOUNT, { handle: 'lines' });
    expect((await exportBackup()).tables.postAccounts).toHaveLength(1);
  });

  it('upgrading from version 9 keeps every post where it was', async () => {
    expect(SCHEMA_VERSION).toBe(11);
    const name = `upgrade-${newId()}`;
    const old = new Dexie(name);
    old.version(9).stores({ posts: 'id, updatedAt, status, scheduledAt, world, *pieceIds', textStyles: 'id, updatedAt' });
    await old.open();
    await old.table('posts').add({ id: 'keep', updatedAt: 1, status: 'draft', scheduledAt: null, world: 'healing', pieceIds: [] });
    old.close();
    const upgraded = new YOUriginDB(name);
    const store = new Map<string, string>();
    const outbox = new Outbox('outbox', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) });
    installChangeTracking(upgraded, outbox, () => true);
    await upgraded.open();
    // Each device keeps its own copy; nothing is sent that could undo an edit made elsewhere.
    expect(outbox.size).toBe(0);
    const kept = (await upgraded.posts.get('keep'))!;
    expect(kept.status).toBe('draft');
    expect(accountOf(kept)).toBe(MAIN_ACCOUNT);
    // A device that already had posts keeps the accounts it started with.
    expect(mergeAccounts(await upgraded.postAccounts.toArray()).map((a) => [a.name, a.handle])).toEqual([
      ['Free the dream', '_freethedream_'],
      ['Poetry', ''],
    ]);
    upgraded.close();
    await Dexie.delete(name);
  });

  it('upgrading from version 10 never undoes an account already named', async () => {
    const name = `upgrade-${newId()}`;
    const old = new Dexie(name);
    old.version(10).stores({ posts: 'id, updatedAt, status, scheduledAt, world, *pieceIds', textStyles: 'id, updatedAt', postAccounts: 'id, updatedAt' });
    await old.open();
    await old.table('posts').add({ id: 'p', updatedAt: 1, status: 'idea', scheduledAt: null, world: 'healing', pieceIds: [], account: POETRY_ACCOUNT });
    await old.table('postAccounts').add({ ...FIRST_ACCOUNTS[1], name: 'Quiet lines', handle: 'quiet.lines', updatedAt: 9 });
    old.close();
    const upgraded = new YOUriginDB(name);
    await upgraded.open();
    expect((await upgraded.postAccounts.get(POETRY_ACCOUNT))?.name).toBe('Quiet lines');
    expect((await upgraded.postAccounts.get(MAIN_ACCOUNT))?.handle).toBe('_freethedream_');
    upgraded.close();
    await Dexie.delete(name);
  });

  it('a new device starts with one unnamed account', async () => {
    const name = `fresh-${newId()}`;
    const fresh = new YOUriginDB(name);
    await fresh.open();
    expect(await fresh.postAccounts.count()).toBe(0);
    expect(mergeAccounts(await fresh.postAccounts.toArray())).toEqual([expect.objectContaining({ id: MAIN_ACCOUNT, name: 'My account', handle: '' })]);
    fresh.close();
    await Dexie.delete(name);
  });
});
