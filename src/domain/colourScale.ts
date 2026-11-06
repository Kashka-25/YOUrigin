import type { ColourScale } from './types';

// The YOU colour scale, adapted to YOUrigin's warm manuscript and midnight
// archive. The middle stop is the existing look, so a fresh install is unchanged.
export const COLOUR_SCALE_DEFAULT = 100 / 3;

export const COLOUR_SCALE_STOPS = {
  light: [
    { label: 'Bark', bg: '#D5B996', paper2: '#C5A780', card: '#E9D8BF', ink: '#2D241C', ink2: '#4C3B2D', muted: '#65513F', line: '#B9A384', glow: '#A16A46' },
    { label: 'Sand', bg: '#F4EFE7', paper2: '#E9E0D5', card: '#FBF8F2', ink: '#2B2130', ink2: '#5F5363', muted: '#8D7F8C', line: '#DED2C5', glow: '#71518A' },
    { label: 'Snow', bg: '#F8F7F3', paper2: '#ECEAE4', card: '#FFFFFF', ink: '#28252D', ink2: '#57515D', muted: '#827D88', line: '#D8D4DB', glow: '#927A8A' },
    { label: 'Moss', bg: '#DDE5CF', paper2: '#CBD8B6', card: '#EDF2E5', ink: '#232A22', ink2: '#465341', muted: '#65725F', line: '#BBC8AA', glow: '#617B51' },
  ],
  dark: [
    { label: 'Void', bg: '#050510', paper2: '#0C0C1D', card: '#101024', ink: '#F2EEF8', ink2: '#C1B8D0', muted: '#9389A7', line: '#2A263B', glow: '#7160B7' },
    { label: 'Midnight', bg: '#090711', paper2: '#15111F', card: '#171321', ink: '#F0E9DF', ink2: '#C5B8C9', muted: '#95869D', line: '#30263B', glow: '#805799' },
    { label: 'Nebula', bg: '#130E2C', paper2: '#1D1643', card: '#241B51', ink: '#F1EDFF', ink2: '#C9C0E5', muted: '#9C92C0', line: '#3A3262', glow: '#7C68C1' },
    { label: 'Aurora', bg: '#06191F', paper2: '#0B242C', card: '#0F2B35', ink: '#E8F4F1', ink2: '#B8D0CB', muted: '#89AAA5', line: '#25434A', glow: '#3C9290' },
  ],
} as const;

type Mode = keyof typeof COLOUR_SCALE_STOPS;

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

function mixHex(first: string, second: string, amount: number): string {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  return '#' + a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, '0')).join('');
}

export function coloursAt(mode: Mode, position: number) {
  const stops = COLOUR_SCALE_STOPS[mode];
  const safePosition = Math.min(100, Math.max(0, Number.isFinite(position) ? position : COLOUR_SCALE_DEFAULT));
  const scaled = (safePosition / 100) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const amount = scaled - index;
  const first = stops[index];
  const second = stops[index + 1];
  return {
    bg: mixHex(first.bg, second.bg, amount),
    paper2: mixHex(first.paper2, second.paper2, amount),
    card: mixHex(first.card, second.card, amount),
    ink: mixHex(first.ink, second.ink, amount),
    ink2: mixHex(first.ink2, second.ink2, amount),
    muted: mixHex(first.muted, second.muted, amount),
    line: mixHex(first.line, second.line, amount),
    glow: mixHex(first.glow, second.glow, amount),
  };
}

export function stopName(mode: Mode, position: number): string {
  const stops = COLOUR_SCALE_STOPS[mode];
  const index = Math.round((Math.min(100, Math.max(0, position)) / 100) * (stops.length - 1));
  return stops[index].label;
}

const VARIABLE_NAMES = ['--paper', '--paper-2', '--card', '--ink', '--ink-2', '--muted', '--line', '--scale-glow'] as const;

/** Paint the chosen mode's surface scale. Accent gold and status colours stay unchanged. */
export function applyColourScale(scale: ColourScale, mode: Mode): void {
  const root = document.documentElement;
  const position = scale[mode];
  if (Math.abs(position - COLOUR_SCALE_DEFAULT) < 0.5) {
    VARIABLE_NAMES.forEach((name) => root.style.removeProperty(name));
    return;
  }
  const colours = coloursAt(mode, position);
  const values: Record<(typeof VARIABLE_NAMES)[number], string> = {
    '--paper': colours.bg,
    '--paper-2': colours.paper2,
    '--card': colours.card,
    '--ink': colours.ink,
    '--ink-2': colours.ink2,
    '--muted': colours.muted,
    '--line': colours.line,
    '--scale-glow': colours.glow,
  };
  VARIABLE_NAMES.forEach((name) => root.style.setProperty(name, values[name]));
}
