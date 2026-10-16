import type { Book } from './types';

export interface ShelfGroup {
  /** '' = projects not on a shelf. */
  shelf: string;
  projects: Book[];
}

/** Named shelves A–Z (case-insensitive), then projects without a shelf. Most recent first inside each. */
export function groupByShelf(projects: Book[]): ShelfGroup[] {
  const groups = new Map<string, Book[]>();
  for (const p of projects) {
    const shelf = p.shelf?.trim() ?? '';
    groups.set(shelf, [...(groups.get(shelf) ?? []), p]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { sensitivity: 'base' })))
    .map(([shelf, list]) => ({ shelf, projects: list.sort((a, b) => b.updatedAt - a.updatedAt) }));
}

/** Every shelf name in use, A–Z. */
export function shelfNames(projects: Book[]): string[] {
  return groupByShelf(projects)
    .map((g) => g.shelf)
    .filter(Boolean);
}

/** "3 songs", "1 track". */
export function countLabel(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
