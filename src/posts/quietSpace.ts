/**
 * Finds the quiet parts of a photo (open sky, a plain wall, still water): the places with the
 * least detail, where a Whisper line can sit and be read. Everything here is plain arithmetic
 * on a small copy of the picture, worked out on the device. It only suggests where words could
 * go; Cassidy can drag them anywhere afterwards.
 */

/** A picture's pixels, RGBA, as a canvas gives them. */
export interface PictureSample {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/** How busy and how light each cell of a grid laid over the picture is (0–1 each). */
export interface QuietMap {
  cols: number;
  rows: number;
  busy: Float32Array;
  light: Float32Array;
}

/** A place on the slide: its centre and size, as fractions of the slide's width and height. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface QuietSpot extends Box {
  /** How light the picture is there (0 dark – 1 light), to choose cream or ink words. */
  light: number;
  /** Lower is quieter. */
  score: number;
}

/** Splits the picture into `cols` columns of square-ish cells and measures each. */
export function quietMap(s: PictureSample, cols = 24): QuietMap {
  const { width: W, height: H, data } = s;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
  const rows = Math.max(1, Math.round((cols * H) / W));
  const n = cols * rows;
  const grad = new Float32Array(n);
  const sum = new Float32Array(n);
  const sq = new Float32Array(n);
  const count = new Float32Array(n);
  for (let y = 0; y < H; y++) {
    const r = Math.min(rows - 1, Math.floor((y * rows) / H));
    for (let x = 0; x < W; x++) {
      const c = Math.min(cols - 1, Math.floor((x * cols) / W));
      const k = r * cols + c;
      const v = lum[y * W + x];
      const dx = x + 1 < W ? Math.abs(lum[y * W + x + 1] - v) : 0;
      const dy = y + 1 < H ? Math.abs(lum[(y + 1) * W + x] - v) : 0;
      grad[k] += dx + dy;
      sum[k] += v;
      sq[k] += v * v;
      count[k]++;
    }
  }
  const busy = new Float32Array(n);
  const light = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const m = count[k] ? sum[k] / count[k] : 0;
    const spread = count[k] ? Math.sqrt(Math.max(0, sq[k] / count[k] - m * m)) : 0;
    // Fine detail (edges, texture) counts most; a gentle gradient across the sky counts little.
    busy[k] = (count[k] ? grad[k] / count[k] : 0) * 4 + spread;
    light[k] = m;
  }
  return { cols, rows, busy, light };
}

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
  const h = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * The quietest places a box of `size` (fractions of the slide) could sit, quietest first.
 * Each is a different place (they hardly overlap), so asking again offers somewhere new.
 * `avoid` holds other words already on the picture; spots on top of them rank last.
 */
