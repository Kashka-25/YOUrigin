import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, PenLine, X } from 'lucide-react';
import { AssetImage } from '../AssetImage';

export interface ViewerSlide {
  assetId: string;
  title: string;
  /** Small line under the title (medium, stage…). */
  caption?: string;
  /** Where "Open" goes, if anywhere. */
  href?: string;
}

/**
 * Full-screen picture viewer. Swipe or use the arrows / arrow keys to move
 * through the slides; Escape or the cross closes it.
 */
export function ArtViewer({ slides, index, onIndex, onClose }: { slides: ViewerSlide[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const slide = slides[index];
  const startX = useRef<number | null>(null);
  const prev = () => onIndex((index - 1 + slides.length) % slides.length);
  const next = () => onIndex((index + 1) % slides.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  });

  if (!slide) return null;
  const many = slides.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col text-white"
      style={{ background: 'rgb(8 7 12 / 0.97)' }}
      role="dialog"
      aria-modal="true"
      aria-label={slide.title || 'Artwork'}
      onPointerDown={(e) => (startX.current = e.clientX)}
      onPointerUp={(e) => {
        if (startX.current === null || !many) return;
        const dx = e.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) > 50) (dx > 0 ? prev : next)();
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate font-serif text-lg">{slide.title || 'Untitled'}</p>
          {slide.caption && <p className="truncate text-xs text-white/60">{slide.caption}</p>}
        </div>
        {many && (
          <span className="text-xs text-white/60 tabular-nums">
            {index + 1} / {slides.length}
          </span>
        )}
        {slide.href && (
          <Link to={slide.href} onClick={onClose} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm hover:bg-white/10">
            <PenLine size={16} /> Open
          </Link>
        )}
        <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close">
          <X size={22} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <AssetImage id={slide.assetId} alt={slide.title} className="h-full w-full object-contain select-none" />
        </div>
        {many && (
          <>
            <button type="button" onClick={prev} className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/50 p-2 hover:bg-white/10" aria-label="Previous">
              <ChevronLeft size={26} />
            </button>
            <button type="button" onClick={next} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/50 p-2 hover:bg-white/10" aria-label="Next">
              <ChevronRight size={26} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
