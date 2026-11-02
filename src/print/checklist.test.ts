import { describe, expect, it } from 'vitest';
import { piecePages, publishingChecklist } from './checklist';
import { defaultDesign, ISBN_PLACEHOLDER } from './design';
import type { Book, BookEntry, ContentItem, ContentType, Section, Status } from '../domain/types';

const piece = (id: string, type: ContentType, body: string, status: Status = 'polished', extra: Partial<ContentItem> = {}): ContentItem => ({
  id,
  title: id,
  body,
  type,
  status,
  tagIds: [],
  notes: '',
  source: { kind: 'capture' },
  keepUnassigned: false,
  archived: false,
  deletedAt: null,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});
const book: Book = { id: 'b', title: 'B', subtitle: '', description: '', type: 'essay', templateId: null, cover: 'clay', notes: '', archived: false, createdAt: 1, updatedAt: 1 };
const section = (id: string, order: number): Section => ({ id, bookId: 'b', title: id.toUpperCase(), order, notes: '', createdAt: 1, updatedAt: 1 });
const entry = (contentId: string, sectionId: string | null, order: number): BookEntry => ({ id: 'e-' + contentId, bookId: 'b', sectionId, contentId, order, createdAt: 1, updatedAt: 1 });

describe('page estimates', () => {
  const d = defaultDesign('essay');

  it('grows with the writing, and a long essay fills several pages', () => {
    const short = piecePages(piece('a', 'reflection', 'A few words.'), undefined, d);
    const long = piecePages(piece('b', 'reflection', 'word '.repeat(1500)), undefined, d);
    expect(short).toBeLessThan(0.5);
    // About 4,300 characters of prose fill a 6×9 page in Design & print's layout.
    expect(long).toBeGreaterThan(1.4);
    expect(long).toBeLessThan(2.2);
  });

  it('counts a full-page picture as a page and an inline one as half', () => {
    expect(piecePages(piece('i', 'image', ''), undefined, d)).toBe(1);
    expect(piecePages(piece('i', 'image', '', 'polished', { imageLayout: 'inline' }), undefined, d)).toBe(0.5);
  });

  it('adds a page of writing lines when a prompt asks for one', () => {
    const prompt = piece('p', 'prompt', 'What do you carry?');
    expect(piecePages(prompt, { space: { kind: 'lines', size: 'page' } }, d)).toBeGreaterThan(1);
  });
});

describe('publishing checklist', () => {
  const items = [piece('one', 'reflection', 'word '.repeat(300)), piece('two', 'poem', 'a\nb\nc', 'seed'), piece('three', 'reflection', 'x', 'developing'), piece('loose', 'poem', 'y')];
  const contentById = new Map(items.map((i) => [i.id, i]));
  const sections = [section('s2', 1), section('s1', 0), section('s3', 2)];
  const entries = [entry('one', 's1', 0), entry('two', 's1', 1), entry('three', 's2', 0), entry('loose', null, 0)];

  it('sizes each chapter in book order', () => {
    const c = publishingChecklist(book, defaultDesign('essay'), sections, entries, contentById);
    expect(c.chapters.map((x) => x.title)).toEqual(['S1', 'S2', 'S3']);
    expect(c.chapters[0]).toMatchObject({ pieces: 2, words: 303, status: { seed: 1, developing: 0, polished: 1 } });
    expect(c.chapters[0].pages).toBeGreaterThanOrEqual(1);
    expect(c.chapters[2]).toMatchObject({ pieces: 0, words: 0, pages: 0 });
    expect(c.totals).toMatchObject({ pieces: 3, words: 304, tray: 1 });
  });

  it('lets the first piece share the chapter’s opening page when pieces start new pages', () => {
    const d = { ...defaultDesign('poetry'), pieceOnNewPage: true };
    const one = publishingChecklist(book, d, [section('s1', 0)], [entry('two', 's1', 0)], contentById);
    const two = publishingChecklist(book, d, [section('s1', 0)], [entry('two', 's1', 0), entry('loose', 's1', 1)], contentById);
    expect(one.chapters[0].pages).toBe(1);
    expect(two.chapters[0].pages).toBe(2);
  });

  it('lists what is still to do, and never counts optional pages against the book', () => {
    const c = publishingChecklist(book, { ...defaultDesign('essay'), copyright: `ISBN ${ISBN_PLACEHOLDER}` }, sections, entries, contentById);
    const state = Object.fromEntries(c.items.map((i) => [i.id, i.state]));
    expect(state).toMatchObject({ placed: 'todo', chapters: 'todo', polished: 'todo', author: 'todo', copyright: 'todo', cover: 'todo', blurb: 'todo', dedication: 'optional', acks: 'optional', bio: 'optional' });
    expect(c.items.find((i) => i.id === 'copyright')!.detail).toContain(ISBN_PLACEHOLDER);
    expect(c.items.find((i) => i.id === 'polished')!.detail).toBe('1 seed, 1 developing.');
    expect(c.ready.of).toBe(c.items.filter((i) => !['dedication', 'acks', 'bio'].includes(i.id)).length);
  });

  it('is ready when everything required is in place', () => {
    const done = new Map(items.map((i) => [i.id, { ...i, status: 'polished' as Status }]));
    const design = {
      ...defaultDesign('essay'),
      author: 'K. Hart',
      copyright: '© 2026 K. Hart\nISBN 978-0-00-000000-0',
      toc: true,
      cover: { blurb: 'A book about water.' },
    } as ReturnType<typeof defaultDesign>;
    const c = publishingChecklist({ ...book, coverAssetId: 'a1' }, design, [section('s1', 0), section('s2', 1)], entries.filter((e) => e.sectionId), done);
    expect(c.items.filter((i) => i.state === 'todo')).toEqual([]);
    expect(c.ready.done).toBe(c.ready.of);
  });
});