export function quietSpots(map: QuietMap, size: { w: number; h: number }, opts: { avoid?: Box[]; margin?: number; count?: number } = {}): QuietSpot[] {
  const { cols, rows, busy, light } = map;
  const { avoid = [], margin = 0.05, count = 4 } = opts;
  const max = busy.reduce((m, v) => Math.max(m, v), 0) || 1;
  // Summed tables, so any rectangle's total is four lookups.
  const sat = (vals: Float32Array, scale = 1) => {
    const t = new Float64Array((cols + 1) * (rows + 1));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) t[(r + 1) * (cols + 1) + c + 1] = vals[r * cols + c] / scale + t[r * (cols + 1) + c + 1] + t[(r + 1) * (cols + 1) + c] - t[r * (cols + 1) + c];
    return (c0: number, r0: number, c1: number, r1: number) => t[r1 * (cols + 1) + c1] - t[r0 * (cols + 1) + c1] - t[r1 * (cols + 1) + c0] + t[r0 * (cols + 1) + c0];
  };
  const busySum = sat(busy, max);
  const lightSum = sat(light);
  const bw = Math.min(cols, Math.max(1, Math.ceil(size.w * cols)));
  const bh = Math.min(rows, Math.max(1, Math.ceil(size.h * rows)));
  // Keep clear of the edges when there is room to.
  const mc = cols - bw >= 2 * Math.ceil(margin * cols) ? Math.ceil(margin * cols) : 0;
  const mr = rows - bh >= 2 * Math.ceil(margin * rows) ? Math.ceil(margin * rows) : 0;
  const all: QuietSpot[] = [];
  for (let r = mr; r + bh <= rows - mr; r++) {
    for (let c = mc; c + bw <= cols - mc; c++) {
      // The box plus a cell of breathing room around it.
      const [c0, r0, c1, r1] = [Math.max(0, c - 1), Math.max(0, r - 1), Math.min(cols, c + bw + 1), Math.min(rows, r + bh + 1)];
      // Mostly how calm it is on average, but one sharp edge (a tower, a horizon) nearby counts too.
      let peak = 0;
      for (let rr = r0; rr < r1; rr++) for (let cc = c0; cc < c1; cc++) peak = Math.max(peak, busy[rr * cols + cc] / max);
      const calm = busySum(c0, r0, c1, r1) / ((c1 - c0) * (r1 - r0)) + peak * 0.5;
      const box = { x: (c + bw / 2) / cols, y: (r + bh / 2) / rows, w: bw / cols, h: bh / rows };
      const covered = avoid.reduce((s, a) => s + overlap(box, a), 0) / (box.w * box.h);
      // A slight lean towards the middle, so two equally calm places pick the more natural one.
      const off = Math.hypot(box.x - 0.5, box.y - 0.5);
      all.push({ ...box, light: lightSum(c, r, c + bw, r + bh) / (bw * bh), score: calm + covered * 2 + off * 0.05 });
    }
  }
  all.sort((a, b) => a.score - b.score);
  // The quietest first; then each next one is calm and also far from the ones already
  // offered, so asking again moves the words somewhere that feels different.
  const picked: QuietSpot[] = all.length ? [all[0]] : [];
  while (picked.length < count) {
    let best: QuietSpot | null = null;
    let bestValue = Infinity;
    for (const s of all) {
      if (picked.some((p) => overlap(p, s) >= 0.1 * s.w * s.h)) continue;
      const near = Math.min(...picked.map((p) => Math.hypot(p.x - s.x, p.y - s.y)));
      const value = s.score - near * 0.15;
      if (value < bestValue) [best, bestValue] = [s, value];
    }
    if (!best) break;
    picked.push(best);
  }
  return picked;
}

/** A layer's box width, the width its words actually take, and its height (slide fractions). */
export interface Extent {
  boxW: number;
  textW: number;
  h: number;
}

/**
 * Where a line (and the name mark under it, if there is one) go so that, together, they fill
 * `spot`. They share the line's alignment, so the mark sits under the words' left edge, middle
 * or right edge. Returns each layer's new centre.
 */
export function placeInSpot(
  spot: Box,
  align: 'left' | 'center' | 'right',
  line: Extent,
  mark?: Extent,
  gap = 0.012,
): { line: { x: number; y: number }; mark?: { x: number; y: number } } {
  const groupW = Math.max(line.textW, mark?.textW ?? 0);
  const groupH = line.h + (mark ? gap + mark.h : 0);
  const top = spot.y - groupH / 2;
  // Where each layer's words sit, then where its box centre must be for them to sit there.
  const xFor = (e: Extent) => {
    if (align === 'left') return spot.x - groupW / 2 + e.boxW / 2;
    if (align === 'right') return spot.x + groupW / 2 - e.boxW / 2;
    return spot.x;
  };
  const placed: { line: { x: number; y: number }; mark?: { x: number; y: number } } = { line: { x: xFor(line), y: top + line.h / 2 } };
  if (mark) placed.mark = { x: xFor(mark), y: top + line.h + gap + mark.h / 2 };
  return placed;
}
