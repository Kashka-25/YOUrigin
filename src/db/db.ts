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
  Asset,
  Project,
} from '../domain/types';
import type { Portfolio } from '../portfolio/model';
import { BUILT_IN_FAMILIES, BUILT_IN_TEMPLATES } from '../domain/constants';
import { installChangeTracking } from '../sync/tracking';
import { DEMO, DEMO_DB_NAME } from '../demo/mode';
import { appOutbox, isSyncEnabled } from '../sync/runtime';

export const SCHEMA_VERSION = 5;

/**
 * One-time, non-destructive migration: each existing standalone Work gets a
 * same-name Project wrapper. The original Work, sections, entries and writing
 * remain in place and are linked to the new Project.
 *
 * IDs are derived from the Work ID so the same migration on another device
 * creates the same Project ID and can safely merge through sync.
 */
export async function migrateLegacyWorksToProjects(
  books: Table<Book, string>,
  projects: Table<Project, string>,
): Promise<number> {
  const works = await books.toArray();
  const existingProjects = await projects.toArray();
  const migratedAt = Date.now();
  let migrated = 0;

  const normaliseTitle = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

  for (const work of works) {
    if ((work.projectIds ?? []).length) continue;

    const title = work.title.trim() || 'Untitled project';
    const matches = existingProjects.filter((project) => normaliseTitle(project.title) === normaliseTitle(title));
    // Reuse an unambiguous same-name Project rather than creating a duplicate.
    const matchingProject = matches.length === 1 ? matches[0] : undefined;
    const projectId = matchingProject?.id ?? `legacy-work-${work.id}`;

    if (!matchingProject && !(await projects.get(projectId))) {
      const project: Project = {
        id: projectId,
        title,
        description: work.description ?? '',
        category: '',
        colour: 'ochre',
        status: work.archived ? 'resting' : 'idea',
        createdAt: work.createdAt,
        updatedAt: migratedAt,
      };
      await projects.add(project);
    }

    await books.update(work.id, {
      projectIds: [projectId],
      updatedAt: migratedAt,
    });
    migrated++;
  }

  return migrated;
}

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
  assets!: Table<Asset, string>;
  projects!: Table<Project, string>;
  portfolios!: Table<Portfolio, string>;

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
    // v2: stored images (book artwork, image pieces).
    this.version(2).stores({ assets: 'id, updatedAt' });
    // v3: independent Projects; notes and Works can each belong to many Projects.
    this.version(3).stores({
      projects: 'id, updatedAt, status, category',
      content: 'id, status, type, createdAt, updatedAt, *tagIds, *projectIds',
      books: 'id, updatedAt, *projectIds',
    });
    // v4: keep each pre-existing standalone Work, and give it a Project home.
    this.version(4).stores({}).upgrade(async (tx) => {
      await migrateLegacyWorksToProjects(
        tx.table('books') as Table<Book, string>,
        tx.table('projects') as Table<Project, string>,
      );
    });
    // v5: Portfolios, curated pages made from chosen Projects, Works and pieces.
    this.version(5).stores({ portfolios: 'id, updatedAt' });
  }
}

// The demo (?demo) gets its own database, so real writing is never opened, read or changed.
export const db = new YOUriginDB(DEMO ? DEMO_DB_NAME : 'yourigin');
// Records local changes for sync (a no-op until sync is set up on this device).
// Never track demo changes: they must not reach the real device's sync outbox.
if (!DEMO) installChangeTracking(db, appOutbox, isSyncEnabled);

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
