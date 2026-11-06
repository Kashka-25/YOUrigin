import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns, migrateLegacyWorksToProjects, SCHEMA_VERSION } from './db';
import { createMany } from './content';
import { addToBook, createBook } from './books';
import { exportBackup, replaceWithBackup } from './backup';
import { addItemsToProject, addWorksToProject, createProject, createProjectForWorks, deleteProject, importWorksAsProjects, removeItemFromProject, updateProject } from './projectRecords';
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
      colour: 'ochre',
      status: 'idea',
    });
  });

  it('stores and updates a Project colour', async () => {
    const id = await createProject({ title: 'Terra Senga', colour: 'moss' });
    expect((await db.projects.get(id))?.colour).toBe('moss');
    await updateProject(id, { colour: 'teal' });
    expect((await db.projects.get(id))?.colour).toBe('teal');
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

  it('imports several unlinked Works as separate Projects without changing their contents or structure', async () => {
    const firstWork = await createBook({
      title: 'YOU App architecture',
      description: 'The personal operating system',
      templateId: null,
      kind: 'custom',
    });
    const secondWork = await createBook({
      title: 'Empatherapy',
      description: 'A healing venture',
      templateId: null,
      kind: 'custom',
    });
    const firstSections = await db.sections.where('bookId').equals(firstWork).toArray();
    const secondSections = await db.sections.where('bookId').equals(secondWork).toArray();

    const projectIds = await importWorksAsProjects([firstWork, secondWork, firstWork], {
      category: 'Business',
      colour: 'violet',
      status: 'building',
    });

    expect(projectIds).toHaveLength(2);
    const created = await db.projects.bulkGet(projectIds);
    expect(created.map((project) => project?.title).sort()).toEqual(['Empatherapy', 'YOU App architecture']);
    expect(created.every((project) => !!project && project.category === 'Business' && project.colour === 'violet' && project.status === 'building')).toBe(true);
    expect((await db.books.get(firstWork))?.description).toBe('The personal operating system');
    expect((await db.books.get(secondWork))?.description).toBe('A healing venture');
    expect((await db.books.get(firstWork))?.projectIds).toEqual([projectIds[0]]);
    expect((await db.books.get(secondWork))?.projectIds).toEqual([projectIds[1]]);
    expect(await db.sections.where('bookId').equals(firstWork).toArray()).toEqual(firstSections);
    expect(await db.sections.where('bookId').equals(secondWork).toArray()).toEqual(secondSections);
  });

  it('does not create a second wrapper for Works already linked to a Project', async () => {
    const alreadyLinked = await createBook({ title: 'Already organised', templateId: null, kind: 'custom' });
    const unlinked = await createBook({ title: 'Still to organise', templateId: null, kind: 'custom' });
    const existingProject = await createProject({ title: 'Existing Project' });
    await addWorksToProject(existingProject, [alreadyLinked]);

    const ids = await importWorksAsProjects([alreadyLinked, unlinked]);
    expect(ids).toHaveLength(1);
    expect((await db.books.get(alreadyLinked))?.projectIds).toEqual([existingProject]);
    expect((await db.books.get(unlinked))?.projectIds).toEqual(ids);
  });

  it('converts existing standalone Works into Projects without changing their original records', async () => {
    const activeWork = await createBook({
      title: 'YOUrigin field guide',
      description: 'The original manuscript and its structure stay intact.',
      templateId: 'tpl-poetry',
    });
    const archivedWork = await createBook({
      title: 'Old collection',
      templateId: null,
      kind: 'custom',
    });
    await db.books.update(archivedWork, { archived: true });

    const [pieceId] = await createMany([{ body: 'An original piece of writing.', type: 'note', status: 'seed' }]);
    await addToBook(activeWork, [pieceId]);
    const sectionsBefore = await db.sections.where('bookId').equals(activeWork).toArray();
    const entriesBefore = await db.entries.where('bookId').equals(activeWork).toArray();

    const alreadyLinkedWork = await createBook({ title: 'Already organised', templateId: null, kind: 'custom' });
    const sameNameWork = await createBook({ title: 'Existing Project', templateId: null, kind: 'custom' });
    const existingProject = await createProject({ title: 'Existing Project' });
    await addWorksToProject(existingProject, [alreadyLinkedWork]);

    const migrated = await db.transaction('rw', db.books, db.projects, async () =>
      migrateLegacyWorksToProjects(db.books, db.projects),
    );

    expect(migrated).toBe(3);
    const activeProjectId = `legacy-work-${activeWork}`;
    const archivedProjectId = `legacy-work-${archivedWork}`;
    expect(await db.projects.get(activeProjectId)).toMatchObject({
      title: 'YOUrigin field guide',
      description: 'The original manuscript and its structure stay intact.',
      status: 'idea',
    });
    expect(await db.projects.get(archivedProjectId)).toMatchObject({
      title: 'Old collection',
      status: 'resting',
    });
    expect((await db.books.get(activeWork))?.projectIds).toEqual([activeProjectId]);
    expect((await db.books.get(archivedWork))?.projectIds).toEqual([archivedProjectId]);
    expect((await db.books.get(alreadyLinkedWork))?.projectIds).toEqual([existingProject]);
    // A single exact-title Project is reused instead of creating a duplicate.
    expect((await db.books.get(sameNameWork))?.projectIds).toEqual([existingProject]);

    // The Work itself, its manuscript sections and its placed writing remain untouched.
    expect((await db.books.get(activeWork))?.title).toBe('YOUrigin field guide');
    expect((await db.books.get(activeWork))?.description).toBe('The original manuscript and its structure stay intact.');
    expect(await db.sections.where('bookId').equals(activeWork).toArray()).toEqual(sectionsBefore);
    expect(await db.entries.where('bookId').equals(activeWork).toArray()).toEqual(entriesBefore);
    expect((await db.content.get(pieceId))?.body).toBe('An original piece of writing.');

    // Opening the app again does not create duplicate Projects.
    expect(await db.transaction('rw', db.books, db.projects, async () =>
      migrateLegacyWorksToProjects(db.books, db.projects),
    )).toBe(0);
    expect(await db.projects.count()).toBe(3);
  });

  it('groups several selected Works under one new Project', async () => {
    const first = await createBook({ title: 'Field notes', templateId: null, kind: 'custom' });
    const second = await createBook({ title: 'Photographs', templateId: null, kind: 'custom' });
    const projectId = await createProjectForWorks({
      title: 'Terra Senga',
      description: 'The land and its development',
      category: 'Place',
      colour: 'jade',
      status: 'resting',
    }, [first, second]);

    expect(await db.projects.get(projectId)).toMatchObject({
      title: 'Terra Senga',
      description: 'The land and its development',
      category: 'Place',
      colour: 'jade',
      status: 'resting',
    });
    expect((await db.books.get(first))?.projectIds).toContain(projectId);
    expect((await db.books.get(second))?.projectIds).toContain(projectId);
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
    expect(SCHEMA_VERSION).toBe(4);
    expect(SYNC_TABLES).toContain('projects');
  });
});
