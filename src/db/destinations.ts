// Where a newly captured note goes: existing Projects and collections, or new ones
// named while capturing. New ones are made only when the note is captured, so
// changing your mind on the Gather screen never leaves an empty Project behind.

import { db } from './db';
import { addToCollection, createCollection } from './collections';
import { addItemsToProject, createProject } from './projectRecords';

export type DestinationKind = 'project' | 'collection';

export interface Destination {
  kind: DestinationKind;
  /** Missing: a new one, made at capture time. */
  id?: string;
  name: string;
}

const same = (a: string, b: string) => a.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase() === b.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

export function destinationKey(d: Destination): string {
  return d.id ? `${d.kind}:${d.id}` : `${d.kind}:new:${d.name.trim().toLocaleLowerCase()}`;
}

/**
 * Puts captured pieces where they were sent. A "new" name that matches an existing
 * Project or collection (whatever the case) joins that one instead of making a twin.
 * Returns how many Projects and collections were created.
 */
export async function sendToDestinations(contentIds: string[], destinations: Destination[]): Promise<{ createdProjects: number; createdCollections: number }> {
  let createdProjects = 0;
  let createdCollections = 0;
  if (!contentIds.length) return { createdProjects, createdCollections };
  const seen = new Set<string>();
  for (const d of destinations) {
    const name = d.name.trim();
    if (d.kind === 'project') {
      let id = d.id && (await db.projects.get(d.id)) ? d.id : undefined;
      if (!id && name) id = (await db.projects.toArray()).find((p) => same(p.title, name))?.id;
      if (!id && name) {
        id = await createProject({ title: name });
        createdProjects++;
      }
      if (id && !seen.has(`p:${id}`)) {
        seen.add(`p:${id}`);
        await addItemsToProject(id, contentIds);
      }
    } else {
      let id = d.id && (await db.collections.get(d.id)) ? d.id : undefined;
      if (!id && name) id = (await db.collections.toArray()).find((c) => same(c.name, name))?.id;
      if (!id && name) {
        id = await createCollection(name, contentIds);
        createdCollections++;
        seen.add(`c:${id}`);
        continue;
      }
      if (id && !seen.has(`c:${id}`)) {
        seen.add(`c:${id}`);
        await addToCollection(id, contentIds);
      }
    }
  }
  return { createdProjects, createdCollections };
}
