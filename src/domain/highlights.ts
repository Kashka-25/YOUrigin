// The highlighter pen: coloured marks over parts of a piece.
// Kept as ranges beside the writing (never inside it), so exports, spelling and
// lyric tools see the words exactly as written. When the writing changes, each
// mark moves with the words it covers.

import type { Highlight, HighlightColour } from './types';
import { newId } from './text';

export const HIGHLIGHT_COLOURS: { value: HighlightColour; label: string; fill: string }[] = [
  { value: 'yellow', label: 'Yellow', fill: 'rgba(246, 205, 82, .42)' },
  { value: 'green', label: 'Green', fill: 'rgba(120, 214, 140, .38)' },
  { value: 'blue', label: 'Blue', fill: 'rgba(110, 178, 255, .38)' },
  { value: 'pink', label: 'Pink', fill: 'rgba(246, 140, 190, .40)' },
  { value: 'orange', label: 'Orange', fill: 'rgba(255, 160, 90, .40)' },
];

const clean = (list: Highlight[]) => list.filter((h) => h.end > h.start).sort((a, b) => a.start - b.start);

/** Takes [start, end) out of every mark, splitting a mark that spans it. */
function cut(list: Highlight[], start: number, end: number): Highlight[] {
  const out: Highlight[] = [];
  for (const h of list) {
    if (h.end <= start || h.start >= end) out.push(h);
    else {
      if (h.start < start) out.push({ ...h, end: start });
      if (h.end > end) out.push({ ...h, id: h.start < start ? newId() : h.id, start: end });
    }
  }
  return clean(out);
}

/** Highlights [start, end) in a colour. Overlapping marks give way; a neighbour of the same colour joins it. */
export function addHighlight(list: Highlight[], start: number, end: number, colour: HighlightColour): Highlight[] {
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  if (a === b) return list;
  let next = cut(list, a, b);
  let mark: Highlight = { id: newId(), start: a, end: b, colour };
  next = next.filter((h) => {
    if (h.colour === colour && (h.end === mark.start || h.start === mark.end)) {
      mark = { ...mark, start: Math.min(mark.start, h.start), end: Math.max(mark.end, h.end) };
      return false;
    }
    return true;
  });
  return clean([...next, mark]);
}

/** The eraser: clears marks from [start, end). With nothing selected, clears the mark under the cursor. */
export function eraseHighlight(list: Highlight[], start: number, end: number): Highlight[] {
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  if (a === b) return list.filter((h) => !(h.start <= a && a <= h.end));
  return cut(list, a, b);
}

/**
 * After an edit, moves each mark with its words. Finds the one changed region (what
 * typing, pasting or deleting produces) by common prefix and suffix: marks before it
 * stay, marks after it shift, and marks running into it are trimmed to what's left.
 */
export function shiftHighlights(before: string, after: string, list: Highlight[] | undefined): Highlight[] {
  if (!list?.length || before === after) return list ?? [];
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before[p] === after[p]) p++;
  let s = 0;
  while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
  const oldEnd = before.length - s; // end of the changed region, in the old text
  const newEnd = after.length - s; // and in the new text
  const delta = newEnd - oldEnd;
  const map = (i: number, side: 'start' | 'end') => {
    if (i < p || (i === p && side === 'start')) return i;
    if (i >= oldEnd) return i + delta;
    // Inside the changed region: a start moves to the end of the new words, an end to their start.
    return side === 'start' ? newEnd : p;
  };
  return clean(
    list.map((h) => {
      // Typing at the end of a mark extends it (like a highlighter left down); inside it, it grows.
      const end = h.end === p && oldEnd === p && delta > 0 ? h.end + delta : map(h.end, 'end');
      const grows = h.start < p && h.end > oldEnd;
      return { ...h, start: map(h.start, 'start'), end: grows ? h.end + delta : end };
    }),
  );
}

/** The writing cut into plain and highlighted runs, for drawing the marks. */
export function highlightRuns(text: string, list: Highlight[] | undefined): { text: string; colour?: HighlightColour }[] {
  const runs: { text: string; colour?: HighlightColour }[] = [];
  let at = 0;
  for (const h of clean([...(list ?? [])])) {
    const start = Math.max(h.start, at);
    const end = Math.min(h.end, text.length);
    if (end <= start) continue;
    if (start > at) runs.push({ text: text.slice(at, start) });
    runs.push({ text: text.slice(start, end), colour: h.colour });
    at = end;
  }
  if (at < text.length) runs.push({ text: text.slice(at) });
  return runs;
}
