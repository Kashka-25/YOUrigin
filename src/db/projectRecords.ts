import { db } from './db';
import type { Project, ProjectStatus } from '../domain/types';
import { newId } from '../domain/text';

export interface NewProject {
  title: string;
  description?: string;
  category?: string;
  status?: ProjectStatus;
}

export type ProjectPatch = Partial<Pick<Project, 'title' | 'description' | 'category' | 'status'>>;

export async function createProject(input: NewProject): Promise<string> {
  const now = Date.now();
  const id = newId();
  await db.projects.add({
    id,
    title: input.title.trim() || 'Untitled project',
    description: input.description?.trim() ?? '',
    category: input.category?.trim() ?? '',
    status: input.status ?? 'idea',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateProject(id: string, patch: ProjectPatch): Promise<void> {
  const clean = { ...patch };
  if (clean.title !== undefined) clean.title = clean.title.trim() || 'Untitled project';
  if (clean.category !== undefined) clean.category = clean.category.trim();
  await db.projects.update(id, { ...clean, updatedAt: Date.now() });
}

export async function addItemsToProject(projectId: string, contentIds: string[]): Promise<void> {
  await db.transaction('rw', db.projects, db.content, async () => {
    const project = await db.projects.get(projectId);
    if (!project) throw new Error('Project not found');
    const items = (await db.content.bulkGet([...new Set(contentIds)])).filter((item) => !!item);
    const now = Date.now();
    for (const item of items) {
      const ids = item.projectIds ?? [];
      if (!ids.includes(projectId)) await db.content.update(item.id, { projectIds: [...ids, projectId], updatedAt: now });
    }
    await db.projects.update(projectId, { updatedAt: now });
  });
}

export async function removeItemFromProject(projectId: string, contentId: string): Promise<void> {
  await db.transaction('rw', db.projects, db.content, async () => {
    const item = await db.content.get(contentId);
    if (item) await db.content.update(contentId, { projectIds: (item.projectIds ?? []).filter((id) => id !== projectId), updatedAt: Date.now() });
    await db.projects.update(projectId, { updatedAt: Date.now() });
  });
}

export async function addWorksToProject(projectId: string, workIds: string[]): Promise<void> {
  await db.transaction('rw', db.projects, db.books, async () => {
    const project = await db.projects.get(projectId);
    if (!project) throw new Error('Project not found');
    const works = (await db.books.bulkGet([...new Set(workIds)])).filter((work) => !!work);
    const now = Date.now();
    for (const work of works) {
      const ids = work.projectIds ?? [];
      if (!ids.includes(projectId)) await db.books.update(work.id, { projectIds: [...ids, projectId], updatedAt: now });
    }
    await db.projects.update(projectId, { updatedAt: now });
  });
}

export async function removeWorkFromProject(projectId: string, workId: string): Promise<void> {
  await db.transaction('rw', db.projects, db.books, async () => {
    const work = await db.books.get(workId);
    if (work) await db.books.update(workId, { projectIds: (work.projectIds ?? []).filter((id) => id !== projectId), updatedAt: Date.now() });
    await db.projects.update(projectId, { updatedAt: Date.now() });
  });
}

/** Remove the project relationship only. Notes and Works remain untouched. */
export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.content, db.books, async () => {
    const now = Date.now();
    const [items, works] = await Promise.all([
      db.content.where('projectIds').equals(id).toArray(),
      db.books.where('projectIds').equals(id).toArray(),
    ]);
    for (const item of items) await db.content.update(item.id, { projectIds: (item.projectIds ?? []).filter((x) => x !== id), updatedAt: now });
    for (const work of works) await db.books.update(work.id, { projectIds: (work.projectIds ?? []).filter((x) => x !== id), updatedAt: now });
    await db.projects.delete(id);
  });
}
