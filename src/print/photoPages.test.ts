import { beforeEach, describe, expect, it } from 'vitest';
import { defaultPhotoLayers, pageAspect, photoLayers, printPixels, renderPhotoPages } from './photoPages';
import { defaultDesign } from './design';
import { bookHtml } from './render';
import { db } from '../db/db';
import { addToBook, createBook, setEntryPhoto } from '../db/books';
import { createContent } from '../db/content';
import { exportBackup } from '../db/backup';
import type { Asset, Book, BookEntry, ContentItem, Section } from '../domain/types';
import type { TextStyle } from '../posts/textLayers';

const book: Book = { id: 'b', title: 'Light & Dark', subtitle: '', description: '', type: 'poetry', templateId: null, cover: 'clay', notes: '', archived: false, createdAt: 1, updatedAt: 1 };
const section: Section = { id: 's', bookId: 'b', title: 'Dark', order: 0, notes: '', createdAt: 1, updatedAt: 1 };
const poem = (id: string, patch: Partial<ContentItem> = {}): ContentItem => ({
  id,
  title: 'North Star',
  body: "All this time I've been chasing stars,\nThe one in my heart.",
  type: 'poem',
  status: 'polished',
  tagIds: [],
  notes: '',
  source: { kind: 'capture' },
  keepUnassigned: false,
  archived: false,
  deletedAt: null,
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});
const asset: Asset = { id: 'photo', name: 'sun.jpg', mime: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AAAA', width: 1080, height: 1350, bytes: 3, createdAt: 1, updatedAt: 1 };
const style = (name: string, font: 'cormorant' | 'caveat'): TextStyle => ({
  id: name,
  name,
  look: { w: 0.8, size: 0.05, font, colour: '#f6efe2', align: 'center', weight: 500, italic: font === 'cormorant', caps: false, tracking: 0, shadow: true, backing: null },
  createdAt: 1,
  updatedAt: 1,
});

describe('pages set on a photo', () => {
  it('takes the page shape and print size from the book’s trim', () => {
    expect(pageAspect({ trim: '6x9' })).toBeCloseTo(2 / 3);
    expect(printPixels({ trim: '6x9' })).toEqual({ w: 1800, h: 2700 });
    expect(printPixels({ trim: 'a5' }).w).toBe(1748);
  });

  it('starts with the poem’s own words in the Whisper style and the author’s name beneath', () => {
    const layers = defaultPhotoLayers('Cassidy Rae', [style('Whisper', 'cormorant'), style('Cassidy Rae signature', 'caveat')]);
    expect(layers).toHaveLength(2);
    expect(layers[0]).toMatchObject({ bind: 'body', font: 'cormorant', italic: true });
    expect(layers[1]).toMatchObject({ text: 'Cassidy Rae', font: 'caveat' });
    expect(layers[1].bind).toBeUndefined();
    expect(layers[1].y).toBeGreaterThan(layers[0].y);
    // No saved styles and no author: a soft italic serif, and no name.
    const plain = defaultPhotoLayers('  ');
    expect(plain).toHaveLength(1);
    expect(plain[0]).toMatchObject({ bind: 'body', font: 'cormorant', italic: true });
  });

  it('always shows the poem as it is now, so it is written in one place', () => {
    const [layer] = defaultPhotoLayers('');
    const stale = { assetId: 'photo', layers: [{ ...layer, text: 'an old copy' }] };
    expect(photoLayers(stale, poem('p'))[0].text).toBe("All this time I've been chasing stars,\nThe one in my heart.");
    expect(photoLayers({ assetId: 'photo', layers: [{ ...layer, bind: 'title' }] }, poem('p'))[0].text).toBe('North Star');
  });

  it('draws each photo page and prints it edge to edge in place of the plain page', async () => {
    const [layer] = defaultPhotoLayers('');
    const entries: BookEntry[] = [
      { id: 'e1', bookId: 'b', sectionId: 's', contentId: 'p1', order: 0, createdAt: 1, updatedAt: 1, photo: { assetId: 'photo', layers: [layer] } },
      { id: 'e2', bookId: 'b', sectionId: 's', contentId: 'p2', order: 1, createdAt: 1, updatedAt: 1 },
      { id: 'e3', bookId: 'b', sectionId: 's', contentId: 'p3', order: 2, createdAt: 1, updatedAt: 1, photo: { assetId: 'missing', layers: [layer] } },
    ];
    const contentById = new Map(['p1', 'p2', 'p3'].map((id) => [id, poem(id, { title: id })]));
    const assets = new Map([[asset.id, asset]]);
    const drawn: { text: string; w: number; h: number }[] = [];
    const design = defaultDesign('poetry');
    const photoPages = await renderPhotoPages({ design, entries, contentById, assets }, async (_url, layers, w, h) => {
      drawn.push({ text: layers[0].text, w, h });
      return new Blob(['x'], { type: 'image/jpeg' });
    });
    expect([...photoPages.keys()]).toEqual(['e1']);
    expect(drawn).toEqual([{ text: contentById.get('p1')!.body, ...printPixels(design) }]);

    const html = bookHtml({ book, design, sections: [section], entries, contentById, assets, photoPages });
    expect(html).toContain('yb-photo-page');
    expect(html.match(/data-piece="p1"/g)).toHaveLength(1);
    expect(html).not.toMatch(/<article[^>]*data-piece="p1"/);
    // The others stay ordinary pages; the one with a missing photo prints as it always did.
    expect(html).toMatch(/<article[^>]*data-piece="p2"/);
    expect(html).toMatch(/<article[^>]*data-piece="p3"/);
    // Without drawn pages (anywhere that doesn't draw them) the poem is an ordinary page.
    expect(bookHtml({ book, design, sections: [section], entries, contentById, assets })).toMatch(/<article[^>]*data-piece="p1"/);
  });
});

describe('saving a photo page', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('keeps the photo on the poem’s place in that book only, syncs it with the book and backs it up', async () => {
    const p = await createContent({ title: 'North Star', body: 'The one in my heart.', type: 'poem', status: 'seed', tagNames: [] });
    const a = await createBook({ title: 'One', type: 'poetry', templateId: null });
    const b = await createBook({ title: 'Two', type: 'poetry', templateId: null });
    const [ea] = await addToBook(a, [p]);
    const [eb] = await addToBook(b, [p]);
    await setEntryPhoto(ea, { assetId: 'photo', layers: defaultPhotoLayers('Cassidy Rae') });
    expect((await db.entries.get(ea))?.photo?.assetId).toBe('photo');
    expect((await db.entries.get(eb))?.photo).toBeUndefined();
    expect((await db.content.get(p))?.body).toBe('The one in my heart.');
    expect(JSON.stringify(await exportBackup())).toContain('"assetId":"photo"');
    await setEntryPhoto(ea, undefined);
    expect((await db.entries.get(ea))?.photo).toBeUndefined();
  });
});
