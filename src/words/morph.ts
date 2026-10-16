// Finding the word to look up, guessing its base form, and fitting a
// replacement back into the sentence. English only for now.

const WORD_CHAR = /[\p{L}\p{M}'’-]/u;

export type Range = { start: number; end: number; text: string };

/** The selected text, or the word the cursor is in or touching. */
export function wordAt(text: string, start: number, end: number = start): Range | null {
  if (end > start) {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return { start: start + lead, end: start + lead + trimmed.length, text: trimmed };
  }
  let a = start;
  let b = start;
  while (a > 0 && WORD_CHAR.test(text[a - 1])) a--;
  while (b < text.length && WORD_CHAR.test(text[b])) b++;
  // Leave quotes and dashes around the word alone.
  while (a < b && /['’-]/.test(text[a])) a++;
  while (b > a && /['’-]/.test(text[b - 1])) b--;
  // "river's" -> "river"
  if (/['’]s$/i.test(text.slice(a, b))) b -= 2;
  return b > a ? { start: a, end: b, text: text.slice(a, b) } : null;
}

export type Ending = '' | 's' | 'ed' | 'ing' | 'er' | 'est';
export type Candidate = { word: string; ending: Ending };

// WordNet's "morphy" rules, plus doubled consonants (running -> run).
const RULES: [string, string, Ending][] = [
  ['ies', 'y', 's'],
  ['ses', 's', 's'],
  ['xes', 'x', 's'],
  ['zes', 'z', 's'],
  ['ches', 'ch', 's'],
  ['shes', 'sh', 's'],
  ['men', 'man', ''],
  ['es', 'e', 's'],
  ['es', '', 's'],
  ['s', '', 's'],
  ['ied', 'y', 'ed'],
  ['ed', 'e', 'ed'],
  ['ed', '', 'ed'],
  ['ying', 'ie', 'ing'],
  ['ing', 'e', 'ing'],
  ['ing', '', 'ing'],
  ['ier', 'y', 'er'],
  ['iest', 'y', 'est'],
  ['er', 'e', 'er'],
  ['er', '', 'er'],
  ['est', 'e', 'est'],
  ['est', '', 'est'],
];

/** Possible dictionary forms of a word, most likely first. */
export function baseForms(word: string): Candidate[] {
  const w = word.toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').trim();
  const out: Candidate[] = [{ word: w, ending: '' }];
  const add = (c: Candidate) => c.word.length > 1 && !out.some((o) => o.word === c.word) && out.push(c);
  if (w.includes(' ')) return out;
  for (const [suffix, repl, ending] of RULES) {
    if (!w.endsWith(suffix) || w.length <= suffix.length + 1) continue;
    const stem = w.slice(0, -suffix.length);
    add({ word: stem + repl, ending });
    if (repl === '' && (ending === 'ed' || ending === 'ing' || ending === 'er' || ending === 'est') && /([b-df-hj-np-tv-z])\1$/.test(stem)) {
      add({ word: stem.slice(0, -1), ending });
    }
  }
  return out;
}

/** Puts an ending back on a base word: (sprint, ing) -> sprinting. Phrases change their first word. */
export function inflect(word: string, ending: Ending): string {
  if (!ending) return word;
  const sp = word.indexOf(' ');
  if (sp > 0) return inflect(word.slice(0, sp), ending) + word.slice(sp);
  const w = word;
  const consonantY = /[^aeiou]y$/i.test(w);
  if (ending === 's') {
    if (/(s|x|z|ch|sh)$/i.test(w)) return w + 'es';
    return consonantY ? w.slice(0, -1) + 'ies' : w + 's';
  }
  if (ending === 'ing') {
    if (/ie$/i.test(w)) return w.slice(0, -2) + 'ying';
    if (/[^eoy]e$/i.test(w)) return w.slice(0, -1) + 'ing';
    return doubled(w) + 'ing';
  }
  // Longer adjectives: more beautiful, most beautiful.
  if ((ending === 'er' || ending === 'est') && syllables(w) > (/y$/i.test(w) ? 2 : 1)) return `${ending === 'er' ? 'more' : 'most'} ${word}`;
  // ed, er, est
  const tail = ending;
  if (/e$/i.test(w)) return w + tail.slice(1);
  if (consonantY) return w.slice(0, -1) + 'i' + tail;
  return doubled(w) + tail;
}

function syllables(w: string): number {
  return (w.toLowerCase().replace(/e$/, '').match(/[aeiouy]+/g) ?? []).length || 1;
}

/**
 * Chooses between irregular forms (went / gone) by the shape of the word being
 * replaced: "gone", "taken", "flown" read as participles, "went", "ran" as past.
 */
export function pickForm(forms: string[], original: string): string {
  if (forms.length === 1) return forms[0];
  const participle = (w: string) => /(en|wn|rn|ne)$/i.test(w);
  return forms.find((f) => participle(f) === participle(original)) ?? forms[0];
}

// One-syllable words ending consonant-vowel-consonant double the last letter: jog -> jogging.
function doubled(w: string): string {
  const groups = w.toLowerCase().match(/[aeiou]+/g) ?? [];
  if (groups.length === 1 && /[^aeiou][aeiou][b-df-hj-np-tvz]$/i.test(w)) return w + w.slice(-1);
  return w;
}

/** Copies the capitals of the word being replaced. */
export function matchCase(original: string, replacement: string): string {
  if (original.length > 1 && original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
  if (original[0] && original[0] !== original[0].toLowerCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}
