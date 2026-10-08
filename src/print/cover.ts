import type { BookDesign, CoverDesign } from '../domain/types';
import { TRIMS } from './design';

/** Paper thickness per page (inches) — Amazon KDP paperback figures. */
export const PAPERS: Record<CoverDesign['paper'], { label: string; perPage: number }> = {
  white: { label: 'White paper (black & white interior)', perPage: 0.002252 },
  cream: { label: 'Cream paper (black & white interior)', perPage: 0.0025 },
  'standard-colour': { label: 'Standard colour, white paper', perPage: 0.002252 },
  'premium-colour': { label: 'Premium colour, white paper', perPage: 0.002347 },
};

export const BLEED_IN = 0.125;
/** Text and important artwork should stay this far inside the trim. */
export const SAFE_IN = 0.25;
/** Spine text needs breathing room either side. */
export const SPINE_SAFE_IN = 0.0625;
/** KDP only allows spine text on books with more than 79 pages. */
export const MIN_PAGES_FOR_SPINE_TEXT = 80;
export const BARCODE = { w: 2, h: 1.2, inset: 0.25 };

export function defaultCover(): CoverDesign {
  return {
    paper: 'cream',
    pageCount: 0,
    spineOverride: 0,
    background: '#1a1421',
    textColour: '#f1e2c4',
    accentColour: '#d4a54c',
    font: 'cinzel',
    titleSize: 1,
    frontLayout: 'image-full',
    wrapImage: false,
    blurb: '',
    authorBio: '',
    spineText: true,
    barcodeSpace: true,
    showGuides: true,
  };
}

export function resolveCover(design: BookDesign): CoverDesign {
  return { ...defaultCover(), ...(design.cover ?? {}) };
}

export interface CoverGeometry {
  trimW: number;
  trimH: number;
  spine: number;
  bleed: number;
  totalW: number;
  totalH: number;
  pages: number;
  warnings: string[];
}

/** Full wraparound size: bleed + back + spine + front + bleed, all in inches. */
export function coverGeometry(design: BookDesign, cover: CoverDesign, measuredPages: number | undefined): CoverGeometry {
  const t = TRIMS[design.trim];
  const trimW = t.unit === 'mm' ? t.w / 25.4 : t.w;
  const trimH = t.unit === 'mm' ? t.h / 25.4 : t.h;
  // Print services count pages in pairs (both sides of each sheet).
  const raw = cover.pageCount || measuredPages || 0;
  const pages = raw % 2 ? raw + 1 : raw;
  const spine = cover.spineOverride > 0 ? cover.spineOverride : pages * PAPERS[cover.paper].perPage;
  const warnings: string[] = [];
  if (!pages) warnings.push('Page count unknown — open Design & print once (it counts the pages), or enter it here.');
  else if (pages < 24) warnings.push('Most print services need at least 24 pages for a paperback.');
  if (cover.spineText && pages && pages < MIN_PAGES_FOR_SPINE_TEXT)
    warnings.push(`Spine text needs at least ${MIN_PAGES_FOR_SPINE_TEXT} pages on KDP — it will be left off until the book is longer.`);
  return { trimW, trimH, spine, bleed: BLEED_IN, totalW: BLEED_IN * 2 + trimW * 2 + spine, totalH: trimH + BLEED_IN * 2, pages, warnings };
}

export function spineTextAllowed(cover: CoverDesign, g: CoverGeometry): boolean {
  return cover.spineText && g.pages >= MIN_PAGES_FOR_SPINE_TEXT && g.spine > SPINE_SAFE_IN * 2 + 0.1;
}

export const fmtIn = (n: number) => `${n.toFixed(3)}″`;
