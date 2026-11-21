import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns } from './db';
import { createContent } from './content';
import { addItemsToProject, createProject, deleteProject, moveItemToProject, setCreationParent } from './projectRecords';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
});

const note = (body: string) => createContent({ body, type: 'note', status: 'seed', tagNames: [], source: { kind: 'capture' } });

describe('nested Creations on the device', () => {
  it('makes a branch, moves it, and brings it back to the top', async () => {
    const music = await createProject({ title: 'Lyrics & Music' });
    const songs = await createProject({ title: 'Songs', parentId: music });
    expect((await db.projects.get(songs))?.parentId).toBe(music);
    const books = await createProject({ title: 'Books' });
    await setCreationParent(songs, books);
    expect((await db.projects.get(songs))?.parentId).toBe(books);
    await setCreationParent(songs, null);
    expect((await db.projects.get(songs))?.parentId).toBeUndefined();
  });

  it('refuses to put a Creation inside its own branch', async () => {
    const music = await createProject({ title: 'Lyrics & Music' });
    const songs = await createProject({ title: 'Songs', parentId: music });
    await expect(setCreationParent(music, songs)).rejects.toThrow();
    expect((await db.projects.get(music))?.parentId).toBeUndefined();
  });

  it('moves a note between branches so it exists once', async () => {
    const writing = await createProject({ title: 'Writing' });
    const finished = await createProject({ title: 'Finished' });
    const other = await createProject({ title: 'Philosophy' });
    const id = await note('the last verse');
    await addItemsToProject(writing, [id]);
    await addItemsToProject(other, [id]);
    await moveItemToProject(id, writing, finished);
    expect((await db.content.get(id))?.projectIds?.sort()).toEqual([finished, other].sort());
    expect(await db.content.count()).toBe(1);
  });

  it('deleting a Creation keeps its branches (they move up) and its notes', async () => {
    const music = await createProject({ title: 'Lyrics & Music' });
    const songs = await createProject({ title: 'Songs', parentId: music });
    const writing = await createProject({ title: 'Writing', parentId: songs });
    const id = await note('a chorus');
    await addItemsToProject(songs, [id]);
    await deleteProject(songs);
    expect((await db.projects.get(writing))?.parentId).toBe(music);
    expect(await db.content.get(id)).toBeTruthy();
    expect((await db.content.get(id))?.projectIds ?? []).toEqual([]);
  });
});
