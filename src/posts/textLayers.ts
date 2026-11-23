import type { PostWorld } from './model';
import { newId } from '../domain/text';

/**
 * Words placed on a post's picture: Cassidy's own on-image text, in brand fonts and colours.
 * Everything is stored as fractions of the slide, so it looks the same on the phone, the
 * laptop and in the picture saved for Instagram (1080 wide).
 */
export type TextFont = 'cinzel' | 'cormorant' | 'playfair' | 'newsreader' | 'josefin' | 'inter' | 'caveat';

export interface TextLayer {
  id: string;
  text: string;
  /** Centre of the text box, as fractions of the slide's width and height. */
  x: number;
  y: number;
  /** Width of the text box, as a fraction of the slide's width. */
  w: number;
  /** Letter size, as a fraction of the slide's width. */
  size: number;
  font: TextFont;
  /** #rrggbb */
  colour: string;
  align: 'left' | 'center' | 'right';
  weight: number;
  italic: boolean;
  caps: boolean;
  /** Extra space between letters, in em. */
  tracking: number;
  shadow: boolean;
  /** A box behind the words (#rrggbb), or none. */
  backing: string | null;
}

export const TEXT_FONTS: Record<TextFont, { label: string; family: string; note: string; weights: [number, number] }> = {
  cinzel: { label: 'Cinzel', family: 'Cinzel Variable', note: 'YOU’s carved capitals', weights: [400, 900] },
  cormorant: { label: 'Cormorant', family: 'Cormorant Garamond Variable', note: 'Soft, poetic serif', weights: [300, 700] },
  playfair: { label: 'Playfair', family: 'Playfair Display Variable', note: 'Bold headline serif', weights: [400, 900] },
  newsreader: { label: 'Newsreader', family: 'Newsreader Variable', note: 'Story serif', weights: [300, 800] },
  josefin: { label: 'Josefin', family: 'Josefin Sans Variable', note: 'Airy, geometric', weights: [100, 700] },
  inter: { label: 'Inter', family: 'Inter Variable', note: 'Clean labels', weights: [300, 800] },
  caveat: { label: 'Caveat', family: 'Caveat Variable', note: 'Handwritten', weights: [400, 700] },
};
export const FONT_ORDER: TextFont[] = ['cinzel', 'cormorant', 'playfair', 'newsreader', 'josefin', 'inter', 'caveat'];

/** The brand palettes the slides are drawn in, grouped as they are used. */
export const BRAND_COLOURS: { group: string; colours: { name: string; hex: string }[] }[] = [
  {
    group: 'YOU',
    colours: [
      { name: 'Cream', hex: '#f6efe2' },
      { name: 'Gold', hex: '#d4a85a' },
      { name: 'Parchment', hex: '#e8d8b8' },
      { name: 'Night ink', hex: '#1a1410' },
      { name: 'Royal maroon', hex: '#6e1a35' },
      { name: 'White', hex: '#ffffff' },
    ],
  },
  {
    group: 'Worlds',
    colours: [
      { name: 'Healing jade', hex: '#5fc49c' },
      { name: 'Digital Homes sky', hex: '#76b6ec' },
      { name: 'Worlds & Stories lilac', hex: '#b8a0f2' },
      { name: 'Music & Sound amber', hex: '#f0b746' },
      { name: 'Earnest ember', hex: '#ef8c5e' },
    ],
  },
  {
    group: 'Creative Universe',
    colours: [
      { name: 'Sun', hex: '#fdd63a' },
      { name: 'Ember', hex: '#df4612' },
      { name: 'Aqua', hex: '#b8fff6' },
      { name: 'Fur', hex: '#642521' },
    ],
  },
  {
    group: 'Atlantean Gardens',
    colours: [
      { name: 'Keeper gold', hex: '#d6b05c' },
      { name: 'Garden green', hex: '#163822' },
    ],
  },
];

export const WORLD_ACCENT: Record<PostWorld, string> = {
  healing: '#5fc49c',
  'digital-homes': '#76b6ec',
  'worlds-stories': '#b8a0f2',
  'music-sound': '#f0b746',
  'coco-making': '#ef8c5e',
};

