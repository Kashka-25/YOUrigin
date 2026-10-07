import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns } from './db';
import { createMany, moveToTrash, purgeContent, setStatus, addTagsToItems, restoreFromTrash } from './content';
import { addToBook, createBook, deleteSection, moveEntry } from './books';
import { renameTag } from './tags';
import { exportBackup, mergeBackup } from './backup';
import { acceptSuggestion, recordSuggestions } from './suggestions';
import { EMPTY_FILTERS, filterItems, isOrphan, type LibraryContext } from '../domain/query';
import { buildImport } from '../io/import';
import { bookToMarkdown } from '../io/export';
import { localProvider } from '../ai/local';

async function context(): Promise<LibraryContext> {
  const [tags, books, entries, collections] = await Promise.all([db.tags.toArray(), db.books.toArray(), db.entries.toArray(), db.collections.toArray()]);
  const booksOf = new Map<string, Set<string>>();
  for (const e of entries) booksOf.set(e.contentId, new Set([...(booksOf.get(e.contentId) ?? []), e.bookId]));
  const collectionsOf = new Map<string, Set<string>>();
  for (const c of collections) for (const id of c.contentIds) collectionsOf.set(id, new Set([...(collectionsOf.get(id) ?? []), c.id]));
  return {
    tagName: new Map(tags.map((t) => [t.id, t.name])),
    tagIdByName: new Map(tags.map((t) => [t.name, t.id])),
    booksOf,
    collectionsOf,
    bookTitle: new Map(books.map((b) => [b.id, b.title])),
    collectionName: new Map(collections.map((c) => [c.id, c.name])),
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
});

describe('V1 acceptance scenario', () => {
  it('captures, organises, structures, exports and survives a reload', async () => {
    // Ten unfinished poems pasted rapidly.
    const poems = Array.from({ length: 10 }, (_, i) => ({
      body: `Poem ${i + 1}\nthe tide keeps its promises\nline ${i}`,
      type: 'poem' as const,
      status: 'seed' as const,
      tagNames: [] as string[],
    }));
    const ids = await createMany(poems);
    expect(ids).toHaveLength(10);

    // 3 polished, 4 developing, 3 seeds.
    await setStatus(ids.slice(0, 3), 'polished');
    await setStatus(ids.slice(3, 7), 'developing');

    // Tags.
    await addTagsToItems(ids.slice(0, 5), ['#water']);
    await addTagsToItems([ids[3], ids[4], ids[8]], ['grief']);
    await addTagsToItems([ids[0], ids[9]], ['love', 'surrender']);

    let items = await db.content.toArray();
    let ctx = await context();
    expect(filterItems(items, EMPTY_FILTERS, ctx)).toHaveLength(10);
    expect(filterItems(items, { ...EMPTY_FILTERS, query: '#water' }, ctx)).toHaveLength(5);
    const griefId = ctx.tagIdByName.get('grief')!;
    expect(filterItems(items, { ...EMPTY_FILTERS, statuses: ['developing'], tagIds: [griefId] }, ctx).map((i) => i.id).sort()).toEqual(
      [ids[3], ids[4]].sort(),
    );

    // Assign 4 to "YOU — Water".
    const water = await createBook({ title: 'YOU — Water', templateId: 'tpl-you-journal' });
    expect(await addToBook(water, ids.slice(0, 4))).toHaveLength(4);
    // The same piece can live in a second book without duplication.
    const poetry = await createBook({ title: 'Poetry Collection', templateId: 'tpl-poetry' });
    const sections = await db.sections.where('bookId').equals(poetry).sortBy('order');
    expect(sections.map((s) => s.title)).toEqual(['Front Matter', 'Part I', 'Interlude', 'Part II', 'Closing']);
    const [e1, e2] = await addToBook(poetry, [ids[0], ids[5]], sections[1].id);
    expect(await db.content.count()).toBe(10);

    // "Drag" poems between sections and reorder.
    await moveEntry(e2, sections[1].id, 0);
    let part1 = (await db.entries.where('sectionId').equals(sections[1].id).toArray()).sort((a, b) => a.order - b.order);
    expect(part1.map((e) => e.id)).toEqual([e2, e1]);
    await moveEntry(e1, sections[3].id, 0);
    part1 = await db.entries.where('sectionId').equals(sections[1].id).toArray();
    expect(part1.map((e) => e.id)).toEqual([e2]);

    // Manuscript export reflects structure order.
    const book = (await db.books.get(poetry))!;
    const md = bookToMarkdown(
      book,
      await db.sections.where('bookId').equals(poetry).toArray(),
      await db.entries.where('bookId').equals(poetry).toArray(),
      new Map((await db.content.toArray()).map((c) => [c.id, c])),
    );
    expect(md.indexOf('## Part I')).toBeLessThan(md.indexOf('Poem 6'));
    expect(md.indexOf('## Part II')).toBeLessThan(md.indexOf('Poem 1'));

    // Removing a section never loses writing: pieces go to the tray.
    await deleteSection(sections[3].id);
    expect((await db.entries.get(e1))!.sectionId).toBeNull();

    // Unassigned pieces are orphans.
    items = await db.content.toArray();
    ctx = await context();
    const orphans = items.filter((i) => isOrphan(i, ctx));
    expect(orphans.map((o) => o.id).sort()).toEqual([ids[4], ids[6], ids[7], ids[8], ids[9]].sort());

    // Suggested relationships exist for an orphan with shared tags.
    const aiCtx = { items, tagName: ctx.tagName, books: [] };
    const related = await localProvider.findRelatedContent(items.find((i) => i.id === ids[4])!, aiCtx);
    expect(related.length).toBeGreaterThan(0);

    // "Refresh": close and reopen the database — everything is still there.
    db.close();
    await db.open();
    expect(await db.content.count()).toBe(10);
    expect(await db.entries.count()).toBe(6);
    expect((await db.content.get(ids[0]))!.status).toBe('polished');
  });
});

