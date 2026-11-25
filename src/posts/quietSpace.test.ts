import { describe, expect, it } from 'vitest';
import { placeInSpot, quietMap, quietSpots, type PictureSample } from './quietSpace';

/** A test picture: `paint(x, y)` gives each pixel's grey level (0–255). */
function picture(width: number, height: number, paint: (x: number, y: number) => number): PictureSample {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const v = paint(x, y);
      data.set([v, v, v, 255], (y * width + x) * 4);
    }
  return { data, width, height };
}

/** Busy noise everywhere except a calm, pale band of sky across the top third. */
const skyOnTop = picture(96, 120, (x, y) => (y < 40 ? 225 : (x * 37 + y * 91) % 2 ? 30 : 200));

describe('finding quiet space on a picture', () => {
  it('measures calm and light for each part of the picture', () => {
    const map = quietMap(skyOnTop, 24);
    expect(map.rows).toBe(30);
    expect(map.busy[0]).toBeLessThan(0.01);
    expect(map.light[0]).toBeCloseTo(225 / 255, 2);
    expect(map.busy[29 * 24]).toBeGreaterThan(1);
  });

  it('puts a line in the calm sky, and says the sky is light', () => {
    const [best] = quietSpots(quietMap(skyOnTop), { w: 0.6, h: 0.1 });
    expect(best.y).toBeLessThan(0.33);
    expect(best.light).toBeGreaterThan(0.8);
  });

  it('keeps clear of the edges when there is room', () => {
    const blank = quietMap(picture(40, 50, () => 128), 20);
    for (const s of quietSpots(blank, { w: 0.5, h: 0.1 }, { count: 6 })) {
      expect(s.x - s.w / 2).toBeGreaterThanOrEqual(0.05 - 1e-9);
      expect(s.y - s.h / 2).toBeGreaterThanOrEqual(0.04 - 1e-9);
      expect(s.x + s.w / 2).toBeLessThanOrEqual(0.95 + 1e-9);
    }
  });

  it('offers different places each time, quietest first', () => {
    const spots = quietSpots(quietMap(skyOnTop), { w: 0.4, h: 0.08 }, { count: 3 });
    expect(spots.length).toBe(3);
    expect(spots[0].score).toBeLessThanOrEqual(spots[1].score);
    const [a, b] = spots;
    const sameSpot = Math.abs(a.x - b.x) < a.w / 2 && Math.abs(a.y - b.y) < a.h / 2;
    expect(sameSpot).toBe(false);
  });

  it('steers away from words already on the picture', () => {
    const sky = quietMap(skyOnTop);
    const [first] = quietSpots(sky, { w: 0.6, h: 0.1 });
    const [next] = quietSpots(sky, { w: 0.6, h: 0.1 }, { avoid: [{ ...first }] });
    expect(Math.abs(next.y - first.y) >= first.h || Math.abs(next.x - first.x) >= first.w).toBe(true);
  });

  it('still finds a place for words bigger than the picture allows', () => {
    const [s] = quietSpots(quietMap(skyOnTop), { w: 1.4, h: 0.2 });
    expect(s.w).toBe(1);
  });
});

describe('placing a line and its name mark together', () => {
  const spot = { x: 0.5, y: 0.3, w: 0.6, h: 0.12 };
  const line = { boxW: 0.64, textW: 0.5, h: 0.08 };
  const mark = { boxW: 0.8, textW: 0.2, h: 0.02 };

  it('stacks the mark under the line, the pair centred on the spot', () => {
    const p = placeInSpot(spot, 'center', line, mark, 0.02);
    expect(p.line).toEqual({ x: 0.5, y: 0.3 - 0.06 + 0.04 });
    expect(p.mark!.x).toBe(0.5);
    expect(p.mark!.y).toBeCloseTo(0.3 + 0.06 - 0.01);
  });

  it('lines up the left or right edges when the words are aligned that way', () => {
    const left = placeInSpot(spot, 'left', line, mark);
    // Both boxes start where the pair's left edge is.
    expect(left.line.x - line.boxW / 2).toBeCloseTo(0.25);
    expect(left.mark!.x - mark.boxW / 2).toBeCloseTo(0.25);
    const right = placeInSpot(spot, 'right', line, mark);
    expect(right.line.x + line.boxW / 2).toBeCloseTo(0.75);
    expect(right.mark!.x + mark.boxW / 2).toBeCloseTo(0.75);
  });

  it('places a line on its own', () => {
    expect(placeInSpot(spot, 'center', line)).toEqual({ line: { x: 0.5, y: 0.3 } });
  });
});
