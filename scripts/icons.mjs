// Renders PWA icons from public/icon.svg. Run: npm run icons
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/icon.svg', import.meta.url));
for (const size of [192, 512]) {
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(new URL(`../public/icon-${size}.png`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
}
console.log('icons written');
