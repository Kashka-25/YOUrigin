import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Clapperboard, GalleryHorizontal, Image as ImageIcon, Quote, CircleDashed, Sparkles } from 'lucide-react';
import { projectColourStyle } from '../ProjectColourPicker';
import { AssetImage } from '../AssetImage';
import { MediaThumb, firstPicture } from './PostMedia';
import { TextOnPicture } from './TextOnPicture';
import type { ProjectColour } from '../../domain/types';
import { FORMAT_LABEL, STATUS_LABEL, WORLD_COLOUR, WORLD_LABEL, timeKey, type Post, type PostFormat, type PostStatus, type PostWorld } from '../../posts/model';

export function worldStyle(world: PostWorld): CSSProperties {
  return projectColourStyle(WORLD_COLOUR[world] as ProjectColour);
}

export const FORMAT_ICON: Record<PostFormat, typeof Quote> = {
  reel: Clapperboard,
  carousel: GalleryHorizontal,
  'quote-card': Quote,
  'single-image': ImageIcon,
  story: CircleDashed,
};

const STATUS_CLASS: Record<PostStatus, string> = {
  idea: 'border-line text-muted',
  draft: 'border-gold/50 text-gold',
  approved: 'border-polished/60 text-polished',
  posted: 'border-ink/30 bg-ink text-paper',
};

export function PostStatusPill({ status, className = '' }: { status: PostStatus; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[status]} ${className}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function WorldDot({ world, className = 'h-2.5 w-2.5' }: { world: PostWorld; className?: string }) {
  return <span className={`project-colour-dot inline-block shrink-0 ${className}`} style={worldStyle(world)} title={WORLD_LABEL[world]} aria-hidden />;
}

/** A short title for a post wherever it is listed. */
export function postTitle(p: Pick<Post, 'hook' | 'caption'>): string {
  const t = (p.hook.trim() || p.caption.trim().split('\n')[0] || '').trim();
  return t.length > 90 ? `${t.slice(0, 88)}…` : t || 'Untitled post';
}

/** One post in a calendar day or board column. */
export function PostChip({ post, showTime = true, showStatus = true }: { post: Post; showTime?: boolean; showStatus?: boolean }) {
  const Icon = FORMAT_ICON[post.format];
  return (
    <Link
      to={`/posts/${post.id}`}
      className="post-world block rounded-xl px-3 py-2 text-left transition-colors hover:brightness-105 focus-visible:outline-2 focus-visible:outline-accent"
      style={worldStyle(post.world)}
    >
      <span className="flex items-center gap-2 text-xs text-ink-2">
        {showTime && post.scheduledAt !== null && <span className="font-semibold tabular-nums text-ink">{timeKey(new Date(post.scheduledAt))}</span>}
        <Icon size={13} aria-hidden />
        <span>{FORMAT_LABEL[post.format]}</span>
        {post.origin.kind === 'claude' && post.status === 'draft' && <Sparkles size={12} className="text-gold" aria-label="Drafted by Claude" />}
        {showStatus && <PostStatusPill status={post.status} className="ml-auto" />}
      </span>
      <span className="mt-1 flex items-start gap-2">
        {firstPicture(post.media) && <MediaThumb media={firstPicture(post.media)!} className="aspect-[4/5] w-10 shrink-0 rounded-md" />}
        <span className="block min-w-0 font-serif text-[15px] leading-snug text-ink">{postTitle(post)}</span>
      </span>
    </Link>
  );
}

/** A post as it will look in the profile grid: its first picture, or its hook on the world's colour. */
export function FeedTileFace({ post }: { post: Post }) {
  const Icon = FORMAT_ICON[post.format];
  const picture = firstPicture(post.media);
  const pictureId = picture?.kind === 'asset' ? picture.assetId : picture?.kind === 'clip' ? picture.posterAssetId : undefined;
  return (
    <span className="post-tile relative block aspect-[4/5] w-full overflow-hidden" style={worldStyle(post.world)}>
      {pictureId ? (
        <>
          <AssetImage id={pictureId} alt={post.altText} className="absolute inset-0 h-full w-full object-cover" />
          {picture?.kind === 'asset' && picture.text?.length ? <TextOnPicture layers={picture.text} /> : null}
        </>
      ) : (
        <span className="absolute inset-0 flex items-center justify-center p-2 text-center font-serif text-[13px] leading-snug text-ink sm:p-4 sm:text-base">
          <span className="line-clamp-5">{post.hook.trim() || postTitle(post)}</span>
        </span>
      )}
      <Icon size={16} className="absolute right-1.5 top-1.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.6)]" aria-label={FORMAT_LABEL[post.format]} />
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-4 text-[10px] font-semibold text-white">
        <span>
          {post.scheduledAt !== null && new Date(post.scheduledAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </span>
        <span className={post.status === 'approved' ? 'text-[#9be3b4]' : post.status === 'posted' ? 'opacity-80' : ''}>{STATUS_LABEL[post.status]}</span>
      </span>
    </span>
  );
}
