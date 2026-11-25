import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns } from './db';
import { createMany } from './content';
import { addSection, addToBook, createBook, deleteSection } from './books';
import { createProject } from './projectRecords';
import { exportBackup, replaceWithBackup } from './backup';
import { placeFromRest, projectIdsOfWork, restEntry, wakeFromRest, worksOfProject } from './resting';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
});

async function setUp() {
  const projectId = await createProject({ title: 'Salt Songs' });
  const albumId = await createBook({ title: 'Salt', templateId: null, kind: 'album', projectIds: [projectId] });
  const setId = await createBook({ title: 'Friday set', templateId: null, kind: 'setlist', projectIds: [projectId] });
  const sideA = await addSection(albumId, 'Side A');
  const [a, b, c] = await createMany(['Tide', 'Undertow', 'Shore'].map((title) => ({ title, body: title.toLowerCase(), type: 'song' as const, status: 'seed' as const })));
  await addToBook(albumId, [a, b, c], sideA);
  const entryOf = async (contentId: string, workId = albumId) =>
    (await db.entries.where('[bookId+contentId]').equals([workId, contentId]).first())!;
  return { projectId, albumId, setId, sideA, a, b, c, entryOf };
}

describe('Resting box', () => {
  it('takes a piece out of the Work but keeps it in the Project', async () => {
    const { projectId, albumId, sideA, a, b, c, entryOf } = await setUp();
    expect(await restEntry((await entryOf(b)).id)).toEqual([projectId]);

    const left = (await db.entries.where('bookId').equals(albumId).sortBy('order')).map((e) => [e.contentId, e.order]);
    expect(left).toEqual([[a, 0], [c, 1]]);
    const project = await db.projects.get(projectId);
    expect(project?.resting).toEqual([expect.objectContaining({ contentId: b, fromWorkId: albumId, fromSectionId: sideA })]);
    // Still in the Project, and the piece itself still exists once, untouched.
    const piece = await db.content.get(b);
    expect(piece?.projectIds).toContain(projectId);
    expect(piece?.body).toBe('undertow');
    expect(await db.content.count()).toBe(3);
  });

  it('places a piece back into its old section in the Work it came from', async () => {
    const { projectId, albumId, sideA, b, entryOf } = await setUp();
    await restEntry((await entryOf(b)).id);
    const entryId = await placeFromRest(projectId, b, albumId);
    expect(entryId).toBeTruthy();
    expect(await db.entries.get(entryId)).toMatchObject({ sectionId: sideA, order: 2 });
    expect((await db.projects.get(projectId))?.resting).toEqual([]);
  });

  it('lands in the tray when its old section is gone', async () => {
    const { projectId, albumId, sideA, b, entryOf } = await setUp();
    await restEntry((await entryOf(b)).id);
    await deleteSection(sideA);
    const entryId = await placeFromRest(projectId, b, albumId);
    expect((await db.entries.get(entryId))?.sectionId).toBeNull();
  });

  it('can be placed into another Work of the same Project', async () => {
    const { projectId, setId, b, entryOf } = await setUp();
    await restEntry((await entryOf(b)).id);
    const entryId = await placeFromRest(projectId, b, setId);
    expect(await db.entries.get(entryId)).toMatchObject({ bookId: setId, sectionId: null, contentId: b });
    expect((await db.projects.get(projectId))?.resting).toEqual([]);
  });

  it('leaves the box when the piece is added to a Work some other way', async () => {
    const { projectId, setId, b, entryOf } = await setUp();
    await restEntry((await entryOf(b)).id);
    await addToBook(setId, [b]);
    expect((await db.projects.get(projectId))?.resting).toEqual([]);
  });

  it('rests a piece only once, however often it is set to rest', async () => {
    const { projectId, albumId, setId, b, entryOf } = await setUp();
    await addToBook(setId, [b]);
    await restEntry((await entryOf(b, albumId)).id);
    await restEntry((await entryOf(b, setId)).id);
    const resting = (await db.projects.get(projectId))?.resting ?? [];
    expect(resting).toHaveLength(1);
    expect(resting[0].fromWorkId).toBe(setId);
  });

  it('can be taken out of the box and stays a note of the Project', async () => {
    const { projectId, b, entryOf } = await setUp();
    await restEntry((await entryOf(b)).id);
    await wakeFromRest([projectId], [b]);
    expect((await db.projects.get(projectId))?.resting).toEqual([]);
    expect((await db.content.get(b))?.projectIds).toContain(projectId);
  });

  it('rests in a Work’s home Project (the one sharing its id)', async () => {
    const workId = await createBook({ title: 'Lanterns', templateId: null });
    await createProject({ id: workId, title: 'Lanterns' });
    const [p] = await createMany([{ title: 'Wick', body: 'wick', type: 'poem' as const, status: 'seed' as const }]);
    const [entryId] = await addToBook(workId, [p]);
    expect(await restEntry(entryId)).toEqual([workId]);
    expect((await db.projects.get(workId))?.resting?.map((r) => r.contentId)).toEqual([p]);
  });

  it('refuses when the Work has no Project, and keeps the piece in the Work', async () => {
    const workId = await createBook({ title: 'Loose', templateId: null });
    const [p] = await createMany([{ title: 'Ember', body: 'ember', type: 'poem' as const, status: 'seed' as const }]);
    const [entryId] = await addToBook(workId, [p]);
    await expect(restEntry(entryId)).rejects.toThrow(/nowhere/);
    expect(await db.entries.get(entryId)).toBeTruthy();
  });

  it('survives a backup and restore', async () => {
    const { projectId, b, entryOf } = await setUp();
    await restEntry((await entryOf(b)).id);
    const backup = await exportBackup();
    await db.projects.update(projectId, { resting: [] });
    await replaceWithBackup(backup);
    expect((await db.projects.get(projectId))?.resting?.map((r) => r.contentId)).toEqual([b]);
  });

  it('finds the Projects of a Work and the Works of a Project', () => {
    const projects = [{ id: 'p1' }, { id: 'w2' }];
    expect(projectIdsOfWork({ id: 'w1', projectIds: ['p1', 'gone'] }, projects)).toEqual(['p1']);
    expect(projectIdsOfWork({ id: 'w2', projectIds: ['p1'] }, projects).sort()).toEqual(['p1', 'w2']);
    const works = [{ id: 'w1', projectIds: ['p1'] }, { id: 'p1' }, { id: 'w3', projectIds: [] }];
    expect(worksOfProject('p1', works).map((w) => w.id)).toEqual(['w1', 'p1']);
  });
});
