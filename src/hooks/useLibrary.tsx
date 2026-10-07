import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type {
  Book,
  BookEntry,
  Collection,
  ContentItem,
  Section,
  Tag,
  TagFamily,
  Template,
} from '../domain/types';
import type { LibraryContext } from '../domain/query';
import type { AIContext } from '../ai';

export interface LibraryData {
  items: ContentItem[];
  tags: Tag[];
  families: TagFamily[];
  books: Book[];
  sections: Section[];
  entries: BookEntry[];
  collections: Collection[];
  templates: Template[];
  ctx: LibraryContext;
  contentById: Map<string, ContentItem>;
  tagById: Map<string, Tag>;
  /** Live (not deleted) pieces per tag id. */
  tagCounts: Map<string, number>;
  ai: AIContext;
}

const LibraryCtx = createContext<LibraryData | undefined>(undefined);

/**
 * One live query feeds the whole UI. Dexie re-runs it whenever any of these
 * tables change, so every screen updates the moment something is saved.
 */
export function LibraryProvider({ children }: { children: ReactNode }) {
  const raw = useLiveQuery(async () => {
    const [items, tags, families, books, sections, entries, collections, templates] = await Promise.all([
      db.content.toArray(),
      db.tags.toArray(),
      db.tagFamilies.orderBy('order').toArray(),
      db.books.toArray(),
      db.sections.toArray(),
      db.entries.toArray(),
      db.collections.toArray(),
      db.templates.toArray(),
    ]);
    return { items, tags, families, books, sections, entries, collections, templates };
  }, []);

  const value = useMemo<LibraryData | undefined>(() => {
    if (!raw) return undefined;
    const { items, tags, books, sections, entries, collections } = raw;
    const contentById = new Map(items.map((i) => [i.id, i]));
    const tagById = new Map(tags.map((t) => [t.id, t]));
    const tagName = new Map(tags.map((t) => [t.id, t.name]));
    const tagIdByName = new Map(tags.map((t) => [t.name, t.id]));
    const booksOf = new Map<string, Set<string>>();
    for (const e of entries) {
      const set = booksOf.get(e.contentId) ?? new Set();
      set.add(e.bookId);
      booksOf.set(e.contentId, set);
    }
    const collectionsOf = new Map<string, Set<string>>();
    for (const c of collections) {
      for (const id of c.contentIds) {
        const set = collectionsOf.get(id) ?? new Set();
        set.add(c.id);
        collectionsOf.set(id, set);
      }
    }
    const tagCounts = new Map<string, number>();
    for (const i of items) {
      if (i.deletedAt) continue;
      for (const t of i.tagIds) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
    const ctx: LibraryContext = {
      tagName,
      tagIdByName,
      booksOf,
      collectionsOf,
      bookTitle: new Map(books.map((b) => [b.id, b.title])),
      collectionName: new Map(collections.map((c) => [c.id, c.name])),
    };
    const ai: AIContext = {
      items: items.filter((i) => !i.deletedAt && !i.archived),
      tagName,
      books: books.map((book) => ({
        book,
        sections: sections.filter((s) => s.bookId === book.id),
        entries: entries.filter((e) => e.bookId === book.id),
      })),
    };
    return { ...raw, ctx, contentById, tagById, tagCounts, ai };
  }, [raw]);

  return <LibraryCtx.Provider value={value}>{children}</LibraryCtx.Provider>;
}

export function useLibrary(): LibraryData | undefined {
  return useContext(LibraryCtx);
}
