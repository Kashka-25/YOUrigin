// Bound-leather cover colours. Keys are stored on books, so they stay stable.
export const COVER_HEX: Record<string, string> = {
  clay: '#8c3b2e', // oxblood
  sea: '#2f4a63', // midnight navy
  moss: '#3f5a3a', // library green
  dusk: '#5a3a73', // amethyst
  sand: '#a8802e', // old gold
  ink: '#2e2733', // ink black
};

export function coverColour(cover: string): string {
  return COVER_HEX[cover] ?? COVER_HEX.clay;
}
