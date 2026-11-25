import type { Book, BookEntry, ContentItem, Project, Section } from './types';
import { childrenOf, descendantsOf } from './creations';

/**
 * A Creation's own workspace: the Work made for it (same id), or else a Work in it
 * with the same name. The same rule the Creation page uses to open its workspace.
 */
export function workspaceOf(books: Book[], project: Pick<Project, 'id' | 'title'>): Book | undefined {
  return (
    books.find((b) => b.id === project.id) ??
    books.find((b) => (b.projectIds ?? []).includes(project.id) && b.title.trim().toLocaleLowerCase() === project.title.trim().toLocaleLowerCase())
  );
}

interface Library {
  projects: Project[];
  books: Book[];
  sections: Section[];
  entries: BookEntry[];
  items: ContentItem[];
}

/**
 * Every note that belongs to a Creation, however it got there: linked to the Creation
 * itself, or placed in one of its Works (a book's chapters or tray). With `branches`,
 * the Creations inside it count too. Each note is counted once; notes in the Trash
 * or archived are left out.
 */
export function notesIn(lib: Library, id: string, { branches = false } = {}): ContentItem[] {
  const ids = new Set([id, ...(branches ? descendantsOf(lib.projects, id).map((p) => p.id) : [])]);
  const works = new Set(lib.books.filter((b) => ids.has(b.id) || (b.projectIds ?? []).some((p) => ids.has(p))).map((b) => b.id));
  const placed = new Set(lib.entries.filter((e) => works.has(e.bookId)).map((e) => e.contentId));
  return lib.items.filter((i) => !i.deletedAt && !i.archived && (placed.has(i.id) || (i.projectIds ?? []).some((p) => ids.has(p))));
}

/** The plain breakdown shown on a Creation: notes (with its branches), branches, and its book's chapters. */
export function creationCounts(lib: Library, project: Pick<Project, 'id' | 'title'>) {
  const work = workspaceOf(lib.books, project);
  return {
    notes: notesIn(lib, project.id, { branches: true }).length,
    branches: childrenOf(lib.projects, project.id).length,
    chapters: work ? lib.sections.filter((s) => s.bookId === work.id).length : 0,
  };
}
