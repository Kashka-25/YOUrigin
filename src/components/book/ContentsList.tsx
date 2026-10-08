import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageIcon } from 'lucide-react';
import { useLibrary } from '../../hooks/useLibrary';
import { orderedBook } from '../../io/export';
import { displayTitle } from '../../domain/text';
import { STATUSES, STATUS_META, TYPE_LABEL } from '../../domain/constants';
import type { ContentItem, Status } from '../../domain/types';
import { StatusBadge } from '../ui';

const DOT: Record<Status, string> = { seed: 'bg-seed', developing: 'bg-developing', polished: 'bg-polished' };

/** Book order: every placed piece, chapter by chapter. Shared by Contents, Previous/Next. */
export function useBookOrder(bookId: string | null | undefined) {
  const lib = useLibrary();
  return useMemo(() => {
    if (!lib || !bookId) return null;
    const book = lib.books.find((b) => b.id === bookId);
    if (!book) return null;
    const parts = orderedBook(
      lib.sections.filter((s) => s.bookId === bookId),
      lib.entries.filter((e) => e.bookId === bookId),
      lib.contentById,
    );
    const tray = lib.entries
      .filter((e) => e.bookId === bookId && !e.sectionId)
      .map((e) => lib.contentById.get(e.contentId))
      .filter((c): c is ContentItem => !!c && !c.deletedAt);
    return { book, parts, tray, flat: parts.flatMap((p) => p.items) };
  }, [lib, bookId]);
}

/**
 * A live, linked contents list: chapters and pieces in book order, colour-coded
 * by creative status. Each title opens the piece for editing.
 */
export function ContentsList({ bookId, currentId, compact = false }: { bookId: string; currentId?: string; compact?: boolean }) {
  const order = useBookOrder(bookId);
  const [only, setOnly] = useState<Status | null>(null);
  if (!order) return null;
  const { parts, tray, flat } = order;
  const counts = { seed: 0, developing: 0, polished: 0 } as Record<Status, number>;
  flat.forEach((c) => counts[c.status]++);
  let n = 0;

  const row = (c: ContentItem, num?: number) => {
    const current = c.id === currentId;
    return (
      <li key={c.id}>
        <Link
          to={`/item/${c.id}?book=${bookId}`}
          aria-current={current ? 'page' : undefined}
          className={`group flex items-center gap-2.5 rounded-lg px-1 ${compact ? 'py-1' : 'py-2'} ${current ? 'bg-paper-2' : 'hover:bg-paper-2'}`}
          title={`${STATUS_META[c.status].label} · ${TYPE_LABEL[c.type]}`}
        >
          {num !== undefined && <span className="w-6 shrink-0 text-right text-[11px] text-muted tabular-nums">{num}</span>}
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[c.status]}`} aria-hidden />
          <span className={`min-w-0 flex-1 truncate font-serif ${compact ? 'text-[15px]' : 'text-[17px]'} ${current ? 'font-semibold' : ''} group-hover:underline`}>
            {displayTitle(c)}
          </span>
          {c.type === 'image' && <ImageIcon size={13} className="shrink-0 text-muted" aria-label="Image" />}
          {!compact && (
            <span className="hidden sm:inline">
              <StatusBadge status={c.status} />
            </span>
          )}
          <span className="sr-only">{STATUS_META[c.status].label}</span>
        </Link>
      </li>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show only">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={only === s}
            onClick={() => setOnly(only === s ? null : s)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${only === s ? 'border-accent bg-paper-2 text-ink' : 'border-line text-ink-2'}`}
          >
            <span className={`h-2 w-2 rounded-full ${DOT[s]}`} aria-hidden />
            {STATUS_META[s].label} {counts[s]}
          </button>
        ))}
      </div>
      <nav className={compact ? 'mt-3 space-y-4' : 'mt-6 space-y-8'} aria-label="Contents">
        {parts.map(({ section, items }) => {
          const start = n;
          n += items.length;
          const shown = items.filter((c) => !only || c.status === only);
          if (only && !shown.length) return null;
          return (
            <section key={section.id}>
              <h3 className={`eyebrow border-b border-line pb-1.5 text-accent ${compact ? 'text-[10px]' : ''}`}>{section.title}</h3>
              {items.length === 0 ? (
                <p className="py-1.5 text-sm text-muted">No pieces yet.</p>
              ) : (
                <ol className="mt-1">{items.map((c, i) => (only && c.status !== only ? null : row(c, compact ? undefined : start + i + 1)))}</ol>
              )}
            </section>
          );
        })}
        {tray.length > 0 && !only && (
          <section>
            <h3 className="eyebrow border-b border-line pb-1.5">Not placed yet (tray)</h3>
            <ul className="mt-1">{tray.map((c) => row(c))}</ul>
          </section>
        )}
      </nav>
    </div>
  );
}
