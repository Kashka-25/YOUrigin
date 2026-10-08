// Tab icon: the emblem "O" cropped from the full-resolution wordmark cutout.
// Usage: FULL_OUT=<tmp>/full.png node scripts/logo-cutout.mjs ... && node scripts/favicon.mjs <tmp>/full.png
import sharp from 'sharp';

const [full] = process.argv.slice(2);
const cx = 554, cy = 354, R = 234; // the O's ring in the trimmed cutout
const size = 2 * R;
const clip = R * 0.955; // just inside the ring's outer edge
const px = await sharp(full).extract({ left: cx - R, top: cy - R, width: size, height: size }).ensureAlpha().raw().toBuffer();
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const d = Math.hypot(x + 0.5 - R, y + 0.5 - R);
    const k = Math.max(0, Math.min(1, (clip - d) / 1.5));
    const o = (y * size + x) * 4;
    px[o + 3] = Math.round(px[o + 3] * k);
  }
const o = sharp(px, { raw: { width: size, height: size, channels: 4 } }).trim({ threshold: 0 });
const emblem = await o.png().toBuffer();
for (const s of [16, 32, 48, 96]) {
  await sharp(emblem).resize(s, s, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(`public/favicon-${s}.png`);
}
console.log('favicons written');
