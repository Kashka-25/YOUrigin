import { describe, expect, it } from 'vitest';
import { isEditNote, noteText, resolveEditCategory } from './buildNotes';
import type { Collection, ContentItem, Tag } from '../domain/types';

const base = { createdAt: 1, updatedAt: 1 };
const tags: Tag[] = [
  { ...base, id: 't1', name: 'poem', familyId: null },
  { ...base, id: 't2', name: 'yourigin-edits', familyId: null },
];
const collections: Collection[] = [{ ...base, id: 'c1', name: 'Favourites', description: '', contentIds: ['a'] }];
const item = (id: string, tagIds: string[] = []) =>
  ({ ...base, id, title: 'Fix', body: 'Make the cover bigger', notes: '', tagIds, deletedAt: null }) as unknown as ContentItem;

describe('edit notes category', () => {
  it('finds a tag or collection with "edit" in its name when none is chosen', () => {
    expect(resolveEditCategory('', tags, collections)).toEqual({ kind: 'tag', id: 't2', name: '#yourigin-edits' });
    const withCollection = [...collections, { ...base, id: 'c2', name: 'YOUrigin edits', description: '', contentIds: ['b'] }];
    expect(resolveEditCategory('', tags, withCollection)?.id).toBe('c2');
  });

  it('uses the chosen one, and nothing when turned off', () => {
    expect(resolveEditCategory('collection:c1', tags, collections)?.name).toBe('Favourites');
    expect(resolveEditCategory('off', tags, collections)).toBeNull();
  });

  it('knows which pieces are edit notes', () => {
    const cat = resolveEditCategory('', tags, collections);
    expect(isEditNote(item('x', ['t2']), cat, collections)).toBe(true);
    expect(isEditNote(item('y', ['t1']), cat, collections)).toBe(false);
    expect(isEditNote(item('a'), resolveEditCategory('collection:c1', tags, collections), collections)).toBe(true);
  });

  it('sends title, writing and notes as one note', () => {
    expect(noteText({ title: 'Fix', body: 'Bigger cover', notes: 'urgent' })).toBe('Fix\n\nBigger cover\n\nNotes to self:\nurgent');
    expect(noteText({ title: '', body: ' Only body ', notes: '' })).toBe('Only body');
  });
});
