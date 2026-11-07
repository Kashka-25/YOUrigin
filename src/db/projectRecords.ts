import { db } from './db';
import type { Project, ProjectColour, ProjectStatus } from '../domain/types';
import { DEFAULT_PROJECT_COLOUR } from '../domain/constants';
import { newId } from '../domain/text';

export interface NewProject {
  /** Optional stable id when a Project shares the identity of an existing creative workspace. */
  id?: string;
  title: string;
  description?: string;
  category?: string;
  colour?: ProjectColour;
  status?: ProjectStatus;
}

export type ProjectPatch = Partial<Pick<Project, 'title' | 'description' | 'category' | 'colour' | 'status' | 'coverAssetId'>>;

export async function createProject(input: NewProject): Promise<string> {
  const now = Date.now();
  const id = input.id ?? newId();
  await db.projects.add({
    id,
    title: input.title.trim() || 'Untitled project',
    description: input.description?.trim() ?? '',
    category: input.category?.trim() ?? '',
    colour: input.colour ?? DEFAULT_PROJECT_COLOUR,
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
    const items = (await db.content.bulkGet([...new Set(contentIds)])).filter((item): item is NonNullable<typeof item> => !!item);
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
    const works = (await db.books.bulkGet([...new Set(workIds)])).filter((work): work is NonNullable<typeof work> => !!work);
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


export interface WorkImportOptions {
  category?: string;
  colour?: ProjectColour;
  status?: ProjectStatus;
}

/**
 * Make every existing creative Work discoverable as a Project. When a Work
 * was already imported into a same-title Project, keep that existing Project
 * rather than creating a duplicate. Otherwise the Project reuses the Work id,
 * so both records represent one thing and its manuscript data stays in place.
 */
export async function ensureWorksHaveProjects(): Promise<string[]> {
  return db.transaction('rw', db.projects, db.books, async () => {
    const [works, projects] = await Promise.all([db.books.toArray(), db.projects.toArray()]);
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const normalise = (value: string) => value.trim().toLocaleLowerCase();
    const created = works
      .filter((work) => {
        if (projectById.has(work.id)) return false;
        return !(work.projectIds ?? []).some((projectId) => {
          const linked = projectById.get(projectId);
          return !!linked && normalise(linked.title) === normalise(work.title);
        });
      })
      .map((work) => ({
        id: work.id,
        title: work.title.trim() || 'Untitled project',
        description: work.description ?? '',
        category: '',
        colour: DEFAULT_PROJECT_COLOUR,
        status: work.archived ? 'resting' as const : 'building' as const,
        createdAt: work.createdAt,
        updatedAt: work.updatedAt,
      }));
    if (created.length) await db.projects.bulkAdd(created);
    return created.map((project) => project.id);
  });
}
export async function importWorksAsProjects(workIds: string[], options: WorkImportOptions = {}): Promise<string[]> {
  const uniqueIds = [...new Set(workIds)];
  if (!uniqueIds.length) return [];

  return db.transaction('rw', db.projects, db.books, async () => {
    const works = (await db.books.bulkGet(uniqueIds)).filter(
      (work): work is NonNullable<typeof work> => !!work && !(work.projectIds ?? []).length,
    );
    const now = Date.now();
    const projects = works.map((work) => ({
      id: newId(),
      title: work.title.trim() || 'Untitled project',
      description: work.description ?? '',
      category: options.category?.trim() ?? '',
      colour: options.colour ?? DEFAULT_PROJECT_COLOUR,
      status: options.status ?? 'idea',
      createdAt: now,
      updatedAt: now,
    }));
    if (!projects.length) return [];
    await db.projects.bulkAdd(projects);
    for (const [index, work] of works.entries()) {
      await db.books.update(work.id, {
        projectIds: [...(work.projectIds ?? []), projects[index].id],
        updatedAt: now,
      });
    }
    return projects.map((project) => project.id);
  });
}

/** Creates one shared Project and links every selected Work to it atomically. */
export async function createProjectForWorks(input: NewProject, workIds: string[]): Promise<string> {
  const uniqueIds = [...new Set(workIds)];
  if (!uniqueIds.length) throw new Error('Choose at least one Work');
  return db.transaction('rw', db.projects, db.books, async () => {
    const works = (await db.books.bulkGet(uniqueIds)).filter(
      (work): work is NonNullable<typeof work> => !!work,
    );
    if (works.length !== uniqueIds.length) throw new Error('One or more selected Works could not be found');
    const now = Date.now();
    const id = newId();
    await db.projects.add({
      id,
      title: input.title.trim() || 'Untitled project',
      description: input.description?.trim() ?? '',
      category: input.category?.trim() ?? '',
      colour: input.colour ?? DEFAULT_PROJECT_COLOUR,
      status: input.status ?? 'idea',
      createdAt: now,
      updatedAt: now,
    });
    for (const work of works) {
      const projectIds = work.projectIds ?? [];
      if (!projectIds.includes(id)) {
        await db.books.update(work.id, { projectIds: [...projectIds, id], updatedAt: now });
      }
    }
    return id;
  });
}
