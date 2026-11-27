import { describe, expect, it } from 'vitest';
import { readingPages } from './readingPages';
import type { ContentItem, Section } from './types';

const sec = (id: string) => ({ id, title: id }) as Section;
const piece = (id: string) => ({ id, title: id, body: '' }) as ContentItem;

describe('reading pages', () => {
  it('gives the cover, the contents, then one piece per page in order', () => {
    const pages = readingPages([
      { section: sec('Opening'), items: [piece('a'), piece('b')] },
      { section: sec('Empty'), items: [] },
      { section: sec('Love'), items: [piece('c')] },
    ]);
    expect(pages.map((p) => (p.kind === 'piece' ? `${p.section.id}:${p.item.id}${p.first ? '*' : ''}` : p.kind))).toEqual([
      'cover',
      'contents',
      'Opening:a*',
      'Opening:b',
      'Love:c*',
    ]);
  });

  it('skips the contents for a single chapter and says so when the book is empty', () => {
    expect(readingPages([{ section: sec('One'), items: [piece('a')] }]).map((p) => p.kind)).toEqual(['cover', 'piece']);
    expect(readingPages([]).map((p) => p.kind)).toEqual(['cover', 'empty']);
  });
});
