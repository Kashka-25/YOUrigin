// Print-ready check for Amazon KDP paperbacks. Pure data checks live here;
// layout checks (blank pages, image sharpness) measure the rendered pages.
import type { Asset, Book, BookDesign, BookEntry, ContentItem, Section, TrimSize } from '../domain/types';
import { ISBN_PLACEHOLDER, MARGINS, TRIMS } from './design';
import { coverGeometry, resolveCover, MIN_PAGES_FOR_SPINE_TEXT, BLEED_IN } from './cover';
import { displayTitle } from '../domain/text';
import { resolveSpace } from './render';

export type Level = 'pass' | 'info' | 'warn' | 'fail';

export interface Check {
  id: string;
  level: Level;
  title: string;
  detail?: string;
  /** In-app link that helps fix it. */
  fix?: { label: string; to: string };
  /** Pieces this concerns, for quick links. */
  items?: { id: string; title: string }[];
}

/** KDP paperback trim sizes we offer that KDP accepts. */
const KDP_TRIMS: Partial<Record<TrimSize, true>> = { '5x8': true, '5.5x8.5': true, '6x9': true, '7x10': true, '8.5x11': true, a4: true };

/** Minimum inside (gutter) margin for a page count — KDP's table, in inches. */
export function kdpGutter(pages: number): number {
  if (pages <= 150) return 0.375;
  if (pages <= 300) return 0.5;
  if (pages <= 500) return 0.625;
  if (pages <= 700) return 0.75;
  return 0.875;
}

const MAX_PAGES: Record<string, number> = { white: 828, cream: 776, 'standard-colour': 600, 'premium-colour': 828 };
const PLACEHOLDER = /\b(TODO|TBD|TK|lorem ipsum)\b|\[(insert|add|tbc)[^\]]*\]|XXX/i;
const EMOJI = /\p{Extended_Pictographic}/u;
export const MIN_DPI = 300;
const LOW_DPI = 200;

export interface PreflightInput {
  book: Book;
  design: BookDesign;
  sections: Section[];
  entries: BookEntry[];
  contentById: Map<string, ContentItem>;
  assets: Map<string, Asset>;
  /** Pages in the current layout. */
  pages: number | null;
}

