import { describe, expect, it } from 'vitest';
import {
  kronkPostText,
  kronkShareUrl,
  newDraft,
  normalizeHandle,
  normalizeUrl,
  fitText,
  shareKindFor,
  toCreditRows,
  toWorkRow,
  validateProfile,
  validateShare,
  type ShareDraft,
} from './model';
import type { ContentItem } from '../domain/types';

const item = (over: Partial<ContentItem>): ContentItem => ({
  id: 'c1',
  title: '',
  body: '',
  type: 'poem',
  status: 'seed',
  tagIds: [],
  notes: '',
  source: { kind: 'capture' },
  keepUnassigned: false,
  archived: false,
  deletedAt: null,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const words = (over: Partial<ShareDraft> = {}): ShareDraft => ({ ...newDraft(item({ body: 'The tide\nremembers' }))!, rights: true, ...over });

describe('what can be shared', () => {
  it('shares images as images and pieces with words as words', () => {
    expect(shareKindFor(item({ type: 'image', assetId: 'a1' }))).toBe('image');
    expect(shareKindFor(item({ type: 'image' }))).toBeNull();
    expect(shareKindFor(item({ type: 'image', assetId: 'a1', inspiration: true }))).toBeNull();
    expect(shareKindFor(item({ type: 'story', body: 'Once' }))).toBe('words');
    expect(shareKindFor(item({ type: 'idea', body: '  ' }))).toBeNull();
  });

  it('starts a draft with the places that suit the piece', () => {
    expect(newDraft(item({ type: 'image', assetId: 'a1' }))!.placements).toEqual(['home_background', 'gallery']);
    const d = newDraft(item({ body: 'The tide\nremembers' }))!;
    expect(d.placements).toEqual(['featured_words', 'gallery']);
    expect(d.title).toBe('The tide');
    expect(d.rights).toBe(false);
  });
});

describe('validateShare', () => {
  it('needs the rights tick', () => {
    expect(validateShare(words({ rights: false }))).toContain('Tick the box to say you made this (or have permission).');
    expect(validateShare(words())).toEqual([]);
  });

  it('keeps written work off the home background', () => {
    expect(validateShare(words({ placements: ['home_background'] }))).toContain('That place is not available for this kind of piece.');
    expect(validateShare(words({ placements: [] }))).toContain('Choose at least one place it can appear.');
  });

  it('checks credits', () => {
    const problems = validateShare(words({ credits: [{ name: '', url: 'http://x.com', kronkHandle: 'nope' }] }));
    expect(problems).toEqual([
      'Credit 1 needs a name.',
      "Credit 1's link must be a web address starting https://.",
      "Credit 1's Kronk handle should look like @name@server.",
    ]);
    expect(validateShare(words({ credits: [{ name: 'Ben', url: 'ben.art', kronkHandle: 'ben@kronk.social' }] }))).toEqual([]);
  });
});

describe('links and handles', () => {
  it('normalises handles', () => {
    expect(normalizeHandle('ana@Kronk.Social')).toBe('@ana@kronk.social');
    expect(normalizeHandle('@ana@kronk.social')).toBe('@ana@kronk.social');
    expect(normalizeHandle('')).toBe('');
    expect(normalizeHandle('@ana')).toBeNull();
  });

  it('allows https links only, adding the scheme when missing', () => {
    expect(normalizeUrl('ko-fi.com/ana')).toBe('https://ko-fi.com/ana');
    expect(normalizeUrl('https://paypal.me/ana')).toBe('https://paypal.me/ana');
    expect(normalizeUrl('http://ko-fi.com/ana')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('')).toBe('');
  });

  it('checks the artist profile', () => {
    expect(validateProfile({ displayName: '', bio: '', links: [], kronkHandle: '' })).toEqual(['Add the name you want to be credited as.']);
    expect(validateProfile({ displayName: 'Ana', bio: '', links: [{ kind: 'kofi', label: '', url: 'ko-fi.com/ana' }], kronkHandle: '@ana@kronk.social' })).toEqual([]);
  });
});

describe('fitText', () => {
  it('ends at a sentence, else a word', () => {
    expect(fitText('Short.', 280)).toBe('Short.');
    expect(fitText('One sentence here. Another that runs on and on.', 30)).toBe('One sentence here.');
    expect(fitText('words that keep going without any stop', 20)).toBe('words that keep…');
  });
});

describe('rows for the server', () => {
  it('keeps only placements that fit and drops the amount for free pieces', () => {
    const row = toWorkRow(words({ placements: ['featured_words', 'home_background'], suggestedAmount: '£3' }), 'c1', null);
    expect(row.placements).toEqual(['featured_words']);
    expect(row.suggested_amount).toBeNull();
    expect(row.kind).toBe('words');
    expect(row.source_id).toBe('c1');
  });

  it('cleans credit links and handles', () => {
    expect(toCreditRows('w1', [{ name: ' Ben ', url: 'ben.art', kronkHandle: 'ben@kronk.social' }])).toEqual([
      { work_id: 'w1', role: 'offered_by', name: 'Ben', url: 'https://ben.art/', kronk_handle: '@ben@kronk.social', position: 0 },
    ]);
  });
});

describe('Kronk', () => {
  const profile = { displayName: 'Ana', links: [{ kind: 'kofi' as const, label: '', url: 'ko-fi.com/ana' }] };

  it('writes a credited post within 500 characters', () => {
    const text = kronkPostText(words({ body: 'word '.repeat(300), credits: [{ name: 'Ben', url: '', kronkHandle: 'ben@kronk.social' }] }), profile);
    expect(text.length).toBeLessThanOrEqual(500);
    expect(text).toContain('Offered by @ben@kronk.social');
    expect(text).toContain('Support Ana: https://ko-fi.com/ana');
    expect(text).toContain('…');
  });

  it("opens the artist's own server", () => {
    expect(kronkShareUrl('@ana@kronk.social', 'Hi there')).toBe('https://kronk.social/share?text=Hi%20there');
    expect(kronkShareUrl('', 'Hi')).toBeNull();
  });
});
