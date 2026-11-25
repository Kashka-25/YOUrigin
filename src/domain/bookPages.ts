import type { BookEntry, ContentItem, Section } from './types';

export interface Chapter {
  /** null: pages the book holds that are not in a chapter yet. */
  section: Section | null;
  pages: ContentItem[];
}

export interface BookPages {
  chapters: Chapter[];
  /** Every page in reading order, with the chapter it sits in. */
  flat: { item: ContentItem; section: Section | null }[];
}

/**
 * The book as the writer moves through it: chapters in order, each with its pages
 * in order, then any pages not in a chapter yet. Pieces in the Trash are left out.
 * The glossary and Previous / Next both read from this, so they always agree.
 */
export function bookPages(sections: Section[], entries: BookEntry[], contentById: Map<string, ContentItem>): BookPages {
  const pagesIn = (sectionId: string | null) =>
    entries
      .filter((e) => e.sectionId === sectionId)
      .sort((a, b) => a.order - b.order)
      .map((e) => contentById.get(e.contentId))
      .filter((c): c is ContentItem => !!c && !c.deletedAt);
  const chapters: Chapter[] = [...sections].sort((a, b) => a.order - b.order).map((section) => ({ section, pages: pagesIn(section.id) }));
  const loose = pagesIn(null);
  if (loose.length) chapters.push({ section: null, pages: loose });
  return { chapters, flat: chapters.flatMap((c) => c.pages.map((item) => ({ item, section: c.section }))) };
}
