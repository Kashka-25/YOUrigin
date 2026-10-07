import { describe, expect, it } from 'vitest';
import { displayTitle, extractHashtags, parseCapture, splitPieces, extractMarkdownTitle, newId } from './text';
import { computeBookProgress } from './progress';
import { EMPTY_FILTERS, filterItems, parseQuery, type LibraryContext } from './query';
import { buildGraph, layout } from './graph';
import type { BookEntry, ContentItem, Section, Status } from './types';

function item(id: string, status: Status, tagIds: string[] = [], body = 'text'): ContentItem {
  return {
    id,
    title: '',
    body,
    type: 'poem',
    status,
    tagIds,
    notes: '',
    source: { kind: 'capture' },
    keepUnassigned: false,
    archived: false,
    deletedAt: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function ctx(tags: Record<string, string>, booksOf: Record<string, string[]> = {}): LibraryContext {
  return {
    tagName: new Map(Object.entries(tags)),
    tagIdByName: new Map(Object.entries(tags).map(([k, v]) => [v, k])),
    booksOf: new Map(Object.entries(booksOf).map(([k, v]) => [k, new Set(v)])),
    collectionsOf: new Map(),
    bookTitle: new Map(),
    collectionName: new Map(),
  };
}

describe('capture parsing', () => {
  it('extracts hashtags as normalised tags', () => {
    expect(extractHashtags('The sea #Water and #grief\n#water #surrender #poetry')).toEqual(['water', 'grief', 'surrender', 'poetry']);
  });

  it('removes tag-only lines but keeps hashtags inside sentences', () => {
    const { body, tags } = parseCapture('The ocean doesn’t ask the shore\nfor #permission to leave.\n\n#water #surrender #poetry\n');
    expect(body).toBe('The ocean doesn’t ask the shore\nfor #permission to leave.');
    expect(tags).toEqual(['permission', 'water', 'surrender', 'poetry']);
  });

  it('does not treat a markdown heading as a tag', () => {
    expect(extractHashtags('# Title\n\nbody')).toEqual([]);
  });

  it('preserves internal whitespace exactly', () => {
    const poem = 'line one\n    indented\n\n\nafter gap';
    expect(parseCapture(poem).body).toBe(poem);
  });

  it('splits pieces on separators and blank lines', () => {
    expect(splitPieces('one\n---\ntwo\n***\nthree', 'separator')).toEqual(['one', 'two', 'three']);
    expect(splitPieces('a\nb\n\n\nc', 'blank-lines')).toEqual(['a\nb', 'c']);
    expect(splitPieces('a\n\nb', 'blank-lines')).toEqual(['a\n\nb']);
    expect(splitPieces('  \n', 'none')).toEqual([]);
  });

  it('derives titles from the first line', () => {
    expect(displayTitle({ title: '', body: '\n\nFirst line\nsecond' })).toBe('First line');
    expect(displayTitle({ title: 'Given', body: 'x' })).toBe('Given');
    expect(extractMarkdownTitle('# Salt\n\nbody')).toEqual({ title: 'Salt', body: 'body' });
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 500 }, newId));
    expect(ids.size).toBe(500);
  });
});

describe('library queries', () => {
  const tags = { t1: 'water', t2: 'grief', t3: 'love' };
  const items = [
    item('a', 'developing', ['t1', 't2'], 'river'),
    item('b', 'developing', ['t2']),
    item('c', 'seed', ['t2']),
    item('d', 'polished', ['t1']),
  ];

  it('parses #tags and words', () => {
    expect(parseQuery('#Water shore')).toEqual({ tags: ['water'], text: ['shore'] });
  });

  it('searches by tag', () => {
    const r = filterItems(items, { ...EMPTY_FILTERS, query: '#water' }, ctx(tags));
    expect(r.map((i) => i.id).sort()).toEqual(['a', 'd']);
  });

  it('combines status and tag filters (Developing + #grief)', () => {
    const r = filterItems(items, { ...EMPTY_FILTERS, statuses: ['developing'], tagIds: ['t2'] }, ctx(tags));
    expect(r.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });

  it('requires every selected tag (intersection)', () => {
    const r = filterItems(items, { ...EMPTY_FILTERS, tagIds: ['t1', 't2'] }, ctx(tags));
    expect(r.map((i) => i.id)).toEqual(['a']);
  });

  it('finds orphans', () => {
    const r = filterItems(items, { ...EMPTY_FILTERS, orphansOnly: true }, ctx(tags, { a: ['book1'] }));
    expect(r.map((i) => i.id).sort()).toEqual(['b', 'c', 'd']);
  });

  it('hides trashed pieces', () => {
    const trashed = { ...item('z', 'seed'), deletedAt: 5 };
    expect(filterItems([trashed], EMPTY_FILTERS, ctx(tags))).toEqual([]);
  });
});

describe('book progress', () => {
  const sections: Section[] = [
    { id: 's1', bookId: 'b', title: 'Opening', order: 0, notes: '', createdAt: 0, updatedAt: 0 },
    { id: 's2', bookId: 'b', title: 'Closing', order: 1, notes: '', createdAt: 0, updatedAt: 0 },
  ];
  const entry = (id: string, sectionId: string | null, contentId: string, order = 0): BookEntry => ({
    id,
    bookId: 'b',
    sectionId,
    contentId,
    order,
    createdAt: 0,
    updatedAt: 0,
  });

  it('is zero for an empty book and suggests adding material', () => {
    const p = computeBookProgress(sections, [], new Map());
    expect(p.overall).toBe(0);
    expect(p.nextAction).toMatch(/Gather material/);
  });

  it('computes figures from real statuses', () => {
    const content = new Map([
      ['p', item('p', 'polished')],
      ['d', item('d', 'developing')],
      ['s', item('s', 'seed')],
    ]);
    const p = computeBookProgress(sections, [entry('e1', 's1', 'p'), entry('e2', 's1', 'd', 1), entry('e3', 's2', 's')], content);
    expect(p.structure).toBe(1);
    expect(p.content).toBeCloseTo(2 / 3);
    expect(p.editing).toBeCloseTo(1 / 3);
    expect(p.counts).toEqual({ seed: 1, developing: 1, polished: 1, total: 3 });
    expect(p.nextAction).toMatch(/Develop the seed .* in Closing/);
  });

  it('points to the tray and empty sections first', () => {
    const content = new Map([['p', item('p', 'polished')]]);
    expect(computeBookProgress(sections, [entry('e', null, 'p')], content).nextAction).toMatch(/tray/);
    expect(computeBookProgress(sections, [entry('e', 's1', 'p')], content).nextAction).toMatch(/Find material for “Closing”/);
  });
});

describe('book map graph', () => {
  it('links co-occurring tags and lays out within bounds', () => {
    const { nodes, edges } = buildGraph({
      items: [
        { id: '1', tagIds: ['a', 'b'] },
        { id: '2', tagIds: ['a', 'b'] },
        { id: '3', tagIds: ['c'] },
      ],
      tagName: new Map([
        ['a', 'water'],
        ['b', 'grief'],
        ['c', 'fire'],
      ]),
      books: [{ id: 'B', title: 'YOU — Water', contentIds: ['1'] }],
      collections: [],
    });
    expect(nodes.map((n) => n.id).sort()).toEqual(['b:B', 't:a', 't:b', 't:c']);
    expect(edges.find((e) => (e.a === 't:a' && e.b === 't:b') || (e.a === 't:b' && e.b === 't:a'))?.weight).toBe(2);
    const laid = layout(nodes, edges, 800, 600);
    for (const n of laid) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(800);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });
});
