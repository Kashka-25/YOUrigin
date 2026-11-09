// Creation Atlas, Plate II: The Loom (see docs/CREATION_ATLAS.md).
// Each Project is a thread running through time. Each piece is a knot on its
// Project's thread, placed when it was gathered. When a piece went into a Work,
// a fine line drops from its knot to that Work's band, at the moment it was placed.
// Read-only: it only describes what already exists.

import type { Book, BookEntry, ContentItem, Project, ProjectColour, Status } from './types';

export type LoomRange = 'month' | 'season' | 'year' | 'all';

export const LOOM_RANGES: { value: LoomRange; label: string; days: number | null }[] = [
  { value: 'month', label: 'Month', days: 31 },
  { value: 'season', label: 'Season', days: 92 },
  { value: 'year', label: 'Year', days: 366 },
  { value: 'all', label: 'All time', days: null },
];

const DAY = 86_400_000;

export interface LoomKnot {
  id: string;
  at: number;
  status: Status;
}

export interface LoomDrop {
  contentId: string;
  /** When the piece was gathered (its knot). */
  from: number;
  /** When it was placed in the Work. */
  to: number;
}

export interface LoomBand {
  workId: string;
  title: string;
  drops: LoomDrop[];
}

export interface LoomThread {
  /** A Project id, or LOOSE_THREAD for pieces in no Project. */
  id: string;
  title: string;
  colour?: ProjectColour;
  knots: LoomKnot[];
  bands: LoomBand[];
}

export const LOOSE_THREAD = 'loose';

export interface Loom {
  start: number;
  end: number;
  threads: LoomThread[];
}

export interface LoomInput {
  items: ContentItem[];
  projects: Project[];
  books: Book[];
  entries: BookEntry[];
  range: LoomRange;
  now: number;
}

export function buildLoom({ items, projects, books, entries, range, now }: LoomInput): Loom {
  const live = items.filter((i) => !i.deletedAt && !i.archived);
  const days = LOOM_RANGES.find((r) => r.value === range)?.days ?? null;
  const earliest = Math.min(now, ...live.map((i) => i.createdAt));
  const start = days === null ? earliest - DAY : now - days * DAY;
  const end = now;
  const inRange = (t: number) => t >= start && t <= end;

  const openWorks = new Map(books.filter((b) => !b.archived).map((b) => [b.id, b]));
  const placements = new Map<string, BookEntry[]>();
  for (const e of entries) if (openWorks.has(e.bookId)) placements.set(e.contentId, [...(placements.get(e.contentId) ?? []), e]);

  const knotOf = (i: ContentItem): LoomKnot => ({ id: i.id, at: i.createdAt, status: i.status });
  const projectIds = new Set(projects.map((p) => p.id));

  const thread = (id: string, title: string, colour: ProjectColour | undefined, pieces: ContentItem[], works: Set<string> | null): LoomThread | null => {
    const shown = pieces.filter((i) => inRange(i.createdAt));
    const bands = new Map<string, LoomBand>();
    for (const piece of shown)
      for (const e of placements.get(piece.id) ?? []) {
        // A Project thread drops into its own Works; loose pieces into any Work.
        if (works && !works.has(e.bookId)) continue;
        const work = openWorks.get(e.bookId)!;
        if (!bands.has(work.id)) bands.set(work.id, { workId: work.id, title: work.title || 'Untitled Work', drops: [] });
        bands.get(work.id)!.drops.push({ contentId: piece.id, from: piece.createdAt, to: Math.max(piece.createdAt, Math.min(e.createdAt, end)) });
      }
    if (!shown.length) return null;
    return {
      id,
      title,
      colour,
      knots: shown.map(knotOf).sort((a, b) => a.at - b.at),
      bands: [...bands.values()].sort((a, b) => Math.min(...a.drops.map((d) => d.to)) - Math.min(...b.drops.map((d) => d.to))),
    };
  };

  const threads: LoomThread[] = [];
  for (const p of projects) {
    const works = new Set(books.filter((b) => (b.projectIds ?? []).includes(p.id)).map((b) => b.id));
    const t = thread(p.id, p.title, p.colour, live.filter((i) => (i.projectIds ?? []).includes(p.id)), works);
    if (t) threads.push(t);
  }
  // Busiest threads first.
  threads.sort((a, b) => b.knots.length - a.knots.length || a.title.localeCompare(b.title));
  const loose = thread(
    LOOSE_THREAD,
    'Not in a Project',
    undefined,
    live.filter((i) => !(i.projectIds ?? []).some((id) => projectIds.has(id))),
    null,
  );
  if (loose) threads.push(loose);
  return { start, end, threads };
}

