import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { createCollection } from './collections';
import { getSettings, setSetting } from './settings';
import { BUILD_NOTES_HOME, addBuildNote, buildNotesHome, screenName, splitNote } from './buildNotes';
import { isEditNote, noteText, resolveEditCategory } from '../sync/buildNotes';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('build notes', () => {
  it('splits a note into a title (the first line) and its words', () => {
    expect(splitNote('  Grid order is wrong\nIt should follow the dates.\r\n')).toEqual({ title: 'Grid order is wrong', body: 'It should follow the dates.' });
    expect(splitNote('One line')).toEqual({ title: 'One line', body: '' });
  });

  it('files a note in the existing edit-notes collection, with the screen it was written on', async () => {
    const home = await createCollection('YOUrigin Edits/Ideas');
    const id = (await addBuildNote('Photo page words are too small\nOn the phone.', screenName('#/projects/b/read?x=1')))!;
    const item = (await db.content.get(id))!;
    expect(item).toMatchObject({ title: 'Photo page words are too small', body: 'On the phone.', type: 'note', notes: 'Seen on: Book · Read (/projects/b/read)' });
    expect((await db.collections.get(home))!.contentIds).toEqual([id]);
    // It is an edit note, so it goes to Notion with the screen in it.
    const cat = resolveEditCategory((await getSettings()).editNotesCategory, await db.tags.toArray(), await db.collections.toArray());
    expect(isEditNote(item, cat, await db.collections.toArray())).toBe(true);
    expect(noteText(item)).toContain('Seen on: Book · Read');
  });

  it('makes a home for build notes when there is none, and remembers it', async () => {
    const id = (await addBuildNote('First note'))!;
    const settings = await getSettings();
    const home = (await db.collections.toArray()).find((c) => c.name === BUILD_NOTES_HOME)!;
    expect(settings.editNotesCategory).toBe(`collection:${home.id}`);
    expect(home.contentIds).toEqual([id]);
    await addBuildNote('Second note');
    expect((await db.collections.toArray()).filter((c) => c.name === BUILD_NOTES_HOME)).toHaveLength(1);
  });

  it('uses an edit-notes tag when that is the chosen home', async () => {
    await setSetting('editNotesCategory', '');
    await db.tags.add({ id: 't', name: 'edits', familyId: null, createdAt: 1, updatedAt: 1 });
    const id = (await addBuildNote('Tag me'))!;
    expect((await db.content.get(id))!.tagIds).toEqual(['t']);
    expect((await buildNotesHome()).kind).toBe('tag');
  });

  it('keeps sending off when it was turned off, and saves nothing for a blank note', async () => {
    await setSetting('editNotesCategory', 'off');
    await addBuildNote('Still kept');
    expect((await getSettings()).editNotesCategory).toBe('off');
    expect(await addBuildNote('   \n  ')).toBeNull();
  });

  it('keeps notes waiting while offline, sending nothing', async () => {
    const { sendWaitingNotes, needsSending } = await import('../sync/buildNotes');
    const id = (await addBuildNote('Written on the train'))!;
    const item = (await db.content.get(id))!;
    expect(needsSending(item)).toBe(true);
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      expect(await sendWaitingNotes([item])).toEqual({ sent: 0, error: 'You’re offline. They’ll send when you’re back online.' });
    } finally {
      online.mockRestore();
    }
    expect(needsSending(item)).toBe(true);
  });

  it('names screens plainly', () => {
    expect(screenName('#/posts?view=grid')).toBe('Posts (/posts)');
    expect(screenName('/posts/abc')).toBe('A post (/posts/abc)');
    expect(screenName('/projects/b/book/p')).toBe('Book · writing page (/projects/b/book/p)');
    expect(screenName('/')).toBe('Capture (/)');
    expect(screenName('/somewhere-new')).toBe('YOUrigin (/somewhere-new)');
  });
});
