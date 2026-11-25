import type { ContentItem, Section } from './types';

export type ReadingPart = { section: Section; items: ContentItem[] };
export type ReadingPage =
  | { kind: 'cover' }
  | { kind: 'contents' }
  | { kind: 'empty' }
  | { kind: 'piece'; section: Section; item: ContentItem; first: boolean };

/** A book as pages to turn: its cover, its contents (when it has chapters), then one piece per page. */
export function readingPages(parts: ReadingPart[]): ReadingPage[] {
  const nonEmpty = parts.filter((p) => p.items.length);
  const pages: ReadingPage[] = [{ kind: 'cover' }];
  if (nonEmpty.length > 1) pages.push({ kind: 'contents' });
  if (!nonEmpty.length) pages.push({ kind: 'empty' });
  for (const { section, items } of nonEmpty) items.forEach((item, i) => pages.push({ kind: 'piece', section, item, first: i === 0 }));
  return pages;
}
