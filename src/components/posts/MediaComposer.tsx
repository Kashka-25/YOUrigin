import { useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, ChevronRight, ImagePlus, Images, Plus, Trash2 } from 'lucide-react';
import { MediaThumb, Slide } from './PostMedia';
import { POST_MEDIA_ACCEPT } from '../../io/postMedia';
import type { PostFormat, PostMedia } from '../../posts/model';

/** A stable id for each piece of media in the strip (the same file twice gets a suffix). */
function mediaIds(media: PostMedia[]): string[] {
  const seen = new Map<string, number>();
  return media.map((m) => {
    const base = m.kind === 'asset' ? `a:${m.assetId}` : m.kind === 'clip' ? `c:${m.clipId}` : `f:${m.name}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base}#${n}` : base;
  });
}

function Thumb({ id, media, index, selected, onSelect }: { id: string; media: PostMedia; index: number; selected: boolean; onSelect: () => void }) {
  const s = useSortable({ id });
  return (
    <li
      ref={s.setNodeRef}
      style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition, zIndex: s.isDragging ? 10 : undefined }}
      className={`relative shrink-0 ${s.isDragging ? 'opacity-80' : ''}`}
    >
      <button
        type="button"
        {...s.attributes}
        {...s.listeners}
        onClick={onSelect}
        aria-label={`Slide ${index + 1}${selected ? ', selected' : ''}. Drag to reorder.`}
        aria-pressed={selected}
        className={`block touch-none overflow-hidden rounded-lg ring-offset-2 ring-offset-card ${selected ? 'ring-2 ring-accent' : 'opacity-80 hover:opacity-100'}`}
      >
        <MediaThumb media={media} className="aspect-[4/5] w-16 sm:w-20" />
      </button>
      <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] font-semibold text-white tabular-nums">{index + 1}</span>
    </li>
  );
}

/**
 * The top of the post editor, laid out like Instagram's "New post": add photos
 * and videos, see the selected one large, and arrange the slides in a strip.
 */
export function MediaComposer({
  media,
  format,
  altText,
  busy,
  onAdd,
  onRemove,
  onReorder,
}: {
  media: PostMedia[];
  format: PostFormat;
  altText: string;
  busy: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  onReorder: (media: PostMedia[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(0);
  const [over, setOver] = useState(false);
  const swipe = useRef<number | null>(null);
  const at = Math.min(selected, Math.max(0, media.length - 1));
  const ids = mediaIds(media);
  const tall = format === 'reel' || format === 'story' || media[at]?.kind === 'clip';
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const pick = () => input.current?.click();
  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    setOver(false);
    onAdd([...e.dataTransfer.files]);
  };
  const dragProps = {
    onDragOver: (e: DragEvent) => {
      if ([...e.dataTransfer.types].includes('Files')) {
        e.preventDefault();
        setOver(true);
      }
    },
    onDragLeave: () => setOver(false),
    onDrop,
  };
  const onDragEnd = ({ active, over: target }: DragEndEvent) => {
    if (!target || active.id === target.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(target.id));
    onReorder(arrayMove(media, from, to));
    setSelected(to);
  };
  const go = (i: number) => setSelected(Math.max(0, Math.min(media.length - 1, i)));

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept={POST_MEDIA_ACCEPT}
      multiple
      className="sr-only"
      tabIndex={-1}
      aria-label="Photos and videos for this post"
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = '';
        if (files.length) onAdd(files);
      }}
    />
  );

  if (!media.length) {
    return (
      <section aria-label="Photos and videos" {...dragProps}>
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          className={`flex aspect-[4/5] w-full max-w-md flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-colors mx-auto ${over ? 'border-accent bg-accent/10' : 'border-line bg-card hover:border-accent/60'}`}
        >
          <Images size={44} className="text-ink-2" aria-hidden />
          <span className="font-serif text-2xl text-ink">{busy ? 'Adding…' : 'Add photos and videos'}</span>
          <span className="max-w-xs text-sm text-ink-2">One photo for a post, several for a carousel, a video for a Reel. A .zip works too.</span>
          <span className="btn-primary mt-2 pointer-events-none">
            <ImagePlus size={16} /> Select from device
          </span>
        </button>
        {fileInput}
      </section>
    );
  }

  const current = media[at];
  return (
    <section aria-label="Photos and videos" className="mx-auto w-full max-w-md" {...dragProps}>
      <div
        className={`relative w-full overflow-hidden rounded-2xl border bg-paper-2 ${over ? 'border-accent' : 'border-line'} ${tall ? 'mx-auto aspect-[9/16] max-w-[min(100%,calc(62vh*0.5625))]' : 'aspect-[4/5]'}`}
        onPointerDown={(e: PointerEvent) => {
          if (current?.kind !== 'clip') swipe.current = e.clientX;
        }}
        onPointerUp={(e: PointerEvent) => {
          if (swipe.current === null) return;
          const dx = e.clientX - swipe.current;
          swipe.current = null;
          if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1));
        }}
      >
        <Slide media={current} alt={at === 0 ? altText : ''} tall={tall} />
        {media.length > 1 && (
          <>
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">
              {at + 1}/{media.length}
            </span>
            {at > 0 && (
              <button type="button" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1 text-ink shadow" onClick={() => go(at - 1)} aria-label="Previous slide">
                <ChevronLeft size={18} />
              </button>
            )}
            {at < media.length - 1 && (
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1 text-ink shadow" onClick={() => go(at + 1)} aria-label="Next slide">
                <ChevronRight size={18} />
              </button>
            )}
          </>
        )}
        <button
          type="button"
          className="absolute bottom-2 right-2 rounded-full bg-black/60 p-2 text-white hover:bg-black/75"
          onClick={() => {
            onRemove(at);
            setSelected(Math.max(0, at - 1));
          }}
          aria-label={`Remove slide ${at + 1}`}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <ul className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 pt-1" aria-label="Slides in order">
            {media.map((m, i) => (
              <Thumb key={ids[i]} id={ids[i]} media={m} index={i} selected={i === at} onSelect={() => setSelected(i)} />
            ))}
            <li className="shrink-0">
              <button
                type="button"
                onClick={pick}
                disabled={busy}
                className="flex aspect-[4/5] w-16 flex-col items-center justify-center rounded-lg border-2 border-dashed border-line text-ink-2 hover:border-accent/60 hover:text-ink sm:w-20"
                aria-label="Add photos and videos"
              >
                <Plus size={20} aria-hidden />
                <span className="text-[10px]">{busy ? 'Adding…' : 'Add'}</span>
              </button>
            </li>
          </ul>
        </SortableContext>
      </DndContext>
      <p className="mt-1 text-xs text-muted">Drag to reorder. Pictures sync to all your devices; videos stay on this one.</p>
      {fileInput}
    </section>
  );
}
