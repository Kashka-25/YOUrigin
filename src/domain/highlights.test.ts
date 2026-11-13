import { describe, expect, it } from 'vitest';
import { addHighlight, eraseHighlight, highlightRuns, shiftHighlights } from './highlights';
import type { Highlight } from './types';

const text = 'The ferry horn sounds like someone clearing their throat.';
const span = (list: Highlight[], t = text) => list.map((h) => `${h.colour}:${t.slice(h.start, h.end)}`);

describe('the highlighter pen', () => {
  it('marks a passage in a colour, either way it was selected', () => {
    const l = addHighlight([], 4, 9, 'yellow');
    expect(span(l)).toEqual(['yellow:ferry']);
    expect(span(addHighlight([], 9, 4, 'blue'))).toEqual(['blue:ferry']);
    expect(addHighlight(l, 5, 5, 'pink')).toBe(l); // nothing selected
  });

  it('a new colour over part of a mark splits it; the same colour next door joins it', () => {
    let l = addHighlight([], 0, 21, 'yellow'); // The ferry horn sounds
    l = addHighlight(l, 4, 9, 'pink'); // ferry
    expect(span(l)).toEqual(['yellow:The ', 'pink:ferry', 'yellow: horn sounds']);
    l = addHighlight(l, 9, 14, 'pink'); // " horn" joins ferry
    expect(span(l)).toEqual(['yellow:The ', 'pink:ferry horn', 'yellow: sounds']);
  });

  it('the eraser clears a selection, or the mark under the cursor', () => {
    let l = addHighlight([], 4, 21, 'green'); // ferry horn sounds
    l = eraseHighlight(l, 9, 14); // erase " horn"
    expect(span(l)).toEqual(['green:ferry', 'green: sounds']);
    expect(span(eraseHighlight(l, 6, 6))).toEqual(['green: sounds']); // cursor inside "ferry"
  });

  it('marks move with their words as you type and delete', () => {
    const l = addHighlight([], 10, 14, 'yellow'); // horn
    const typedBefore = 'The old ferry horn sounds like someone clearing their throat.';
    expect(span(shiftHighlights(text, typedBefore, l), typedBefore)).toEqual(['yellow:horn']);
    const typedInside = 'The ferry fog-horn sounds like someone clearing their throat.';
    expect(span(shiftHighlights(text, typedInside, addHighlight([], 4, 14, 'blue')), typedInside)).toEqual(['blue:ferry fog-horn']);
    const typedAfter = text.replace('throat', 'dry throat');
    expect(span(shiftHighlights(text, typedAfter, l), typedAfter)).toEqual(['yellow:horn']);
  });

  it('deleting part of a mark trims it; deleting all of it removes it', () => {
    const l = addHighlight([], 4, 14, 'pink'); // ferry horn
    const lost = 'The ry horn sounds like someone clearing their throat.'; // deleted "fer"
    expect(span(shiftHighlights(text, lost, l), lost)).toEqual(['pink:ry horn']);
    const gone = 'The  sounds like someone clearing their throat.';
    expect(shiftHighlights(text, gone, l)).toEqual([]);
  });

  it('cuts the writing into plain and marked runs for drawing', () => {
    const runs = highlightRuns(text, addHighlight([], 4, 9, 'yellow'));
    expect(runs.map((r) => r.text).join('')).toBe(text);
    expect(runs.filter((r) => r.colour)).toEqual([{ text: 'ferry', colour: 'yellow' }]);
    // A stale mark past the end of the writing is ignored safely.
    expect(highlightRuns('short', [{ id: 'x', start: 2, end: 99, colour: 'blue' }]).map((r) => r.text)).toEqual(['sh', 'ort']);
  });
});
