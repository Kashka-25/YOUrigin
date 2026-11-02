import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { bookToDocx, bookToEpub, paragraphs, pieceHeading, type ImageConverter, type PublishInput } from './publish';
import { defaultDesign } from '../print/design';
import type { Asset, ContentItem, ContentType } from '../domain/types';

const piece = (id: string, type: ContentType, title: string, body: string, extra: Partial<ContentItem> = {}): ContentItem => ({
  id,
  title,
  body,
  type,
  status: 'seed',
  tagIds: [],
  notes: '',
  source: { kind: 'capture' },
  keepUnassigned: false,
  archived: false,
  deletedAt: null,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const art: Asset = { id: 'a1', name: 'tide.webp', mime: 'image/webp', dataUrl: 'data:image/webp;base64,AAAA', width: 1200, height: 800, bytes: 3, createdAt: 1, updatedAt: 1 };
const fakeConvert: ImageConverter = async (a) => ({ data: new Uint8Array([1, 2, 3]), mime: 'image/jpeg', ext: 'jpg', width: a.width, height: a.height });

function input(): PublishInput {
  const items = [
    piece('p1', 'poem', '', 'The ocean doesn’t ask\nthe shore for permission.\n\nIt goes & returns.'),
    piece('p2', 'reflection', 'On <softness>', 'Water teaches softness.\nIt wears canyons.'),
    piece('p3', 'image', 'Low tide', 'Ink on paper', { assetId: 'a1' }),
    piece('gone', 'poem', 'Deleted', 'x', { deletedAt: 5 }),
  ];
  return {
    book: { id: 'b1', title: 'YOU — Water', subtitle: 'A journal', description: '', type: 'poetry', templateId: null, cover: 'clay', notes: '', archived: false, coverAssetId: 'a1', createdAt: 1, updatedAt: 1 },
    design: { ...defaultDesign('poetry'), author: 'K. Hart', copyright: '© 2026 K. Hart\nISBN 000', dedication: 'For the sea', acknowledgements: 'Thank you.', toc: true },
    sections: [
      { id: 's2', bookId: 'b1', title: 'Two', order: 1, notes: '', createdAt: 1, updatedAt: 1 },
      { id: 's1', bookId: 'b1', title: 'One', order: 0, notes: '', createdAt: 1, updatedAt: 1 },
      { id: 's3', bookId: 'b1', title: 'Empty', order: 2, notes: '', createdAt: 1, updatedAt: 1 },
    ],
    entries: [
      { id: 'e1', bookId: 'b1', sectionId: 's1', contentId: 'p1', order: 0, createdAt: 1, updatedAt: 1 },
      { id: 'e2', bookId: 'b1', sectionId: 's1', contentId: 'p2', order: 1, createdAt: 1, updatedAt: 1 },
      { id: 'e3', bookId: 'b1', sectionId: 's2', contentId: 'p3', order: 0, createdAt: 1, updatedAt: 1 },
      { id: 'e4', bookId: 'b1', sectionId: 's2', contentId: 'gone', order: 1, createdAt: 1, updatedAt: 1 },
      { id: 'e5', bookId: 'b1', sectionId: null, contentId: 'p2', order: 0, createdAt: 1, updatedAt: 1 },
    ],
    contentById: new Map(items.map((i) => [i.id, i])),
    assets: new Map([[art.id, art]]),
  };
}

const open = async (blob: Blob) => JSZip.loadAsync(await blob.arrayBuffer());

describe('piece text for publishing', () => {
  it('keeps poem lines together, and makes each prose line a paragraph', () => {
    const i = input();
    expect(paragraphs(i.contentById.get('p1')!)).toEqual([['The ocean doesn’t ask', 'the shore for permission.'], ['It goes & returns.']]);
    expect(paragraphs(i.contentById.get('p2')!)).toEqual([['Water teaches softness.'], ['It wears canyons.']]);
  });

  it('leaves untitled poems without a heading, as in print', () => {
    expect(pieceHeading(input().contentById.get('p1')!)).toBe('');
    expect(pieceHeading(piece('x', 'reflection', '', 'First words of it'))).not.toBe('');
  });
});

describe('Word manuscript', () => {
  it('is a valid package with chapters in order, front pages and the image', async () => {
    const zip = await open(await bookToDocx(input(), fakeConvert));
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/styles.xml', 'word/_rels/document.xml.rels', 'word/media/image1.jpg']));
    // One → Two, no empty chapter, no deleted piece, no tray piece.
    expect(doc.indexOf('>One<')).toBeLessThan(doc.indexOf('>Two<'));
    expect(doc).not.toContain('>Empty<');
    expect(doc).not.toContain('Deleted');
    expect(doc).toContain('w:val="Heading1"');
    // Escaped text and poem line breaks.
    expect(doc).toContain('On &lt;softness&gt;');
    expect(doc).toContain('It goes &amp; returns.');
    expect(doc).toMatch(/doesn’t ask<\/w:t><\/w:r><w:r><w:br\/><\/w:r>/);
    expect(doc).toContain('K. Hart');
    expect(doc).toContain('For the sea');
    expect(doc).toContain('TOC \\o');
    expect(doc).toContain('r:embed="rIdImg1"');
    expect(await zip.file('word/settings.xml')!.async('string')).toContain('updateFields');
  });
});

describe('EPUB', () => {
  it('starts with an uncompressed mimetype and lists every file it uses', async () => {
    const blob = await bookToEpub(input(), fakeConvert);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // Local file header: name at offset 30, compression method at offset 8 (0 = stored).
    expect(new TextDecoder().decode(bytes.slice(30, 38))).toBe('mimetype');
    expect(bytes[8]).toBe(0);
    const zip = await open(blob);
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    for (const f of Object.keys(zip.files).filter((n) => n.startsWith('OEBPS/') && !n.endsWith('/') && !n.endsWith('content.opf')))
      expect(opf).toContain(`href="${f.slice('OEBPS/'.length)}"`);
    expect(opf).toContain('properties="cover-image"');
    expect(opf).toContain('<dc:creator>K. Hart</dc:creator>');
    expect(opf).toContain('urn:uuid:b1');
  });

  it('has a chapter per section with the pieces, and a contents page', async () => {
    const zip = await open(await bookToEpub(input(), fakeConvert));
    const one = await zip.file('OEBPS/text/chapter1.xhtml')!.async('string');
    expect(one).toContain('<h2 class="chapter-title">One</h2>');
    expect(one).toContain('The ocean doesn’t ask<br/>the shore for permission.');
    expect(one).toContain('On &lt;softness&gt;');
    expect(await zip.file('OEBPS/text/chapter2.xhtml')!.async('string')).toContain('<figcaption>Ink on paper</figcaption>');
    expect(zip.file('OEBPS/text/chapter3.xhtml')).toBeNull();
    const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');
    expect(nav).toContain('href="text/chapter1.xhtml">One<');
    expect(nav).toContain('href="text/acknowledgements.xhtml"');
    expect(await zip.file('OEBPS/content.opf')!.async('string')).toContain('<itemref idref="nav"/>');
  });
});
