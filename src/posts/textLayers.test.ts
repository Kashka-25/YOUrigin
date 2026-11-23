import { describe, expect, it } from 'vitest';
import { BOX_PAD, LINE_HEIGHT, layoutLayer, lookFor, lookOf, newTextLayer, readableOn, wrapLines } from './textLayers';

// Every character is 1 unit wide (scaled by px), so widths are easy to reason about.
const mono = (s: string, px = 1) => s.length * px;

describe('wrapLines', () => {
  it('fills each line as far as it fits', () => {
    expect(wrapLines('one two three four', 9, mono)).toEqual(['one two', 'three', 'four']);
  });
  it('keeps the writer’s own line breaks, including blank lines', () => {
    expect(wrapLines('a b\n\nc', 20, mono)).toEqual(['a b', '', 'c']);
  });
  it('keeps a long word whole rather than splitting it', () => {
    expect(wrapLines('extraordinarily so', 5, mono)).toEqual(['extraordinarily', 'so']);
  });
});

describe('layoutLayer', () => {
  it('sizes the box from the slide width and centres it on x, y', () => {
    const l = { ...newTextLayer({ size: 0.1, w: 0.5, backing: null, tracking: 0 }), text: 'ab cd ef', x: 0.5, y: 0.5 };
    const lay = layoutLayer(l, 100, 200, mono);
    expect(lay.px).toBe(10);
    expect(lay.box.width).toBe(50);
    // 50 wide fits "ab cd" (50) but not "ab cd ef" (80)
    expect(lay.lines).toEqual(['ab cd', 'ef']);
    expect(lay.box.height).toBeCloseTo(2 * LINE_HEIGHT * 10);
    expect(lay.box.left).toBe(25);
    expect(lay.box.top).toBeCloseTo(100 - lay.box.height / 2);
  });
  it('leaves room for the box padding and letter spacing', () => {
    const l = { ...newTextLayer({ size: 0.1, w: 0.5, backing: '#000000', tracking: 0.1 }), text: 'ab cd' };
    const lay = layoutLayer(l, 100, 100, mono);
    expect(lay.pad).toBe(BOX_PAD * 10);
    // "ab cd" is 50 + 4 gaps of 1 = 54, more than 50 - 2 * 4.5
    expect(lay.lines).toEqual(['ab', 'cd']);
    expect(lay.widths[0]).toBe(21);
  });
  it('measures capitals when the layer is set in capitals', () => {
    const seen: string[] = [];
    layoutLayer({ ...newTextLayer({ caps: true }), text: 'quiet' }, 100, 100, (s) => (seen.push(s), 1));
    expect(seen).toContain('QUIET');
  });
});

describe('looks', () => {
  it('a world label takes the post’s world colour', () => {
    expect(lookFor('label', 'music-sound').colour).toBe('#f0b746');
    expect(lookFor('label', 'healing').colour).toBe('#5fc49c');
  });
  it('a look carries style but never the words or place', () => {
    const look = lookOf({ ...newTextLayer(), text: 'secret', x: 0.1, y: 0.9 });
    expect(look).not.toHaveProperty('text');
    expect(look).not.toHaveProperty('x');
    expect(look).not.toHaveProperty('id');
  });
  it('a look keeps underline and highlight, and older words without them read as off', () => {
    expect(lookOf({ ...newTextLayer(), underline: true, highlight: '#fdd63a' })).toMatchObject({ underline: true, highlight: '#fdd63a' });
    const older = newTextLayer();
    delete older.underline;
    delete older.highlight;
    expect(lookOf(older)).toMatchObject({ underline: false, highlight: null });
  });
  it('picks readable words for a box colour', () => {
    expect(readableOn('#f6efe2')).toBe('#1a1410');
    expect(readableOn('#1a1410')).toBe('#f6efe2');
  });
});
