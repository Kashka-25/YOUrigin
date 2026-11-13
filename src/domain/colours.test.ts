import { describe, expect, it } from 'vitest';
import { PROJECT_COLOURS } from './constants';

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('Project colours', () => {
  it.each(PROJECT_COLOURS)('$label is lighter in light mode and deeper in dark mode', (c) => {
    expect(luminance(c.hex)).toBeGreaterThan(luminance(c.dark));
  });

  it.each(PROJECT_COLOURS)('$label has readable text on top in both themes', (c) => {
    expect(contrast(c.onLight, c.hex)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onDark, c.dark)).toBeGreaterThanOrEqual(4.5);
  });

  it('has no repeated shades', () => {
    expect(new Set(PROJECT_COLOURS.map((c) => c.hex)).size).toBe(PROJECT_COLOURS.length);
    expect(new Set(PROJECT_COLOURS.map((c) => c.dark)).size).toBe(PROJECT_COLOURS.length);
  });
});
