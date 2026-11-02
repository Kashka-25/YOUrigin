// The publishing checklist: how big each chapter is and what the book still needs
// before it goes out. Pure data — no page layout needed (Design & print measures that).
import type { Book, BookDesign, BookEntry, ContentItem, Section, Status } from '../domain/types';
import { wordCount } from '../domain/text';
import { ISBN_PLACEHOLDER, MARGINS, TRIMS } from './design';
import { resolveCover } from './cover';
import { resolveSpace } from './render';

export interface ChapterSize {
  id: string;
  title: string;
  pieces: number;
  words: number;
  /** Estimated printed pages, opener included. */
  pages: number;
  status: Record<Status, number>;
}

export type ItemState = 'done' | 'todo' | 'optional';

const OPTIONAL = new Set(['dedication', 'acks', 'bio']);

export interface ChecklistItem {
  id: string;
  label: string;
  state: ItemState;
  detail?: string;
  fix?: { label: string; to: string };
}

export interface PublishingChecklist {
  chapters: ChapterSize[];
  totals: { pieces: number; words: number; pages: number; tray: number; status: Record<Status, number> };
  /** Pages counted the last time Design & print laid the book out. */
  laidOutPages: number | null;
  items: ChecklistItem[];
  /** Required items done, out of all required items. */
  ready: { done: number; of: number };
}

/**
 * Rough page geometry for estimates, calibrated against Design & print's own layout
 * (6×9in, EB Garamond 11pt, 1.45 spacing: about 4,300 characters of prose a page).
 */
export function pageGeometry(d: BookDesign) {
  const t = TRIMS[d.trim];
  const inch = (v: number) => (t.unit === 'mm' ? v / 25.4 : v);
  const m = MARGINS[d.margins];
  const widthPt = (inch(t.w) - m.inner - m.outer) * 72;
  const heightPt = (inch(t.h) - m.top - m.bottom) * 72;
  const charsPerLine = Math.max(20, widthPt / (d.fontSize * 0.3));
  const charsPerPage = (4.4 * widthPt * heightPt) / (d.fontSize * d.fontSize * d.lineHeight);
  return { charsPerLine, linesPerPage: Math.max(10, charsPerPage / charsPerLine) };
}

/**
 * Where a piece ends, in pages from the chapter start, when it begins at `at`: its wrapped
 * lines and title, then any writing space — which fills to the end of the page it lands on.
 */
export function placePiece(at: number, c: ContentItem, entry: Pick<BookEntry, 'space'> | undefined, d: BookDesign): number {
  const g = pageGeometry(d);
  if (c.type === 'image') return at + ((c.imageLayout ?? 'full-page') === 'inline' ? 0.5 : 1);
  const lineBroken = c.type === 'poem' || c.type === 'fragment';
  // A title takes about two lines; the gap between paragraphs or stanzas about half a line.
  let lines = c.title.trim() || c.type !== 'poem' ? 2 : 0;
  for (const block of c.body.trim().split(/\n\s*\n+/)) {
    if (!block.trim()) continue;
    for (const l of block.split('\n')) lines += lineBroken ? Math.max(1, Math.ceil(l.length / g.charsPerLine)) : l.length / g.charsPerLine;
    lines += 0.5;
  }
  let end = at + lines / g.linesPerPage;
  const sp = resolveSpace(c, entry, d);
  if (sp.kind !== 'none') {
    if (sp.size === 'fill' || sp.size === 'fill+page') end = Math.ceil(end);
    if (sp.size === 'page' || sp.size === 'fill+page') end += 1;
  }
  return end;
}

/** Estimated pages for one piece on its own. */
export const piecePages = (c: ContentItem, entry: Pick<BookEntry, 'space'> | undefined, d: BookDesign) => placePiece(0, c, entry, d);

