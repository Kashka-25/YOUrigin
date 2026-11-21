import type { Asset, ContentItem } from '../domain/types';
import { displayTitle } from '../domain/text';
import { FORMAT_LABEL, WORLD_LABEL, dateKey, timeKey, type Post } from './model';

// Approved posts leave as a file for the scheduling step (Metricool, later).
// Exporting only writes a file: it changes nothing and sends nothing.

export interface ScheduledPostOut {
  id: string;
  date: string;
  time: string;
  /** ISO time with this device's offset. */
  scheduledAt: string;
  format: string;
  world: string;
  hook: string;
  caption: string;
  hashtags: string[];
  /** Caption, call to action and hashtags together, ready to paste. */
  fullCaption: string;
  altText: string;
  cta: string;
  /** Where the post sends people: for a Story link sticker or the bio. Empty when none. */
  link: string;
  media: { name: string; storedInYOUrigin: boolean; note?: string }[];
  pieces: string[];
}

export interface PostSchedule {
  app: 'YOUrigin';
  kind: 'post-schedule';
  version: 1;
  exportedAt: string;
  timeZone: string;
  from: string;
  to: string;
  posts: ScheduledPostOut[];
}

/** Approved posts with a time between the two dates (inclusive, local), earliest first. */
export function approvedBetween(posts: Post[], from: Date, to: Date): Post[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1).getTime();
  return posts
    .filter((p) => !p.deletedAt && p.status === 'approved' && p.scheduledAt !== null && p.scheduledAt >= start && p.scheduledAt < end)
    .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));
}

export function fullCaption(p: Pick<Post, 'caption' | 'cta' | 'hashtags'>): string {
  return [p.caption.trim(), p.cta.trim(), p.hashtags.join(' ')].filter(Boolean).join('\n\n');
}

function isoWithOffset(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const p = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return `${dateKey(d)}T${timeKey(d)}:00${sign}${p(off / 60)}:${p(off % 60)}`;
}

export function buildSchedule(
  posts: Post[],
  from: Date,
  to: Date,
  lookup: { pieces: Map<string, Pick<ContentItem, 'title' | 'body'>>; assets: Map<string, Pick<Asset, 'name'>> },
  now = new Date(),
): PostSchedule {
  return {
    app: 'YOUrigin',
    kind: 'post-schedule',
    version: 1,
    exportedAt: now.toISOString(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    from: dateKey(from),
    to: dateKey(to),
    posts: approvedBetween(posts, from, to).map((p) => {
      const at = new Date(p.scheduledAt as number);
      return {
        id: p.id,
        date: dateKey(at),
        time: timeKey(at),
        scheduledAt: isoWithOffset(at),
        format: FORMAT_LABEL[p.format],
        world: WORLD_LABEL[p.world],
        hook: p.hook,
        caption: p.caption,
        hashtags: p.hashtags,
        fullCaption: fullCaption(p),
        altText: p.altText,
        cta: p.cta,
        link: p.link ?? '',
        media: p.media.map((m) =>
          m.kind === 'asset'
            ? { name: lookup.assets.get(m.assetId)?.name ?? 'image stored in YOUrigin', storedInYOUrigin: true }
            : m.kind === 'clip'
              ? { name: m.name, storedInYOUrigin: true, note: 'video kept on the device it was added on' }
              : { name: m.name, storedInYOUrigin: false, ...(m.note ? { note: m.note } : {}) },
        ),
        pieces: p.pieceIds.flatMap((id) => {
          const piece = lookup.pieces.get(id);
          return piece ? [displayTitle(piece)] : [];
        }),
      };
    }),
  };
}

export function scheduleToMarkdown(s: PostSchedule): string {
  const lines = [`# Approved posts, ${s.from} to ${s.to}`, '', `${s.posts.length} post${s.posts.length === 1 ? '' : 's'} · times in ${s.timeZone}`];
  for (const p of s.posts) {
    const day = new Date(`${p.date}T${p.time}`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    lines.push('', '---', '', `## ${day}, ${p.time} · ${p.format} · ${p.world}`);
    if (p.hook.trim()) lines.push('', `**On the image:** ${p.hook.trim()}`);
    lines.push('', '**Caption**', '', p.fullCaption || '(no caption)');
    if (p.link) lines.push('', `**Link:** ${p.link} (for a Story link sticker or your bio)`);
    if (p.altText.trim()) lines.push('', `**Alt text:** ${p.altText.trim()}`);
    if (p.media.length) lines.push('', `**Media:** ${p.media.map((m) => (m.storedInYOUrigin ? `${m.name} (in YOUrigin)` : m.name)).join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}
