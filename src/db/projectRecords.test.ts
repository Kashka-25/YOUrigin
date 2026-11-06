import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns, SCHEMA_VERSION } from './db';
import { createMany } from './content';
import { createBook } from './books';
import { exportBackup, replaceWithBackup } from './backup';
import { addItemsToProject, addWorksToProject, createProject, deleteProject, removeItemFromProject } from './projectRecords';
import { SYNC_TABLES } from '../sync/tracking';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
});

describe('independent Projects', () => {
  it('creates flexible Projects with optional categories and a simple default status', async () => {
    const id = await createProject({ title: 'YOU App', description: 'A personal operating system' });
    const project = await db.projects.get(id);
    expect(project).toMatchObject({
      title: 'YOU App',
      description: 'A personal operating system',
      category: '',
      status: 'idea',
    });
  });

  it('links one note to multiple Projects and removes only the selected relationship', async () => {
    const [noteId] = await createMany([{ body: 'Wandering map concept', type: 'note', status: 'seed' }]);
    const first = await createProject({ title: 'YOU App' });
    const second = await createProject({ title: 'YOUrigin' });
    await addItemsToProject(first, [noteId]);
    await addItemsToProject(second, [noteId]);
    expect((await db.content.get(noteId))?.projectIds?.sort()).toEqual([first, second].sort());

    await removeItemFromProject(first, noteId);
    expect((await db.content.get(noteId))?.projectIds).toEqual([second]);
  });

  it('allows one Work to contribute to several Projects', async () => {
    const workId = await createBook({ title: 'Product architecture', templateId: null, kind: 'custom' });
    const first = await createProject({ title: 'YOU App' });
    const second = await createProject({ title: 'YOUrigin' });
    await addWorksToProject(first, [workId]);
    await addWorksToProject(second, [workId]);
    expect((await db.books.get(workId))?.projectIds?.sort()).toEqual([first, second].sort());
  });

  it('deletes a Project without deleting its notes or Works', async () => {
    const [noteId] = await createMany([{ body: 'Keep this note', type: 'note', status: 'seed' }]);
    const workId = await createBook({ title: 'Keep this Work', templateId: null, kind: 'custom' });
    const projectId = await createProject({ title: 'Terra Senga' });
    await addItemsToProject(projectId, [noteId]);
    await addWorksToProject(projectId, [workId]);

    await deleteProject(projectId);
    expect(await db.projects.get(projectId)).toBeUndefined();
    expect((await db.content.get(noteId))?.body).toBe('Keep this note');
    expect((await db.content.get(noteId))?.projectIds).toEqual([]);
    expect((await db.books.get(workId))?.title).toBe('Keep this Work');
    expect((await db.books.get(workId))?.projectIds).toEqual([]);
  });

  it('backs up and restores Projects and their links', async () => {
    const [noteId] = await createMany([{ body: 'A note', type: 'note', status: 'seed' }]);
    const workId = await createBook({ title: 'A separate Work', templateId: null, kind: 'custom' });
    const projectId = await createProject({ title: 'Empatherapy', category: 'Business', status: 'building' });
    await addItemsToProject(projectId, [noteId]);
    await addWorksToProject(projectId, [workId]);
    const backup = await exportBackup();

    await replaceWithBackup({ ...backup, tables: { ...backup.tables, projects: undefined } });
    expect(await db.projects.get(projectId)).toBeUndefined();

    await replaceWithBackup(backup);
    expect((await db.projects.get(projectId))?.status).toBe('building');
    expect((await db.content.get(noteId))?.projectIds).toContain(projectId);
    expect((await db.books.get(workId))?.projectIds).toContain(projectId);
  });

  it('uses the new local database schema and includes Projects in encrypted sync', () => {
    expect(SCHEMA_VERSION).toBe(3);
    expect(SYNC_TABLES).toContain('projects');
  });
});
