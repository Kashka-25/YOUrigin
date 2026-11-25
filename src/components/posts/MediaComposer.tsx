import { useEffect, useRef, useState, type DragEvent, type PointerEvent, type RefObject } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Camera, Check, ChevronLeft, ChevronRight, FileText, ImagePlus, Images, Lightbulb, Plus, Trash2, Type, Upload } from 'lucide-react';
import { TextStudio } from './TextStudio';
import type { TextLayer } from '../../posts/textLayers';
import { MediaThumb, Slide } from './PostMedia';
import { AssetImage } from '../AssetImage';
import { frameFromVideo } from '../../db/postMedia';
import { POST_MEDIA_ACCEPT } from '../../io/postMedia';
import { plainPageFile } from '../../posts/plainPage';
import type { PostFormat, PostMedia, PostWorld } from '../../posts/model';
import type { TakeOutTo } from '../../db/posts';

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

function Thumb({ id, media, index, selected, chosen, onSelect }: { id: string; media: PostMedia; index: number; selected: boolean; chosen?: boolean; onSelect: () => void }) {
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
        aria-label={chosen === undefined ? `Slide ${index + 1}${selected ? ', selected' : ''}. Drag to reorder.` : `Take out slide ${index + 1}`}
        aria-pressed={chosen ?? selected}
        className={`block touch-none overflow-hidden rounded-lg ring-offset-2 ring-offset-card ${(chosen ?? selected) ? 'ring-2 ring-accent' : 'opacity-80 hover:opacity-100'}`}
      >
        <MediaThumb media={media} className="aspect-[4/5] w-16 sm:w-20" />
      </button>
      <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-[10px] font-semibold text-white tabular-nums">{index + 1}</span>
      {chosen !== undefined && (
        <span
          className={`pointer-events-none absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white ${chosen ? 'bg-accent text-accent-ink' : 'bg-black/30'}`}
          aria-hidden
        >
          {chosen && <Check size={12} strokeWidth={3} />}
        </span>
      )}
    </li>
  );
}


/** Small frames from across a video, for the cover filmstrip. */
function useFilmstrip(src: string | null, count = 8): string[] {
  const [frames, setFrames] = useState<string[]>([]);
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.src = src;
    const seek = (t: number) =>
      new Promise<void>((resolve) => {
        v.addEventListener('seeked', () => resolve(), { once: true });
        v.currentTime = t;
      });
    void (async () => {
      await new Promise<void>((r) => v.addEventListener('loadedmetadata', () => r(), { once: true }));
      const out: string[] = [];
      const canvas = document.createElement('canvas');
      canvas.width = 72;
      canvas.height = Math.round((72 * (v.videoHeight || 16)) / (v.videoWidth || 9));
      for (let i = 0; i < count && !cancelled; i++) {
        await seek(((i + 0.5) / count) * (v.duration || 1));
        canvas.getContext('2d')?.drawImage(v, 0, 0, canvas.width, canvas.height);
        out.push(canvas.toDataURL('image/jpeg', 0.7));
        if (!cancelled) setFrames([...out]);
      }
    })();
    return () => {
      cancelled = true;
      v.removeAttribute('src');
      v.load();
    };
  }, [src, count]);
  return src ? frames : [];
}