type Look = Omit<TextLayer, 'id' | 'text' | 'x' | 'y'>;
const base: Look = { w: 0.8, size: 0.075, font: 'newsreader', colour: '#f6efe2', align: 'center', weight: 600, italic: false, caps: false, tracking: 0, shadow: true, backing: null };

/** One-tap brand looks. `accent` uses the post's world colour. */
export const TEXT_LOOKS: { id: string; label: string; look: Partial<Look> & { accent?: boolean } }[] = [
  { id: 'title', label: 'YOU title', look: { font: 'cinzel', colour: '#d4a85a', caps: true, tracking: 0.08, weight: 600, size: 0.07 } },
  { id: 'quote', label: 'Soft quote', look: { font: 'cormorant', italic: true, weight: 500, size: 0.08, colour: '#f6efe2' } },
  { id: 'story', label: 'Story serif', look: { font: 'newsreader', weight: 600, size: 0.075, colour: '#f6efe2' } },
  { id: 'headline', label: 'Headline', look: { font: 'playfair', weight: 800, size: 0.09, colour: '#ffffff' } },
  { id: 'label', label: 'World label', look: { font: 'inter', weight: 600, caps: true, tracking: 0.14, size: 0.032, w: 0.7, shadow: false, accent: true } },
  { id: 'hand', label: 'Handwritten', look: { font: 'caveat', weight: 600, size: 0.09, colour: '#f6efe2' } },
  { id: 'boxed', label: 'Boxed', look: { font: 'josefin', weight: 600, size: 0.05, colour: '#1a1410', backing: '#f6efe2', shadow: false } },
];

export function lookFor(id: string, world?: PostWorld): Partial<Look> {
  const found = TEXT_LOOKS.find((l) => l.id === id)?.look ?? {};
  const { accent, ...look } = found;
  return accent && world ? { ...look, colour: WORLD_ACCENT[world] } : look;
}


/** A new text box in the middle of the slide, in the look given (or the default). */
export function newTextLayer(look: Partial<Look> = {}, at: { x?: number; y?: number } = {}): TextLayer {
  return { ...base, ...look, id: newId(), text: 'Your words', x: at.x ?? 0.5, y: at.y ?? 0.5 };
}

/** The look of a layer, to reuse for the next one. */
export function lookOf(l: TextLayer): Look {
  const { w, size, font, colour, align, weight, italic, caps, tracking, shadow, backing } = l;
  return { w, size, font, colour, align, weight, italic, caps, tracking, shadow, backing };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Line height, in em; the same on screen and in the saved picture. */
export const LINE_HEIGHT = 1.18;
/** Padding inside a backing box, in em. */
export const BOX_PAD = 0.45;

export function cssFont(l: Pick<TextLayer, 'font' | 'weight' | 'italic'>, px: number): string {
  return `${l.italic ? 'italic ' : ''}${l.weight} ${px}px "${TEXT_FONTS[l.font].family}"`;
}

export function shownText(l: Pick<TextLayer, 'text' | 'caps'>): string {
  return l.caps ? l.text.toLocaleUpperCase() : l.text;
}

/**
 * Breaks the words into lines that fit `maxWidth`, keeping the writer's own line breaks.
 * `measure` gives a string's width in the same units. A word longer than a line stays whole.
 */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/ +/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

/**
 * Where a layer's lines sit on a slide `width` × `height` pixels wide, given a way to measure
 * text in that layer's font at `px` size. Shared by the screen and the saved picture.
 */
export function layoutLayer(l: TextLayer, width: number, height: number, measure: (s: string, px: number) => number) {
  const px = l.size * width;
  const pad = l.backing ? BOX_PAD * px : 0;
  const boxW = l.w * width;
  const track = l.tracking * px;
  const measureLine = (s: string) => measure(s, px) + track * Math.max(0, [...s].length - 1);
  const lines = wrapLines(shownText(l), boxW - 2 * pad, measureLine);
  const lh = LINE_HEIGHT * px;
  const boxH = lines.length * lh + 2 * pad;
  const left = l.x * width - boxW / 2;
  const top = l.y * height - boxH / 2;
  return { px, pad, lh, lines, box: { left, top, width: boxW, height: boxH }, widths: lines.map(measureLine) };
}

/** Text that reads on the given box colour: night ink on light boxes, cream on dark ones. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1a1410' : '#f6efe2';
}
