// Lyric space: reading a song's words as a songwriter would.
// Pure and offline. It only *describes* the lyric; it never changes it.

export interface LyricLine {
  text: string;
  syllables: number;
  /** Rhyme letter within its stanza (A, B, …), or '' for a blank line. */
  rhyme: string;
  /** True when another line in the stanza shares its rhyme. */
  rhymes: boolean;
}

export interface LyricStanza {
  /** Section name when the stanza starts with one ("Chorus", "Verse 2"), else ''. */
  label: string;
  lines: LyricLine[];
}

const SECTION =
  /^\s*[[(]?\s*((?:pre[- ]?chorus|post[- ]?chorus|chorus|verse|bridge|intro|outro|hook|refrain|interlude|tag|coda|breakdown|instrumental|solo)(?:\s*\d+)?(?:\s*[x×]\s*\d+)?)\s*[\])]?\s*:?\s*$/i;

/** "[Chorus]", "(Verse 2)", "Bridge:" on its own line → its name; otherwise null. */
export function sectionLabel(line: string): string | null {
  const m = line.match(SECTION);
  if (!m) return null;
  const name = m[1].replace(/\s+/g, ' ').trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** A songwriter's estimate, not a dictionary: vowel groups with the usual silent endings. */
export function wordSyllables(raw: string): number {
  let w = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  // A consonant + "le" ending is its own beat: ta-ble, lit-tle.
  const le = /[^aeiouy]le$/.test(w) ? 1 : 0;
  if (le) w = w.slice(0, -2);
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]e)$/, '').replace(/^y/, '');
  // "-ed" is silent unless after t/d (walked = 1, wanted = 2).
  if (/[^td]ed$/.test(w)) w = w.slice(0, -2);
  const groups = w.match(/[aeiouy]{1,2}/g)?.length ?? 0;
  return Math.max(1, groups + le);
}

export function lineSyllables(line: string): number {
  return (line.match(/[A-Za-z']+/g) ?? []).reduce((n, w) => n + wordSyllables(w.replace(/'/g, '')), 0);
}

/**
 * The sound a line ends on, roughly: the last word from its final vowel sound.
 * "night" / "light" / "bite" all end on "ite"; "sky" / "high" / "eye" on "i".
 */
export function rhymeKey(line: string): string {
  const words = line.toLowerCase().match(/[a-z']+/g);
  if (!words) return '';
  let w = words[words.length - 1].replace(/'/g, '');
  // Open "ee" sounds: me, be, she, sea, free, key.
  if (/^[^aeiouy]*e$/.test(w) || /(ee|ea|ey)$/.test(w)) return 'ee';
  w = w
    .replace(/igh(t?)$/, 'i$1e') // night → nite, high → ie
    .replace(/ie$/, 'i')
    .replace(/ye$/, 'i')
    .replace(/eye$/, 'i')
    .replace(/y$/, 'i')
    .replace(/([^aeiou])e$/, '_$1') // time → tim (silent e marked)
    .replace(/ph/g, 'f')
    .replace(/ck$/, 'k');
  const silentE = w.includes('_');
  w = w.replace('_', '');
  const m = w.match(/[aeiouy]+[^aeiouy]*$/);
  let key = m ? m[0] : w;
  if (silentE) key = key.replace(/^[aeiouy]+/, (v) => v[0]) + 'e';
  // "-ite" (night, bite) and "-ie" (high) differ, but "ite"/"ight" already matched above.
  return key.replace(/y/g, 'i');
}

export function analyseLyric(body: string): LyricStanza[] {
  const stanzas: LyricStanza[] = [];
  let current: LyricStanza | null = null;
  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const text = raw.trimEnd();
    const label = sectionLabel(text);
    if (label !== null) {
      current = { label, lines: [] };
      stanzas.push(current);
      continue;
    }
    if (!text.trim()) {
      // A blank line ends a stanza, but a section label right before it keeps its stanza.
      if (current?.lines.length) current = null;
      continue;
    }
    if (!current) {
      current = { label: '', lines: [] };
      stanzas.push(current);
    }
    current.lines.push({ text, syllables: lineSyllables(text), rhyme: '', rhymes: false });
  }
  for (const stanza of stanzas) {
    const letters = new Map<string, string>();
    const keys = stanza.lines.map((l) => rhymeKey(l.text));
    const counts = new Map<string, number>();
    for (const k of keys) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    stanza.lines.forEach((line, i) => {
      const k = keys[i];
      if (!k) return;
      if (!letters.has(k)) letters.set(k, String.fromCharCode(65 + (letters.size % 26)));
      line.rhyme = letters.get(k)!;
      line.rhymes = (counts.get(k) ?? 0) > 1;
    });
  }
  return stanzas.filter((s) => s.lines.length || s.label);
}

/** "ABAB", "AABB" … for a stanza. */
export function schemeOf(stanza: LyricStanza): string {
  return stanza.lines.map((l) => l.rhyme).join('');
}
