import type { Asset, Book, BookDesign, BookEntry, ContentItem, Section, SpaceSize } from '../domain/types';
import { BODY_FONTS, LINE_SPACING, MARGINS, TRIMS, contentHeightIn } from './design';
import { displayTitle } from '../domain/text';

export interface PrintInput {
  book: Book;
  design: BookDesign;
  sections: Section[];
  entries: BookEntry[];
  contentById: Map<string, ContentItem>;
  assets: Map<string, Asset>;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function img(a: Asset | undefined, cls: string, alt = '') {
  if (!a) return '';
  const size = a.width && a.height ? ` width="${a.width}" height="${a.height}"` : '';
  return `<img class="${cls}" src="${a.dataUrl}" alt="${esc(alt)}"${size} />`;
}

export interface ResolvedSpace {
  kind: 'lines' | 'blank' | 'none';
  size: SpaceSize;
  /** Why: shown in the editor so automatic choices are understandable. */
  reason: string;
}

const DRAW_WORDS = /\b(draw|drawing|sketch|doodle|paint|colou?r(?:ing)? in|illustrat\w*|collage|mandala|map(?:ping)?|trace|outline (?:your|the)|create an image)\b/i;
const WRITE_WORDS = /\b(write|writing|journal|list|answer|letter|describe|note down|reflect on|record)\b/i;

/**
 * What space follows a piece: the piece's own override, else automatic —
 * prompts get lines, activities get lines if they ask you to write and blank
 * space if they ask you to draw.
 */
export function resolveSpace(c: ContentItem, entry: Pick<BookEntry, 'space'> | undefined, d: BookDesign): ResolvedSpace {
  const o = entry?.space;
  if (o && o.kind !== 'auto') return { kind: o.kind, size: o.kind === 'none' ? 'none' : o.size, reason: 'Set for this piece' };
  const text = `${c.title}\n${c.body}`;
  const draws = d.detectDrawing && DRAW_WORDS.test(text);
  const pick = (kind: 'lines' | 'blank', size: SpaceSize, reason: string): ResolvedSpace =>
    size === 'none' ? { kind: 'none', size, reason } : { kind, size, reason };
  if (c.type === 'prompt') return draws ? pick('blank', d.drawingSpace, 'Prompt asks you to draw') : pick('lines', d.promptSpace, 'Prompt');
  if (c.type === 'ritual' || c.type === 'reflection' || c.type === 'idea') {
    if (draws) return pick('blank', d.drawingSpace, 'Activity asks you to draw');
    if (c.type === 'ritual' && WRITE_WORDS.test(text)) return pick('lines', d.activitySpace, 'Activity asks you to write');
  }
  return { kind: 'none', size: 'none', reason: 'No writing needed' };
}

/** The book as HTML, in reading order. Paged.js turns this into pages using bookCss(). */
export function bookHtml({ book, design: d, sections, entries, contentById, assets }: PrintInput): string {
  const parts: string[] = [];
  const cover = book.coverAssetId ? assets.get(book.coverAssetId) : undefined;
  if (cover) parts.push(`<section class="yb-cover">${img(cover, 'yb-cover-img', `Cover of ${book.title}`)}</section>`);

  if (d.titlePage) {
    parts.push(`<section class="yb-front yb-titlepage">
      ${d.sectionStyle === 'ornamental' ? `<p class="yb-orn yb-orn-top">${esc(d.ornament || '✦')}</p>` : ''}
      <h1 class="yb-book-title">${esc(book.title)}</h1>
      ${book.subtitle ? `<p class="yb-subtitle">${esc(book.subtitle)}</p>` : ''}
      ${d.author ? `<p class="yb-author">${esc(d.author)}</p>` : ''}
    </section>`);
  } else {
    parts.push(`<span class="yb-book-title yb-hidden">${esc(book.title)}</span>`);
  }
  if (d.copyright.trim()) parts.push(`<section class="yb-front yb-copyright"><div>${esc(d.copyright)}</div></section>`);
  if (d.dedication.trim()) parts.push(`<section class="yb-front yb-dedication"><div>${esc(d.dedication)}</div></section>`);
  const acks = d.acknowledgements.trim()
    ? `<section class="yb-front yb-acks" id="acknowledgements"><h2 class="yb-toc-title">Acknowledgements</h2><div class="yb-acks-body">${esc(d.acknowledgements)}</div></section>`
    : '';
  if (acks && d.acknowledgementsAt === 'front') parts.push(acks);

  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const live = (e: BookEntry) => {
    const c = contentById.get(e.contentId);
    return c && !c.deletedAt ? c : undefined;
  };
  const groups = ordered
    .map((s) => {
      const placed = entries
        .filter((e) => e.sectionId === s.id)
        .sort((a, b) => a.order - b.order)
        .map((e) => ({ entry: e, item: live(e) }))
        .filter((x): x is { entry: BookEntry; item: ContentItem } => !!x.item);
      return { section: s, items: placed.map((x) => x.item), placed };
    })
    .filter((g) => g.items.length || g.section.imageAssetId);

  if (d.toc && groups.length > 1) {
    parts.push(`<nav class="yb-front yb-toc"><h2 class="yb-toc-title">Contents</h2><ol>${groups
      .map((g) => `<li><a href="#s-${g.section.id}">${esc(g.section.title)}</a></li>`)
      .join('')}${acks && d.acknowledgementsAt === 'back' ? '<li><a href="#acknowledgements">Acknowledgements</a></li>' : ''}</ol></nav>`);
  }

  const fullPage = contentHeightIn(d).toFixed(2);
  const lineIn = LINE_SPACING[d.lineSpacing].inches;
  const linePx = (lineIn * 96).toFixed(3);
  const spaceHtml = (sp: ResolvedSpace) => {
    if (sp.kind === 'none') return '';
    const cls = sp.kind === 'lines' ? 'yb-space yb-space-lines' : 'yb-space yb-space-blank';
    const fill = sp.size === 'fill' || sp.size === 'fill+page' ? `<div class="${cls} yb-space-fill" data-line="${sp.kind === 'lines' ? linePx : 0}">${sp.kind === 'lines' ? '<div class="yb-rule"></div>'.repeat(3) : ''}</div>` : '';
    const rules = (n: number) => (sp.kind === 'lines' ? '<div class="yb-rule"></div>'.repeat(n) : '');
    const page = sp.size === 'page' || sp.size === 'fill+page' ? `<div class="${cls} yb-space-page" style="height:${fullPage}in">${rules(Math.floor(Number(fullPage) / lineIn))}</div>` : '';
    return fill + page;
  };

  for (const { section, items, placed } of groups) {
    const opener = section.imageAssetId ? assets.get(section.imageAssetId) : undefined;
    const pieces = items.map((c, i) => {
      const title = c.title.trim() || (c.type === 'image' ? '' : displayTitle(c));
      const showTitle = c.title.trim() !== '' || c.type !== 'poem' ? title : '';
      const sep = i > 0 && !d.pieceOnNewPage && d.ornament ? `<p class="yb-orn">${esc(d.ornament)}</p>` : '';
      if (c.type === 'image') {
        const a = c.assetId ? assets.get(c.assetId) : undefined;
        const layout = c.imageLayout ?? 'full-page';
        return `${layout === 'inline' ? sep : ''}<figure class="yb-fig yb-fig-${layout}">${img(a, 'yb-fig-img', c.title)}${
          c.body.trim() ? `<figcaption>${esc(c.body)}</figcaption>` : ''
        }</figure>`;
      }
      const sp = resolveSpace(c, placed[i].entry, d);
      return `${sep}<article class="yb-piece yb-type-${c.type}${sp.kind !== 'none' ? ' yb-has-space' : ''}">
        ${showTitle ? `<h3 class="yb-piece-title">${esc(showTitle)}</h3>` : ''}
        ${c.body.trim() ? `<div class="yb-body">${esc(c.body)}</div>` : ''}
        ${spaceHtml(sp)}
      </article>`;
    });
    parts.push(`<section class="yb-section" id="s-${section.id}">
      <header class="yb-opener yb-opener-${d.sectionStyle}">
        ${opener ? img(opener, 'yb-opener-img', section.title) : ''}
        ${d.sectionStyle === 'ornamental' ? `<p class="yb-orn yb-orn-top">${esc(d.ornament || '✦')}</p>` : ''}
        <h2 class="yb-section-title">${esc(section.title)}</h2>
      </header>
      ${pieces.join('\n')}
    </section>`);
  }
  if (!groups.length) parts.push('<section class="yb-section"><p class="yb-empty">This book has no placed pieces yet.</p></section>');
  if (acks && d.acknowledgementsAt === 'back') parts.push(acks);
  return parts.join('\n');
}

/** Print stylesheet (CSS Paged Media) generated from the design. */
export function bookCss(d: BookDesign): string {
  const t = TRIMS[d.trim];
  const m = MARGINS[d.margins];
  // KDP bleed: the page grows 0.125in at the outside edge and 0.125in top and bottom
  // (not at the spine), so margins grow by the same amount and no crop marks are added.
  const b = d.bleed ? 0.125 : 0;
  const inch = (v: number) => (t.unit === 'mm' ? v / 25.4 : v);
  const size = d.bleed ? `${(inch(t.w) + b).toFixed(4)}in ${(inch(t.h) + 2 * b).toFixed(4)}in` : `${t.w}${t.unit} ${t.h}${t.unit}`;
  const mt = m.top + b;
  const mb = m.bottom + b;
  const mo = m.outer + b;
  const body = BODY_FONTS[d.bodyFont].css;
  const heading = d.headingFont === 'cinzel' ? "'Cinzel Variable', 'Trajan Pro', Georgia, serif" : body;
  const num = 'counter(page)';
  const ls = LINE_SPACING[d.lineSpacing].inches;
  const pageNumbers =
    d.pageNumbers === 'bottom-center'
      ? `@page { @bottom-center { content: ${num}; } }`
      : d.pageNumbers === 'bottom-outside'
        ? `@page :left { @bottom-left { content: ${num}; } } @page :right { @bottom-right { content: ${num}; } }`
        : '';
  const heads = d.runningHeads
    ? `@page :left { @top-center { content: string(booktitle); } } @page :right { @top-center { content: string(section); } }`
    : '';
  return `
@page {
  size: ${size};
  margin: ${mt}in ${mo}in ${mb}in ${m.inner}in;
  @top-center { font-family: ${heading}; font-size: 7.5pt; letter-spacing: 0.18em; text-transform: uppercase; color: #6b5d55; }
  @bottom-center { font-family: ${body}; font-size: 9pt; color: #4a3f3a; }
  @bottom-left { font-family: ${body}; font-size: 9pt; color: #4a3f3a; }
  @bottom-right { font-family: ${body}; font-size: 9pt; color: #4a3f3a; }
}
@page :left { margin-left: ${mo}in; margin-right: ${m.inner}in; }
@page :right { margin-left: ${m.inner}in; margin-right: ${mo}in; }
${pageNumbers}
${heads}
@page front { @top-center { content: none; } @bottom-center { content: none; } @bottom-left { content: none; } @bottom-right { content: none; } }
@page chapter:first { @top-center { content: none; } }
@page bleedpage { margin: 0; @top-center { content: none; } @bottom-center { content: none; } @bottom-left { content: none; } @bottom-right { content: none; } }

.yb-root { font-family: ${body}; font-size: ${d.fontSize}pt; line-height: ${d.lineHeight}; color: #1d1714; hyphens: manual; }
.yb-root * { box-sizing: border-box; }
.yb-hidden { display: none; }
.yb-book-title { string-set: booktitle content(text); }
.yb-section-title { string-set: section content(text); }

.yb-cover { page: bleedpage; break-after: page; height: 100%; }
.yb-cover-img { display: block; width: 100%; height: 100%; object-fit: cover; }

.yb-front { page: front; break-after: page; }
.yb-titlepage { text-align: center; padding-top: 28%; }
.yb-titlepage .yb-book-title { font-family: ${heading}; font-weight: 500; font-size: 2.3em; line-height: 1.15; margin: 0.4em 0 0.3em; letter-spacing: ${d.headingFont === 'cinzel' ? '0.06em' : '0'}; }
.yb-subtitle { font-style: italic; font-size: 1.15em; margin: 0; }
.yb-author { margin-top: 3em; font-family: ${heading}; letter-spacing: 0.2em; text-transform: uppercase; font-size: 0.85em; }
.yb-copyright { display: flex; flex-direction: column; justify-content: flex-end; height: 100%; font-size: 0.78em; line-height: 1.5; white-space: pre-wrap; }
.yb-dedication { text-align: center; font-style: italic; padding-top: 30%; white-space: pre-wrap; }
.yb-acks { break-before: page; }
.yb-acks-body { white-space: pre-wrap; }
.yb-toc-title { font-family: ${heading}; text-align: center; font-weight: 500; font-size: 1.1em; letter-spacing: 0.2em; text-transform: uppercase; margin: 2em 0 1.6em; }
.yb-toc ol { list-style: none; padding: 0; margin: 0; }
.yb-toc li { margin: 0.45em 0; }
.yb-toc a { color: inherit; text-decoration: none; display: flex; }
.yb-toc a::after { content: leader('.') target-counter(attr(href), page); margin-left: auto; padding-left: 0.5em; }

.yb-section { page: chapter; break-before: ${d.sectionOnRightPage ? 'right' : 'page'}; }
.yb-opener { text-align: center; margin: 0 0 2.2em; ${d.sectionStyle === 'minimal' ? '' : 'padding-top: 18%;'} }
.yb-opener-img { display: block; max-width: 100%; max-height: 3.6in; margin: 0 auto 1.4em; object-fit: contain; }
.yb-section-title { font-family: ${heading}; font-weight: 500; margin: 0;
  ${
    d.sectionStyle === 'classic'
      ? 'font-size: 1.6em; letter-spacing: 0.02em;'
      : d.sectionStyle === 'ornamental'
        ? 'font-size: 1.25em; letter-spacing: 0.24em; text-transform: uppercase;'
        : 'font-size: 1.1em; text-align: left;'
  } }
.yb-opener-ornamental .yb-section-title::after { content: ''; display: block; width: 2.2em; margin: 0.9em auto 0; border-top: 0.6pt solid #8a6a3a; }

.yb-orn { text-align: center; color: #8a6a3a; margin: 1.6em 0; letter-spacing: 0.4em; }
.yb-orn-top { margin: 0 0 1em; font-size: 1.2em; }

.yb-piece { break-inside: auto; }
${d.pieceOnNewPage ? '.yb-piece + .yb-piece, .yb-fig + .yb-piece, .yb-piece + .yb-fig-inline { break-before: page; }' : ''}
.yb-piece-title { font-family: ${heading}; font-weight: 500; font-size: 1.15em; line-height: 1.3; margin: 0 0 1em; text-align: ${d.titleAlign}; break-after: avoid; ${d.headingFont === 'cinzel' ? 'letter-spacing: 0.04em;' : ''} }
.yb-body { white-space: pre-wrap; orphans: 2; widows: 2; }
.yb-type-poem .yb-body, .yb-type-fragment .yb-body { text-align: ${d.poemAlign}; }
.yb-type-prompt .yb-piece-title { font-family: ${body}; font-style: italic; font-weight: 500; text-align: left; }
.yb-type-quote .yb-body { font-style: italic; text-align: center; }

.yb-has-space { break-inside: avoid; }
.yb-space { margin-top: 0.5em; }
.yb-rule { height: ${ls}in; border-bottom: 0.75pt solid #a8998a; }
/* Margin boxes (page numbers, running heads) sit outside .yb-root: give them ink colour too. */
.pagedjs_margin-content { color: #4a3f3a; }
.yb-space-blank { ${d.drawingFrame ? "border: 0.6pt solid #c7b9a6; border-radius: 3pt;" : ""} }
/* Grows to the bottom of its page once the page is laid out (see print/fillSpace.ts). */
.yb-space-fill { min-height: ${(ls * 3).toFixed(2)}in; break-after: page; break-inside: avoid; }
.yb-space-page { break-before: page; margin-top: 0; }

.yb-fig { margin: 0; text-align: center; }
.yb-fig-img { display: block; margin: 0 auto; }
.yb-fig-inline { margin: 1.4em 0; }
.yb-fig-inline .yb-fig-img { max-width: 100%; max-height: 3.4in; object-fit: contain; }
.yb-fig-full-page { break-before: page; break-after: page; height: 100%; display: flex; flex-direction: column; justify-content: center; }
.yb-fig-full-page .yb-fig-img { max-width: 100%; max-height: 92%; object-fit: contain; }
.yb-fig-full-bleed { page: bleedpage; break-before: page; break-after: page; height: 100%; }
.yb-fig-full-bleed .yb-fig-img { width: 100%; height: 100%; object-fit: cover; }
.yb-fig figcaption { font-size: 0.85em; font-style: italic; margin-top: 0.7em; }
.yb-empty { text-align: center; font-style: italic; padding-top: 40%; }
`;
}
