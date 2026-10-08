import { PenLine } from 'lucide-react';
import type { BookEntry, ContentItem, EntrySpace } from '../../domain/types';
import { useLibrary } from '../../hooks/useLibrary';
import { resolveDesign, SPACE_LABEL } from '../../print/design';
import { resolveSpace } from '../../print/render';
import { setEntrySpace } from '../../db/books';

const KIND_LABEL: Record<EntrySpace['kind'], string> = {
  auto: 'Automatic',
  lines: 'Ruled lines (writing)',
  blank: 'Open space (drawing)',
  none: 'No space',
};

/** Choose the writing/drawing space after one piece, in one book. */
export function SpaceControl({ entry, item }: { entry: BookEntry; item: ContentItem }) {
  const lib = useLibrary();
  const book = lib?.books.find((b) => b.id === entry.bookId);
  if (!book) return null;
  const design = resolveDesign(book);
  const current: EntrySpace = entry.space ?? { kind: 'auto', size: 'fill' };
  const auto = resolveSpace(item, undefined, design);
  const set = (patch: Partial<EntrySpace>) => {
    const next = { ...current, ...patch };
    void setEntrySpace(entry.id, next.kind === 'auto' ? undefined : next);
  };
  return (
    <section>
      <h2 className="label flex items-center gap-1">
        <PenLine size={12} aria-hidden /> Space after this piece
      </h2>
      <p className="mb-1.5 text-xs text-muted">In “{book.title}” — for the reader’s handwriting or drawing.</p>
      <select className="input" value={current.kind} onChange={(e) => set({ kind: e.target.value as EntrySpace['kind'] })} aria-label="Kind of space">
        {(Object.keys(KIND_LABEL) as EntrySpace['kind'][]).map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </select>
      {(current.kind === 'lines' || current.kind === 'blank') && (
        <select
          className="input mt-1.5"
          value={current.size}
          onChange={(e) => set({ size: e.target.value as EntrySpace['size'] })}
          aria-label="How much space"
        >
          {(['fill', 'page', 'fill+page'] as const).map((k) => (
            <option key={k} value={k}>
              {SPACE_LABEL[k]}
            </option>
          ))}
        </select>
      )}
      {current.kind === 'auto' && (
        <p className="mt-1.5 text-xs text-ink-2">
          {auto.kind === 'none'
            ? `Automatic: no space (${auto.reason.toLowerCase()}).`
            : `Automatic: ${auto.kind === 'lines' ? 'ruled lines' : 'open drawing space'}, ${SPACE_LABEL[auto.size].toLowerCase()} — ${auto.reason.toLowerCase()}.`}
        </p>
      )}
    </section>
  );
}
