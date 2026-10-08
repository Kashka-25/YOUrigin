// Removes a baked-in grey checkerboard "transparency" from the logo artwork.
// Usage: node scripts/logo-cutout.mjs <input> <outputDir>
import sharp from 'sharp';

const [input, outDir] = process.argv.slice(2);
const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const N = W * H;

// Candidate background: neutral grey in the checkerboard's brightness band.
const cand = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  const v = (r + g + b) / 3;
  cand[i] = sat <= 8 && v >= 105 && v <= 230 ? 1 : 0;
}

// Connected components of candidates; remove those touching the border or large enough
// to be a pocket of checkerboard (e.g. inside letter counters).
const bg = new Uint8Array(N);
const seen = new Uint8Array(N);
const stack = new Int32Array(N);
for (let s = 0; s < N; s++) {
  if (!cand[s] || seen[s]) continue;
  let top = 0, size = 0, border = false;
  const members = [];
  stack[top++] = s; seen[s] = 1;
  while (top) {
    const p = stack[--top];
    members.push(p); size++;
    const x = p % W, y = (p / W) | 0;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) border = true;
    for (const q of [p - 1, p + 1, p - W, p + W]) {
      if (q < 0 || q >= N) continue;
      if ((q % W === 0 && p % W === W - 1) || (p % W === 0 && q % W === W - 1)) continue;
      if (cand[q] && !seen[q]) { seen[q] = 1; stack[top++] = q; }
    }
  }
  if (border || size > 400) for (const p of members) bg[p] = 1;
}

// Alpha: opaque logo, transparent background, with a soft 1px edge.
const alpha = Buffer.alloc(N);
for (let i = 0; i < N; i++) alpha[i] = bg[i] ? 0 : 255;
const soft = await sharp(alpha, { raw: { width: W, height: H, channels: 1 } }).blur(0.6).extractChannel(0).raw().toBuffer();

const rgba = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  rgba[i * 4] = data[i * 3];
  rgba[i * 4 + 1] = data[i * 3 + 1];
  rgba[i * 4 + 2] = data[i * 3 + 2];
  rgba[i * 4 + 3] = bg[i] ? 0 : soft[i];
}
// Crop to the visible logo plus a small margin.
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let i = 0; i < N; i++) {
  if (rgba[i * 4 + 3] < 16) continue;
  const x = i % W, y = (i / W) | 0;
  if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
}
const m = 4;
const left = Math.max(0, x0 - m), top = Math.max(0, y0 - m);
const trimmed = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left, top, width: Math.min(W, x1 + m) - left, height: Math.min(H, y1 + m) - top })
  .png()
  .toBuffer();
for (const w of [1400, 700]) {
  const out = await sharp(trimmed).resize(w).webp({ quality: 85, alphaQuality: 90 }).toFile(`${outDir}/yourigin-logo-${w}.webp`);
  console.log(`yourigin-logo-${w}.webp`, out.width, 'x', out.height, Math.round(out.size / 1024) + 'KB');
}
await sharp(trimmed).resize(1400).png().toFile(`${outDir}/preview-logo.png`);
