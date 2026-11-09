// Creative Universe is Cassidy's portfolio hub (github.com/Kashka-25/creative-universe).
// YOUrigin is the source of its updates: a Project can be linked to a realm there,
// keeps change notes, and a portfolio can be exported as the starter pack it reads.

import type { UniverseRealm } from './types';

/** The realms that hold works, in Creative Universe's order (its content/realms.json). */
export const UNIVERSE_REALMS: { id: UniverseRealm; title: string }[] = [
  { id: 'digital', title: 'Digital Creations' },
  { id: 'ventures', title: 'Ventures & Brands' },
  { id: 'music', title: 'Music & Sound' },
  { id: 'books', title: 'Books & Literature' },
  { id: 'art', title: 'Art & Experiments' },
];

export function isUniverseRealm(v: unknown): v is UniverseRealm {
  return UNIVERSE_REALMS.some((r) => r.id === v);
}

/** Exactly how Creative Universe turns a title into an address: "Chantilly's Tallow" → "chantillys-tallow". */
export function slugify(title: string): string {
  return String(title)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
