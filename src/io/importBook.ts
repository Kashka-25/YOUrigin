import { addSection, addToBook, createBook } from '../db/books';
import type { BookType, ContentType } from '../domain/types';
import type { DraftPiece } from './import';

/** Suggests what kind of book a document is from the pieces in it. */
export function guessBookType(types: ContentType[]): BookType {
  if (!types.length) return 'custom';
  const share = (ts: ContentType[]) => types.filter((t) => ts.includes(t)).length / types.length;
  if (share(['prompt', 'ritual']) >= 0.2) return 'journal';
  if (share(['poem', 'fragment']) >= 0.5) return 'poetry';
  if (share(['teaching', 'reflection']) >= 0.5) return 'essay';
  return 'custom';
}

/**
 * Builds a book from imported pieces: one section per chapter found in the
 * document (in order), each piece placed where it appeared. Pieces before the
 * first chapter go into "Front Matter".
 */
export async function buildBookFromImport(
  title: string,
  type: BookType,
  drafts: DraftPiece[],
  contentIds: string[],
): Promise<string> {
  const bookId = await createBook({ title, templateId: null, type });
  const hasSections = drafts.some((d) => d.section);
  const fallback = hasSections ? 'Front Matter' : type === 'journal' ? 'Pages' : type === 'poetry' ? 'Poems' : 'Contents';
  const order: string[] = [];
  const bySection = new Map<string, string[]>();
  drafts.forEach((d, i) => {
    const name = d.section ?? fallback;
    if (!bySection.has(name)) {
      bySection.set(name, []);
      order.push(name);
    }
    bySection.get(name)!.push(contentIds[i]);
  });
  for (const name of order) {
    const sectionId = await addSection(bookId, name);
    await addToBook(bookId, bySection.get(name)!, sectionId);
  }
  return bookId;
}
