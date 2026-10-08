import { Link } from 'react-router-dom';
import { BookOpen, FolderOpen } from 'lucide-react';
import type { ContentItem } from '../domain/types';
import { bodyAfterTitle, displayTitle, excerpt } from '../domain/text';
import { TYPE_LABEL } from '../domain/constants';
import { StatusBadge } from './ui';
import { useLibrary } from '../hooks/useLibrary';
import { AssetImage } from './AssetImage';

export function ItemCard({
  item,
  selected,
  onToggle,
  extra,
}: {
  item: ContentItem;
  selected?: boolean;
  onToggle?: (shift: boolean) => void;
  extra?: React.ReactNode;
}) {
  const lib = useLibrary();
  const books = [...(lib?.ctx.booksOf.get(item.id) ?? [])].map((id) => lib?.ctx.bookTitle.get(id)).filter(Boolean);
  const cols = [...(lib?.ctx.collectionsOf.get(item.id) ?? [])].map((id) => lib?.ctx.collectionName.get(id)).filter(Boolean);
  const title = displayTitle(item);

  return (
    <article
      className={`group relative flex gap-3 border-b border-line px-1 py-4 transition-colors ${selected ? 'bg-paper-2' : ''}`}
    >
      {onToggle && (
        <div className="pt-1">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--accent)]"
            checked={!!selected}
            onChange={(e) => onToggle((e.nativeEvent as MouseEvent).shiftKey)}
            aria-label={`Select “${title}”`}
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={item.status} />
          <span className="text-xs text-muted">{TYPE_LABEL[item.type]}</span>
          {item.archived && <span className="text-xs text-muted">· Archived</span>}
        </div>
        <h3 className="mt-1.5 font-serif text-lg leading-snug text-ink">
          <Link to={`/item/${item.id}`} className="hover:underline focus:underline">
            {title}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 font-serif text-[15px] leading-relaxed text-ink-2">
          {excerpt(bodyAfterTitle(item))}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {item.tagIds.map((t) => (
            <span key={t}>#{lib?.ctx.tagName.get(t)}</span>
          ))}
          {books.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <BookOpen size={12} aria-hidden /> {books.join(', ')}
            </span>
          )}
          {cols.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <FolderOpen size={12} aria-hidden /> {cols.join(', ')}
            </span>
          )}
        </div>
        {extra}
      </div>
      {item.type === 'image' && item.assetId && (
        <AssetImage id={item.assetId} className="h-20 w-20 shrink-0 rounded-lg border border-line object-cover" />
      )}
    </article>
  );
}
