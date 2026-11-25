import { db } from './db';
import { ensureTags } from './tags';
import { addToBook } from './books';
import { workspaceOf } from '../domain/creationCounts';

/**
 * Makes a tag a Creation's own: from now on a note given this tag anywhere (Gather,
 * a note's page, bulk tagging) joins the Creation, and its workspace's chapter or tray.
 * A tag belongs to one Creation at a time. Notes that already carry the tag join too.
 * Returns how many notes were filed.
 */
export async function linkTagToProject(tagName: string, projectId: string, sectionId?: string | null): Promise<number> {
  const map = await ensureTags([tagName]);
  const tagId = [...map.values()][0];
  if (!tagId) return 0;
  await db.tags.update(tagId, { projectId, sectionId: sectionId ?? undefined, updatedAt: Date.now() });
  const tagged = await db.content.where('tagIds').equals(tagId).primaryKeys();
  return fileByProjectTags(tagged);
}

/** Choose the chapter tagged notes are placed in (null: the tray). Notes already placed stay where they are. */
export async function setProjectTagChapter(tagId: string, sectionId: string | null): Promise<void> {
  await db.tags.update(tagId, { sectionId: sectionId ?? undefined, updatedAt: Date.now() });
}

/** The tag stops filing notes. Nothing already filed is taken out: the notes stay in the Creation. */
export async function unlinkProjectTag(tagId: string): Promise<void> {
  await db.tags.update(tagId, { projectId: undefined, sectionId: undefined, updatedAt: Date.now() });
}

/**
 * Files notes by their Creation tags: each joins every Creation whose tag it carries
 * and, when that Creation has a workspace, is placed in the tag's chapter or the tray
 * (a note already in that workspace stays where it is). Never removes anything.
 * Returns how many notes were newly filed somewhere.
 */
export async function fileByProjectTags(contentIds: string[]): Promise<number> {
  if (!contentIds.length) return 0;
  const projectTags = (await db.tags.toArray()).filter((t) => t.projectId);
  if (!projectTags.length) return 0;
  const byTag = new Map(projectTags.map((t) => [t.id, t]));
  const items = (await db.content.bulkGet([...new Set(contentIds)])).filter((i): i is NonNullable<typeof i> => !!i && !i.deletedAt);
  const filed = new Set<string>();
  for (const item of items) {
    for (const tag of item.tagIds.map((id) => byTag.get(id)).filter((t): t is NonNullable<typeof t> => !!t)) {
      const project = await db.projects.get(tag.projectId!);
      if (!project) continue;
      const now = Date.now();
      const fresh = (await db.content.get(item.id))!;
      if (!(fresh.projectIds ?? []).includes(project.id)) {
        await db.content.update(item.id, { projectIds: [...(fresh.projectIds ?? []), project.id], updatedAt: now });
        await db.projects.update(project.id, { updatedAt: now });
        filed.add(item.id);
      }
      const work = workspaceOf(await db.books.toArray(), project);
      if (!work) continue;
      const section = tag.sectionId ? await db.sections.get(tag.sectionId) : undefined;
      const added = await addToBook(work.id, [item.id], section && section.bookId === work.id ? section.id : null);
      if (added.length) filed.add(item.id);
    }
  }
  return filed.size;
}
