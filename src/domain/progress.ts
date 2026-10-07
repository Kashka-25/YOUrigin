import type { BookEntry, ContentItem, Section, Status } from './types';
import { displayTitle } from './text';

export interface SectionProgress {
  id: string;
  title: string;
  count: number;
  /** 0..1 — share of the section's pieces that are polished, half credit for developing. */
  progress: number;
}

export interface BookProgress {
  overall: number;
  structure: number;
  content: number;
  editing: number;
  counts: Record<Status, number> & { total: number };
  tray: number;
  sections: SectionProgress[];
  nextAction: string;
}

const STATUS_WEIGHT: Record<Status, number> = { seed: 0, developing: 0.5, polished: 1 };

/**
 * All figures are derived from real data:
 * - structure: share of sections that hold at least one piece
 * - content:   share of placed pieces that have grown past seed
 * - editing:   share of pieces that are polished
 * - overall:   weighted blend (structure 25%, content 35%, editing 40%)
 */
export function computeBookProgress(
  sections: Section[],
  entries: BookEntry[],
  contentById: Map<string, ContentItem>,
): BookProgress {
  const live = entries.filter((e) => {
    const c = contentById.get(e.contentId);
    return c && !c.deletedAt;
  });
  const counts = { seed: 0, developing: 0, polished: 0, total: 0 };
  for (const e of live) {
    const c = contentById.get(e.contentId)!;
    counts[c.status]++;
    counts.total++;
  }
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const bySection = new Map<string, BookEntry[]>();
  for (const e of live) {
    if (!e.sectionId) continue;
    const list = bySection.get(e.sectionId) ?? [];
    list.push(e);
    bySection.set(e.sectionId, list);
  }
  const sectionProgress: SectionProgress[] = ordered.map((s) => {
    const list = bySection.get(s.id) ?? [];
    const sum = list.reduce((acc, e) => acc + STATUS_WEIGHT[contentById.get(e.contentId)!.status], 0);
    return { id: s.id, title: s.title, count: list.length, progress: list.length ? sum / list.length : 0 };
  });
  const filled = sectionProgress.filter((s) => s.count > 0).length;
  const structure = ordered.length ? filled / ordered.length : 0;
  const content = counts.total ? (counts.developing + counts.polished) / counts.total : 0;
  const editing = counts.total ? counts.polished / counts.total : 0;
  const overall = counts.total || ordered.length ? 0.25 * structure + 0.35 * content + 0.4 * editing : 0;
  const tray = live.filter((e) => !e.sectionId).length;

  return {
    overall,
    structure,
    content,
    editing,
    counts,
    tray,
    sections: sectionProgress,
    nextAction: nextBestAction(ordered, live, bySection, tray, contentById),
  };
}

function nextBestAction(
  sections: Section[],
  entries: BookEntry[],
  bySection: Map<string, BookEntry[]>,
  tray: number,
  contentById: Map<string, ContentItem>,
): string {
  if (sections.length === 0) return 'Give the book a shape: add its first section.';
  if (entries.length === 0) return 'Gather material: bring pieces from your library into a section.';
  if (tray > 0) return `Place the ${tray} piece${tray === 1 ? '' : 's'} waiting in the tray.`;
  const empty = sections.find((s) => !(bySection.get(s.id)?.length));
  if (empty) return `Find material for “${empty.title}”.`;
  for (const status of ['seed', 'developing'] as const) {
    for (const s of sections) {
      const list = [...(bySection.get(s.id) ?? [])].sort((a, b) => a.order - b.order);
      const hit = list.find((e) => contentById.get(e.contentId)!.status === status);
      if (hit) {
        const t = displayTitle(contentById.get(hit.contentId)!);
        return status === 'seed' ? `Develop the seed “${t}” in ${s.title}.` : `Refine “${t}” in ${s.title}.`;
      }
    }
  }
  return 'Everything here is polished. Read it through in Manuscript mode.';
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
