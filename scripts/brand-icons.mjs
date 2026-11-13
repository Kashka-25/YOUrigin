// Browser-tab and home-screen icons: the emblem "O" from the wordmark.
// Run via `npm run brand` (which first produces the full-resolution cutout).
import sharp from 'sharp';

const FULL_CUTOUT = 'node_modules/.cache/yourigin/logo-full.png';

// The O's ring in the trimmed full-resolution cutout.
const cx = 554, cy = 354, R = 234;
const size = 2 * R;
const clip = R * 0.955; // just inside the ring's outer edge, so the bar and letters never show

const px = await sharp(FULL_CUTOUT).extract({ left: cx - R, top: cy - R, width: size, height: size }).ensureAlpha().raw().toBuffer();
for (let y = 0; y < size; y++)
  for (let x = 0; x < size; x++) {
    const d = Math.hypot(x + 0.5 - R, y + 0.5 - R);
    const k = Math.max(0, Math.min(1, (clip - d) / 1.5));
    const o = (y * size + x) * 4;
    px[o + 3] = Math.round(px[o + 3] * k);
  }
const emblem = await sharp(px, { raw: { width: size, height: size, channels: 4 } }).trim({ threshold: 0 }).png().toBuffer();

// Tab icons: emblem alone on transparency.
for (const s of [16, 32, 48, 96]) {
  await sharp(emblem).resize(s, s, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(`public/favicon-${s}.png`);
}

// Home-screen icons: phones need an opaque icon. The emblem fills it, on a deep maroon that
// matches the emblem's own inner colour, so no dark band shows around it (Build Notes, 2 Nov).
function backdrop(s, rounded) {
  const r = rounded ? Math.round(s * 0.22) : 0;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <defs><radialGradient id="g" cx="50%" cy="50%" r="72%">
      <stop offset="0" stop-color="#6e1a35"/><stop offset="0.7" stop-color="#551228"/><stop offset="1" stop-color="#3f0d1e"/>
    </radialGradient></defs>
    <rect width="${s}" height="${s}" rx="${r}" fill="url(#g)"/></svg>`);
}

async function appIcon(file, s, { scale, rounded }) {
  const e = Math.round(s * scale);
  const art = await sharp(emblem).resize(e, e, { kernel: 'lanczos3' }).png().toBuffer();
  await sharp(backdrop(s, rounded))
    .composite([{ input: art, left: Math.round((s - e) / 2), top: Math.round((s - e) / 2) }])
    // Palette PNG keeps the files small with no visible difference.
    .png({ palette: true, quality: 92, effort: 10, compressionLevel: 9 })
    .toFile(`public/${file}`);
}

await appIcon('icon-192.png', 192, { scale: 0.94, rounded: true });
await appIcon('icon-512.png', 512, { scale: 0.94, rounded: true });
// Android (Samsung included) crops maskable icons to its own shape, most often a circle the
// full width of the icon. The round emblem fills that circle; any corners show the maroon.
await appIcon('icon-maskable-512.png', 512, { scale: 1, rounded: false });
// iOS rounds the corners itself and ignores transparency.
await appIcon('apple-touch-icon.png', 180, { scale: 0.94, rounded: false });

console.log('tab and home-screen icons written');
