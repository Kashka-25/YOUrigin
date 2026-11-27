import { db } from './db';
import { newId } from '../domain/text';
import { suggestedFamilyFor, projectKind } from '../domain/constants';
import { workspaceOf } from '../domain/creationCounts';
import type { Section, Tag } from '../domain/types';

/**
 * A chapter's own tag: its name in lowercase, with no spaces or punctuation
 * ("Mini Vacations" → "minivacations"), so capturing "#minivacations" files a note there.
 */
export function chapterTagName(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** "love", then "love2", "love3"… ("chapter1" goes on as "chapter1-2" so the number stays clear). */
export function tagVariant(base: string, n: number): string {
  if (n < 2) return base;
  return /\d$/.test(base) ? `${base}-${n}` : `${base}${n}`;
}

/** True when a tag is still the one made from this chapter name (or its variant), not renamed by hand. */
export function followsName(tagName: string, title: string): boolean {
  const base = chapterTagName(title);
  if (!base) return false;
  if (tagName === base) return true;
  const rest = tagName.startsWith(base) ? tagName.slice(base.length) : '';
  return /^-?\d+$/.test(rest) && tagVariant(base, Number(rest.replace('-', ''))) === tagName;
}

export interface ChapterTag {
  /** The chapter's tag now, without '#'. */
  name: string;
  /** created: a new tag · reused: an unused tag of that name now files here · renamed: followed the chapter's new name
   *  · kept: renamed by hand earlier, so left alone · unchanged: already right. */
  status: 'created' | 'reused' | 'renamed' | 'kept' | 'unchanged';
  /** Set when the plain name belonged to something else, so a variant was chosen. */
  wanted?: string;
}

/** The Creation a book's chapters file notes into: the Creation that owns the workspace. */
async function creationOfSection(section: Section) {
  const book = await db.books.get(section.bookId);
  // Only books have chapters people tag; album tracks, set lists and boards are left alone.
  if (!book || projectKind(book) !== 'book') return null;
  const own = await db.projects.get(book.id);
  if (own) return own;
  const books = await db.books.toArray();
  for (const projectId of book.projectIds ?? []) {
    const project = await db.projects.get(projectId);
    if (project && workspaceOf(books, project)?.id === book.id) return project;
  }
  return null;
}

const linkedTo = (projectId: string, sectionId: string) => (t: Tag) => t.projectId === projectId && t.sectionId === sectionId;

/**
 * Gives a chapter its linked tag, or finds the one it has. A tag of the same name that is
 * free is reused; one already filing into somewhere else is never taken, and a variant is
 * chosen instead. Notes that already carry a reused tag are not moved or retagged.
 */
export async function tagChapter(sectionId: string): Promise<ChapterTag | null> {
  return db.transaction('rw', [db.tags, db.sections, db.books, db.projects], async () => {
    const section = await db.sections.get(sectionId);
    if (!section) return null;
    const creation = await creationOfSection(section);
    if (!creation) return null;
    const mine = await db.tags.filter(linkedTo(creation.id, section.id)).first();
    if (mine) return { name: mine.name, status: 'unchanged' };
    const base = chapterTagName(section.title);
    if (!base) return null;
    for (let n = 1; ; n++) {
      const name = tagVariant(base, n);
      const wanted = name === base ? undefined : base;
      const existing = await db.tags.where('name').equals(name).first();
      const now = Date.now();
      if (!existing) {
        await db.tags.add({ id: newId(), name, familyId: suggestedFamilyFor(name), projectId: creation.id, sectionId: section.id, createdAt: now, updatedAt: now });
        return { name, status: 'created', wanted };
      }
      if (!existing.projectId) {
        await db.tags.update(existing.id, { projectId: creation.id, sectionId: section.id, updatedAt: now });
        return { name, status: 'reused', wanted };
      }
    }
  });
}

/**
 * After a chapter is renamed: its linked tag follows the new name, unless the tag was
 * renamed by hand (it no longer matches the old chapter name). The tag keeps its link and
 * its notes; if the new name already belongs to another tag, a variant is chosen. A chapter
 * without a tag gets one.
 */
export async function followChapterRename(sectionId: string, oldTitle: string): Promise<ChapterTag | null> {
  const result = await db.transaction('rw', [db.tags, db.sections, db.books, db.projects], async (): Promise<ChapterTag | null | 'none'> => {
    const section = await db.sections.get(sectionId);
    if (!section) return null;
    const creation = await creationOfSection(section);
    if (!creation) return null;
    const mine = await db.tags.filter(linkedTo(creation.id, section.id)).first();
    if (!mine) return 'none';
    const base = chapterTagName(section.title);
    if (!followsName(mine.name, oldTitle) && mine.name !== base) return { name: mine.name, status: 'kept' };
    if (!base || mine.name === base) return { name: mine.name, status: 'unchanged' };
    for (let n = 1; ; n++) {
      const name = tagVariant(base, n);
      if (name === mine.name) return { name, status: 'unchanged', wanted: base };
      const taken = await db.tags.where('name').equals(name).first();
      if (taken) continue;
      await db.tags.update(mine.id, { name, updatedAt: Date.now() });
      return { name, status: 'renamed', wanted: name === base ? undefined : base };
    }
  });
  return result === 'none' ? tagChapter(sectionId) : result;
}

/** A plain sentence when a chapter's tag isn't simply its name, for a gentle notice. */
export function chapterTagNotice(tag: ChapterTag | null): string | null {
  if (!tag?.wanted) return null;
  return `#${tag.wanted} already files notes somewhere else, so this chapter's tag is #${tag.name}.`;
}
