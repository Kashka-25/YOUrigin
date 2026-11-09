import { describe, expect, it } from 'vitest';
import { buildLineage, layoutLineage } from './atlas';
import type { Book, BookEntry, ContentItem, Relationship, Section } from './types';

let t = 0;
function piece(id: string, extra: Partial<ContentItem> = {}): ContentItem {
  t += 1;
  return {
    id,
    title: id,
    body: '',
    type: 'poem',
    status: 'seed',
    tagIds: [],
    notes: '',
    source: { kind: 'capture' },
    keepUnassigned: false,
    archived: false,
    deletedAt: null,
    createdAt: t,
    updatedAt: t,
    ...extra,
  };
}
const rel = (fromId: string, toId: string, kind: Relationship['kind']): Relationship => ({ id: `${fromId}-${toId}`, fromId, toId, kind, note: '', createdAt: 0, updatedAt: 0 });

function world() {
  const items = new Map(
    [
      piece('note'), // the idea behind the artwork
      piece('art', { type: 'image' }),
      piece('poem'),
      piece('poem-v2'),
      piece('ai-draft', { source: { kind: 'ai-variant', derivedFromId: 'poem' } }),
      piece('poem-v3'),
      piece('cousin'),
      piece('gone', { deletedAt: 5 }),
    ].map((i) => [i.id, i]),
  );
  const relationships = [
    rel('art', 'note', 'idea'),
    rel('poem', 'art', 'continues'),
    rel('poem-v2', 'poem', 'variant'),
    rel('ai-draft', 'poem', 'variant'), // recorded twice: as a relationship and a derivedFromId
    rel('poem-v3', 'poem-v2', 'continues'),
    rel('poem', 'cousin', 'echoes'),
    rel('gone', 'poem', 'variant'),
  ];
  const books: Book[] = [{ id: 'b1', title: 'Salt Book', kind: 'book', archived: false } as Book, { id: 'b2', title: 'Old', archived: true } as Book];
  const sections: Section[] = [{ id: 's1', bookId: 'b1', title: 'Shore', order: 0 } as Section];
  const entries: BookEntry[] = [
    { id: 'e0', bookId: 'b1', sectionId: 's1', contentId: 'cousin', order: 0 } as BookEntry,
    { id: 'e1', bookId: 'b1', sectionId: 's1', contentId: 'poem-v3', order: 1 } as BookEntry,
    { id: 'e2', bookId: 'b2', sectionId: null, contentId: 'poem', order: 0 } as BookEntry,
  ];
  return { items, relationships, books, sections, entries };
}

describe('Creation Atlas — Lineage', () => {
  it('walks back to where a piece came from and forward to what came from it', () => {
    const l = buildLineage('poem', world());
    const at = Object.fromEntries(l.nodes.map((n) => [n.id, n.depth]));
    expect(at).toEqual({ note: -2, art: -1, poem: 0, 'poem-v2': 1, 'ai-draft': 1, 'poem-v3': 2 });
    // Ancestors come first, most distant first; then the piece.
    expect(l.nodes.slice(0, 3).map((n) => n.id)).toEqual(['note', 'art', 'poem']);
  });

  it('names how each piece descends, preferring "AI draft" for AI variants', () => {
    const l = buildLineage('poem', world());
    const via = Object.fromEntries(l.nodes.map((n) => [n.id, n.via]));
    expect(via).toMatchObject({ art: 'continues', note: 'idea', 'poem-v2': 'variant', 'ai-draft': 'ai', 'poem-v3': 'continues' });
    expect(l.nodes.filter((n) => n.id === 'ai-draft')).toHaveLength(1);
  });

  it('leaves out pieces in the Trash and archived Works', () => {
    const l = buildLineage('poem', world());
    expect(l.nodes.some((n) => n.id === 'gone')).toBe(false);
    expect(l.places.map((p) => p.workTitle)).toEqual(['Salt Book']);
  });

  it('shows kin separately and where descendants sit in Works', () => {
    const l = buildLineage('poem', world());
    expect(l.kin).toEqual([{ id: 'cousin', kind: 'echoes' }]);
    expect(l.places).toEqual([{ contentId: 'poem-v3', workId: 'b1', workTitle: 'Salt Book', kind: 'book', section: 'Shore', position: 2 }]);
  });

  it('survives loops and respects the depth limit', () => {
    const w = world();
    w.relationships.push(rel('poem', 'poem-v3', 'continues')); // poem continues its own descendant
    const l = buildLineage('poem', { ...w, maxDepth: 1 });
    expect(new Set(l.nodes.map((n) => n.id)).size).toBe(l.nodes.length);
    expect(Math.max(...l.nodes.map((n) => Math.abs(n.depth)))).toBe(1);
  });

  it('a piece with no family is just itself', () => {
    const l = buildLineage('cousin', world());
    expect(l.nodes.map((n) => n.id)).toEqual(['cousin']);
  });

  it('lays out a wide plate in columns and a narrow one top to bottom, without overlaps', () => {
    const l = buildLineage('poem', world());
    for (const o of ['wide', 'narrow'] as const) {
      const p = layoutLineage(l, o);
      expect(p.boxes.filter((b) => b.root)).toHaveLength(1);
      for (const a of p.boxes)
        for (const b of p.boxes)
          if (a !== b) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
      for (const b of p.boxes) expect(b.x + b.w).toBeLessThanOrEqual(p.width);
      const keys = new Set(p.boxes.map((b) => b.key));
      for (const line of p.lines) expect(keys.has(line.from) && keys.has(line.to)).toBe(true);
    }
    const wide = layoutLineage(l, 'wide');
    const x = (k: string) => wide.boxes.find((b) => b.key === k)!.x;
    expect(x('p:note')).toBeLessThan(x('p:art'));
    expect(x('p:art')).toBeLessThan(x('p:poem'));
    expect(x('p:poem')).toBeLessThan(x('p:poem-v3'));
    expect(x('p:poem-v3')).toBeLessThan(x('w:b1'));
  });
});
