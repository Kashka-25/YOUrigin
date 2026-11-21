import type { Syncable } from '../domain/types';
import { newId } from '../domain/text';

// Posts: social media posts for Instagram, planned, written and approved here.
// A post links to the pieces it draws on; it never holds a copy of them.

export type PostStatus = 'idea' | 'draft' | 'approved' | 'posted';
export type PostFormat = 'reel' | 'carousel' | 'quote-card' | 'story' | 'single-image';
export type PostWorld = 'healing' | 'digital-homes' | 'worlds-stories' | 'music-sound' | 'coco-making';

/** A picture stored in YOUrigin, or a file kept elsewhere (Google Drive, the phone) named by its file name. */
export type PostMedia =
  | { kind: 'asset'; assetId: string }
  | { kind: 'file'; name: string; note?: string }
  /**
   * A video kept on the device it was added on (videos are too large to sync).
   * Its still frame is an asset, so every device can show the post's picture.
   */
  | { kind: 'clip'; clipId: string; name: string; posterAssetId?: string };

export type PostOrigin =
  | { kind: 'cassidy' }
  | { kind: 'claude'; draftKey: string; fileName: string; importedAt: number };

export interface Post extends Syncable {
  /** Planned date and time (local), or null while it is still an unplaced idea. */
  scheduledAt: number | null;
  status: PostStatus;
  format: PostFormat;
  world: PostWorld;
  /** Words on the image or the first frame. */
  hook: string;
  caption: string;
  hashtags: string[];
  altText: string;
  cta: string;
  /** Pieces this post draws on or quotes, by id. Content exists once. */
  pieceIds: string[];
  media: PostMedia[];
  /** Notes to self while reviewing. Never exported. */
  notes: string;
  origin: PostOrigin;
  approvedAt: number | null;
  postedAt: number | null;
  /** Link to the live post, once it is up. */
  postedUrl: string;
  /**
   * Where the post sends people (a website, a demo, a course). Instagram doesn't make
   * links in captions clickable, so it goes on a Story link sticker or in the bio.
   * Optional: posts made before links existed don't have one.
   */
  link?: string;
  /** Soft delete: the post sits aside until it is removed for good. */
  deletedAt: number | null;
}

export const STATUS_ORDER: PostStatus[] = ['idea', 'draft', 'approved', 'posted'];
export const STATUS_LABEL: Record<PostStatus, string> = { idea: 'Idea', draft: 'Draft', approved: 'Approved', posted: 'Posted' };

export const FORMAT_ORDER: PostFormat[] = ['reel', 'carousel', 'quote-card', 'single-image', 'story'];
export const FORMAT_LABEL: Record<PostFormat, string> = {
  reel: 'Reel',
  carousel: 'Carousel',
  'quote-card': 'Quote card',
  story: 'Story',
  'single-image': 'Single image',
};

export const WORLD_ORDER: PostWorld[] = ['healing', 'digital-homes', 'worlds-stories', 'music-sound', 'coco-making'];
export const WORLD_LABEL: Record<PostWorld, string> = {
  healing: 'Healing',
  'digital-homes': 'Digital Homes',
  'worlds-stories': 'Worlds & Stories',
  'music-sound': 'Music & Sound',
  'coco-making': 'Coco & the Making',
};
/** Project colour names (see ProjectColour) so worlds read at a glance. */
export const WORLD_COLOUR: Record<PostWorld, string> = {
  healing: 'jade',
  'digital-homes': 'sky',
  'worlds-stories': 'violet',
  'music-sound': 'amber',
  'coco-making': 'terracotta',
};

/**
 * The weekly plan: each content world has its own weekday; Friday and Sunday
 * are for Stories. Times are placeholders until real insights are in.
 * Keys are JavaScript weekdays (0 = Sunday).
 */
export const WEEK_PLAN: Record<number, { world: PostWorld | null; label: string; time: string }> = {
  1: { world: 'healing', label: 'Healing', time: '19:00' },
  2: { world: 'digital-homes', label: 'Digital Homes', time: '19:00' },
  3: { world: 'worlds-stories', label: 'Worlds & Stories', time: '19:00' },
  4: { world: 'music-sound', label: 'Music & Sound', time: '19:00' },
  5: { world: null, label: 'Stories', time: '12:00' },
  6: { world: 'coco-making', label: 'Coco & the Making', time: '11:00' },
  0: { world: null, label: 'Stories', time: '12:00' },
};

