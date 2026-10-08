import { describe, expect, it } from 'vitest';
import { dataChecks, kdpGutter, layoutChecks, type Check } from './preflight';
import { DEDICATION_STARTERS, copyrightTemplate, defaultDesign } from './design';
import { bookCss } from './render';
import type { Book, BookEntry, ContentItem, Section } from '../domain/types';

const book: Book = { id: 'b', title: 'Tide', subtitle: '', description: '', type: 'journal', templateId: null, cover: 'clay', notes: '', archived: false, createdAt: 1, updatedAt: 1 };
const section: Section = { id: 's', bookId: 'b', title: 'One', order: 0, notes: '', createdAt: 1, updatedAt: 1 };
const item = (id: string, patch: Partial<ContentItem> = {}): ContentItem => ({
  id,
  title: id,
  body: 'text',
  type: 'poem',
  status: 'polished',
  tagIds: [],
  notes: '',
  source: { kind: 'capture' },
  keepUnassigned: false,
  archived: false,
  deletedAt: null,
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});
const entry = (contentId: string, sectionId: string | null = 's'): BookEntry => ({ id: `e-${contentId}`, bookId: 'b', sectionId, contentId, order: 0, createdAt: 1, updatedAt: 1 });
const find = (cs: Check[], id: string) => cs.find((c) => c.id === id);

function run(items: ContentItem[], entries: BookEntry[], design = defaultDesign('journal'), pages: number | null = 120) {
  return dataChecks({ book, design, sections: [section], entries, contentById: new Map(items.map((c) => [c.id, c])), assets: new Map(), pages });
}

describe('KDP print-ready check', () => {
  it('uses KDP’s gutter table', () => {
    expect(kdpGutter(100)).toBe(0.375);
    expect(kdpGutter(200)).toBe(0.5);
    expect(kdpGutter(450)).toBe(0.625);
    expect(kdpGutter(800)).toBe(0.875);
  });

  it('flags sizes KDP doesn’t print and too few pages', () => {
    const cs = run([], [], { ...defaultDesign('journal'), trim: '8x8' }, 12);
    expect(find(cs, 'trim')?.level).toBe('fail');
    expect(find(cs, 'pages')?.level).toBe('fail');
  });

  it('passes a well set-up book', () => {
    const d = { ...defaultDesign('journal'), author: 'Cassidy Dugan', copyright: '© 2026 Cassidy Dugan\nISBN 978-0-00-000000-0' };
    const cs = run([item('a')], [entry('a')], d, 120);
    for (const id of ['trim', 'pages', 'gutter', 'status', 'titlepage', 'author', 'copyright']) expect(find(cs, id)?.level).toBe('pass');
  });

  it('points out Seeds, unplaced pieces and placeholder text', () => {
    const cs = run(
      [item('seed', { status: 'seed' }), item('tray'), item('todo', { body: 'TODO finish this' })],
      [entry('seed'), entry('tray', null), entry('todo')],
    );
    expect(find(cs, 'seeds')?.items?.map((i) => i.id)).toEqual(['seed']);
    expect(find(cs, 'tray')?.level).toBe('warn');
    expect(find(cs, 'placeholders')?.items?.map((i) => i.id)).toEqual(['todo']);
  });

  it('requires bleed for edge-to-edge images and notes greyscale emoji', () => {
    const cs = run([item('pic', { type: 'image', imageLayout: 'full-bleed' }), item('🌊 Wave')], [entry('pic'), entry('🌊 Wave')]);
    expect(find(cs, 'bleed')?.level).toBe('fail');
    expect(find(cs, 'emoji')?.level).toBe('info');
  });

  it('applies KDP’s blank-page rule from the real layout', () => {
    expect(layoutChecks({ blankRuns: [{ start: 10, length: 3 }], totalBlank: 3, images: [] }, 120)[0].level).toBe('fail');
    expect(layoutChecks({ blankRuns: [{ start: 115, length: 6 }], totalBlank: 6, images: [] }, 120)[0].level).toBe('pass');
    expect(find(layoutChecks({ blankRuns: [], totalBlank: 0, images: [{ name: 'x', dpi: 150, page: 4 }] }, 120), 'image-dpi')?.level).toBe('fail');
  });

  it('sizes bleed pages the way KDP expects, without crop marks', () => {
    const css = bookCss({ ...defaultDesign('journal'), bleed: true });
    expect(css).toContain('size: 6.1250in 9.2500in');
    expect(css).not.toMatch(/marks:|bleed:/);
  });

  it('offers a copyright template and flags its ISBN placeholder until filled', () => {
    const text = copyrightTemplate(book, 'Cassidy Dugan', 2026);
    expect(text).toContain('Copyright © 2026 Cassidy Dugan');
    expect(text).toMatch(/not a substitute/); // journals get a wellbeing note
    const d = { ...defaultDesign('journal'), author: 'Cassidy Dugan', copyright: text };
    expect(find(run([item('a')], [entry('a')], d), 'isbn')?.level).toBe('warn');
    const filled = { ...d, copyright: text.replace('[insert ISBN]', '979-8-0000-0000-0') };
    expect(find(run([item('a')], [entry('a')], filled), 'copyright')?.level).toBe('pass');
  });

  it('flags a dedication template until its [placeholders] are rewritten', () => {
    const d = { ...defaultDesign('poetry'), dedication: DEDICATION_STARTERS[1].text };
    expect(find(run([item('a')], [entry('a')], d), 'dedication')?.level).toBe('warn');
    expect(find(run([item('a')], [entry('a')], { ...d, dedication: 'For Mum,\nwho taught me the sea.' }), 'dedication')).toBeUndefined();
  });
});
