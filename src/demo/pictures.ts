// The pictures Creative Universe shows for Cassidy's projects (its public covers and
// screens, from github.com/Kashka-25/creative-universe), shrunk for the demo and
// shipped in public/demo/, so the service worker keeps them for offline use. The demo
// copies them into its own database like any other picture; if one can't be loaded,
// a drawn picture stands in.

import type { DemoPicture } from './art';

/** File name (without .webp) → its size. */
export const CU_PICTURES = {
  you: [960, 540],
  'you-pillars': [480, 1039],
  'you-yournal': [480, 1039],
  yourigin: [960, 540],
  empatherapy: [960, 540],
  'empatherapy-v2-home': [960, 600],
  'empatherapy-v2-discover': [960, 600],
  intothelighthouse: [960, 540],
  'intothelighthouse-home': [960, 600],
  'intothelighthouse-support': [960, 600],
  'intothelighthouse-safety': [960, 600],
  'the-art-of-free-flow': [960, 540],
  'my-living-youlogy': [960, 540],
  'living-youlogy-home': [800, 500],
  'living-youlogy-evening': [800, 500],
} as const satisfies Record<string, readonly [number, number]>;

export type CuPicture = keyof typeof CU_PICTURES;

/** A Creative Universe picture, with a drawn one in reserve. */
export interface RealPicture {
  real: CuPicture;
  fallback: DemoPicture;
}

export interface LoadedPicture {
  dataUrl: string;
  width: number;
  height: number;
  mime: string;
}

function base64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

export async function loadPicture(p: DemoPicture | RealPicture): Promise<LoadedPicture> {
  if (!('real' in p)) return { ...p, mime: 'image/svg+xml' };
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}demo/${p.real}.webp`);
    if (!res.ok) throw new Error(String(res.status));
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) throw new Error(type); // e.g. the app's own page standing in for a missing file
    const [width, height] = CU_PICTURES[p.real];
    return { dataUrl: `data:image/webp;base64,${base64(new Uint8Array(await res.arrayBuffer()))}`, width, height, mime: 'image/webp' };
  } catch {
    return { ...p.fallback, mime: 'image/svg+xml' };
  }
}