/**
 * The format the media suggests, the way Instagram decides: a video makes a
 * Reel, several pictures a carousel, one picture a single image. Quote cards,
 * Stories and a Reel made of pictures are left as chosen.
 */
export function formatForMedia(media: PostMedia[], current: PostFormat): PostFormat {
  if (!media.length || current === 'story' || current === 'quote-card') return current;
  if (media.some((m) => m.kind === 'clip')) return 'reel';
  if (current === 'reel') return current;
  return media.length > 1 ? 'carousel' : 'single-image';
}

export const CAPTION_LIMIT = 2200;
export const HASHTAG_LIMIT = 30;

export function newPost(patch: Partial<Post> = {}, now = Date.now()): Post {
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    scheduledAt: null,
    status: 'idea',
    format: 'single-image',
    world: 'healing',
    hook: '',
    caption: '',
    hashtags: [],
    altText: '',
    cta: '',
    pieceIds: [],
    media: [],
    notes: '',
    origin: { kind: 'cassidy' },
    approvedAt: null,
    postedAt: null,
    postedUrl: '',
    link: '',
    deletedAt: null,
    ...patch,
  };
}

/** A new post for a day in the calendar, carrying that day's world and placeholder time. */
export function postForDay(day: Date, now = Date.now()): Post {
  const plan = WEEK_PLAN[day.getDay()];
  const [h, m] = plan.time.split(':').map(Number);
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
  return newPost({ scheduledAt: at.getTime(), world: plan.world ?? 'healing', format: plan.world ? 'single-image' : 'story' }, now);
}

/** The fields a status move changes. Moving back clears the later dates. */
export function statusPatch(status: PostStatus, now = Date.now()): Pick<Post, 'status' | 'approvedAt' | 'postedAt'> {
  const rank = STATUS_ORDER.indexOf(status);
  return {
    status,
    approvedAt: rank >= 2 ? now : null,
    postedAt: rank >= 3 ? now : null,
  };
}

/** Same as statusPatch but keeps the dates a post already has when it stays past that step. */
export function moveStatus(post: Post, status: PostStatus, now = Date.now()): Pick<Post, 'status' | 'approvedAt' | 'postedAt'> {
  const p = statusPatch(status, now);
  return {
    status,
    approvedAt: p.approvedAt === null ? null : (post.approvedAt ?? now),
    postedAt: p.postedAt === null ? null : (post.postedAt ?? now),
  };
}

export function nextStatus(s: PostStatus): PostStatus | null {
  return STATUS_ORDER[STATUS_ORDER.indexOf(s) + 1] ?? null;
}
export function previousStatus(s: PostStatus): PostStatus | null {
  return STATUS_ORDER[STATUS_ORDER.indexOf(s) - 1] ?? null;
}

