import { useRef, useState, type Ref } from 'react';
import { ChevronLeft, ChevronRight, FileImage, Film, Link2, Play, Upload } from 'lucide-react';
import { AssetImage } from '../AssetImage';
import { addClipOnThisDevice, useClipUrl } from '../../db/postMedia';
import { VIDEO_ACCEPT } from '../../io/postMedia';
import { linkLabel, type Post, type PostMedia } from '../../posts/model';

/** A small square-ish picture of one piece of media: the image, a video's still frame, or its file name. */
export function MediaThumb({ media, className = '', alt = '' }: { media: PostMedia; className?: string; alt?: string }) {
  if (media.kind === 'asset') return <AssetImage id={media.assetId} alt={alt} className={`object-cover ${className}`} />;
  if (media.kind === 'clip') {
    return (
      <span className={`relative block overflow-hidden bg-ink/80 ${className}`}>
        {media.posterAssetId ? <AssetImage id={media.posterAssetId} alt={alt} className="absolute inset-0 h-full w-full object-cover" /> : null}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-black/55 p-1.5 text-white">
            <Play size={14} fill="currentColor" aria-label="Video" />
          </span>
        </span>
      </span>
    );
  }
  return (
    <span className={`flex flex-col items-center justify-center gap-1 border border-dashed border-line p-1 text-center text-[10px] leading-tight text-ink-2 ${className}`}>
      <FileImage size={14} aria-hidden />
      <span className="line-clamp-3 break-all">{media.name}</span>
    </span>
  );
}

/** The first picture a post would show in the feed, if it has one. */
export function firstPicture(media: PostMedia[]): PostMedia | undefined {
  return media.find((m) => m.kind === 'asset' || (m.kind === 'clip' && m.posterAssetId));
}

function ClipPlayer({ media, tall, videoRef }: { media: Extract<PostMedia, { kind: 'clip' }>; tall: boolean; videoRef?: Ref<HTMLVideoElement> }) {
  const { url, missing } = useClipUrl(media.clipId);
  const input = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState('');
  if (url) {
    return <video ref={videoRef} src={url} className="h-full w-full bg-black object-contain" controls playsInline loop preload="metadata" aria-label={media.name} />;
  }
  const add = async (file: File | undefined) => {
    if (!file) return;
    setAdding(true);
    setProblem('');
    try {
      await addClipOnThisDevice(media.clipId, file);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };
  return (
    <span className="relative block h-full w-full bg-ink">
      {media.posterAssetId && <AssetImage id={media.posterAssetId} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />}
      {missing && (
        <span className={`absolute inset-x-3 ${tall ? 'bottom-6' : 'bottom-3'} flex flex-col items-center gap-2 rounded-xl bg-black/70 p-3 text-center text-xs text-white`}>
          <span>
            <Film size={14} className="mr-1 inline" aria-hidden />
            This video is on the device it was added on. To play it here, add the same file on this device too.
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#1a1410] disabled:opacity-60"
            disabled={adding}
            onClick={(e) => {
              e.stopPropagation();
              input.current?.click();
            }}
          >
            <Upload size={13} aria-hidden /> {adding ? 'Adding…' : `Add ${media.name} here`}
          </button>
          {problem && <span className="text-[11px] text-white/80">{problem}</span>}
          <input
            ref={input}
            type="file"
            accept={VIDEO_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-label={`Add ${media.name} on this device`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              void add(f);
            }}
          />
        </span>
      )}
    </span>
  );
}

export function Slide({ media, alt, tall, videoRef }: { media: PostMedia; alt: string; tall: boolean; videoRef?: Ref<HTMLVideoElement> }) {
  if (media.kind === 'clip') return <ClipPlayer media={media} tall={tall} videoRef={videoRef} />;
  if (media.kind === 'asset') return <AssetImage id={media.assetId} alt={alt} className="h-full w-full object-cover" />;
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-ink-2">
      <FileImage size={22} aria-hidden />
      <span className="break-all">{media.name}</span>
      <span className="text-xs text-muted">Not added yet. Tap + to add it, or use “Add media” on the Posts page.</span>
    </span>
  );
}

