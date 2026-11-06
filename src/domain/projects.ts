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

export const PROJECT_HOME_ORDER = ['App', 'Business', 'Creative', 'Place', 'Research', 'Personal', 'Other'] as const;

/**
 * Suggest a home only when the Project's title makes its purpose clear.
 * An explicitly chosen category always wins. Suggestions are used to organise
 * older/uncategorised Projects without changing their notes or Works.
 */
export function suggestedProjectHome(project: {
  title: string;
  description?: string;
  category?: string;
}): string {
  const existing = project.category?.trim();
  if (existing) return existing;

  const title = project.title.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const compact = title.replace(/\s+/g, '');

  const knownHomes: Record<string, string> = {
    'you': 'App',
    'youapp': 'App',
    'yourigin': 'App',
    'commyounity': 'App',
    'empatherapy': 'Business',
    'atlanteangardens': 'Business',
    'sweetvitalnectar': 'Business',
    'rhythmrelics': 'Business',
    'terrasenga': 'Place',
    'lyricideas': 'Creative',
  };
  const known = knownHomes[compact];
  if (known) return known;

  if (/\b(lyrics?|songwriting|songs?|music|band|album|gig|set ?lists?)\b/.test(title)) return 'Creative';
  if (/\b(apps?|software|platforms?|websites?|pwa)\b/.test(title)) return 'App';
  if (/\b(property|farm|farmland|land|homestead|estate)\b/.test(title)) return 'Place';
  if (/\b(research|study|experiment|investigation)\b/.test(title)) return 'Research';
  if (/\b(business|company|brand|shop|store|venture)\b/.test(title)) return 'Business';
  return '';
}
