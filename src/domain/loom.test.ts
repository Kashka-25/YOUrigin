import { describe, expect, it } from 'vitest';
import { buildLoom, layoutLoom, LOOSE_THREAD } from './loom';
import type { Book, BookEntry, ContentItem, Project } from './types';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 9);
const ago = (d: number) => NOW - d * DAY;

function piece(id: string, daysAgo: number, projectIds: string[] = [], extra: Partial<ContentItem> = {}): ContentItem {
  const t = ago(daysAgo);
  return { id, title: id, body: '', type: 'poem', status: 'seed', tagIds: [], notes: '', source: { kind: 'capture' }, keepUnassigned: false, archived: false, deletedAt: null, createdAt: t, updatedAt: t, projectIds, ...extra };
}
const project = (id: string, title: string) => ({ id, title, description: '', category: '', status: 'building', createdAt: 0, updatedAt: 0 }) as Project;
const work = (id: string, title: string, projectIds: string[]) => ({ id, title, projectIds, kind: 'book', archived: false, updatedAt: 0 }) as Book;
const entry = (bookId: string, contentId: string, placedDaysAgo: number) => ({ id: `${bookId}-${contentId}`, bookId, contentId, sectionId: 's', order: 0, createdAt: ago(placedDaysAgo), updatedAt: 0 }) as BookEntry;

function world() {
  const items = [
    piece('a', 40, ['p1'], { status: 'polished' }),
    piece('b', 20, ['p1']),
    piece('c', 5, ['p1', 'p2'], { status: 'developing' }),
    piece('d', 3, ['p2']),
    piece('old', 500, ['p1']),
    piece('loose', 2),
    piece('trashed', 1, ['p1'], { deletedAt: NOW }),
  ];
  const projects = [project('p1', 'Salt Book Project'), project('p2', 'Harbour Songs'), project('p3', 'Quiet')];
  const books = [work('w1', 'Salt Book', ['p1']), work('w2', 'Harbour Album', ['p2']), { ...work('w3', 'Shelved', ['p1']), archived: true } as Book];
  const entries = [entry('w1', 'a', 30), entry('w1', 'c', 4), entry('w2', 'c', 2), entry('w3', 'b', 1)];
  return { items, projects, books, entries, now: NOW };
}

describe('Creation Atlas — The Loom', () => {
  it('runs one thread per Project, busiest first, with loose pieces last', () => {
    const loom = buildLoom({ ...world(), range: 'season' });
    expect(loom.threads.map((t) => t.id)).toEqual(['p1', 'p2', LOOSE_THREAD]);
    expect(loom.threads[0].knots.map((k) => k.id)).toEqual(['a', 'b', 'c']);
    // A piece in two Projects is a knot on both threads.
    expect(loom.threads[1].knots.map((k) => k.id)).toEqual(['c', 'd']);
    // Empty Projects and pieces in the Trash are left out.
    expect(loom.threads.some((t) => t.id === 'p3')).toBe(false);
  });

  it('drops a knot into the Work it went into, at the moment it was placed', () => {
    const loom = buildLoom({ ...world(), range: 'season' });
    const salt = loom.threads[0].bands;
    expect(salt.map((b) => b.title)).toEqual(['Salt Book']); // the archived Work is left out
    expect(salt[0].drops).toEqual([
      { contentId: 'a', from: ago(40), to: ago(30) },
      { contentId: 'c', from: ago(5), to: ago(4) },
    ]);
    // On the Harbour thread, the same piece drops into the Harbour Work only.
    expect(loom.threads[1].bands.map((b) => b.title)).toEqual(['Harbour Album']);
  });

  it('shows only what was gathered in the chosen range', () => {
    const month = buildLoom({ ...world(), range: 'month' });
    expect(month.threads.find((t) => t.id === 'p1')!.knots.map((k) => k.id)).toEqual(['b', 'c']);
    const all = buildLoom({ ...world(), range: 'all' });
    expect(all.threads[0].knots[0].id).toBe('old');
    expect(all.start).toBeLessThan(ago(500));
  });

  it('is empty, not broken, with nothing gathered', () => {
    expect(buildLoom({ items: [], projects: [], books: [], entries: [], range: 'year', now: NOW }).threads).toEqual([]);
  });

  it('lays knots in time order inside the plate, and fits a phone by scrolling sideways', () => {
    const loom = buildLoom({ ...world(), range: 'season' });
    const wide = layoutLoom(loom, 'season', 1200);
    const a = wide.knots.get('p1:a')!;
    const c = wide.knots.get('p1:c')!;
    expect(a.x).toBeLessThan(c.x);
    expect(c.x).toBeLessThanOrEqual(wide.width);
    expect(wide.rows.map((r) => r.id)).toEqual(['p1', 'p2', LOOSE_THREAD]);
    expect(wide.ticks.length).toBeGreaterThan(1);
    const phone = layoutLoom(loom, 'season', 360);
    expect(phone.labelWidth).toBeLessThan(wide.labelWidth);
    expect(phone.width).toBeGreaterThan(360); // a season is wider than a phone: it scrolls
  });
});
