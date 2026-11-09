import { describe, expect, it } from 'vitest';
import { buildMotifTable, layoutMotifs, LOOSE } from './atlas';
import type { Book, BookEntry, ContentItem } from './types';

let t = 0;
function piece(id: string, body: string, tagIds: string[] = [], extra: Partial<ContentItem> = {}): ContentItem {
  t += 1;
  return { id, title: '', body, type: 'poem', status: 'seed', tagIds, notes: '', source: { kind: 'capture' }, keepUnassigned: false, archived: false, deletedAt: null, createdAt: t, updatedAt: t, ...extra };
}
const book = (id: string, title: string, extra: Partial<Book> = {}) => ({ id, title, kind: 'book', archived: false, updatedAt: 0, ...extra }) as Book;
const entry = (bookId: string, contentId: string, order = 0) => ({ id: `${bookId}-${contentId}`, bookId, contentId, sectionId: 's', order }) as BookEntry;

function world() {
  const items = [
    piece('a', 'The lighthouse lamp turns over the harbour', ['sea']),
    piece('b', 'Harbour water, the lighthouse again', ['sea', 'grief']),
    piece('c', 'Grief walks the harbour at dawn', ['grief']),
    piece('d', 'A lighthouse keeper sleeps', []),
    piece('e', 'Lighthouses everywhere tonight', [], { deletedAt: 9 }),
    piece('f', 'Old poem in an archived book', ['sea']),
  ];
  const tagName = new Map([
    ['sea', 'sea'],
    ['grief', 'grief'],
  ]);
  const books = [book('w1', 'Salt Book'), book('w2', 'Harbour Songs'), book('w3', 'Archived', { archived: true })];
  const entries = [entry('w1', 'a'), entry('w1', 'b', 1), entry('w2', 'c'), entry('w3', 'f')];
  return { items, tagName, books, entries };
}

describe('Creation Atlas — Motifs', () => {
  it('lays your tags across Works, with loose pieces in their own column', () => {
    const table = buildMotifTable(world());
    expect(table.columns.map((c) => c.id)).toEqual(['w1', 'w2', LOOSE]);
    const sea = table.rows.find((r) => r.label === '#sea')!;
    expect(sea.source).toBe('tag');
    expect(sea.cells.get('w1')).toEqual(['a', 'b']);
    // The archived Work is left out; its piece shows as loose.
    expect(sea.cells.get(LOOSE)).toEqual(['f']);
    const grief = table.rows.find((r) => r.label === '#grief')!;
    expect([...grief.cells.keys()]).toEqual(['w1', 'w2']);
  });

  it('suggests repeated words that cross Works, in real words, and never ones in the Trash', () => {
    const table = buildMotifTable(world());
    const words = table.rows.filter((r) => r.source === 'word');
    const harbour = words.find((r) => r.label === 'harbour');
    expect(harbour).toBeDefined();
    expect(harbour!.total).toBe(3);
    const lighthouse = words.find((r) => r.label === 'lighthouse')!;
    expect(lighthouse.cells.get(LOOSE)).toEqual(['d']); // 'e' is in the Trash
    // Tags come first, then suggestions.
    expect(table.rows.findIndex((r) => r.source === 'word')).toBeGreaterThan(table.rows.findIndex((r) => r.source === 'tag'));
  });

  it('does not suggest a word that is already a tag', () => {
    const w = world();
    w.items.push(piece('g', 'grief and grief', []), piece('h', 'more grief'));
    const table = buildMotifTable(w);
    expect(table.rows.filter((r) => r.source === 'word').map((r) => r.label)).not.toContain('grief');
  });

  it('is empty, not broken, with no material', () => {
    expect(buildMotifTable({ items: [], tagName: new Map(), books: [], entries: [] })).toEqual({ columns: [], rows: [] });
  });

  it('numbers the columns on a narrow screen and fits them', () => {
    const table = buildMotifTable(world());
    const narrow = layoutMotifs(table, 360);
    expect(narrow.numbered).toBe(true);
    expect(narrow.width).toBeLessThanOrEqual(360);
    expect(layoutMotifs(table, 1200).numbered).toBe(false);
  });
});
