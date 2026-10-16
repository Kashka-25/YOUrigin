// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { baseForms, inflect, matchCase, pickForm, wordAt } from './morph';
import { PACKS, WordsDB, fitWord, installPack, lookUp, packRows, removePack } from './store';

describe('wordAt', () => {
  const text = 'The river’s edge, "quietly" running.';
  it('finds the word around the cursor', () => {
    expect(wordAt(text, 6)?.text).toBe('river');
    expect(wordAt(text, 4)?.text).toBe('river');
    expect(wordAt(text, 35)?.text).toBe('running');
  });
  it('leaves quotes and punctuation out', () => {
    const at = text.indexOf('quietly') + 2;
    expect(wordAt(text, at)).toEqual({ start: text.indexOf('quietly'), end: text.indexOf('quietly') + 7, text: 'quietly' });
  });
  it('uses a selection as it is, trimmed', () => {
    expect(wordAt('a  give up  b', 1, 11)).toEqual({ start: 3, end: 10, text: 'give up' });
  });
  it('returns null between words', () => {
    expect(wordAt('a , b', 2)).toBeNull();
  });
});

describe('base forms and endings', () => {
  it('guesses dictionary forms', () => {
    const words = (w: string) => baseForms(w).map((c) => c.word);
    expect(words('running')).toContain('run');
    expect(words('cries')).toContain('cry');
    expect(words('happier')).toContain('happy');
    expect(words('Wandered')).toContain('wander');
  });
  it('puts endings back', () => {
    expect(inflect('sprint', 'ing')).toBe('sprinting');
    expect(inflect('jog', 'ing')).toBe('jogging');
    expect(inflect('make', 'ing')).toBe('making');
    expect(inflect('dash', 'ed')).toBe('dashed');
    expect(inflect('hurry', 's')).toBe('hurries');
    expect(inflect('set off', 'ing')).toBe('setting off');
    expect(inflect('open', 'ing')).toBe('opening');
    expect(inflect('bright', 'er')).toBe('brighter');
    expect(inflect('happy', 'est')).toBe('happiest');
    expect(inflect('blissful', 'er')).toBe('more blissful');
  });
  it('tells past forms from participles', () => {
    expect(pickForm(['gone', 'went'], 'took')).toBe('went');
    expect(pickForm(['gone', 'went'], 'taken')).toBe('gone');
    expect(pickForm(['ran'], 'taken')).toBe('ran');
  });
  it('copies capitals', () => {
    expect(matchCase('River', 'stream')).toBe('Stream');
    expect(matchCase('RIVER', 'stream')).toBe('STREAM');
    expect(matchCase('river', 'stream')).toBe('stream');
  });
});

const wordnet = {
  s: [
    ['n', 'a score in baseball', '', ['run', 'tally'], []],
    ['v', 'move fast by using your feet', 'Don’t run!', ['run'], []],
    ['v', 'move fast on foot', '', ['sprint', 'dash', 'run'], []],
    ['v', 'leave', '', ['go', 'depart'], []],
    ['n', 'the act of running', '', ['running', 'run'], []],
    ['v', 'tear apart', '', ['rive', 'rend'], []],
    ['n', 'a large stream', '', ['river'], []],
  ],
  w: { run: [0, 1, 2], sprint: [2], go: [3], running: [4], rive: [5], river: [6] },
  f: { went: [['go', 'ed']], ran: [['run', 'ed']], running: [['run', 'ing']] },
  x: { go: { ed: ['gone', 'went'] }, run: { ed: ['ran'], ing: ['running'] } },
};
const moby = { w: { run: ['Everyman', 'bolt', 'make off', 'scamper'] } };

describe('packs', () => {
  let db: WordsDB;
  beforeEach(() => {
    db = new WordsDB(`words-test-${Math.random()}`);
    vi.stubGlobal('fetch', async (url: string) => new Response(gzipSync(JSON.stringify(url.includes('moby') ? moby : wordnet))));
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.delete();
  });
  const install = async (id: string) => {
    const p = PACKS.find((x) => x.id === id)!;
    const steps: number[] = [];
    await installPack(p, (f) => steps.push(f), { url: `https://example.test/${p.file}`, target: db });
    return steps;
  };

  it('turns a pack into rows, without the word itself among its synonyms', () => {
    const rows = packRows('en-wordnet', wordnet);
    const run = rows.find((r) => r.word === 'run')!;
    expect(run.senses?.[2].syn).toEqual(['sprint', 'dash']);
    expect(rows.find((r) => r.word === 'went')?.forms).toEqual([['go', 'ed']]);
    expect(rows.find((r) => r.word === 'go')?.irr).toEqual({ ed: ['gone', 'went'] });
  });

  it('downloads, reports progress and looks words up', async () => {
    const steps = await install('en-wordnet');
    expect(steps.at(-1)).toBe(1);
    const [run] = await lookUp('run', db);
    expect(run.word).toBe('run');
    expect(run.senses.map((s) => s.def)).toEqual(['a score in baseball', 'move fast by using your feet', 'move fast on foot']);
  });

  it('finds base forms and keeps the ending', async () => {
    await install('en-wordnet');
    const found = await lookUp('running', db);
    expect(found.map((g) => [g.word, g.ending])).toEqual([
      ['run', 'ing'],
      ['running', ''],
    ]);
    const went = await lookUp('went', db);
    expect(went.map((g) => [g.word, g.ending])).toEqual([['go', 'ed']]);
    expect(found[0].senses.map((s) => s.pos)).toEqual(['v', 'v']);
    // "river" is not "rive" + -er: rive is a verb, which can't take -er.
    expect((await lookUp('River', db)).map((g) => g.word)).toEqual(['river']);
  });

  it('fits a synonym into the sentence', async () => {
    await install('en-wordnet');
    expect(await fitWord('depart', 'ed', 'went', db)).toBe('departed');
    expect(await fitWord('run', 'ed', 'Walked', db)).toBe('Ran');
    expect(await fitWord('go', 'ed', 'taken', db)).toBe('gone');
    expect(await fitWord('turn tail', 'ing', 'running', db)).toBe('turning tail');
    expect(await fitWord('stream', '', 'RIVER', db)).toBe('STREAM');
  });

  it('adds more synonyms from the second pack, and removes a pack', async () => {
    await install('en-wordnet');
    await install('en-moby');
    expect((await lookUp('run', db))[0].more).toEqual(['bolt', 'scamper', 'make off', 'Everyman']);
    await removePack('en-moby', db);
    expect((await lookUp('run', db))[0].more).toEqual([]);
    expect(await db.entries.count()).toBe(packRows('en-wordnet', wordnet).length);
  });

  it('finds nothing with no packs', async () => {
    expect(await lookUp('run', db)).toEqual([]);
  });

  it('fails clearly when the download fails', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    await expect(install('en-wordnet')).rejects.toThrow('404');
    expect(await db.packs.count()).toBe(0);
  });
});

describe('published English pack', () => {
  it('has meanings, synonyms and irregular forms', () => {
    const data = JSON.parse(gunzipSync(readFileSync(new URL('../../public/packs/en-wordnet.json.gz', import.meta.url))).toString());
    const rows = new Map(packRows('en-wordnet', data).map((r) => [r.word, r]));
    expect(rows.get('happy')?.senses?.some((s) => s.syn.includes('glad'))).toBe(true);
    expect(rows.get('went')?.forms).toContainEqual(['go', 'ed']);
    expect(rows.get('take')?.irr?.ed).toEqual(expect.arrayContaining(['took', 'taken']));
  });
});
