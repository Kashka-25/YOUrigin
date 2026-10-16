import Dexie, { type Table } from 'dexie';
import { baseForms, inflect, matchCase, pickForm, type Ending } from './morph';

/**
 * Dictionary and thesaurus packs. Each is an optional download (public/packs/,
 * served beside the app but not precached) kept in its own IndexedDB database,
 * so it never syncs, never goes into backups and works offline once saved.
 */
export type PackInfo = {
  id: string;
  /** words: meanings and synonyms. spelling: a word list for the spell checker (one at a time). */
  kind: 'words' | 'spelling';
  language: string;
  name: string;
  file: string;
  mb: number;
  version: number;
  credit: string;
  creditUrl: string;
};

export const PACKS: PackInfo[] = [
  {
    id: 'en-wordnet',
    kind: 'words',
    language: 'English',
    name: 'Dictionary and synonyms',
    file: 'en-wordnet.json.gz',
    mb: 4.8,
    version: 1,
    credit: 'Open English WordNet 2025, CC BY 4.0',
    creditUrl: 'https://en-word.net',
  },
  {
    id: 'en-moby',
    kind: 'words',
    language: 'English',
    name: 'More synonyms',
    file: 'en-moby.json.gz',
    mb: 9.7,
    version: 1,
    credit: 'Moby Thesaurus II, public domain',
    creditUrl: 'https://www.gutenberg.org/ebooks/3202',
  },
  {
    id: 'en-us-spelling',
    kind: 'spelling',
    language: 'English (US)',
    name: 'Spelling',
    file: 'en-us-spelling.json.gz',
    mb: 0.45,
    version: 1,
    credit: 'SCOWL, © Kevin Atkinson',
    creditUrl: 'https://github.com/en-wl/wordlist',
  },
  {
    id: 'en-gb-spelling',
    kind: 'spelling',
    language: 'English (UK)',
    name: 'Spelling',
    file: 'en-gb-spelling.json.gz',
    mb: 0.46,
    version: 1,
    credit: 'SCOWL, © Kevin Atkinson',
    creditUrl: 'https://github.com/en-wl/wordlist',
  },
];

const WORD_PACKS = new Set(PACKS.filter((p) => p.kind === 'words').map((p) => p.id));
const SPELLING_PACKS = new Set(PACKS.filter((p) => p.kind === 'spelling').map((p) => p.id));
export const isWordPack = (id: string) => WORD_PACKS.has(id);
export const isSpellingPack = (id: string) => SPELLING_PACKS.has(id);

export type Sense = { pos: string; def: string; ex: string; syn: string[] };
/** forms: what this word is a form of (went → go + ed). irr: this word's irregular forms (go → ed → went, gone). */
export type WordRow = {
  pack: string;
  word: string;
  senses?: Sense[];
  forms?: [string, Ending][];
  irr?: Partial<Record<Ending, string[]>>;
  more?: string[];
};
export type InstalledPack = { id: string; version: number; installedAt: number };
/** A spelling pack: correct words, and correct words never to suggest, one per line. */
export type WordList = { pack: string; w: string; n: string };

export class WordsDB extends Dexie {
  packs!: Table<InstalledPack, string>;
  entries!: Table<WordRow, [string, string]>;
  lists!: Table<WordList, string>;
  constructor(name = 'yourigin-words') {
    super(name);
    this.version(1).stores({ packs: 'id', entries: '[pack+word]' });
    // v2: spelling word lists, one row per pack.
    this.version(2).stores({ lists: 'pack' });
  }
}

export const wordsDb = new WordsDB();

type WordNetFile = {
  s: [string, string, string, string[], number[]][];
  w: Record<string, number[]>;
  f: Record<string, [string, Ending][]>;
  x: Record<string, Partial<Record<Ending, string[]>>>;
};
type MobyFile = { w: Record<string, string[]> };

/** Turns a downloaded pack into one row per word. */
export function packRows(id: string, data: unknown): WordRow[] {
  if (id === 'en-moby') {
    const { w } = data as MobyFile;
    return Object.entries(w).map(([word, more]) => ({ pack: id, word, more }));
  }
  const { s, w, f, x } = data as WordNetFile;
  const rows = new Map<string, WordRow>();
  for (const [word, ids] of Object.entries(w)) {
    const senses = ids.map((i) => {
      const [pos, def, ex, members, similar] = s[i];
      const syn = [...members, ...similar.flatMap((j) => s[j][3].slice(0, 2))];
      return { pos, def, ex, syn: [...new Set(syn)].filter((m) => m.toLowerCase() !== word) };
    });
    rows.set(word, { pack: id, word, senses });
  }
  const add = (word: string, patch: Partial<WordRow>) => rows.set(word, { ...(rows.get(word) ?? { pack: id, word }), ...patch });
  for (const [form, bases] of Object.entries(f)) add(form, { forms: bases });
  for (const [base, irr] of Object.entries(x)) add(base, { irr });
  return [...rows.values()];
}

async function readAll(res: Response, onBytes: (n: number) => void): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.length;
    onBytes(n);
  }
  const all = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return all;
}