describe('data safety', () => {
  it('trash is reversible and purge removes every reference', async () => {
    const [a] = await createMany([{ body: 'keep me', type: 'note', status: 'seed' }]);
    const b = await createBook({ title: 'B', templateId: null });
    await addToBook(b, [a]);
    const undo = await moveToTrash([a]);
    expect((await db.content.get(a))!.deletedAt).not.toBeNull();
    await undo();
    expect((await db.content.get(a))!.deletedAt).toBeNull();
    await moveToTrash([a]);
    await restoreFromTrash([a]);
    expect((await db.content.get(a))!.deletedAt).toBeNull();
    await purgeContent([a]);
    expect(await db.content.get(a)).toBeUndefined();
    expect(await db.entries.count()).toBe(0);
  });

  it('import never alters the original text', () => {
    const text = '# Salt\n\nMy mother kept salt by the door  \n   for luck #memory\n';
    const [piece] = buildImport([{ name: 'salt.md', text }], { split: 'none', status: 'seed', type: 'poem', extraTags: ['archive'] });
    expect(piece.title).toBe('Salt');
    expect(piece.body).toBe('My mother kept salt by the door  \n   for luck #memory');
    expect(piece.tagNames).toEqual(['memory', 'archive']);
  });

  it('AI suggestions are pending until accepted', async () => {
    const [a] = await createMany([{ body: 'grief is love looking for somewhere to go', type: 'fragment', status: 'seed' }]);
    await recordSuggestions(a, 'tags', ['grief', 'love'], 'local');
    expect((await db.content.get(a))!.tagIds).toEqual([]);
    const s = await db.suggestions.where('contentId').equals(a).toArray();
    await acceptSuggestion(s.find((x) => x.value === 'grief')!.id);
    const tags = await db.tags.bulkGet((await db.content.get(a))!.tagIds);
    expect(tags.map((t) => t!.name)).toEqual(['grief']);
  });

  it('renaming onto an existing tag merges them', async () => {
    const [a, b] = await createMany([
      { body: 'a', type: 'note', status: 'seed', tagNames: ['sea'] },
      { body: 'b', type: 'note', status: 'seed', tagNames: ['water'] },
    ]);
    const sea = (await db.tags.where('name').equals('sea').first())!;
    expect(await renameTag(sea.id, 'water')).toBe('merged');
    const water = (await db.tags.where('name').equals('water').first())!;
    expect((await db.content.get(a))!.tagIds).toEqual([water.id]);
    expect((await db.content.get(b))!.tagIds).toEqual([water.id]);
    expect(await db.tags.count()).toBe(1);
  });
});

describe('moving between devices', () => {
  it('merges a backup from another device: newest wins, tags unify by name, nothing is lost', async () => {
    // Device A (laptop)
    const [shared, laptopOnly] = await createMany([
      { body: 'shared v1', type: 'poem', status: 'seed', tagNames: ['water'] },
      { body: 'written on laptop', type: 'poem', status: 'seed', tagNames: ['water'] },
    ]);
    const laptopBackup = structuredClone(await exportBackup());

    // Device B (phone): has the shared piece (edited later) plus its own "water" tag with a different id.
    await db.delete();
    await db.open();
    await ensureBuiltIns();
    const [phoneOnly] = await createMany([{ body: 'written on phone', type: 'fragment', status: 'seed', tagNames: ['water'] }]);
    const sharedOnPhone = { ...(laptopBackup.tables.content as { id: string }[]).find((c) => c.id === shared)! } as never as import('../domain/types').ContentItem;
    const phoneWater = (await db.tags.where('name').equals('water').first())!;
    await db.content.put({ ...sharedOnPhone, body: 'shared v2 (phone)', tagIds: [phoneWater.id], updatedAt: Date.now() + 1000 });

    const report = await mergeBackup(laptopBackup);
    expect(report.added).toBeGreaterThan(0);

    const all = await db.content.toArray();
    expect(all.map((c) => c.id).sort()).toEqual([shared, laptopOnly, phoneOnly].sort());
    expect((await db.content.get(shared))!.body).toBe('shared v2 (phone)');
    // Only one "water" tag survives, and every piece points at it.
    const waters = await db.tags.where('name').equals('water').toArray();
    expect(waters).toHaveLength(1);
    for (const c of all) expect(c.tagIds).toEqual([waters[0].id]);
  });

  it('never exports the API key', async () => {
    await db.settings.put({ key: 'claudeApiKey', value: 'sk-ant-secret' });
    const backup = await exportBackup();
    expect(JSON.stringify(backup)).not.toContain('sk-ant-secret');
  });
});
