import { useState } from 'react';
import type { ContentItem } from '../../domain/types';
import { displayTitle } from '../../domain/text';
import { AssetImage } from '../AssetImage';
import { ArtViewer } from './ArtViewer';
import { artCaption } from './art';

/** Picture-first grid of artworks. Tapping one opens the full-screen viewer. */
export function ArtGrid({ items, empty }: { items: ContentItem[]; empty?: React.ReactNode }) {
  const [open, setOpen] = useState<number | null>(null);
  const art = items.filter((i) => i.type === 'image' && i.assetId);
  if (!art.length) return <>{empty ?? null}</>;
  const slides = art.map((i) => ({ assetId: i.assetId!, title: displayTitle(i), caption: artCaption(i), href: `/item/${i.id}` }));

  return (
    <>
      <ul className="columns-2 gap-3 sm:columns-3 lg:columns-4">
        {art.map((item, i) => (
          <li key={item.id} className="mb-3 break-inside-avoid">
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="group block w-full overflow-hidden rounded-xl border border-line bg-card text-left"
              aria-label={`View “${displayTitle(item)}”`}
            >
              <AssetImage id={item.assetId} alt="" className="block w-full transition-transform group-hover:scale-[1.02]" />
              <span className="block truncate px-2.5 py-1.5 text-sm text-ink-2">{displayTitle(item)}</span>
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <ArtViewer slides={slides} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}
