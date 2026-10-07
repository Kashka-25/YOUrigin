import type { ContentItem } from './types';
import { keywords } from './text';

export interface Profile {
  id: string;
  tags: Set<string>;
  words: Map<string, number>;
}

export interface SimilarityIndex {
  profiles: Map<string, Profile>;
  idf: Map<string, number>;
}

/** Builds lightweight per-item profiles (tags + keyword counts) and IDF
 *  weights so related-material lookups stay fast on a whole library. */
export function buildIndex(items: ContentItem[]): SimilarityIndex {
  const profiles = new Map<string, Profile>();
  const df = new Map<string, number>();
  for (const item of items) {
    const words = new Map<string, number>();
    for (const w of keywords(`${item.title} ${item.body}`)) words.set(w, (words.get(w) ?? 0) + 1);
    for (const w of words.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    profiles.set(item.id, { id: item.id, tags: new Set(item.tagIds), words });
  }
  const n = Math.max(items.length, 1);
  const idf = new Map<string, number>();
  for (const [w, d] of df) idf.set(w, Math.log(1 + n / d));
  return { profiles, idf };
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function wordCosine(a: Profile, b: Profile, idf: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [w, c] of a.words) {
    const wt = (idf.get(w) ?? 1) * Math.min(c, 3);
    na += wt * wt;
    const cb = b.words.get(w);
    if (cb) dot += wt * (idf.get(w) ?? 1) * Math.min(cb, 3);
  }
  for (const [w, c] of b.words) {
    const wt = (idf.get(w) ?? 1) * Math.min(c, 3);
    nb += wt * wt;
  }
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

export function similarity(index: SimilarityIndex, aId: string, bId: string): number {
  const a = index.profiles.get(aId);
  const b = index.profiles.get(bId);
  if (!a || !b) return 0;
  return 0.55 * jaccard(a.tags, b.tags) + 0.45 * wordCosine(a, b, index.idf);
}

export function sharedWords(index: SimilarityIndex, aId: string, bId: string, limit = 3): string[] {
  const a = index.profiles.get(aId);
  const b = index.profiles.get(bId);
  if (!a || !b) return [];
  return [...a.words.keys()]
    .filter((w) => b.words.has(w))
    .sort((x, y) => (index.idf.get(y) ?? 0) - (index.idf.get(x) ?? 0))
    .slice(0, limit);
}

export function mostSimilar(
  index: SimilarityIndex,
  id: string,
  candidates: Iterable<string>,
  limit = 5,
  threshold = 0.08,
): { id: string; score: number }[] {
  const out: { id: string; score: number }[] = [];
  for (const c of candidates) {
    if (c === id) continue;
    const score = similarity(index, id, c);
    if (score >= threshold) out.push({ id: c, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
