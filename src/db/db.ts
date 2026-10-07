import Dexie, { type Table } from 'dexie';
import type {
  AISuggestion,
  Book,
  BookEntry,
  Collection,
  ContentItem,
  Relationship,
  Revision,
  Section,
  Setting,
  Tag,
  TagFamily,
  Template,
} from '../domain/types';
import { BUILT_IN_FAMILIES, BUILT_IN_TEMPLATES } from '../domain/constants';

export const SCHEMA_VERSION = 1;

/**
 * Local-first store in IndexedDB. Schema changes go through `this.version(n)`
 * blocks — add a new version with an upgrade function, never edit an old one.
 */
export class YOUriginDB extends Dexie {
  content!: Table<ContentItem, string>;
  tags!: Table<Tag, string>;
  tagFamilies!: Table<TagFamily, string>;
  collections!: Table<Collection, string>;
  books!: Table<Book, string>;
  sections!: Table<Section, string>;
  entries!: Table<BookEntry, string>;
  relationships!: Table<Relationship, string>;
  templates!: Table<Template, string>;
  suggestions!: Table<AISuggestion, string>;
  revisions!: Table<Revision, string>;
  settings!: Table<Setting, string>;

  constructor(name = 'yourigin') {
    super(name);
    this.version(1).stores({
      content: 'id, status, type, createdAt, updatedAt, *tagIds',
      tags: 'id, &name, familyId',
      tagFamilies: 'id, order',
      collections: 'id, name, *contentIds',
      books: 'id, updatedAt',
      sections: 'id, bookId',
      entries: 'id, bookId, sectionId, contentId, &[bookId+contentId]',
      relationships: 'id, fromId, toId',
      templates: 'id',
      suggestions: 'id, contentId, state',
      revisions: 'id, contentId, createdAt',
      settings: 'key',
    });
  }
}

export const db = new YOUriginDB();

/** Built-ins have stable ids, so this is idempotent and merge-safe. */
export async function ensureBuiltIns(target: YOUriginDB = db): Promise<void> {
  const now = Date.now();
  await target.transaction('rw', target.templates, target.tagFamilies, async () => {
    for (const t of BUILT_IN_TEMPLATES) {
      if (!(await target.templates.get(t.id))) {
        await target.templates.add({ ...t, builtIn: true, createdAt: now, updatedAt: now });
      }
    }
    for (const [order, f] of BUILT_IN_FAMILIES.entries()) {
      if (!(await target.tagFamilies.get(f.id))) {
        await target.tagFamilies.add({ id: f.id, name: f.name, order, createdAt: now, updatedAt: now });
      }
    }
  });
}

/** Ask the browser not to evict our data under storage pressure (important on Android). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* unsupported */
  }
  return false;
}
