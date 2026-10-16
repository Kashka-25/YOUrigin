import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns } from './db';
import { createMany } from './content';
import { addToBook, createBook, renameShelf, updateBook } from './books';
import { exportBackup, mergeBackup, replaceWithBackup } from './backup';
import { isBookProject, projectKind } from '../domain/constants';
import { groupByShelf, shelfNames } from '../domain/projects';
import type { Book } from '../domain/types';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
});

describe('projects', () => {
  it('treats books made before projects as book projects', async () => {
    const id = await createBook({ title: 'Water', templateId: 'tpl-poetry' });
    await db.books.update(id, { kind: undefined, shelf: undefined });
    const b = (await db.books.get(id))!;
    expect(projectKind(b)).toBe('book');
    expect(isBookProject(b)).toBe(true);
    expect(projectKind({ kind: 'nonsense' as never })).toBe('book');
  });

  it('starts non-book projects with their own sections and no print pages', async () => {
    const id = await createBook({ title: 'Friday gig', templateId: 'tpl-poetry', kind: 'setlist', shelf: ' Music ', author: 'Cass' });
    const b = (await db.books.get(id))!;
    expect(b.kind).toBe('setlist');
    expect(b.shelf).toBe('Music');
    expect(b.templateId).toBeNull();
    expect(b.design).toBeUndefined();
    const sections = await db.sections.where('bookId').equals(id).toArray();
    expect(sections.map((s) => s.title)).toEqual(['Set 1']);

    const ideas = await createBook({ title: 'App ideas', templateId: null, kind: 'ideas' });
    expect(await db.sections.where('bookId').equals(ideas).count()).toBe(0);
  });

  it('keeps book templates and copyright page for book projects', async () => {
    const id = await createBook({ title: 'Water', templateId: 'tpl-poetry', kind: 'book' });
    const b = (await db.books.get(id))!;
    expect(b.design?.copyright).toContain('Water');
    expect(await db.sections.where('bookId').equals(id).count()).toBe(5);
  });

  it('lets one song sit in an album and several set lists at once', async () => {
    const [song] = await createMany([{ body: 'Tidewalker\nverse one', type: 'song', status: 'developing', tagNames: [] }]);
    const album = await createBook({ title: 'Salt', templateId: null, kind: 'album', shelf: 'Music' });
    const gig1 = await createBook({ title: 'Friday', templateId: null, kind: 'setlist', shelf: 'Music' });
    const gig2 = await createBook({ title: 'Saturday', templateId: null, kind: 'setlist', shelf: 'Music' });
    for (const p of [album, gig1, gig2]) {
      const [section] = await db.sections.where('bookId').equals(p).toArray();
      expect(await addToBook(p, [song], section.id)).toHaveLength(1);
    }
    // Once per project.
    expect(await addToBook(gig1, [song])).toHaveLength(0);
    expect(await db.entries.where('contentId').equals(song).count()).toBe(3);
  });

  it('groups projects by shelf and renames shelves', async () => {
    const a = await createBook({ title: 'A', templateId: null, kind: 'album', shelf: 'music' });
    await createBook({ title: 'B', templateId: null, kind: 'ideas', shelf: 'App ideas' });
    await createBook({ title: 'C', templateId: null });
    let books = await db.books.toArray();
    expect(groupByShelf(books).map((g) => g.shelf)).toEqual(['App ideas', 'music', '']);

    await renameShelf('music', 'Music');
    books = await db.books.toArray();
    expect(shelfNames(books)).toEqual(['App ideas', 'Music']);
    expect((await db.books.get(a))!.shelf).toBe('Music');

    await renameShelf('Music', '');
    expect(shelfNames(await db.books.toArray())).toEqual(['App ideas']);
  });

  it('old backups without kinds import as books; new fields survive a round trip', async () => {
    const id = await createBook({ title: 'Salt', templateId: null, kind: 'album', shelf: 'Music' });
    await updateBook(id, { kind: 'setlist' });
    const backup = await exportBackup();
    const old = structuredClone(backup);
    for (const b of old.tables.books as Book[]) {
      delete b.kind;
      delete b.shelf;
    }
    await replaceWithBackup(old);
    const restored = (await db.books.get(id))!;
    expect(projectKind(restored)).toBe('book');

    await replaceWithBackup(backup);
    await mergeBackup(backup);
    const back = (await db.books.get(id))!;
    expect(back.kind).toBe('setlist');
    expect(back.shelf).toBe('Music');
  });
});
