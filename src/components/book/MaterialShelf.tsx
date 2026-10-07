import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import type { ContentItem } from '../../domain/types';
import { displayTitle, excerpt } from '../../domain/text';
import { isOrphan, matchesQuery, parseQuery, type LibraryContext } from '../../domain/query';
import { addToBook } from '../../db/books';
import { StatusBadge } from '../ui';
import type { DragData } from './dnd';

export type ShelfMode = 'relevant' | 'unclaimed' | 'all';

/** Library items scored by how much they share with a book's existing material. */
export function relevantToBook(
  items: ContentItem[],
  bookContentIds: Set<string>,
  bookTitle: string,
  ctx: LibraryContext,
): { item: ContentItem; score: number }[] {
  const bookTags = new Map<string, number>();
  for (const id of bookContentIds) {
    const c = items.find((i) => i.id === id);
    for (const t of c?.tagIds ?? []) bookTags.set(t, (bookTags.get(t) ?? 0) + 1);
  }
  // A fresh book can still find material through words in its title ("YOU — Water" → #water).
  const titleWords = new Set(bookTitle.toLowerCase().match(/[\p{L}]+/gu) ?? []);
  return items
    .filter((i) => !i.deletedAt && !i.archived && !bookContentIds.has(i.id))
    .map((item) => {
      let score = 0;
      for (const t of item.tagIds) {
        score += bookTags.get(t) ?? 0;
        if (titleWords.has(ctx.tagName.get(t) ?? '')) score += 2;
      }
      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function MaterialShelf({
  bookId,
  bookTitle,
  items,
  bookContentIds,
  ctx,
}: {
  bookId: string;
  bookTitle: string;
  items: ContentItem[];
  bookContentIds: Set<string>;
  ctx: LibraryContext;
}) {
  const [mode, setMode] = useState<ShelfMode>('relevant');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const parsed = parseQuery(q);
    let base: ContentItem[];
    if (mode === 'relevant') base = relevantToBook(items, bookContentIds, bookTitle, ctx).map((x) => x.item);
    else
      base = items
        .filter((i) => !i.deletedAt && !i.archived && !bookContentIds.has(i.id))
        .filter((i) => mode === 'all' || isOrphan(i, ctx))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    return base.filter((i) => matchesQuery(i, parsed, ctx)).slice(0, 80);
  }, [items, bookContentIds, bookTitle, ctx, mode, q]);

  return (
    <aside className="panel p-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto" aria-label="Material shelf">
      <h2 className="font-serif text-xl">Material</h2>
      <p className="text-xs text-muted">Drag into a section, or tap + to put it in the tray.</p>
      <div className="mt-3 flex gap-1" role="tablist" aria-label="Shelf filter">
        {(
          [
            ['relevant', 'Relevant'],
            ['unclaimed', 'Unclaimed'],
            ['all', 'All'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${mode === m ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-2'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <input type="search" className="input mt-3" placeholder="Filter words or #tags" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter material" />
      <ul className="mt-3 space-y-1.5">
        {list.map((item) => (
          <ShelfItem key={item.id} item={item} bookId={bookId} ctx={ctx} />
        ))}
        {list.length === 0 && (
          <li className="py-6 text-center text-sm text-muted">
            {mode === 'relevant' ? 'Nothing obviously related yet — try Unclaimed or All.' : 'Nothing here.'}
          </li>
        )}
      </ul>
    </aside>
  );
}

function ShelfItem({ item, bookId, ctx }: { item: ContentItem; bookId: string; ctx: LibraryContext }) {
  const d = useDraggable({ id: 'lib:' + item.id, data: { type: 'lib', contentId: item.id } satisfies DragData });
  return (
    <li
      ref={d.setNodeRef}
      className={`flex items-start gap-2 rounded-xl border border-line bg-paper px-3 py-2 ${d.isDragging ? 'opacity-40' : ''}`}
    >
      <div className="min-w-0 flex-1 cursor-grab touch-none" {...d.attributes} {...d.listeners} aria-label={`Drag “${displayTitle(item)}” into a section`}>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={item.status} compact />
          <span className="truncate font-serif text-[15px]">{displayTitle(item)}</span>
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted">
          {item.tagIds.map((t) => '#' + ctx.tagName.get(t)).join(' ') || excerpt(item.body, 60)}
        </p>
      </div>
      <button type="button" className="btn-ghost p-1" onClick={() => void addToBook(bookId, [item.id], null)} aria-label={`Add “${displayTitle(item)}” to the tray`}>
        <Plus size={16} />
      </button>
    </li>
  );
}