export function dataChecks({ book, design: d, sections, entries, contentById, assets, pages }: PreflightInput): Check[] {
  const out: Check[] = [];
  const base = `/books/${book.id}`;
  const cover = resolveCover(d);
  const t = TRIMS[d.trim];
  const m = MARGINS[d.margins];
  const live = entries.map((e) => ({ e, c: contentById.get(e.contentId) })).filter((x): x is { e: BookEntry; c: ContentItem } => !!x.c && !x.c.deletedAt);
  const placed = live.filter((x) => x.e.sectionId);
  const sectionIds = new Set(sections.map((s) => s.id));
  const printed = placed.filter((x) => sectionIds.has(x.e.sectionId!)).map((x) => x.c);
  const list = (cs: ContentItem[]) => cs.slice(0, 12).map((c) => ({ id: c.id, title: displayTitle(c) }));

  // --- Book setup ----------------------------------------------------------
  out.push(
    KDP_TRIMS[d.trim]
      ? { id: 'trim', level: 'pass', title: `Trim size ${t.label.split(' — ')[0]} is a KDP paperback size` }
      : {
          id: 'trim',
          level: 'fail',
          title: `${t.label.split(' — ')[0]} isn’t one of KDP’s standard paperback sizes`,
          detail: 'Choose 5×8, 5.5×8.5, 6×9, 7×10, 8.5×11 or A4 — or use a printer that supports this size (e.g. IngramSpark).',
          fix: { label: 'Change trim size', to: `${base}/print` },
        },
  );

  if (pages === null) out.push({ id: 'pages', level: 'info', title: 'Pages are still being laid out…' });
  else if (pages < 24) out.push({ id: 'pages', level: 'fail', title: `${pages} pages — KDP paperbacks need at least 24`, detail: 'Add pieces, or turn on “Each piece starts on a new page”.' });
  else if (pages > MAX_PAGES[cover.paper])
    out.push({ id: 'pages', level: 'fail', title: `${pages} pages is over KDP’s limit for this paper (${MAX_PAGES[cover.paper]})`, fix: { label: 'Paper & cover', to: `${base}/cover` } });
  else out.push({ id: 'pages', level: 'pass', title: `${pages} pages — within KDP’s limits`, detail: pages % 2 ? 'Odd page count: KDP adds a blank page at the end.' : undefined });

  if (pages !== null) {
    const need = kdpGutter(pages);
    out.push(
      m.inner >= need
        ? { id: 'gutter', level: 'pass', title: `Inside margin ${m.inner}″ meets KDP’s ${need}″ for ${pages} pages` }
        : { id: 'gutter', level: 'fail', title: `Inside margin ${m.inner}″ is below KDP’s ${need}″ for ${pages} pages`, detail: 'Text could disappear into the binding.', fix: { label: 'Use wider margins', to: `${base}/print` } },
    );
  }
  // With bleed the page grows 0.125″ and so do the margins, keeping KDP's 0.375″ from the bleed edge.
  if (Math.min(m.outer, m.top, m.bottom) < 0.25)
    out.push({ id: 'outer', level: 'fail', title: 'Outside margins are below KDP’s 0.25″ minimum', fix: { label: 'Margins', to: `${base}/print` } });

  const bleedImages = printed.filter((c) => c.type === 'image' && c.imageLayout === 'full-bleed');
  if (bleedImages.length && !d.bleed)
    out.push({
      id: 'bleed',
      level: 'fail',
      title: `${bleedImages.length} image${bleedImages.length === 1 ? '' : 's'} run to the page edge, but bleed is off`,
      detail: 'Turn on “Add bleed for print services”, then choose “Bleed” when uploading to KDP.',
      fix: { label: 'Turn on bleed', to: `${base}/print` },
      items: list(bleedImages),
    });
  else if (d.bleed) out.push({ id: 'bleed', level: 'info', title: 'Bleed is on', detail: 'When uploading the interior to KDP, choose “Bleed” so the page size matches.' });
  else out.push({ id: 'bleed', level: 'pass', title: 'No artwork runs to the edge — upload with “No bleed”' });

  // --- Contents --------------------------------------------------------------
  const tray = live.filter((x) => !x.e.sectionId).map((x) => x.c);
  if (tray.length)
    out.push({ id: 'tray', level: 'warn', title: `${tray.length} piece${tray.length === 1 ? ' is' : 's are'} in the tray and won’t be printed`, fix: { label: 'Place them', to: base }, items: list(tray) });
  const seeds = printed.filter((c) => c.status === 'seed' && c.type !== 'image');
  const developing = printed.filter((c) => c.status === 'developing' && c.type !== 'image');
  if (seeds.length) out.push({ id: 'seeds', level: 'warn', title: `${seeds.length} piece${seeds.length === 1 ? ' is' : 's are'} still Seeds`, detail: 'Publish anyway, or develop them first.', fix: { label: 'Open Contents', to: `${base}/contents` }, items: list(seeds) });
  if (developing.length) out.push({ id: 'developing', level: 'info', title: `${developing.length} piece${developing.length === 1 ? ' is' : 's are'} still Developing`, fix: { label: 'Open Contents', to: `${base}/contents` }, items: list(developing) });
  if (!seeds.length && !developing.length && printed.length) out.push({ id: 'status', level: 'pass', title: 'Every piece is Polished' });

  const placeholders = printed.filter((c) => PLACEHOLDER.test(`${c.title}\n${c.body}`));
  if (placeholders.length)
    out.push({ id: 'placeholders', level: 'warn', title: `${placeholders.length} piece${placeholders.length === 1 ? ' has' : 's have'} placeholder text (TODO, [insert…], XXX)`, items: list(placeholders) });
  // A heading followed by writing lines or drawing space is a journal page, not a missing poem.
  const empty = placed
    .filter(({ e, c }) => sectionIds.has(e.sectionId!) && c.type !== 'image' && c.type !== 'prompt' && !c.body.trim() && resolveSpace(c, e, d).size === 'none')
    .map((x) => x.c);
  if (empty.length) out.push({ id: 'empty', level: 'info', title: `${empty.length} piece${empty.length === 1 ? ' has' : 's have'} a title but no text`, items: list(empty) });

  const bw = cover.paper === 'white' || cover.paper === 'cream';
  const emoji = printed.filter((c) => EMOJI.test(`${c.title}${c.body}`));
  if (bw && (emoji.length || sections.some((s) => EMOJI.test(s.title))))
    out.push({
      id: 'emoji',
      level: 'info',
      title: 'Emoji will print in greyscale',
      detail: 'Your interior is black & white (set on the Cover page). Emoji like 🌊 🌀 will print as grey shapes — keep, or remove them from titles.',
      items: list(emoji),
    });
  const greyImages = printed.filter((c) => c.type === 'image');
  if (bw && greyImages.length) out.push({ id: 'bw-images', level: 'info', title: `${greyImages.length} image${greyImages.length === 1 ? '' : 's'} will print in black & white` });

  // --- Front matter ------------------------------------------------------------
  out.push(d.titlePage ? { id: 'titlepage', level: 'pass', title: 'Title page included' } : { id: 'titlepage', level: 'warn', title: 'No title page', fix: { label: 'Front pages', to: `${base}/print` } });
  out.push(d.author.trim() ? { id: 'author', level: 'pass', title: `Author: ${d.author.trim()}` } : { id: 'author', level: 'warn', title: 'No author name set', fix: { label: 'Add author', to: `${base}/print` } });
  if (!d.copyright.trim()) out.push({ id: 'copyright', level: 'warn', title: 'No copyright page', detail: 'Add © year, your name and rights, plus the ISBN.', fix: { label: 'Front pages', to: `${base}/print` } });
  else if (d.copyright.includes(ISBN_PLACEHOLDER) || /\[(insert|add)[^\]]*\]/i.test(d.copyright))
    out.push({ id: 'isbn', level: 'warn', title: 'Copyright page still has a placeholder', detail: 'Replace “[insert ISBN]” with your ISBN — KDP shows it after you set up the paperback, or offers a free one.', fix: { label: 'Front pages', to: `${base}/print` } });
  else if (!/isbn/i.test(d.copyright))
    out.push({ id: 'isbn', level: 'info', title: 'Copyright page has no ISBN', detail: 'KDP can assign a free ISBN — add it to the copyright page once you have it.', fix: { label: 'Front pages', to: `${base}/print` } });
  else out.push({ id: 'copyright', level: 'pass', title: 'Copyright page with ISBN' });

  // --- Cover -------------------------------------------------------------------
  const g = coverGeometry(d, cover, pages ?? d.pageCount);
  const front = book.coverAssetId ? assets.get(book.coverAssetId) : undefined;
  if (!front && cover.frontLayout !== 'type-only')
    out.push({ id: 'cover-art', level: 'warn', title: 'No front cover artwork yet', fix: { label: 'Design cover', to: `${base}/cover` } });
  else if (front) {
    const printedWidth = cover.wrapImage ? g.totalW : g.trimW + BLEED_IN;
    const dpi = Math.round(front.width / printedWidth);
    out.push(
      dpi >= MIN_DPI
        ? { id: 'cover-dpi', level: 'pass', title: `Cover artwork is sharp enough (${dpi} DPI)` }
        : {
            id: 'cover-dpi',
            level: dpi < LOW_DPI ? 'fail' : 'warn',
            title: `Cover artwork is ${dpi} DPI — KDP recommends ${MIN_DPI}`,
            detail: `Use an image at least ${Math.ceil(printedWidth * MIN_DPI)} pixels wide.`,
            fix: { label: 'Design cover', to: `${base}/cover` },
          },
    );
  }
  if (cover.spineText && pages !== null && pages < MIN_PAGES_FOR_SPINE_TEXT)
    out.push({ id: 'spine', level: 'info', title: `Spine text is left off until the book has ${MIN_PAGES_FOR_SPINE_TEXT}+ pages (KDP rule)` });
  else if (cover.spineText) out.push({ id: 'spine', level: 'pass', title: `Spine ${g.spine.toFixed(3)}″ wide, with title and author` });
  if (!cover.barcodeSpace) out.push({ id: 'barcode', level: 'warn', title: 'Barcode space is not reserved on the back cover', detail: 'KDP prints the ISBN barcode at the bottom right of the back.', fix: { label: 'Design cover', to: `${base}/cover` } });
  return out;
}

