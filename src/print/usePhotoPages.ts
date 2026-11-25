import { useEffect, useState } from 'react';
import type { Asset, BookDesign, BookEntry, ContentItem } from '../domain/types';
import { renderPhotoPages } from './photoPages';
import { renderPicture } from '../components/posts/TextOnPicture';

/**
 * Draws a book's photo pages for printing. Returns null while drawing (so the layout waits
 * and runs once), then entry id → picture. A book with no photo pages is ready at once.
 */
export function usePhotoPages(
  input: { design: Pick<BookDesign, 'trim'>; entries: BookEntry[]; contentById: Map<string, ContentItem>; assets: Map<string, Asset> } | null,
): Map<string, string> | null {
  const [pages, setPages] = useState<{ for: unknown; pages: Map<string, string> } | null>(null);
  const needed = !!input?.entries.some((e) => e.photo);
  useEffect(() => {
    if (!input || !needed) return;
    let live = true;
    renderPhotoPages(input, renderPicture)
      .catch(() => new Map<string, string>())
      .then((p) => live && setPages({ for: input, pages: p }));
    return () => {
      live = false;
    };
  }, [input, needed]);
  if (!input) return null;
  if (!needed) return EMPTY;
  return pages && pages.for === input ? pages.pages : null;
}

const EMPTY = new Map<string, string>();
