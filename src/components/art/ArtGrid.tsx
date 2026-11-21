import { Film, Play } from 'lucide-react';
import { useState } from 'react';
import type { ContentItem } from '../../domain/types';
import { displayTitle } from '../../domain/text';
import { AssetImage } from '../AssetImage';
import { ArtViewer } from './ArtViewer';
import { artCaption } from './art';

/**
 * Picture-first grid of artworks. Tapping one opens the full-screen viewer, or, while
 * `chosen` is given, selects it (numbered in the order tapped).
 */
export function ArtGrid({
  items,
  empty,
  chosen,
  onToggle,
  onLongPress,
}: {
  items: ContentItem[];
  empty?: React.ReactNode;
  chosen?: string[];
  onToggle?: (id: string) => void;
  /** Long-press (or right-click) starts selecting with this picture. */
  onLongPress?: (id: string) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const art = items.filter((i) => i.type === 'image' && (i.assetId || i.clipId));
  if (!art.length) return <>{empty ?? null}</>;
  const slides = art.filter((i) => i.assetId).map((i) => ({ assetId: i.assetId!, title: displayTitle(i), caption: artCaption(i), href: `/item/${i.id}` }));

  return (
    <>
      <ul className="columns-2 gap-3 sm:columns-3 lg:columns-4">
        {art.map((item) => {
          const n = chosen ? chosen.indexOf(item.id) : -1;
          return (
          <li key={item.id} className="relative mb-3 break-inside-avoid">
            <button
              type="button"
              onClick={() => {
                if (chosen && onToggle) return onToggle(item.id);
                const at = slides.findIndex((s) => s.href === `/item/${item.id}`);
                if (at >= 0) setOpen(at);
              }}
              className={`group block w-full overflow-hidden rounded-xl border bg-card text-left ${n >= 0 ? 'border-accent ring-2 ring-accent' : 'border-line'}`}
              aria-pressed={chosen ? n >= 0 : undefined}
              onContextMenu={onLongPress ? (e) => {
                e.preventDefault();
                onLongPress(item.id);
              } : undefined}
              aria-label={chosen ? `${n >= 0 ? 'Unselect' : 'Select'} “${displayTitle(item)}”` : `View “${displayTitle(item)}”`}
            >
              <span className="relative block">
                {item.assetId ? (
                  <AssetImage id={item.assetId} alt="" className="block w-full transition-transform group-hover:scale-[1.02]" />
                ) : (
                  <span className="flex aspect-[4/5] w-full items-center justify-center bg-paper-2 text-muted"><Film size={28} aria-hidden /></span>
                )}
                {item.clipId && (
                  <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white" aria-label="Video">
                    <Play size={13} fill="currentColor" aria-hidden />
                  </span>
                )}
              </span>
              <span className="block truncate px-2.5 py-1.5 text-sm text-ink-2">{displayTitle(item)}</span>
            </button>
            {chosen && (
              <span className={`pointer-events-none absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 text-sm font-bold ${n >= 0 ? 'border-white bg-accent text-accent-ink' : 'border-white/90 bg-black/30'}`} aria-hidden>
                {n >= 0 ? n + 1 : ''}
              </span>
            )}
          </li>
          );
        })}
      </ul>
      {open !== null && <ArtViewer slides={slides} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}