export interface LayoutFindings {
  blankRuns: { start: number; length: number }[];
  totalBlank: number;
  images: { name: string; dpi: number; page: number }[];
}

/** Measures the rendered pages: blank pages and the real printed resolution of every image. */
export function measureLayout(stage: HTMLElement, imageName: (src: string) => string): LayoutFindings {
  const pages = [...stage.querySelectorAll<HTMLElement>('.pagedjs_page')];
  const blank = pages.map((p) => {
    const content = p.querySelector('.pagedjs_page_content');
    if (!content) return true;
    const hasText = (content.textContent ?? '').trim().length > 0;
    return !hasText && !content.querySelector('img, .yb-rule');
  });
  const blankRuns: LayoutFindings['blankRuns'] = [];
  blank.forEach((b, i) => {
    if (!b) return;
    const last = blankRuns[blankRuns.length - 1];
    if (last && last.start + last.length === i + 1) last.length++;
    else blankRuns.push({ start: i + 1, length: 1 });
  });
  const images: LayoutFindings['images'] = [];
  pages.forEach((p, i) => {
    const scale = p.offsetWidth ? p.getBoundingClientRect().width / p.offsetWidth : 1;
    p.querySelectorAll<HTMLImageElement>('.pagedjs_page_content img').forEach((img) => {
      const widthIn = img.getBoundingClientRect().width / scale / 96;
      if (widthIn > 0.3 && img.naturalWidth) images.push({ name: imageName(img.src), dpi: Math.round(img.naturalWidth / widthIn), page: i + 1 });
    });
  });
  return { blankRuns, totalBlank: blank.filter(Boolean).length, images };
}

