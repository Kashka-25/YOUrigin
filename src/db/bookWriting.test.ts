import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns } from './db';
import { createMany, moveToTrash, updateContent } from './content';
import { addPage, addSection, addToBook, createBook, renameSection, setSectionStatus } from './books';
import { bookPages } from '../domain/bookPages';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
});

async function pages(bookId: string) {
  const content = await db.content.toArray();
  return bookPages(
    await db.sections.where('bookId').equals(bookId).toArray(),
    await db.entries.where('bookId').equals(bookId).toArray(),
    new Map(content.map((c) => [c.id, c])),
  );
}

async function poetryBook() {
  const bookId = await createBook({ title: 'Poems', templateId: null, type: 'poetry', projectIds: ['proj-1'] });
  const hopeful = await addSection(bookId, 'Hopeful');
  const sad = await addSection(bookId, 'Sad');
  const [a, b, c] = await createMany([
    { title: 'Dawn', body: 'first light', type: 'poem', status: 'polished' },
    { title: 'Noon', body: 'high sun', type: 'poem', status: 'none' },
    { title: 'Rain', body: 'grey sky', type: 'poem', status: 'seed' },
  ]);
  await addToBook(bookId, [a, b], hopeful);
  await addToBook(bookId, [c], sad);
  return { bookId, hopeful, sad, a, b, c };
}

describe('writing a book page by page', () => {
  it('builds the glossary from every chapter and page title, in order', async () => {
    const { bookId, a, b, c } = await poetryBook();
    const loose = (await createMany([{ title: 'Stray', body: 'x', type: 'poem', status: 'none' }]))[0];
    await addToBook(bookId, [loose], null);
    const p = await pages(bookId);
    expect(p.chapters.map((ch) => ch.section?.title ?? null)).toEqual(['Hopeful', 'Sad', null]);
    expect(p.flat.map((x) => x.item.id)).toEqual([a, b, c, loose]);
    expect(p.flat[2].section?.title).toBe('Sad');
  });

  it('leaves pages in the Trash out of the glossary and Previous / Next', async () => {
    const { bookId, a, b, c } = await poetryBook();
    await moveToTrash([b]);
    expect((await pages(bookId)).flat.map((x) => x.item.id)).toEqual([a, c]);
  });

  it('shows renamed pages and chapters straight away', async () => {
    const { bookId, a, hopeful } = await poetryBook();
    await updateContent(a, { title: 'Daybreak' });
    await renameSection(hopeful, 'Hopeful days');
    const p = await pages(bookId);
    expect(p.chapters[0].section?.title).toBe('Hopeful days');
    expect(p.chapters[0].pages[0].title).toBe('Daybreak');
  });

  it('adds a blank page right after the current one, in the same chapter', async () => {
    const { bookId, hopeful, a, b, c } = await poetryBook();
    const id = await addPage(bookId, hopeful, a);
    const p = await pages(bookId);
    expect(p.flat.map((x) => x.item.id)).toEqual([a, id, b, c]);
    const page = (await db.content.get(id))!;
    expect(page).toMatchObject({ title: '', body: '', type: 'poem', status: 'none', projectIds: ['proj-1'] });
  });

  it('adds a page at the end of a chapter from the glossary', async () => {
    const { bookId, sad, a, b, c } = await poetryBook();
    const id = await addPage(bookId, sad);
    expect((await pages(bookId)).flat.map((x) => x.item.id)).toEqual([a, b, c, id]);
  });

  it('starts an empty poetry book with a poem page', async () => {
    const bookId = await createBook({ title: 'Empty', templateId: null, type: 'poetry' });
    const ch = await addSection(bookId, 'One');
    const id = await addPage(bookId, ch);
    expect((await db.content.get(id))!.type).toBe('poem');
    expect((await db.content.get(id))!.projectIds ?? []).toEqual([]);
  });

  it('never changes the words of the pages around a new one', async () => {
    const { bookId, hopeful, a, b } = await poetryBook();
    const before = (await db.content.bulkGet([a, b])).map((x) => [x!.title, x!.body, x!.status]);
    await addPage(bookId, hopeful, a);
    expect((await db.content.bulkGet([a, b])).map((x) => [x!.title, x!.body, x!.status])).toEqual(before);
  });

  it('gives chapters a colour of their own, starting with none', async () => {
    const { bookId, hopeful } = await poetryBook();
    expect((await pages(bookId)).chapters[0].section?.status).toBeUndefined();
    await setSectionStatus(hopeful, 'developing');
    expect((await db.sections.get(hopeful))!.status).toBe('developing');
    await setSectionStatus(hopeful, 'none');
    expect((await db.sections.get(hopeful))!.status).toBe('none');
  });
});