export function publishingChecklist(book: Book, design: BookDesign, sections: Section[], entries: BookEntry[], contentById: Map<string, ContentItem>): PublishingChecklist {
  const d = design;
  const base = `/projects/${book.id}`;
  const cover = resolveCover(d);
  const live = entries.filter((e) => {
    const c = contentById.get(e.contentId);
    return c && !c.deletedAt;
  });
  const empty = (): Record<Status, number> => ({ seed: 0, developing: 0, polished: 0 });

  const chapters: ChapterSize[] = [...sections]
    .sort((a, b) => a.order - b.order)
    .map((s) => {
      const placed = live.filter((e) => e.sectionId === s.id).sort((a, b) => a.order - b.order);
      const status = empty();
      let words = 0;
      // The chapter title takes about a fifth of a page (an opener picture, a page); the first piece follows it.
      let pages = s.imageAssetId ? 1 : 0.2;
      placed.forEach((e, i) => {
        const c = contentById.get(e.contentId)!;
        if (c.type !== 'image') {
          status[c.status]++;
          words += wordCount(c.body);
        }
        // Later pieces on a new page, and full-page pictures, start on a fresh page.
        if ((d.pieceOnNewPage && i > 0) || (c.type === 'image' && (c.imageLayout ?? 'full-page') !== 'inline')) pages = Math.ceil(pages);
        pages = placePiece(pages, c, e, d);
        // The ornament between pieces sharing a page.
        if (i > 0 && !d.pieceOnNewPage && d.ornament) pages += 1 / pageGeometry(d).linesPerPage;
      });
      // Chapters start on a fresh page, so each one fills whole pages.
      pages = placed.length || s.imageAssetId ? Math.ceil(pages) : 0;
      return { id: s.id, title: s.title, pieces: placed.length, words, pages, status };
    });

  const status = empty();
  for (const ch of chapters) for (const k of ['seed', 'developing', 'polished'] as const) status[k] += ch.status[k];
  const printedChapters = chapters.filter((c) => c.pieces > 0);
  const totals = {
    pieces: chapters.reduce((n, c) => n + c.pieces, 0),
    words: chapters.reduce((n, c) => n + c.words, 0),
    pages: chapters.reduce((n, c) => n + c.pages, 0),
    tray: live.filter((e) => !e.sectionId).length,
    status,
  };

  const items: ChecklistItem[] = [];
  const add = (id: string, label: string, state: ItemState, fix?: ChecklistItem['fix'], detail?: string) => items.push({ id, label, state, fix, detail });
  const front = { label: 'Front pages', to: `${base}/print` };
  const coverFix = { label: 'Cover', to: `${base}/cover` };

  // The writing.
  add('placed', 'Every piece placed in a chapter', totals.tray ? 'todo' : 'done', totals.tray ? { label: 'Place them', to: base } : undefined, totals.tray ? `${totals.tray} waiting in the tray won’t be published.` : undefined);
  const hollow = chapters.filter((c) => c.pieces === 0);
  add('chapters', 'Every chapter has pieces', hollow.length ? 'todo' : 'done', hollow.length ? { label: 'Open the project', to: base } : undefined, hollow.length ? `Empty: ${hollow.map((c) => c.title).join(', ')}.` : undefined);
  const unfinished = status.seed + status.developing;
  add(
    'polished',
    'Every piece polished',
    unfinished ? 'todo' : 'done',
    unfinished ? { label: 'Open Contents', to: `${base}/contents` } : undefined,
    unfinished ? [status.seed && `${status.seed} seed${status.seed === 1 ? '' : 's'}`, status.developing && `${status.developing} developing`].filter(Boolean).join(', ') + '.' : undefined,
  );

  // Front and back pages.
  add('titlepage', 'Title page', d.titlePage ? 'done' : 'todo', d.titlePage ? undefined : front);
  add('author', 'Author name', d.author.trim() ? 'done' : 'todo', d.author.trim() ? undefined : front, d.author.trim() ? d.author.trim() : 'Shown on the title page and in the ebook.');
  const isbnPlaceholder = d.copyright.includes(ISBN_PLACEHOLDER) || /\[(insert|add)[^\]]*\]/i.test(d.copyright);
  add(
    'copyright',
    'Copyright page with ISBN',
    d.copyright.trim() && !isbnPlaceholder ? 'done' : 'todo',
    d.copyright.trim() && !isbnPlaceholder ? undefined : front,
    !d.copyright.trim() ? '© year, your name, rights and the ISBN.' : isbnPlaceholder ? `Replace “${ISBN_PLACEHOLDER}” once you have the ISBN.` : undefined,
  );
  add('dedication', 'Dedication', d.dedication.trim() ? 'done' : 'optional', d.dedication.trim() ? undefined : front);
  if (printedChapters.length > 1) add('toc', 'Contents page', d.toc ? 'done' : 'todo', d.toc ? undefined : front);
  add('acks', 'Acknowledgements', d.acknowledgements.trim() ? 'done' : 'optional', d.acknowledgements.trim() ? undefined : front);

  // Cover and store listing.
  add('cover', 'Cover artwork', book.coverAssetId ? 'done' : 'todo', book.coverAssetId ? undefined : coverFix, book.coverAssetId ? undefined : 'Ebook stores need a front cover image.');
  add('blurb', 'Back-cover blurb', cover.blurb.trim() ? 'done' : 'todo', cover.blurb.trim() ? undefined : coverFix, cover.blurb.trim() ? undefined : 'Also the start of your store description.');
  add('bio', 'Author bio', cover.authorBio.trim() ? 'done' : 'optional', cover.authorBio.trim() ? undefined : coverFix);

  // Dedication, acknowledgements and a bio are the author's choice: they never count against readiness.
  const required = items.filter((i) => !OPTIONAL.has(i.id));
  return {
    chapters,
    totals,
    laidOutPages: d.pageCount ?? null,
    items,
    ready: { done: required.filter((i) => i.state === 'done').length, of: required.length },
  };
}