function CoverChooser({ video, onPick, onCancel }: { video: RefObject<HTMLVideoElement | null>; onPick: () => void; onCancel: () => void }) {
  const v = video.current;
  const [t, setT] = useState(() => v?.currentTime ?? 0);
  const duration = v?.duration && Number.isFinite(v.duration) ? v.duration : 0;
  const frames = useFilmstrip(v?.currentSrc ?? null);
  useEffect(() => {
    video.current?.pause();
  }, [video]);
  return (
    <div className="mt-2 rounded-xl border border-accent/50 bg-card p-3" role="group" aria-label="Choose a cover">
      <p className="mb-2 text-sm font-medium text-ink">Choose a cover</p>
      <div className="relative">
        <div className="flex h-16 overflow-hidden rounded-lg bg-paper-2" aria-hidden>
          {frames.map((f, i) => (
            <img key={i} src={f} alt="" className="h-full min-w-0 flex-1 object-cover" />
          ))}
        </div>
        {duration > 0 && (
          <span
            className="pointer-events-none absolute -top-1 bottom-[-4px] w-[14%] rounded-md border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,.4)]"
            style={{ left: `calc(${(t / duration) * 86}%)` }}
            aria-hidden
          />
        )}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.04}
          value={t}
          disabled={!duration}
          aria-label="Cover frame"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onChange={(e) => {
            const next = Number(e.target.value);
            setT(next);
            if (video.current) video.current.currentTime = next;
          }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">Slide along the strip; the frame shows large above.</p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={onPick}>
          Use this frame
        </button>
      </div>
    </div>
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
  onCover,
  onText,
  onTakeOut,
  world = 'healing',
}: {
  media: PostMedia[];
  format: PostFormat;
  altText: string;
  busy: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  onReorder: (media: PostMedia[]) => void;
  /** A new cover picture for the video at this place. */
  onCover?: (index: number, picture: File) => void;
  /** New words on the picture at this place. */
  onText?: (index: number, text: TextLayer[]) => void;
  /** Moves these slides out of the post: back to Ideas, or into a new post of their own. */
  onTakeOut?: (indexes: number[], to: TakeOutTo) => void;
  /** The post's world, for its accent colour. */
  world?: PostWorld;
}) {
  const input = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [coverNote, setCoverNote] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [writing, setWriting] = useState(false);
  const [selected, setSelected] = useState(0);
  /** Slides chosen to take out, while choosing (null when not choosing). */
  const [taking, setTaking] = useState<number[] | null>(null);
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
  /** A beige paper page to write on, added like a photo. */
  const addPlainPage = async () => onAdd([await plainPageFile()]);
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
    // Chosen slides stay chosen when they move.
    if (taking) {
      const order = arrayMove(media.map((_, i) => i), from, to);
      setTaking(taking.map((i) => order.indexOf(i)));
    }
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
        <button type="button" className="btn mx-auto mt-2 flex" disabled={busy} onClick={() => void addPlainPage()}>
          <FileText size={16} /> Plain page to write on
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
        <Slide media={current} alt={at === 0 ? altText : ''} tall={tall} videoRef={video} />
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
        {current?.kind === 'asset' && onText && (
          <button
            type="button"
            className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-2 text-sm font-semibold text-white hover:bg-black/75"
            onClick={() => setWriting(true)}
          >
            <Type size={16} aria-hidden /> {current.text?.length ? 'Edit text' : 'Add text'}
          </button>
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

      {current?.kind === 'clip' && onCover && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card p-2">
          {current.posterAssetId ? (
            <AssetImage id={current.posterAssetId} alt="Current cover" className="aspect-[9/16] w-9 shrink-0 rounded object-cover" />
          ) : (
            <span className="aspect-[9/16] w-9 shrink-0 rounded bg-paper-2" aria-hidden />
          )}
          <span className="mr-auto text-sm">
            <span className="block font-medium text-ink">Cover</span>
            <span className="block text-xs text-muted">{coverNote || 'Shown in the grid and before it plays.'}</span>
          </span>
          <button
            type="button"
            className="btn min-h-9 px-3"
            onClick={() => {
              if (!video.current) {
                setCoverNote('Add the video on this device first, or upload a picture.');
                return;
              }
              setCoverNote('');
              setChoosing(true);
            }}
          >
            <Camera size={15} /> Choose from video
          </button>
          <button type="button" className="btn min-h-9 px-3" onClick={() => coverInput.current?.click()}>
            <Upload size={15} /> Upload a picture
          </button>
          <input
            ref={coverInput}
            type="file"
            accept="image/*,.heic,.heif"
            className="sr-only"
            tabIndex={-1}
            aria-label="Cover picture for this video"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) {
                setCoverNote('Cover set from your picture.');
                onCover(at, f);
              }
            }}
          />
        </div>
      )}

      {choosing && current?.kind === 'clip' && onCover && (
        <CoverChooser
          video={video}
          onCancel={() => setChoosing(false)}
          onPick={async () => {
            const v = video.current;
            const frame = v ? await frameFromVideo(v, current.name) : null;
            setChoosing(false);
            if (!frame) {
              setCoverNote('That frame couldn’t be read. Try another, or upload a picture.');
              return;
            }
            setCoverNote('Cover set from the video.');
            onCover(at, frame);
          }}
        />
      )}

      {writing && current?.kind === 'asset' && onText && (
        <TextStudio
          open
          onClose={() => setWriting(false)}
          assetId={current.assetId}
          layers={current.text ?? []}
          tall={tall}
          world={world}
          slideName={`slide-${String(at + 1).padStart(2, '0')}`}
          onChange={(text) => onText(at, text)}
        />
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <ul className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 pt-1" aria-label="Slides in order">
            {media.map((m, i) => (
              <Thumb
                key={ids[i]}
                id={ids[i]}
                media={m}
                index={i}
                selected={i === at}
                chosen={taking ? taking.includes(i) : undefined}
                onSelect={() => {
                  setSelected(i);
                  if (taking) setTaking(taking.includes(i) ? taking.filter((x) => x !== i) : [...taking, i]);
                }}
              />
            ))}
            <li className={`shrink-0 ${taking ? 'hidden' : ''}`}>
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
            <li className={`shrink-0 ${taking ? 'hidden' : ''}`}>
              <button
                type="button"
                onClick={() => void addPlainPage()}
                disabled={busy}
                className="flex aspect-[4/5] w-16 flex-col items-center justify-center rounded-lg border-2 border-dashed border-line bg-[#eee3cf]/60 text-ink-2 hover:border-accent/60 hover:text-ink sm:w-20"
                aria-label="Add a plain page to write on"
              >
                <FileText size={18} aria-hidden />
                <span className="text-[10px]">Plain page</span>
              </button>
            </li>
          </ul>
        </SortableContext>
      </DndContext>
      {taking ? (
        <div className="mt-2 rounded-xl border border-accent/50 bg-card p-3" role="group" aria-label="Take slides out">
          <p className="mb-2 text-sm text-ink-2">
            {taking.length ? `${taking.length} slide${taking.length === 1 ? '' : 's'} chosen. Nothing is deleted.` : 'Tap the slides to take out of this post.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn min-h-9 px-3"
              disabled={!taking.length}
              onClick={() => {
                onTakeOut?.(taking, 'ideas');
                setTaking(null);
                setSelected(0);
              }}
            >
              <Lightbulb size={15} /> {taking.length > 1 ? 'Each back to Ideas' : 'Back to Ideas'}
            </button>
            <button
              type="button"
              className="btn min-h-9 px-3"
              disabled={!taking.length || taking.length === media.length}
              title={taking.length === media.length ? 'Leave at least one slide here' : undefined}
              onClick={() => {
                onTakeOut?.(taking, 'new-post');
                setTaking(null);
                setSelected(0);
              }}
            >
              <Images size={15} /> {taking.length > 1 ? 'Make their own carousel' : 'Make its own post'}
            </button>
            <button type="button" className="btn-ghost min-h-9 px-3" onClick={() => setTaking(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex items-start gap-2">
          <p className="min-w-0 flex-1 text-xs text-muted">Drag to reorder. Pictures sync to all your devices; videos stay on this one.</p>
          {onTakeOut && (
            <button type="button" className="btn-ghost -mt-1 min-h-8 shrink-0 px-2 text-xs" onClick={() => setTaking([])}>
              Take slides out
            </button>
          )}
        </div>
      )}
      {fileInput}
    </section>
  );
}
