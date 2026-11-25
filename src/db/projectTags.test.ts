import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns } from './db';
import { addTagsToItems, createMany, removeTagFromItems } from './content';
import { addSection, addToBook, createBook } from './books';
import { addItemsToProject, createProject } from './projectRecords';
import { linkTagToProject, setProjectTagChapter, unlinkProjectTag } from './projectTags';
import { creationCounts, notesIn } from '../domain/creationCounts';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
});

async function library() {
  return {
    projects: await db.projects.toArray(),
    books: await db.books.toArray(),
    sections: await db.sections.toArray(),
    entries: await db.entries.toArray(),
    items: await db.content.toArray(),
  };
}

/** A Creation with its own book workspace (same id), as the app makes them. */
async function poetry() {
  const id = await createProject({ title: 'Poetry Collection' });
  await createBook({ id, title: 'Poetry Collection', templateId: null, type: 'poetry', projectIds: [id] });
  const hopeful = await addSection(id, 'Hopeful');
  const sad = await addSection(id, 'Sad');
  return { id, hopeful, sad };
}

describe('Creation counts', () => {
  it('counts pieces placed in the book, not only notes linked to the Creation', async () => {
    const { id, hopeful, sad } = await poetry();
    const [a, b, c, d] = await createMany(['a', 'b', 'c', 'd'].map((body) => ({ body, type: 'poem' as const, status: 'none' as const })));
    await addToBook(id, [a, b], hopeful);
    await addToBook(id, [c], sad);
    await addItemsToProject(id, [a, d]); // a is both linked and placed: counted once
    const counts = creationCounts(await library(), { id, title: 'Poetry Collection' });
    expect(counts).toEqual({ notes: 4, branches: 0, chapters: 2 });
  });

  it('counts branches and their notes, and leaves out the Trash', async () => {
    const parent = await createProject({ title: 'Writing' });
    const child = await createProject({ title: 'Poems', parentId: parent });
    const [a, b] = await createMany(['a', 'b'].map((body) => ({ body, type: 'note' as const, status: 'none' as const })));
    await addItemsToProject(child, [a, b]);
    await db.content.update(b, { deletedAt: Date.now() });
    const lib = await library();
    expect(creationCounts(lib, { id: parent, title: 'Writing' })).toEqual({ notes: 1, branches: 1, chapters: 0 });
    expect(notesIn(lib, parent)).toHaveLength(0); // the page lists its own notes; branches show as tiles
  });
});

describe('Creation tags', () => {
  it('files a note captured with the tag into the Creation and its book tray', async () => {
    const { id } = await poetry();
    await linkTagToProject('poetry', id);
    const [n] = await createMany([{ body: 'new poem', type: 'poem', status: 'none', tagNames: ['#Poetry'] }]);
    expect((await db.content.get(n))!.projectIds).toEqual([id]);
    const entry = await db.entries.where('[bookId+contentId]').equals([id, n]).first();
    expect(entry?.sectionId).toBeNull();
  });

  it('places it in the chosen chapter', async () => {
    const { id, sad } = await poetry();
    await linkTagToProject('sad', id, sad);
    const [n] = await createMany([{ body: 'rain', type: 'poem', status: 'none' }]);
    await addTagsToItems([n], ['sad']);
    expect((await db.entries.where('[bookId+contentId]').equals([id, n]).first())?.sectionId).toBe(sad);
  });

  it('files notes that already had the tag, once, without moving placed ones', async () => {
    const { id, hopeful, sad } = await poetry();
    const [a, b] = await createMany(['a', 'b'].map((body) => ({ body, type: 'poem' as const, status: 'none' as const, tagNames: ['hope'] })));
    await addToBook(id, [a], hopeful);
    expect(await linkTagToProject('hope', id)).toBe(2);
    const tag = (await db.tags.where('name').equals('hope').first())!;
    await setProjectTagChapter(tag.id, sad);
    await addTagsToItems([a, b], ['hope']);
    const entries = await db.entries.where('bookId').equals(id).toArray();
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.contentId === a)?.sectionId).toBe(hopeful);
    expect(entries.find((e) => e.contentId === b)?.sectionId).toBeNull();
  });

  it('never takes a note out when the tag comes off, or stops being the Creation’s', async () => {
    const id = await createProject({ title: 'Songs' });
    await linkTagToProject('song', id);
    const [n] = await createMany([{ body: 'la', type: 'song', status: 'none', tagNames: ['song'] }]);
    const tag = (await db.tags.where('name').equals('song').first())!;
    await removeTagFromItems([n], tag.id);
    expect((await db.content.get(n))!.projectIds).toEqual([id]);
    await unlinkProjectTag(tag.id);
    expect((await db.tags.get(tag.id))!.projectId).toBeUndefined();
    const [m] = await createMany([{ body: 'later', type: 'song', status: 'none', tagNames: ['song'] }]);
    expect((await db.content.get(m))!.projectIds ?? []).toEqual([]);
    expect((await db.content.get(n))!.projectIds).toEqual([id]);
  });

  it('leaves untagged and other-tagged notes alone', async () => {
    const id = await createProject({ title: 'Songs' });
    await linkTagToProject('song', id);
    const [n] = await createMany([{ body: 'x', type: 'note', status: 'none', tagNames: ['other'] }]);
    expect((await db.content.get(n))!.projectIds ?? []).toEqual([]);
  });
});
