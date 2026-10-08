import { db } from './db';
import type { Book, BookEntry, BookType } from '../domain/types';
import { newId } from '../domain/text';
import { COVER_COLOURS } from '../domain/constants';
import { acknowledgementsTemplate, copyrightTemplate, dedicationTemplate } from '../print/design';

export interface NewBook {
  title: string;
  subtitle?: string;
  description?: string;
  templateId: string | null;
  type?: BookType;
  /** Name for the title and copyright pages. */
  author?: string;
  /** Start with the copyright page template (defaults to the template's setting). */
  copyrightPage?: boolean;
  /** Start with a dedication page to rewrite (defaults to the template's setting). */
  dedicationPage?: boolean;
  /** Start with an acknowledgements page to rewrite (defaults to the template's setting). */
  acknowledgementsPage?: boolean;
}

export async function createBook(input: NewBook): Promise<string> {
  return db.transaction('rw', db.books, db.sections, db.templates, async () => {
    const tpl = input.templateId ? await db.templates.get(input.templateId) : undefined;
    const now = Date.now();
    const count = await db.books.count();
    const title = input.title.trim() || 'Untitled book';
    const type = input.type ?? tpl?.bookType ?? 'custom';
    const author = input.author?.trim() ?? '';
    const withCopyright = input.copyrightPage ?? tpl?.copyrightPage ?? true;
    const withDedication = input.dedicationPage ?? tpl?.dedicationPage ?? false;
    const withAcks = input.acknowledgementsPage ?? tpl?.acknowledgementsPage ?? false;
    const book: Book = {
      id: newId(),
      title,
      subtitle: input.subtitle?.trim() ?? '',
      description: input.description?.trim() ?? '',
      type,
      templateId: tpl?.id ?? null,
      cover: COVER_COLOURS[count % COVER_COLOURS.length],
      notes: '',
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    if (author || withCopyright || withDedication || withAcks)
      book.design = {
        author,
        ...(withCopyright ? { copyright: copyrightTemplate({ title, type }, author) } : {}),
        ...(withDedication ? { dedication: dedicationTemplate(type) } : {}),
        ...(withAcks ? { acknowledgements: acknowledgementsTemplate(type) } : {}),
      };
    await db.books.add(book);
    await db.sections.bulkAdd(
      (tpl?.sections ?? []).map((title, order) => ({
        id: newId(),
        bookId: book.id,
        title,
        order,
        notes: '',
        createdAt: now,
        updatedAt: now,
      })),
    );
    return book.id;
  });
}

export async function updateBook(
  id: string,
  patch: Partial<Pick<Book, 'title' | 'subtitle' | 'description' | 'cover' | 'notes' | 'type' | 'archived' | 'coverAssetId' | 'design'>>,
): Promise<void> {
  await db.books.update(id, { ...patch, updatedAt: Date.now() });
}

/** Removes the book's structure only. Every piece of writing stays in the Library. */
export async function deleteBook(id: string): Promise<void> {
  await db.transaction('rw', db.books, db.sections, db.entries, async () => {
    await db.entries.where('bookId').equals(id).delete();
    await db.sections.where('bookId').equals(id).delete();
    await db.books.delete(id);
  });
}

async function touchBook(bookId: string) {
  await db.books.update(bookId, { updatedAt: Date.now() });
}

// ---- sections --------------------------------------------------------------

export async function addSection(bookId: string, title: string): Promise<string> {
  const id = newId();
  const now = Date.now();
  const existing = await db.sections.where('bookId').equals(bookId).toArray();
  const order = existing.reduce((m, s) => Math.max(m, s.order + 1), 0);
  await db.sections.add({ id, bookId, title: title.trim() || 'New section', order, notes: '', createdAt: now, updatedAt: now });
  await touchBook(bookId);
  return id;
}

export async function renameSection(id: string, title: string): Promise<void> {
  await db.sections.update(id, { title: title.trim() || 'Untitled section', updatedAt: Date.now() });
}

/** Pieces in a removed section go back to the book's tray rather than vanish. */
export async function deleteSection(id: string): Promise<void> {
  await db.transaction('rw', db.sections, db.entries, db.books, async () => {
    const s = await db.sections.get(id);
    if (!s) return;
    const now = Date.now();
    await db.entries.where('sectionId').equals(id).modify({ sectionId: null, updatedAt: now });
    await db.sections.delete(id);
    await touchBook(s.bookId);
  });
}

export async function reorderSections(bookId: string, orderedIds: string[]): Promise<void> {
  await db.transaction('rw', db.sections, db.books, async () => {
    const now = Date.now();
    for (const [order, id] of orderedIds.entries()) await db.sections.update(id, { order, updatedAt: now });
    await touchBook(bookId);
  });
}

// ---- entries (content references) ------------------------------------------

async function entriesIn(bookId: string, sectionId: string | null): Promise<BookEntry[]> {
  const all = await db.entries.where('bookId').equals(bookId).toArray();
  return all.filter((e) => e.sectionId === sectionId).sort((a, b) => a.order - b.order);
}

/**
 * Adds references to a book. A piece appears at most once per book; if it is
 * already there it is left where it is. Returns the ids of new entries (for undo).
 */
export async function addToBook(bookId: string, contentIds: string[], sectionId: string | null = null): Promise<string[]> {
  return db.transaction('rw', db.entries, db.books, async () => {
    const existing = new Set((await db.entries.where('bookId').equals(bookId).toArray()).map((e) => e.contentId));
    const target = await entriesIn(bookId, sectionId);
    let order = target.reduce((m, e) => Math.max(m, e.order + 1), 0);
    const now = Date.now();
    const created: BookEntry[] = [];
    for (const contentId of contentIds) {
      if (existing.has(contentId)) continue;
      existing.add(contentId);
      created.push({ id: newId(), bookId, sectionId, contentId, order: order++, createdAt: now, updatedAt: now });
    }
    await db.entries.bulkAdd(created);
    await touchBook(bookId);
    return created.map((e) => e.id);
  });
}

/** Moves an entry to `sectionId` at position `index`, renumbering both lists. */
export async function moveEntry(entryId: string, sectionId: string | null, index: number): Promise<void> {
  await db.transaction('rw', db.entries, db.books, async () => {
    const entry = await db.entries.get(entryId);
    if (!entry) return;
    const target = (await entriesIn(entry.bookId, sectionId)).filter((e) => e.id !== entryId);
    const clamped = Math.max(0, Math.min(index, target.length));
    target.splice(clamped, 0, { ...entry, sectionId });
    const now = Date.now();
    for (const [order, e] of target.entries()) {
      await db.entries.update(e.id, { sectionId, order, updatedAt: now });
    }
    if (entry.sectionId !== sectionId) {
      const source = (await entriesIn(entry.bookId, entry.sectionId)).filter((e) => e.id !== entryId);
      for (const [order, e] of source.entries()) await db.entries.update(e.id, { order, updatedAt: now });
    }
    await touchBook(entry.bookId);
  });
}

/** Insert a library piece directly at a position (drag from the material shelf). */
export async function insertIntoSection(bookId: string, contentId: string, sectionId: string | null, index: number) {
  const existing = await db.entries.where('[bookId+contentId]').equals([bookId, contentId]).first();
  if (existing) return moveEntry(existing.id, sectionId, index);
  const [id] = await addToBook(bookId, [contentId], sectionId);
  if (id) await moveEntry(id, sectionId, index);
}

export async function removeEntries(entryIds: string[]): Promise<void> {
  await db.entries.bulkDelete(entryIds);
}

// ---- templates -------------------------------------------------------------

export async function saveTemplate(t: {
  id?: string;
  name: string;
  bookType: BookType;
  sections: string[];
  copyrightPage?: boolean;
  dedicationPage?: boolean;
  acknowledgementsPage?: boolean;
}): Promise<string> {
  const now = Date.now();
  const copyrightPage = t.copyrightPage ?? true;
  const dedicationPage = t.dedicationPage ?? false;
  const acknowledgementsPage = t.acknowledgementsPage ?? false;
  if (t.id) {
    await db.templates.update(t.id, { name: t.name, bookType: t.bookType, sections: t.sections, copyrightPage, dedicationPage, acknowledgementsPage, updatedAt: now });
    return t.id;
  }
  const id = newId();
  await db.templates.add({ id, name: t.name, bookType: t.bookType, sections: t.sections, copyrightPage, dedicationPage, acknowledgementsPage, builtIn: false, createdAt: now, updatedAt: now });
  return id;
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.templates.delete(id);
}

/** Save the current structure of a book as a reusable template. */
export async function templateFromBook(bookId: string, name: string): Promise<string> {
  const book = await db.books.get(bookId);
  const sections = (await db.sections.where('bookId').equals(bookId).sortBy('order')).map((s) => s.title);
  return saveTemplate({ name, bookType: book?.type ?? 'custom', sections });
}

/** Writing/drawing space after a piece in one book (undefined = automatic). */
export async function setEntrySpace(entryId: string, space: BookEntry['space']): Promise<void> {
  await db.entries.update(entryId, { space, updatedAt: Date.now() });
}
