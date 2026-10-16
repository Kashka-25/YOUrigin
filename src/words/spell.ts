import { matchCase } from './morph';
import { isSpellingPack, wordsDb, type WordsDB } from './store';

/**
 * Spell checking against a downloaded spelling pack (US or UK) plus the
 * writer's own words. Works offline; nothing leaves the device.
 */
export type Speller = {
  check: (word: string) => boolean;
  suggest: (word: string, max?: number) => string[];
};

export type Misspelling = { start: number; end: number; word: string };

const LETTERS = "abcdefghijklmnopqrstuvwxyz'";
const VOWELS = 'aeiou';
// Neighbouring keys on a QWERTY keyboard: likely slips.
const NEAR: Record<string, string> = {
  q: 'wa', w: 'qase', e: 'wsdr', r: 'edft', t: 'rfgy', y: 'tghu', u: 'yhji', i: 'ujko', o: 'iklp', p: 'ol',
  a: 'qwsz', s: 'awedxz', d: 'serfcx', f: 'drtgvc', g: 'ftyhbv', h: 'gyujnb', j: 'huikmn', k: 'jiolm', l: 'kop',
  z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk',
};

const norm = (w: string) => w.replace(/’/g, "'");

export function makeSpeller(list: string, hidden: string, own: string[] = []): Speller {
  const words = new Set(list.split('\n'));
  const quiet = new Set(hidden.split('\n'));
  const mine = new Set(own.map((w) => norm(w).toLowerCase()));
  const known = (w: string) => words.has(w) || quiet.has(w);

  const checkOne = (raw: string): boolean => {
    const w = norm(raw).replace(/^'+|'+$/g, '');
    if (!w || /\d/.test(w)) return true;
    if (mine.has(w.toLowerCase())) return true;
    // Acronyms and shouting are left alone, as in Word.
    if (w.length > 1 && w === w.toUpperCase() && w !== w.toLowerCase()) return true;
    if (known(w)) return true;
    const lower = w.toLowerCase();
    // "The" at the start of a sentence; "RIVER" handled above.
    if (w[0] !== lower[0] && w.slice(1) === lower.slice(1) && known(lower)) return true;
    return false;
  };

  const check = (raw: string) => (raw.includes('-') ? raw.split('-').every((p) => !p || checkOne(p)) : checkOne(raw));

  // Every word one typing slip away, with a cost: swapped letters and
  // neighbouring keys are the usual slips, so they rank first.
  const edits = (w: string): [string, number][] => {
    const out: [string, number][] = [];
    for (let i = 0; i <= w.length; i++) {
      const a = w.slice(0, i);
      const b = w.slice(i);
      if (b) out.push([a + b.slice(1), 1.5]);
      if (b.length > 1) out.push([a + b[1] + b[0] + b.slice(2), 0.5]);
      for (const c of LETTERS) {
        if (b && c !== b[0]) {
          const cost = NEAR[b[0]]?.includes(c) ? 1 : VOWELS.includes(b[0]) && VOWELS.includes(c) ? 1 : 2;
          out.push([a + c + b.slice(1), cost]);
        }
        out.push([a + c + b, 1.5]);
      }
    }
    return out;
  };

  const suggest = (raw: string, max = 6): string[] => {
    const w = norm(raw).toLowerCase();
    const found = new Map<string, number>();
    const consider = (cand: string, cost: number) => {
      const hit = words.has(cand) ? cand : words.has(cand[0]?.toUpperCase() + cand.slice(1)) ? cand[0].toUpperCase() + cand.slice(1) : null;
      if (!hit || hit.toLowerCase() === w) return;
      // Keeping the first letter is far more likely than changing it.
      const total = cost + (hit[0].toLowerCase() === w[0] ? 0 : 0.75);
      if (total < (found.get(hit) ?? Infinity)) found.set(hit, total);
    };
    // "paris" -> "Paris": only the capital is missing.
    const capital = w[0]?.toUpperCase() + w.slice(1);
    if (w && words.has(capital)) found.set(capital, 0);
    const first = edits(w);
    for (const [c, cost] of first) consider(c, cost);
    if (found.size < 3 && w.length < 16) for (const [c1, cost1] of first) for (const [c2, cost2] of edits(c1)) consider(c2, cost1 + cost2);
    return [...found]
      .sort((a, b) => a[1] - b[1] || Math.abs(a[0].length - w.length) - Math.abs(b[0].length - w.length) || a[0].localeCompare(b[0]))
      .slice(0, max)
      .map(([s]) => (s[0] === s[0].toUpperCase() && s[0] !== s[0].toLowerCase() ? s : matchCase(raw, s)));
  };

  return { check, suggest };
}

const WORD = /[\p{L}\p{M}](?:[\p{L}\p{M}'’-]*[\p{L}\p{M}])?/gu;
const SKIP = /\b(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+|[#@][\p{L}\p{N}_-]+/gu;

/** The misspelled words in a text, with where they are. Links, emails and #tags are skipped. */
export function findMisspellings(text: string, speller: Speller): Misspelling[] {
  const skip: [number, number][] = [...text.matchAll(SKIP)].map((m) => [m.index, m.index + m[0].length]);
  const out: Misspelling[] = [];
  for (const m of text.matchAll(WORD)) {
    const start = m.index;
    if (skip.some(([a, b]) => start >= a && start < b)) continue;
    // "river's": the possessive is fine if the word is.
    const word = m[0].replace(/['’]s$/i, '');
    if (!speller.check(word)) out.push({ start, end: start + word.length, word });
  }
  return out;
}

let cached: { key: string; speller: Speller } | null = null;

/** The speller for the installed spelling pack, or null when there isn't one. */
export async function loadSpeller(own: string[], target: WordsDB = wordsDb): Promise<Speller | null> {
  const pack = (await target.packs.toArray()).find((p) => isSpellingPack(p.id));
  if (!pack) return null;
  const key = `${pack.id}:${pack.installedAt}:${own.join('\n')}`;
  if (cached?.key === key) return cached.speller;
  const list = await target.lists.get(pack.id);
  if (!list) return null;
  cached = { key, speller: makeSpeller(list.w, list.n, own) };
  return cached.speller;
}
