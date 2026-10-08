import { describe, expect, it } from 'vitest';
import { blocksFromHtml, blocksFromText, isTitleLike, splitDocument } from './splitter';

describe('poem splitter', () => {
  it('splits a Word document on headings and keeps stanza breaks exactly', () => {
    const html =
      '<h1>The Shore</h1><p>The ocean doesn’t ask</p><p>the shore to stay.</p><p></p><p>It goes.</p>' +
      '<h1>Salt</h1><p>My mother kept salt<br />by the door</p>';
    const { strategy, pieces } = splitDocument(blocksFromHtml(html), 'auto');
    expect(strategy).toBe('headings');
    expect(pieces).toEqual([
      { title: 'The Shore', body: 'The ocean doesn’t ask\nthe shore to stay.\n\nIt goes.' },
      { title: 'Salt', body: 'My mother kept salt\nby the door' },
    ]);
  });

  it('splits on page breaks', () => {
    const html = '<p>one a</p><p>one b</p><hr /><p>two a</p><hr /><p>three a</p>';
    const { strategy, pieces } = splitDocument(blocksFromHtml(html), 'auto');
    expect(strategy).toBe('pagebreaks');
    expect(pieces.map((p) => p.body)).toEqual(['one a\none b', 'two a', 'three a']);
  });

  it('splits on separator lines like *** and ⁂', () => {
    const text = 'first poem\nline two\n\n***\n\nsecond poem\n\n⁂\n\nthird';
    const { strategy, pieces } = splitDocument(blocksFromText(text), 'auto');
    expect(strategy).toBe('separators');
    expect(pieces.map((p) => p.body)).toEqual(['first poem\nline two', 'second poem', 'third']);
  });

  it('finds ALL-CAPS and numbered titles without breaking stanzas', () => {
    const text = [
      'RIVER',
      'the river remembers',
      'every stone',
      '',
      'it has softened',
      '',
      'EMBER',
      'even the smallest ember',
      '',
      'XII',
      'a numbered poem',
      'with two lines',
    ].join('\n');
    const { strategy, pieces } = splitDocument(blocksFromText(text), 'auto');
    expect(strategy).toBe('title-lines');
    expect(pieces).toEqual([
      { title: 'RIVER', body: 'the river remembers\nevery stone\n\nit has softened' },
      { title: 'EMBER', body: 'even the smallest ember' },
      { title: 'XII', body: 'a numbered poem\nwith two lines' },
    ]);
  });

  it('falls back to two blank lines between poems', () => {
    const text = 'a1\na2\n\na3\n\n\nb1\nb2\n\n\nc1';
    const { strategy, pieces } = splitDocument(blocksFromText(text), 'auto');
    expect(strategy).toBe('blank-lines');
    expect(pieces.map((p) => p.body)).toEqual(['a1\na2\n\na3', 'b1\nb2', 'c1']);
  });

  it('treats top-level headings as chapters and the next level as pieces', () => {
    const html =
      '<h1>- H O P E F U L -</h1><h2>North Star</h2><p>a</p><h2>Meadows</h2><p>b</p>' + '<h1>S A D</h1><h2>Far From Home</h2><p>c</p>';
    const { pieces } = splitDocument(blocksFromHtml(html), 'auto');
    expect(pieces.map((p) => [p.section, p.title])).toEqual([
      ['HOPEFUL', 'North Star'],
      ['HOPEFUL', 'Meadows'],
      ['SAD', 'Far From Home'],
    ]);
  });

  it('reads bold lines as titles and "Chapter" lines as chapters, even right after a page break', () => {
    const html =
      '<p><strong>Introduction: Learning to Swim</strong></p><p>Welcome.</p>' +
      '<p><strong>🌀 Invitation 1: A Breath</strong></p><p>Breathe.</p>' +
      '<p><strong>1 What have you brought with you?</strong></p>' +
      // The parser lifts a bold title out of a paragraph that starts with a page break.
      '<p><em><hr /></em><strong>Chapter 2: Ankle Deep</strong></p><p>Opening words.</p>' +
      '<p><strong>2 What feels alive?</strong></p><p>notes</p>';
    const { pieces } = splitDocument(blocksFromHtml(html), 'auto');
    expect(pieces.map((p) => [p.section ?? '', p.title])).toEqual([
      ['Introduction: Learning to Swim', 'Introduction: Learning to Swim'],
      ['Introduction: Learning to Swim', '🌀 Invitation 1: A Breath'],
      ['Introduction: Learning to Swim', '1 What have you brought with you?'],
      ['Chapter 2: Ankle Deep', 'Chapter 2: Ankle Deep'],
      ['Chapter 2: Ankle Deep', '2 What feels alive?'],
    ]);
  });

  it('does not mistake ordinary verse for titles', () => {
    expect(isTitleLike('and the door stayed open,')).toBe(false);
    expect(isTitleLike('I keep circling back to the idea that loss is a kind of shape')).toBe(false);
    expect(isTitleLike('THE OCEAN WITHIN')).toBe(true);
    expect(isTitleLike('No. 7')).toBe(true);
  });
});
