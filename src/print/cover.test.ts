import { describe, expect, it } from 'vitest';
import { coverGeometry, defaultCover, spineTextAllowed } from './cover';
import { defaultDesign } from './design';

describe('wraparound cover geometry (KDP paperback)', () => {
  const design = defaultDesign('journal'); // 6 × 9 in

  it('matches KDP’s formula: bleed + back + spine + front + bleed', () => {
    const g = coverGeometry(design, { ...defaultCover(), paper: 'cream' }, 200);
    expect(g.spine).toBeCloseTo(0.5, 6); // 200 × 0.0025
    expect(g.totalW).toBeCloseTo(0.125 + 6 + 0.5 + 6 + 0.125, 6);
    expect(g.totalH).toBeCloseTo(9.25, 6);
  });

  it('uses white-paper thickness and rounds odd page counts up to whole sheets', () => {
    const g = coverGeometry(design, { ...defaultCover(), paper: 'white' }, 101);
    expect(g.pages).toBe(102);
    expect(g.spine).toBeCloseTo(102 * 0.002252, 6);
  });

  it('prefers a manual page count, and an exact spine width from the printer', () => {
    expect(coverGeometry(design, { ...defaultCover(), pageCount: 300 }, 120).pages).toBe(300);
    expect(coverGeometry(design, { ...defaultCover(), spineOverride: 0.61 }, 120).spine).toBe(0.61);
  });

  it('keeps spine text off thin books and warns when the page count is unknown', () => {
    const thin = coverGeometry(design, defaultCover(), 60);
    expect(spineTextAllowed(defaultCover(), thin)).toBe(false);
    expect(thin.warnings.join(' ')).toMatch(/80 pages/);
    expect(spineTextAllowed(defaultCover(), coverGeometry(design, defaultCover(), 180))).toBe(true);
    expect(coverGeometry(design, defaultCover(), undefined).warnings.join(' ')).toMatch(/Page count unknown/);
  });

  it('converts metric trims (A5) to inches', () => {
    const g = coverGeometry({ ...design, trim: 'a5' }, defaultCover(), 100);
    expect(g.trimW).toBeCloseTo(148 / 25.4, 6);
    expect(g.trimH).toBeCloseTo(210 / 25.4, 6);
  });
});
