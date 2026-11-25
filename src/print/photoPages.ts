import type { Asset, BookDesign, BookEntry, ContentItem, EntryPhoto } from '../domain/types';
import { TRIMS } from './design';
import { lookFor, newTextLayer, withBoundText, type TextLayer, type TextStyle } from '../posts/textLayers';

// Pages set on a photo: in one book, a piece (usually a poem) can sit on a photo, edge to
// edge, with its words placed on the picture in a chosen look. The words showing the piece
// are linked to it, so the poem is still written in one place.

/** The page's shape, width ÷ height, from the book's trim size. */
export function pageAspect(d: Pick<BookDesign, 'trim'>): number {
  const t = TRIMS[d.trim];
  return t.w / t.h;
}

const byName = (styles: TextStyle[] | undefined, name: string) =>
  styles?.find((s) => s.name.trim().toLowerCase() === name) ?? styles?.find((s) => s.name.trim().toLowerCase().includes(name.split(' ').pop() ?? name));

/**
 * The words for a new photo page: the piece's own words in the "Whisper" style when it has
 * been saved (else a soft italic serif), and the author's name beneath in the signature style.
 */
export function defaultPhotoLayers(author: string, styles?: TextStyle[]): TextLayer[] {
  const whisper = byName(styles, 'whisper')?.look ?? { ...lookFor('quote'), size: 0.045, weight: 500 };
  const poem: TextLayer = { ...newTextLayer(whisper, { x: 0.5, y: 0.4 }), w: 0.82, text: '', bind: 'body' };
  const layers: TextLayer[] = [poem];
  const name = author.trim();
  if (name) {
    const sig = byName(styles, 'cassidy rae signature')?.look ?? { ...lookFor('hand'), size: 0.04, weight: 600 };
    layers.push({ ...newTextLayer({ ...sig, colour: poem.colour, shadow: poem.shadow }, { x: 0.5, y: 0.62 }), w: 0.6, text: name });
  }
  return layers;
}

/** A piece's photo in one book, with its linked words filled in from the piece. */
export function photoLayers(photo: EntryPhoto, piece: Pick<ContentItem, 'title' | 'body'>): TextLayer[] {
  return withBoundText(photo.layers, piece);
}

/** Pixel size for printing a photo page: 300 dots per inch across the page's width. */
export function printPixels(d: Pick<BookDesign, 'trim'>): { w: number; h: number } {
  const t = TRIMS[d.trim];
  const widthIn = t.unit === 'mm' ? t.w / 25.4 : t.w;
  const w = Math.round(Math.min(2600, widthIn * 300));
  return { w, h: Math.round(w / pageAspect(d)) };
}

/**
 * Draws every photo page in a book, ready to print (entry id → picture). Pieces that are
 * gone, or whose photo is missing, are left out and print as ordinary pages.
 */
export async function renderPhotoPages(
  input: { design: Pick<BookDesign, 'trim'>; entries: BookEntry[]; contentById: Map<string, ContentItem>; assets: Map<string, Asset> },
  draw: (pictureUrl: string, layers: TextLayer[], w: number, h: number) => Promise<Blob>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { w, h } = printPixels(input.design);
  for (const e of input.entries) {
    const piece = input.contentById.get(e.contentId);
    const asset = e.photo ? input.assets.get(e.photo.assetId) : undefined;
    if (!e.photo || !piece || piece.deletedAt || !asset) continue;
    const blob = await draw(asset.dataUrl, photoLayers(e.photo, piece), w, h);
    out.set(e.id, await blobToDataUrl(blob));
  }
  return out;
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}
