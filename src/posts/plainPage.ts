// A plain beige page: paper to write a poem on, for breaking up a feed of photos the way a
// poetry book breaks up its photographs. It is a picture like any other, so words go on it
// with the same text tool (Whisper ink reads well on it).

export const PLAIN_PAGE_COLOUR = '#eee3cf';

/** Draws a 1080 × 1350 sheet of warm beige paper with a faint grain, as a JPEG file. */
export async function plainPageFile(colour = PLAIN_PAGE_COLOUR, seed = Date.now()): Promise<File> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('This browser can’t draw pictures.');
  g.fillStyle = colour;
  g.fillRect(0, 0, W, H);
  // A soft, even grain so it reads as paper rather than a flat colour.
  let s = seed % 2147483647 || 1;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(120,96,60,0.05)' : 'rgba(255,255,255,0.08)';
    g.fillRect(rand() * W, rand() * H, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }
  const edge = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(110,84,50,0.10)');
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) throw new Error('The page couldn’t be drawn.');
  return new File([blob], 'plain-page.jpg', { type: 'image/jpeg' });
}
