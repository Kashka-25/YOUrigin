import { describe, expect, it } from 'vitest';
import { analyseLyric, lineSyllables, rhymeKey, schemeOf, sectionLabel, wordSyllables } from './lyrics';

describe('lyric space', () => {
  it('recognises section labels in the usual spellings', () => {
    expect(sectionLabel('[Chorus]')).toBe('Chorus');
    expect(sectionLabel('(verse 2)')).toBe('Verse 2');
    expect(sectionLabel('Pre-Chorus:')).toBe('Pre-Chorus');
    expect(sectionLabel('Bridge')).toBe('Bridge');
    expect(sectionLabel('Chorus x2')).toBe('Chorus x2');
    expect(sectionLabel('The chorus of birds')).toBeNull();
    expect(sectionLabel('Verse after verse I sing')).toBeNull();
  });

  it('counts syllables close enough for a songwriter', () => {
    expect(wordSyllables('the')).toBe(1);
    expect(wordSyllables('time')).toBe(1);
    expect(wordSyllables('walked')).toBe(1);
    expect(wordSyllables('wanted')).toBe(2);
    expect(wordSyllables('little')).toBe(2);
    expect(wordSyllables('lighthouse')).toBe(2);
    expect(wordSyllables('remember')).toBe(3);
    expect(lineSyllables("I don't know where the river goes")).toBe(8);
  });

  it('hears end rhymes across spellings', () => {
    expect(rhymeKey('in the night')).toBe(rhymeKey('hold the light'));
    expect(rhymeKey('into the sky')).toBe(rhymeKey('flying high'));
    expect(rhymeKey('one more time')).toBe(rhymeKey('a perfect rhyme'));
    expect(rhymeKey('the sea')).not.toBe(rhymeKey('the sun'));
  });

  it('splits a song into labelled stanzas with rhyme schemes', () => {
    const song = `[Verse 1]
I walked out in the night
Looking for the sea
Holding on to light
Hoping you'd find me

[Chorus]
Sing it one more time
Sing it till it's done`;
    const stanzas = analyseLyric(song);
    expect(stanzas.map((s) => s.label)).toEqual(['Verse 1', 'Chorus']);
    expect(schemeOf(stanzas[0])).toBe('ABAB');
    expect(stanzas[0].lines.every((l) => l.rhymes)).toBe(true);
    expect(stanzas[1].lines.some((l) => l.rhymes)).toBe(false);
  });

  it('copes with unlabelled stanzas and Windows line endings', () => {
    const stanzas = analyseLyric('one line\r\n\r\nanother line\r\nand more');
    expect(stanzas).toHaveLength(2);
    expect(stanzas[1].lines.map((l) => l.text)).toEqual(['another line', 'and more']);
  });
});