/** "#Healing, nervous system" → ['#healing', '#nervoussystem']; duplicates dropped, order kept. */
export function normaliseHashtags(input: string | string[]): string[] {
  const parts = (Array.isArray(input) ? input : input.split(/[\s,]+/)).flatMap((p) => p.split(/(?=#)/));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const word = raw.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '').toLocaleLowerCase();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push(`#${word}`);
  }
  return out;
}

// ---- gentle checks -------------------------------------------------------------
// They suggest; they never block saving or approving.

export interface PostCheck {
  key: string;
  message: string;
}

const CRISIS = /\b(suicid\w*|self[- ]?harm\w*|kill(ing)? myself|end(ing)? (my|it all)|want(ed)? to die|overdose|crisis)\b/i;
const HELPLINE = /\b(helpline|hotline|lifeline|samaritans|crisis line|text line|988|116 ?123|lifeline\.org)\b/i;
const CANNABIS = /\b(cannabis|marijuana|weed|ganja|thc|cbd|420|stoned|joint|edibles?|dispensar\w*)\b/i;

export function postChecks(post: Pick<Post, 'caption' | 'hook' | 'altText' | 'hashtags' | 'status' | 'format'>): PostCheck[] {
  const text = `${post.hook}\n${post.caption}`;
  const checks: PostCheck[] = [];
  if (CRISIS.test(text) && !HELPLINE.test(text)) {
    checks.push({ key: 'helpline', message: 'This touches on crisis. Add a helpline to the caption.' });
  }
  if (CANNABIS.test(`${text}\n${post.hashtags.join(' ')}`)) {
    checks.push({ key: 'cannabis', message: 'Instagram restricts cannabis promotion. Keep this to folklore and art.' });
  }
  if (post.caption.length > CAPTION_LIMIT) {
    checks.push({ key: 'caption-length', message: `The caption is over Instagram's ${CAPTION_LIMIT.toLocaleString()} characters.` });
  }
  if (post.hashtags.length > HASHTAG_LIMIT) {
    checks.push({ key: 'hashtags', message: `Instagram allows up to ${HASHTAG_LIMIT} hashtags.` });
  }
  if (post.format !== 'story' && (post.status === 'draft' || post.status === 'approved') && !post.altText.trim()) {
    checks.push({ key: 'alt', message: 'Add alt text so everyone can see the image.' });
  }
  return checks;
}

/** True while the hook still appears, word for word (ignoring spacing and case), in one of the linked pieces. */
export function hookInPieces(hook: string, pieceBodies: string[]): boolean {
  const norm = (s: string) => s.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  const h = norm(hook);
  return !!h && pieceBodies.some((b) => norm(b).includes(h));
}

// ---- dates -------------------------------------------------------------------

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
/** Monday of the week the date falls in. */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const offset = (day.getDay() + 6) % 7;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - offset);
}
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
}
export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** YYYY-MM-DD in local time. */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** HH:MM in local time. */
export function timeKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** Local date ("2026-11-23") and time ("19:00") to a timestamp; null when the date is missing or invalid. */
export function fromDateTime(date: string, time: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim()) ?? ['', '12', '00'];
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]));
  if (at.getMonth() !== Number(m[2]) - 1 || Number(t[1]) > 23 || Number(t[2]) > 59) return null;
  return at.getTime();
}
/** The 6×7 grid of days shown for a month, starting on a Monday. */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function postsByDay(posts: Post[]): Map<string, Post[]> {
  const map = new Map<string, Post[]>();
  for (const p of [...posts].sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0))) {
    if (p.scheduledAt === null) continue;
    const k = dateKey(new Date(p.scheduledAt));
    map.set(k, [...(map.get(k) ?? []), p]);
  }
  return map;
}

// ---- feed grid ------------------------------------------------------------------
// The grid shows how the profile will look: feed posts, newest first, three across.
// Stories never appear in the feed, and posts without a time aren't placed yet.

export function isFeedFormat(f: PostFormat): boolean {
  return f !== 'story';
}

/** Feed posts in the order the profile grid shows them: latest time first. */
export function feedOrder(posts: Post[]): Post[] {
  return posts
    .filter((p) => !p.deletedAt && p.scheduledAt !== null && isFeedFormat(p.format))
    .sort((a, b) => (b.scheduledAt ?? 0) - (a.scheduledAt ?? 0) || a.createdAt - b.createdAt);
}

/**
 * Moves one post to another place in the grid. The planned times stay where
 * they are (they are the schedule's slots); the posts between the two places
 * shift along and take on the times of their new places. Posted posts are
 * live, so they never move and nothing moves onto them.
 * Returns only the posts whose time changes.
 */
export function moveInFeed(feed: Post[], postId: string, toIndex: number): { id: string; scheduledAt: number }[] {
  const from = feed.findIndex((p) => p.id === postId);
  if (from < 0 || toIndex < 0 || toIndex >= feed.length || from === toIndex) return [];
  if (feed[from].status === 'posted') return [];
  const lo = Math.min(from, toIndex);
  const hi = Math.max(from, toIndex);
  if (feed.slice(lo, hi + 1).some((p) => p.status === 'posted')) return [];
  const slots = feed.map((p) => p.scheduledAt as number);
  const order = [...feed];
  const [moved] = order.splice(from, 1);
  order.splice(toIndex, 0, moved);
  const changes: { id: string; scheduledAt: number }[] = [];
  order.forEach((p, i) => {
    if (p.scheduledAt !== slots[i]) changes.push({ id: p.id, scheduledAt: slots[i] });
  });
  return changes;
}

/** A link as people would type it: adds https:// when it's missing; empty stays empty. */
export function normaliseLink(input: string): string {
  const t = input.trim();
  if (!t) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`;
}

/** The short form shown on a link sticker ("yourownuniverse.life"), or the link itself if it isn't a web address. */
export function linkLabel(link: string): string {
  try {
    const u = new URL(normaliseLink(link));
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : ''}`;
  } catch {
    return link.trim();
  }
}
