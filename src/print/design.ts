import type { Book, BookDesign, BookType, TrimSize } from '../domain/types';

export const TRIMS: Record<TrimSize, { label: string; w: number; h: number; unit: 'in' | 'mm' }> = {
  '5x8': { label: '5 × 8 in — pocket', w: 5, h: 8, unit: 'in' },
  '5.5x8.5': { label: '5.5 × 8.5 in — digest (poetry favourite)', w: 5.5, h: 8.5, unit: 'in' },
  '6x9': { label: '6 × 9 in — trade paperback (most common)', w: 6, h: 9, unit: 'in' },
  '7x10': { label: '7 × 10 in — large journal', w: 7, h: 10, unit: 'in' },
  '8x8': { label: '8 × 8 in — square', w: 8, h: 8, unit: 'in' },
  '8.5x11': { label: '8.5 × 11 in — workbook / US Letter', w: 8.5, h: 11, unit: 'in' },
  a5: { label: 'A5 — 148 × 210 mm', w: 148, h: 210, unit: 'mm' },
  a4: { label: 'A4 — 210 × 297 mm', w: 210, h: 297, unit: 'mm' },
};

/** Page margins in inches: top, bottom, inside (gutter), outside. */
export const MARGINS: Record<BookDesign['margins'], { top: number; bottom: number; inner: number; outer: number; label: string }> = {
  snug: { top: 0.6, bottom: 0.7, inner: 0.7, outer: 0.55, label: 'Snug' },
  standard: { top: 0.75, bottom: 0.85, inner: 0.85, outer: 0.65, label: 'Standard' },
  generous: { top: 0.95, bottom: 1.05, inner: 1, outer: 0.8, label: 'Generous' },
};

export const BODY_FONTS: Record<BookDesign['bodyFont'], { label: string; css: string }> = {
  garamond: { label: 'EB Garamond — classic book face', css: "'EB Garamond Variable', Garamond, Georgia, serif" },
  cormorant: { label: 'Cormorant Garamond — elegant, airy', css: "'Cormorant Garamond Variable', Garamond, Georgia, serif" },
  newsreader: { label: 'Newsreader — warm, modern', css: "'Newsreader Variable', Georgia, serif" },
};

export const ORNAMENTS = ['⁂', '❦', '✦', '❧', '☙', '~', '•', ''] as const;

export function defaultDesign(type: BookType): BookDesign {
  const base: BookDesign = {
    trim: '6x9',
    margins: 'standard',
    bodyFont: 'garamond',
    headingFont: 'cinzel',
    fontSize: 11,
    lineHeight: 1.5,
    poemAlign: 'left',
    titleAlign: 'center',
    pieceOnNewPage: false,
    sectionOnRightPage: true,
    sectionStyle: 'ornamental',
    ornament: '⁂',
    pageNumbers: 'bottom-outside',
    runningHeads: true,
    titlePage: true,
    author: '',
    copyright: '',
    dedication: '',
    toc: true,
    promptLines: 0,
    bleed: false,
  };
  if (type === 'poetry') return { ...base, trim: '5.5x8.5', pieceOnNewPage: true, fontSize: 11.5, lineHeight: 1.45, pageNumbers: 'bottom-center' };
  if (type === 'journal') return { ...base, trim: '6x9', promptLines: 12, lineHeight: 1.55 };
  if (type === 'essay') return { ...base, sectionStyle: 'classic', fontSize: 11, lineHeight: 1.45 };
  return base;
}

export function resolveDesign(book: Pick<Book, 'type' | 'design'>): BookDesign {
  return { ...defaultDesign(book.type), ...(book.design ?? {}) };
}

/** Text area height in inches — used to size a full page of writing lines. */
export function contentHeightIn(d: BookDesign): number {
  const t = TRIMS[d.trim];
  const h = t.unit === 'mm' ? t.h / 25.4 : t.h;
  const m = MARGINS[d.margins];
  return h - m.top - m.bottom - 0.45; // leave room for the page number line
}
