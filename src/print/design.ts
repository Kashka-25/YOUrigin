import type { Book, BookDesign, BookType, SpaceSize, TrimSize } from '../domain/types';

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
    acknowledgements: '',
    acknowledgementsAt: 'back',
    toc: true,
    promptSpace: 'none',
    activitySpace: 'none',
    drawingSpace: 'none',
    detectDrawing: true,
    lineSpacing: 'wide',
    drawingFrame: false,
    bleed: false,
  };
  if (type === 'poetry') return { ...base, trim: '5.5x8.5', pieceOnNewPage: true, fontSize: 11.5, lineHeight: 1.45, pageNumbers: 'bottom-center' };
  if (type === 'journal')
    return { ...base, trim: '6x9', lineHeight: 1.55, promptSpace: 'fill', activitySpace: 'fill', drawingSpace: 'fill', pieceOnNewPage: true };
  if (type === 'essay') return { ...base, sectionStyle: 'classic', fontSize: 11, lineHeight: 1.45 };
  return base;
}

export function resolveDesign(book: Pick<Book, 'type' | 'design'>): BookDesign {
  const saved = { ...(book.design ?? {}) } as Partial<BookDesign> & { promptLines?: number };
  // Earlier versions stored a number of prompt lines.
  if (saved.promptLines !== undefined && saved.promptSpace === undefined) {
    saved.promptSpace = saved.promptLines === 0 ? 'none' : saved.promptLines === -1 ? 'page' : 'fill';
  }
  delete saved.promptLines;
  return { ...defaultDesign(book.type), ...saved };
}

export const LINE_SPACING: Record<BookDesign['lineSpacing'], { label: string; inches: number }> = {
  wide: { label: 'Wide ruled — roomy handwriting (8.7mm)', inches: 0.34 },
  college: { label: 'College ruled (7.1mm)', inches: 0.28 },
  narrow: { label: 'Narrow (6.4mm)', inches: 0.25 },
};

export const SPACE_LABEL: Record<SpaceSize, string> = {
  fill: 'To the end of the page',
  page: 'A full extra page',
  'fill+page': 'End of the page, plus a full page',
  none: 'No space',
};

/** Text area height in inches — used to size a full page of writing lines. */
export function contentHeightIn(d: BookDesign): number {
  const t = TRIMS[d.trim];
  const h = t.unit === 'mm' ? t.h / 25.4 : t.h;
  const m = MARGINS[d.margins];
  return h - m.top - m.bottom - 0.45; // leave room for the page number line
}

/** Marks the spot to fill in on the copyright page (the KDP check looks for it). */
export const ISBN_PLACEHOLDER = '[insert ISBN]';

/** A standard copyright page, ready to edit. */
export function copyrightTemplate(book: { title: string; type: BookType }, author: string, year = new Date().getFullYear()): string {
  const name = author.trim() || 'Your Name';
  const lines = [
    book.title,
    '',
    `Copyright © ${year} ${name}`,
    'All rights reserved. No part of this book may be reproduced, stored or shared in any form without written permission from the author, except for brief quotations in reviews.',
    '',
    `ISBN: ${ISBN_PLACEHOLDER}`,
    '',
    `First edition ${year}`,
    `Cover and interior design by ${name}`,
  ];
  if (book.type === 'journal')
    lines.push('', 'This journal is for personal reflection and is not a substitute for professional medical or mental-health care.');
  return lines.join('\n');
}

/** Marks who the book is for on the dedication page (the KDP check looks for it). */
export const NAME_PLACEHOLDER = '[name]';

/** Starting points for a dedication page — each is meant to be rewritten in your own words. */
export const DEDICATION_STARTERS: { id: string; label: string; text: string }[] = [
  { id: 'simple', label: 'For someone', text: `For ${NAME_PLACEHOLDER}` },
  { id: 'who', label: 'For someone, and why', text: `For ${NAME_PLACEHOLDER},\nwho taught me [what they gave you].` },
  { id: 'memory', label: 'In memory', text: `In loving memory of ${NAME_PLACEHOLDER}\n[years]` },
  { id: 'reader', label: 'To the reader', text: 'For you, the reader —\nmay these pages meet you exactly where you are.' },
  { id: 'self', label: 'To my younger self', text: 'For the version of me\nwho needed these words first.' },
];

/** The dedication a new book starts with: journals speak to the reader, others to someone. */
export function dedicationTemplate(type: BookType): string {
  return DEDICATION_STARTERS.find((s) => s.id === (type === 'journal' ? 'reader' : 'who'))!.text;
}

/** A thank-you page to rewrite: replace each [bracket] with your own people and words. */
export function acknowledgementsTemplate(type: BookType): string {
  const closing =
    type === 'journal'
      ? 'And to you, the reader — thank you for opening these pages and doing this work with me.'
      : 'And to you, the reader — thank you for carrying these pages with you.';
  return [
    'This book would not exist without the people who held it — and me — along the way.',
    '',
    'To [name], for [what they gave you].',
    'To [name], for [what they gave you].',
    '',
    'To my family, [a few words].',
    '',
    'To [teachers, friends, early readers or communities], for [how they shaped this book].',
    '',
    closing,
  ].join('\n');
}
