import { db } from './db';
import { addToBook } from './books';
import type { Book, Project, RestingPiece } from '../domain/types';

/**
 * The Resting box. A piece set to rest leaves a Work's running order but stays in the
 * Project, waiting until it finds its place. The box is a list of links on the Project
 * (`Project.resting`): the piece itself is never copied or changed, only linked.
 */

/** The Projects a Work belongs to: those it lists, and the one sharing its id (its home). */
export function projectIdsOfWork(work: Pick<Book, 'id' | 'projectIds'>, projects: Pick<Project, 'id'>[]): string[] {
  const ids = new Set(work.projectIds ?? []);
  if (projects.some((p) => p.id === work.id)) ids.add(work.id);
  return [...ids].filter((id) => projects.some((p) => p.id === id));
}

/** The Works of a Project (those that list it, or share its id). */
export function worksOfProject<W extends Pick<Book, 'id' | 'projectIds'>>(projectId: string, works: W[]): W[] {
  return works.filter((w) => w.id === projectId || (w.projectIds ?? []).includes(projectId));
}

/**
 * Takes a piece out of its Work and sets it to rest in the Work's Projects. The piece stays
 * linked to each of those Projects, so it never drops out of them.
 * Returns the ids of the Projects it rests in (empty if the entry is gone).
 */
export async function restEntry(entryId: string): Promise<string[]> {
  return db.transaction('rw', [db.entries, db.books, db.projects, db.content], async () => {
    const entry = await db.entries.get(entryId);
    if (!entry) return [];
    const work = await db.books.get(entry.bookId);
    const projectIds = work ? projectIdsOfWork(work, await db.projects.toArray()) : [];
    if (!projectIds.length) throw new Error('This Work isn’t part of a Project yet, so there is nowhere for the piece to rest.');
    const now = Date.now();
    const piece: RestingPiece = { contentId: entry.contentId, at: now, fromWorkId: entry.bookId, fromSectionId: entry.sectionId };
    for (const projectId of projectIds) {
      const project = (await db.projects.get(projectId))!;
      const resting = (project.resting ?? []).filter((r) => r.contentId !== entry.contentId);
      await db.projects.update(projectId, { resting: [piece, ...resting], updatedAt: now });
    }
    // It stays in the Project even though it is no longer in the Work.
    const item = await db.content.get(entry.contentId);
    if (item) {
      const linked = item.projectIds ?? [];
      const missing = projectIds.filter((id) => !linked.includes(id));
      if (missing.length) await db.content.update(item.id, { projectIds: [...linked, ...missing], updatedAt: now });
    }
    await db.entries.delete(entryId);
    // Close the gap it left in its section.
    const left = (await db.entries.where('bookId').equals(entry.bookId).toArray())
      .filter((e) => e.sectionId === entry.sectionId)
      .sort((a, b) => a.order - b.order);
    for (const [order, e] of left.entries()) if (e.order !== order) await db.entries.update(e.id, { order, updatedAt: now });
    await db.books.update(entry.bookId, { updatedAt: now });
    return projectIds;
  });
}

/** Takes pieces out of the Resting box of the given Projects (they stay in the Projects). */
export async function wakeFromRest(projectIds: string[], contentIds: string[]): Promise<void> {
  const ids = new Set(contentIds);
  if (!ids.size || !projectIds.length) return;
  await db.transaction('rw', db.projects, async () => {
    const now = Date.now();
    for (const project of await db.projects.bulkGet([...new Set(projectIds)])) {
      if (!project?.resting?.some((r) => ids.has(r.contentId))) continue;
      await db.projects.update(project.id, { resting: project.resting.filter((r) => !ids.has(r.contentId)), updatedAt: now });
    }
  });
}

/**
 * Places a resting piece into a Work of its Project. Going back to the Work it came from,
 * it returns to the end of its old section when that section is still there; otherwise it
 * lands in the Work's tray. Returns the new entry's id ('' if it was already in that Work).
 */
export async function placeFromRest(projectId: string, contentId: string, workId: string): Promise<string> {
  const project = await db.projects.get(projectId);
  const piece = project?.resting?.find((r) => r.contentId === contentId);
  let sectionId: string | null = null;
  if (piece?.fromWorkId === workId && piece.fromSectionId) {
    const section = await db.sections.get(piece.fromSectionId);
    if (section?.bookId === workId) sectionId = section.id;
  }
  const [entryId] = await addToBook(workId, [contentId], sectionId);
  // addToBook wakes it from the Work's Projects; this also covers the Project it was chosen from.
  await wakeFromRest([projectId], [contentId]);
  return entryId ?? '';
}