/** KDP: no more than 2 blank pages in a row at the start or middle, 10 at the end. */
export function layoutChecks(f: LayoutFindings, pages: number): Check[] {
  const out: Check[] = [];
  const bad = f.blankRuns.filter((r) => (r.start + r.length - 1 === pages ? r.length > 10 : r.length > 2));
  if (bad.length)
    out.push({
      id: 'blank-runs',
      level: 'fail',
      title: `${bad.length} run${bad.length === 1 ? '' : 's'} of more than 2 blank pages in a row`,
      detail: `KDP rejects more than 2 consecutive blank pages (10 at the end). Pages ${bad.map((r) => `${r.start}–${r.start + r.length - 1}`).join(', ')}. Turn off “Chapters start on a right-hand page”, or add content or writing lines.`,
    });
  else out.push({ id: 'blank-runs', level: 'pass', title: f.totalBlank ? `${f.totalBlank} blank page${f.totalBlank === 1 ? '' : 's'}, none in long runs` : 'No blank pages' });
  if (pages && f.totalBlank / pages > 0.1)
    out.push({ id: 'blank-share', level: 'warn', title: `${Math.round((f.totalBlank / pages) * 100)}% of pages are blank`, detail: 'KDP may question a book with many blank pages.' });
  const low = f.images.filter((i) => i.dpi < MIN_DPI);
  if (low.length)
    out.push({
      id: 'image-dpi',
      level: low.some((i) => i.dpi < LOW_DPI) ? 'fail' : 'warn',
      title: `${low.length} image${low.length === 1 ? '' : 's'} below ${MIN_DPI} DPI at printed size`,
      detail: low.slice(0, 8).map((i) => `p.${i.page} “${i.name}” — ${i.dpi} DPI`).join(' · '),
    });
  else if (f.images.length) out.push({ id: 'image-dpi', level: 'pass', title: f.images.length === 1 ? `The image prints at ${MIN_DPI}+ DPI` : `All ${f.images.length} images print at ${MIN_DPI}+ DPI` });
  return out;
}