// ---- layout -----------------------------------------------------------------

export interface LoomLayout {
  width: number;
  height: number;
  labelWidth: number;
  x: (t: number) => number;
  /** Per thread: the y of its line, and of each Work band beneath it. */
  rows: { id: string; y: number; bands: { workId: string; y: number }[] }[];
  /** Knot positions (a knot nudged up or down when it would sit on its neighbour). */
  knots: Map<string, { x: number; y: number }>;
  ticks: { x: number; label: string }[];
  axisY: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Days per pixel varies with the range, so a month is spacious and all time stays scrollable. */
const MIN_PX_PER_DAY: Record<LoomRange, number> = { month: 18, season: 6, year: 2.2, all: 1.2 };

export function layoutLoom(loom: Loom, range: LoomRange, availableWidth: number): LoomLayout {
  const labelWidth = availableWidth < 640 ? 12 : 170;
  const days = Math.max(1, (loom.end - loom.start) / DAY);
  const plot = Math.max(availableWidth - labelWidth - 24, days * MIN_PX_PER_DAY[range]);
  const x = (t: number) => labelWidth + ((t - loom.start) / (loom.end - loom.start || 1)) * plot;
  const axisY = 26;
  const narrow = labelWidth < 100;

  let y = axisY + 34;
  const rows: LoomLayout['rows'] = [];
  const knots = new Map<string, { x: number; y: number }>();
  for (const t of loom.threads) {
    // On the phone the thread's name sits above its line.
    if (narrow) y += 16;
    const lineY = y;
    let lastX = -Infinity;
    let nudge = 0;
    for (const k of t.knots) {
      const kx = x(k.at);
      nudge = kx - lastX < 10 ? (nudge === 0 ? -7 : nudge === -7 ? 7 : 0) : 0;
      lastX = kx;
      knots.set(`${t.id}:${k.id}`, { x: kx, y: lineY + nudge });
    }
    y += 22;
    const bands = t.bands.map((b) => {
      const by = y;
      y += 20;
      return { workId: b.workId, y: by };
    });
    rows.push({ id: t.id, y: lineY, bands });
    y += 22;
  }

  // Month marks (or weeks, for a single month).
  const ticks: LoomLayout['ticks'] = [];
  const d = new Date(loom.start);
  if (range === 'month') {
    const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    c.setDate(c.getDate() + ((8 - c.getDay()) % 7)); // next Monday
    for (; c.getTime() <= loom.end; c.setDate(c.getDate() + 7)) ticks.push({ x: x(c.getTime()), label: `${c.getDate()} ${MONTHS[c.getMonth()]}` });
  } else {
    const c = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const step = range === 'all' && days > 900 ? 3 : 1;
    for (; c.getTime() <= loom.end; c.setMonth(c.getMonth() + step))
      ticks.push({ x: x(c.getTime()), label: c.getMonth() === 0 ? `${MONTHS[0]} ${c.getFullYear()}` : MONTHS[c.getMonth()] });
  }
  return { width: Math.ceil(labelWidth + plot + 24), height: y + 6, labelWidth, x, rows, knots, ticks, axisY };
}
