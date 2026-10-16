// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gunzipSync, gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { findMisspellings, loadSpeller, makeSpeller } from './spell';
import { PACKS, WordsDB, installPack } from './store';

const pack = (file: string) => JSON.parse(gunzipSync(readFileSync(new URL(`../../public/packs/${file}`, import.meta.url))).toString());
const us = pack('en-us-spelling.json.gz');
const speller = makeSpeller(us.w, us.n, ['Aelora']);

describe('spell checking (US pack)', () => {
  it('accepts real words in their forms and capitals', () => {
    for (const w of ['running', 'unhappiness', 'The', 'Paris', 'doesn’t', 'lugubrious', 'NASA', 'well-worn', 'aelora']) expect(speller.check(w), w).toBe(true);
  });
  it('flags misspellings', () => {
    for (const w of ['teh', 'recieve', 'mispelled', 'colour', 'paris']) expect(speller.check(w), w).toBe(false);
  });
  it('suggests the likely word first', () => {
    expect(speller.suggest('teh')[0]).toBe('the');
    expect(speller.suggest('recieve')[0]).toBe('receive');
    expect(speller.suggest('mispelled')[0]).toBe('misspelled');
    expect(speller.suggest('definately')[0]).toBe('definitely');
    expect(speller.suggest('Becuase')[0]).toBe('Because');
    expect(speller.suggest('paris')).toContain('Paris');
  });
  it('finds misspellings in text, skipping links and tags', () => {
    const text = 'Teh river’s edge was quiet. See https://exmple.com #wtaer and the recieved letter.';
    expect(findMisspellings(text, speller).map((m) => [m.word, text.slice(m.start, m.end)])).toEqual([
      ['Teh', 'Teh'],
      ['recieved', 'recieved'],
    ]);
  });
});

describe('UK pack', () => {
  it('uses British spelling', () => {
    const gb = pack('en-gb-spelling.json.gz');
    const uk = makeSpeller(gb.w, gb.n);
    expect(uk.check('colour')).toBe(true);
    expect(uk.check('realise')).toBe(true);
    expect(uk.check('color')).toBe(false);
  });
});

describe('spelling packs', () => {
  let db: WordsDB;
  beforeEach(() => {
    db = new WordsDB(`spell-test-${Math.random()}`);
    vi.stubGlobal('fetch', async () => new Response(gzipSync(JSON.stringify({ w: 'river\nthe', n: '' }))));
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.delete();
  });
  const install = (id: string) => installPack(PACKS.find((p) => p.id === id)!, undefined, { url: 'https://example.test/x', target: db });

  it('keeps one spelling pack at a time and loads it', async () => {
    expect(await loadSpeller([], db)).toBeNull();
    await install('en-us-spelling');
    await install('en-gb-spelling');
    expect((await db.packs.toArray()).map((p) => p.id)).toEqual(['en-gb-spelling']);
    const s = await loadSpeller(['Aelora'], db);
    expect(s?.check('river')).toBe(true);
    expect(s?.check('rivr')).toBe(false);
    expect(s?.check('aelora')).toBe(true);
  });
});
