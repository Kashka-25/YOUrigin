export const COVER_HEX: Record<string, string> = {
  clay: '#c4876a',
  sea: '#6c95a6',
  moss: '#7d9768',
  dusk: '#8a7aa6',
  sand: '#cdb487',
  ink: '#4a4540',
};

export function coverColour(cover: string): string {
  return COVER_HEX[cover] ?? COVER_HEX.clay;
}