/** Hosts may hand the file over already unzipped; only gunzip when it's still gzip. */
export async function gunzipText(bytes: Uint8Array): Promise<string> {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export function packUrl(p: PackInfo): string {
  return new URL(`packs/${p.file}`, document.baseURI).href;
}

/** Downloads and saves a pack. Progress goes 0 → 1 (first half download, second half saving). */
export async function installPack(
  p: PackInfo,
  onProgress: (fraction: number) => void = () => {},
  opts: { url?: string; target?: WordsDB } = {},
): Promise<void> {
  const target = opts.target ?? wordsDb;
  const res = await fetch(opts.url ?? packUrl(p));
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || p.mb * 1e6;
  const bytes = await readAll(res, (n) => onProgress(Math.min(n / total, 1) * 0.5));
  const data = JSON.parse(await gunzipText(bytes));
  if (p.kind === 'spelling') {
    // One spelling pack at a time: US or UK.
    for (const other of SPELLING_PACKS) if (other !== p.id) await removePack(other, target);
    await target.lists.put({ pack: p.id, w: data.w, n: data.n });
    onProgress(1);
    await target.packs.put({ id: p.id, version: p.version, installedAt: Date.now() });
    return;
  }
  const rows = packRows(p.id, data);
  await clearRows(target, p.id);
  const CHUNK = 5000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await target.entries.bulkPut(rows.slice(i, i + CHUNK));
    onProgress(0.5 + (Math.min(i + CHUNK, rows.length) / rows.length) * 0.5);
  }
  await target.packs.put({ id: p.id, version: p.version, installedAt: Date.now() });
}

function clearRows(target: WordsDB, id: string) {
  return target.entries.where('[pack+word]').between([id, Dexie.minKey], [id, Dexie.maxKey]).delete();
}

export async function removePack(id: string, target: WordsDB = wordsDb): Promise<void> {
  await target.packs.delete(id);
  await target.lists.delete(id);
  await clearRows(target, id);
}

export type Lookup = { word: string; ending: Ending; senses: Sense[]; more: string[] };

/**
 * Definitions and synonyms for a word. Besides the word as written, its base
 * form is looked up too (running → run, went → go), each as its own group so a
 * swap can put the same ending back.
 */
export async function lookUp(query: string, target: WordsDB = wordsDb): Promise<Lookup[]> {
  const installed = (await target.packs.toArray()).map((p) => p.id).filter(isWordPack);
  if (!installed.length) return [];
  const found: Lookup[] = [];
  const tried = new Set<string>();
  const queue = baseForms(query);
  let stemmed = false;
  for (let i = 0; i < queue.length && found.length < 3; i++) {
    const { word, ending } = queue[i];
    if (tried.has(word) || (ending && stemmed)) continue;
    tried.add(word);
    const rows = (await target.entries.bulkGet(installed.map((pack) => [pack, word] as [string, string]))).filter((r): r is WordRow => !!r);
    // Listed forms (went → go, running → run) are tried next, keeping a regular ending where there is one.
    const endings = baseForms(word);
    queue.splice(i + 1, 0, ...rows.flatMap((r) => r.forms ?? []).map(([f, e]) => ({ word: f, ending: e || (endings.find((c) => c.word === f)?.ending ?? '') })));
    let senses = rows.flatMap((r) => r.senses ?? []);
    if (ending) {
      // A base form only counts if it can take that ending: "river" isn't "rive" + -er.
      senses = senses.filter((s) => ENDING_POS[ending].includes(s.pos));
      if (!senses.length && installed.includes('en-wordnet')) continue;
    }
    const more = plainFirst(rows.flatMap((r) => r.more ?? []));
    if (!senses.length && !more.length) continue;
    // An inflected word usually means its base (was running → run), so that comes first.
    if (ending) found.unshift({ word, ending, senses, more });
    else found.push({ word, ending, senses, more });
    if (ending) stemmed = true;
  }
  return found;
}

const ENDING_POS: Record<Exclude<Ending, ''>, string[]> = { s: ['n', 'v'], ing: ['v'], ed: ['v'], er: ['a', 'r'], est: ['a', 'r'] };

// Single everyday words before names and phrases (Moby lists "Everyman" before "bolt").
function plainFirst(words: string[]): string[] {
  const rank = (w: string) => (/[A-Z]/.test(w) ? 2 : 0) + (w.includes(' ') ? 1 : 0);
  return words.map((w, i) => [rank(w), i, w] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
}

/**
 * The synonym as it should go into the sentence: same ending and capitals as
 * the word it replaces, using irregular forms where WordNet lists them
 * (went → departed, but walked → ran).
 */
export async function fitWord(word: string, ending: Ending, original: string, target: WordsDB = wordsDb): Promise<string> {
  let fitted = word;
  if (ending) {
    const sp = word.indexOf(' ');
    const head = sp > 0 ? word.slice(0, sp) : word;
    const irr = (await target.entries.get(['en-wordnet', head.toLowerCase()]))?.irr?.[ending];
    fitted = irr?.length ? pickForm(irr, original) + (sp > 0 ? word.slice(sp) : '') : inflect(word, ending);
  }
  return matchCase(original, fitted);
}