/**
 * The post as followers will see it: swipe through the slides (or play the
 * video), with the caption, call to action and hashtags underneath.
 */
export function PostPreview({ post }: { post: Pick<Post, 'format' | 'media' | 'hook' | 'caption' | 'cta' | 'hashtags' | 'altText' | 'world' | 'link'> }) {
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [more, setMore] = useState(false);
  const tall = post.format === 'reel' || post.format === 'story' || post.media.some((m) => m.kind === 'clip');
  const count = post.media.length;
  const at = Math.min(index, Math.max(0, count - 1));

  const go = (i: number) => {
    const el = strip.current;
    if (!el) return;
    const next = Math.max(0, Math.min(count - 1, i));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    setIndex(next);
  };

  const caption = post.caption.trim();
  const tags = post.hashtags.join(' ');
  const long = caption.length > 160 || caption.split('\n').length > 3;

  return (
    <figure
      className={`mx-auto w-full overflow-hidden rounded-2xl border border-line bg-card shadow-sm ${tall ? 'max-w-[min(24rem,calc(70vh*0.5625))]' : 'max-w-sm'}`}
      aria-label="Preview"
    >
      <div className={`relative w-full bg-paper-2 ${tall ? 'aspect-[9/16]' : 'aspect-[4/5]'}`}>
        {count ? (
          <div
            ref={strip}
            className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth));
            }}
          >
            {post.media.map((m, i) => (
              <div key={m.kind === 'asset' ? `${m.assetId}-${i}` : m.kind === 'clip' ? `${m.clipId}-${i}` : `${m.name}-${i}`} className="h-full w-full shrink-0 snap-center">
                <Slide media={m} alt={i === 0 ? post.altText : ''} tall={tall} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center p-6 text-center font-serif text-xl leading-snug text-ink">{post.hook.trim() || 'Add images or a video to see the post here.'}</div>
        )}
        {count > 1 && (
          <>
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">
              {at + 1}/{count}
            </span>
            {at > 0 && (
              <button type="button" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1 text-ink shadow" onClick={() => go(at - 1)} aria-label="Previous slide">
                <ChevronLeft size={18} />
              </button>
            )}
            {at < count - 1 && (
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1 text-ink shadow" onClick={() => go(at + 1)} aria-label="Next slide">
                <ChevronRight size={18} />
              </button>
            )}
          </>
        )}
      </div>
      {count > 1 && (
        <div className="flex justify-center gap-1 pt-2" aria-hidden>
          {post.media.map((_, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === at ? 'bg-accent' : 'bg-line'}`} />
          ))}
        </div>
      )}
      <figcaption className="px-3 pb-3 pt-2 text-[14px] leading-relaxed">
        {caption ? (
          <span className={`writing block whitespace-pre-line ${!more && long ? 'line-clamp-3' : ''}`}>{caption}</span>
        ) : (
          <span className="text-muted">No caption yet.</span>
        )}
        {long && (
          <button type="button" className="text-sm text-muted" onClick={() => setMore(!more)}>
            {more ? 'less' : 'more'}
          </button>
        )}
        {(more || !long) && post.cta.trim() && <span className="mt-2 block">{post.cta.trim()}</span>}
        {(more || !long) && tags && <span className="mt-2 block break-words text-[13px] text-accent">{tags}</span>}
        {post.link && (
          <a href={post.link} target="_blank" rel="noreferrer" className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[13px] font-semibold text-[#2f6fd6] shadow-sm" title="As a Story link sticker">
            <Link2 size={14} aria-hidden /> <span className="truncate">{linkLabel(post.link)}</span>
          </a>
        )}
      </figcaption>
    </figure>
  );
}
