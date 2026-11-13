import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns } from './db';
import { createContent } from './content';
import { createCollection } from './collections';
import { createProject } from './projectRecords';
import { sendToDestinations } from './destinations';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
});

const note = (body: string) => createContent({ body, type: 'note', status: 'seed', tagNames: [], source: { kind: 'capture' } });

describe('sending a captured note somewhere', () => {
  it('adds it to existing Projects and collections', async () => {
    const p = await createProject({ title: 'Saltglass' });
    const c = await createCollection('Favourite lines');
    const id = await note('the tide');
    const r = await sendToDestinations([id], [
      { kind: 'project', id: p, name: 'Saltglass' },
      { kind: 'collection', id: c, name: 'Favourite lines' },
    ]);
    expect(r).toEqual({ createdProjects: 0, createdCollections: 0 });
    expect((await db.content.get(id))!.projectIds).toEqual([p]);
    expect((await db.collections.get(c))!.contentIds).toEqual([id]);
  });

  it('creates a new Project or collection only now, holding the note', async () => {
    const a = await note('one');
    const b = await note('two');
    const r = await sendToDestinations([a, b], [
      { kind: 'project', name: 'Night Ferry Songs' },
      { kind: 'collection', name: 'Overheard' },
    ]);
    expect(r).toEqual({ createdProjects: 1, createdCollections: 1 });
    const project = (await db.projects.toArray()).find((x) => x.title === 'Night Ferry Songs')!;
    expect((await db.content.get(a))!.projectIds).toEqual([project.id]);
    const col = (await db.collections.toArray()).find((x) => x.name === 'Overheard')!;
    expect(col.contentIds).toEqual([a, b]);
  });

  it('joins an existing one with the same name instead of making a twin', async () => {
    const p = await createProject({ title: 'Garden Almanac' });
    const c = await createCollection('Prompts');
    const id = await note('basil');
    const r = await sendToDestinations([id], [
      { kind: 'project', name: '  garden   almanac ' },
      { kind: 'collection', name: 'PROMPTS' },
      { kind: 'collection', id: c, name: 'Prompts' },
    ]);
    expect(r).toEqual({ createdProjects: 0, createdCollections: 0 });
    expect(await db.projects.count()).toBe(1);
    expect((await db.content.get(id))!.projectIds).toEqual([p]);
    expect((await db.collections.get(c))!.contentIds).toEqual([id]);
  });

  it('does nothing without a note, and ignores empty names', async () => {
    expect(await sendToDestinations([], [{ kind: 'project', name: 'Ghost' }])).toEqual({ createdProjects: 0, createdCollections: 0 });
    const id = await note('x');
    await sendToDestinations([id], [{ kind: 'project', name: '   ' }]);
    expect(await db.projects.count()).toBe(0);
  });
});
