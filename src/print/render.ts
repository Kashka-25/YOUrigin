import type { Asset, Book, BookDesign, BookEntry, ContentItem, Section } from '../domain/types';
import { BODY_FONTS, MARGINS, TRIMS, contentHeightIn } from './design';
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

  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const live = (e: BookEntry) => {
    const c = contentById.get(e.contentId);
    return c && !c.deletedAt ? c : undefined;
  };
  const groups = ordered
    .map((s) => ({
      section: s,
      items: entries
        .filter((e) => e.sectionId === s.id)
        .sort((a, b) => a.order - b.order)
        .map(live)
        .filter((c): c is ContentItem => !!c),
    }))
    .filter((g) => g.items.length || g.section.imageAssetId);

  if (d.toc && groups.length > 1) {
    parts.push(`<nav class="yb-front yb-toc"><h2 class="yb-toc-title">Contents</h2><ol>${groups
      .map((g) => `<li><a href="#s-${g.section.id}">${esc(g.section.title)}</a></li>`)
      .join('')}</ol></nav>`);
  }

  const lines = (n: number) =>
    n === -1
      ? `<div class="yb-lines yb-lines-page" style="height:${contentHeightIn(d).toFixed(2)}in"></div>`
      : n > 0
        ? `<div class="yb-lines" style="height:${(n * 0.34).toFixed(2)}in"></div>`
        : '';

  for (const { section, items } of groups) {
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
      return `${sep}<article class="yb-piece yb-type-${c.type}">
        ${showTitle ? `<h3 class="yb-piece-title">${esc(showTitle)}</h3>` : ''}
        ${c.body.trim() ? `<div class="yb-body">${esc(c.body)}</div>` : ''}
        ${c.type === 'prompt' ? lines(d.promptLines) : ''}
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
  return parts.join('\n');
}

/** Print stylesheet (CSS Paged Media) generated from the design. */
export function bookCss(d: BookDesign): string {
  const t = TRIMS[d.trim];
  const m = MARGINS[d.margins];
  const size = `${t.w}${t.unit} ${t.h}${t.unit}`;
  const body = BODY_FONTS[d.bodyFont].css;
  const heading = d.headingFont === 'cinzel' ? "'Cinzel Variable', 'Trajan Pro', Georgia, serif" : body;
  const num = 'counter(page)';
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
  margin: ${m.top}in ${m.outer}in ${m.bottom}in ${m.inner}in;
  ${d.bleed ? 'bleed: 0.125in; marks: crop;' : ''}
  @top-center { font-family: ${heading}; font-size: 7.5pt; letter-spacing: 0.18em; text-transform: uppercase; color: #6b5d55; }
  @bottom-center, @bottom-left, @bottom-right { font-family: ${body}; font-size: 9pt; color: #4a3f3a; }
}
@page :left { margin-left: ${m.outer}in; margin-right: ${m.inner}in; }
@page :right { margin-left: ${m.inner}in; margin-right: ${m.outer}in; }
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
.yb-type-ritual .yb-piece-title::before { content: '${(d.ornament || '✦').replace(/'/g, "\\'")}  '; color: #8a6a3a; }

.yb-lines { margin-top: 0.6em; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent calc(0.34in - 0.6pt), #b9ab9a calc(0.34in - 0.6pt), #b9ab9a 0.34in); }
.yb-lines-page { break-before: page; margin-top: 0; }

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
