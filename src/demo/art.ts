// Small drawn pictures for the demo (covers and sketches), made from shapes, so the
// example library has real images without shipping photos or fetching anything.

export interface DemoPicture {
  dataUrl: string;
  width: number;
  height: number;
}

type Motif = 'waves' | 'lantern' | 'kite' | 'leaf' | 'notes' | 'circle' | 'map' | 'harbour';

const W = 1200;
const H = 800;

function shapes(motif: Motif, ink: string, accent: string): string {
  switch (motif) {
    case 'waves':
      return [0, 1, 2, 3, 4]
        .map((i) => `<path d="M0 ${430 + i * 70} C 200 ${380 + i * 70}, 400 ${480 + i * 70}, 600 ${430 + i * 70} S 1000 ${380 + i * 70}, 1200 ${430 + i * 70}" fill="none" stroke="${i % 2 ? accent : ink}" stroke-width="${10 - i}" stroke-opacity=".8"/>`)
        .join('') + `<circle cx="880" cy="230" r="90" fill="${accent}" fill-opacity=".85"/>`;
    case 'lantern':
      return `<line x1="600" y1="60" x2="600" y2="220" stroke="${ink}" stroke-width="6"/><rect x="500" y="220" width="200" height="300" rx="40" fill="${accent}" fill-opacity=".9"/><rect x="530" y="250" width="140" height="240" rx="28" fill="${ink}" fill-opacity=".25"/><circle cx="600" cy="370" r="200" fill="${accent}" fill-opacity=".12"/><circle cx="600" cy="370" r="320" fill="${accent}" fill-opacity=".06"/>`;
    case 'kite':
      return `<polygon points="600,120 820,360 600,620 380,360" fill="${accent}" fill-opacity=".9"/><line x1="600" y1="120" x2="600" y2="620" stroke="${ink}" stroke-width="4"/><line x1="380" y1="360" x2="820" y2="360" stroke="${ink}" stroke-width="4"/><path d="M600 620 C 560 680, 660 700, 600 760" fill="none" stroke="${ink}" stroke-width="4"/>`;
    case 'leaf':
      return [0, 1, 2]
        .map((i) => `<path d="M${380 + i * 220} 640 C ${300 + i * 220} 420, ${420 + i * 220} 220, ${480 + i * 220} 160 C ${560 + i * 220} 300, ${560 + i * 220} 500, ${380 + i * 220} 640 Z" fill="${i === 1 ? accent : ink}" fill-opacity=".75"/>`)
        .join('');
    case 'notes':
      return [0, 1, 2, 3]
        .map((i) => `<line x1="200" y1="${280 + i * 70}" x2="1000" y2="${280 + i * 70}" stroke="${ink}" stroke-opacity=".45" stroke-width="3"/>`)
        .join('') + `<circle cx="430" cy="455" r="34" fill="${accent}"/><line x1="462" y1="455" x2="462" y2="250" stroke="${accent}" stroke-width="8"/><circle cx="720" cy="385" r="34" fill="${accent}"/><line x1="752" y1="385" x2="752" y2="200" stroke="${accent}" stroke-width="8"/>`;
    case 'circle':
      return [0, 1, 2, 3, 4, 5]
        .map((i) => {
          const a = (i / 6) * Math.PI * 2;
          return `<circle cx="${600 + Math.cos(a) * 200}" cy="${400 + Math.sin(a) * 200}" r="56" fill="${i % 2 ? accent : ink}" fill-opacity=".8"/>`;
        })
        .join('') + `<circle cx="600" cy="400" r="70" fill="none" stroke="${accent}" stroke-width="6"/>`;
    case 'map':
      return `<path d="M160 640 C 320 520, 360 600, 480 470 S 700 300, 820 360 S 1000 220, 1060 160" fill="none" stroke="${ink}" stroke-width="8" stroke-dasharray="22 18"/>${[
        [160, 640],
        [480, 470],
        [820, 360],
        [1060, 160],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="26" fill="${accent}"/>`)
        .join('')}`;
    case 'harbour':
      return `<rect x="0" y="520" width="1200" height="280" fill="${ink}" fill-opacity=".35"/><rect x="820" y="220" width="70" height="300" fill="${ink}"/><polygon points="800,220 910,220 855,160" fill="${accent}"/><path d="M200 520 L 420 520 L 380 580 L 240 580 Z" fill="${ink}"/><line x1="310" y1="520" x2="310" y2="380" stroke="${ink}" stroke-width="6"/><polygon points="314,390 314,500 400,500" fill="${accent}" fill-opacity=".8"/>`;
  }
}

/** A calm, made-up picture: a coloured ground with a simple motif. */
export function demoPicture(motif: Motif, ground: string, ink: string, accent: string): DemoPicture {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ground}"/><stop offset="1" stop-color="${ink}" stop-opacity=".9"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>${shapes(motif, ink, accent)}</svg>`;
  return { dataUrl: `data:image/svg+xml;base64,${btoa(svg)}`, width: W, height: H };
}
