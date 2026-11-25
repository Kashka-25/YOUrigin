import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns } from './db';
import { addChapter, addSection, createBook, renameChapter } from './books';
import { createProject } from './projectRecords';
import { createMany, addTagsToItems } from './content';
import { renameTag } from './tags';
import { chapterTagName, followsName } from './chapterTags';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
});

/** A Creation with its own book workspace (same id), as the app makes them. */
async function creation(title = 'Poetry Collection') {
  const id = await createProject({ title });
  await createBook({ id, title, templateId: null, type: 'poetry', projectIds: [id] });
  return id;
}
const tagNamed = (name: string) => db.tags.where('name').equals(name).first();

describe('chapter tag names', () => {
  it('are lowercase with no spaces or punctuation', () => {
    expect(chapterTagName('Mini Vacations')).toBe('minivacations');
    expect(chapterTagName('New Poems')).toBe('newpoems');
    expect(chapterTagName("Love & Loss, Part 2!")).toBe('lovelosspart2');
    expect(chapterTagName('Café Été')).toBe('cafeete');
    expect(chapterTagName('  ')).toBe('');
  });

  it('know a tag made from a name, or its variant, from one renamed by hand', () => {
    expect(followsName('love', 'Love')).toBe(true);
    expect(followsName('love2', 'Love')).toBe(true);
    expect(followsName('part1-2', 'Part 1')).toBe(true);
    expect(followsName('myfavourite', 'Love')).toBe(false);
    expect(followsName('lovely', 'Love')).toBe(false);
  });
});

describe('a new chapter', () => {
  it('gets a tag linked to its Creation and chapter', async () => {
    const id = await creation();
    const { id: chapter, tag } = await addChapter(id, 'Mini Vacations');
    expect(tag).toEqual({ name: 'minivacations', status: 'created', wanted: undefined });
    const t = await tagNamed('minivacations');
    expect(t?.projectId).toBe(id);
    expect(t?.sectionId).toBe(chapter);
  });

  it('reuses a free tag of that name without touching the notes that carry it', async () => {
    const id = await creation();
    const [note] = await createMany([{ body: 'an old love poem', type: 'poem', status: 'none' }]);
    await addTagsToItems([note], ['love']);
    const before = await tagNamed('love');
    const { id: chapter, tag } = await addChapter(id, 'Love');
    expect(tag?.status).toBe('reused');
    const after = await tagNamed('love');
    expect(after?.id).toBe(before?.id);
    expect(after?.sectionId).toBe(chapter);
    expect((await db.content.get(note))?.tagIds).toEqual([before!.id]);
    expect(await db.tags.count()).toBe(1);
  });

  it('never takes a tag that files into somewhere else, and picks a safe variant', async () => {
    const poetry = await creation();
    const songs = await creation('Songs');
    await addChapter(poetry, 'Love');
    const { tag } = await addChapter(songs, 'Love');
    expect(tag).toEqual({ name: 'love2', status: 'created', wanted: 'love' });
    expect((await tagNamed('love'))?.projectId).toBe(poetry);
    expect((await tagNamed('love2'))?.projectId).toBe(songs);
  });

  it('keeps a hand-made tag already linked to the chapter, with no duplicate', async () => {
    const id = await creation();
    const chapter = await addSection(id, 'Hopeful');
    expect(await db.tags.count()).toBe(1);
    // Running again (or a chapter set up by hand earlier) finds the same tag.
    const { tagChapter } = await import('./chapterTags');
    expect(await tagChapter(chapter)).toEqual({ name: 'hopeful', status: 'unchanged' });
    expect(await db.tags.count()).toBe(1);
  });

  it('leaves set lists, albums and other workspaces alone', async () => {
    const id = await createProject({ title: 'Gig' });
    await createBook({ id, title: 'Gig', templateId: null, kind: 'setlist', projectIds: [id] });
    const { tag } = await addChapter(id, 'Encore');
    expect(tag).toBeNull();
    expect(await db.tags.count()).toBe(0);
  });
});

describe('a renamed chapter', () => {
  it('takes its tag along, keeping the link and the notes', async () => {
    const id = await creation();
    const { id: chapter } = await addChapter(id, 'Hopeful');
    const tagId = (await tagNamed('hopeful'))!.id;
    const [note] = await createMany([{ body: 'a', type: 'poem', status: 'none' }]);
    await addTagsToItems([note], ['hopeful']);
    expect(await renameChapter(chapter, 'Hope Rising')).toEqual({ name: 'hoperising', status: 'renamed', wanted: undefined });
    const t = await db.tags.get(tagId);
    expect(t).toMatchObject({ name: 'hoperising', projectId: id, sectionId: chapter });
    expect((await db.content.get(note))?.tagIds).toEqual([tagId]);
  });

  it('leaves a tag renamed by hand as it is', async () => {
    const id = await creation();
    const { id: chapter } = await addChapter(id, 'Sad');
    const tagId = (await tagNamed('sad'))!.id;
    await renameTag(tagId, 'blue');
    expect(await renameChapter(chapter, 'Sorrow')).toEqual({ name: 'blue', status: 'kept' });
    expect((await db.tags.get(tagId))?.name).toBe('blue');
  });

  it('never merges into another tag: a taken name gets a variant', async () => {
    const id = await creation();
    const { id: chapter } = await addChapter(id, 'Other');
    const [note] = await createMany([{ body: 'b', type: 'poem', status: 'none' }]);
    await addTagsToItems([note], ['misc']); // a free tag someone already uses
    const tagId = (await tagNamed('other'))!.id;
    expect(await renameChapter(chapter, 'Misc')).toEqual({ name: 'misc2', status: 'renamed', wanted: 'misc' });
    expect((await db.tags.get(tagId))?.name).toBe('misc2');
    expect((await tagNamed('misc'))?.projectId).toBeUndefined();
    expect(await db.tags.count()).toBe(2);
  });

  it('gives a tag to an older chapter that had none', async () => {
    const id = await creation();
    const { id: chapter } = await addChapter(id, 'Philosophy');
    await db.tags.clear();
    expect(await renameChapter(chapter, 'Big Questions')).toMatchObject({ name: 'bigquestions', status: 'created' });
  });
});
