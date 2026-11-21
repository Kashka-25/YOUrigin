import type { ContentItem } from '../domain/types';
import { displayTitle } from '../domain/text';
import { sameTitle } from '../portfolio/starter';
import {
  FORMAT_LABEL,
  FORMAT_ORDER,
  WORLD_LABEL,
  WORLD_ORDER,
  fromDateTime,
  newPost,
  normaliseHashtags,
  type Post,
  type PostFormat,
  type PostWorld,
} from '../posts/model';

// Drafts Claude writes come in as a file, are shown for review like a document
// import (see import.ts: preview, edit, tick what to keep, then save), and land
// as Draft whatever the file says. AI only suggests. See docs/POSTS.md.

export const POST_DRAFTS_ACCEPT = '.json,application/json';

/** How a draft names a piece it draws on: by id, or by title when the id isn't known. */
export interface PieceRef {
  id?: string;
  title?: string;
}

/** One draft in the review list. */
export interface PostDraft {
  key: string;
  include: boolean;
  /** Already imported earlier (same key): left out so nothing edited is overwritten. */
  duplicate: boolean;
  scheduledAt: number | null;
  format: PostFormat;
  world: PostWorld;
  hook: string;
  caption: string;
  hashtags: string[];
  altText: string;
  cta: string;
  pieces: { ref: PieceRef; pieceId: string | null }[];
  media: { name: string; note?: string }[];
  notes: string;
  /** Things to look at before saving (an unknown world, a piece that wasn't found…). */
  warnings: string[];
}

export interface PostDraftsFile {
  fileName: string;
  week: string;
  drafts: PostDraft[];
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

function pickFormat(v: unknown): PostFormat | null {
  const s = squash(str(v));
  return FORMAT_ORDER.find((f) => squash(f) === s || squash(FORMAT_LABEL[f]) === s) ?? null;
}

function pickWorld(v: unknown): PostWorld | null {
  const s = squash(str(v).replace(/&/g, 'and'));
  return WORLD_ORDER.find((w) => squash(w) === s || squash(WORLD_LABEL[w].replace(/&/g, 'and')) === s || squash(WORLD_LABEL[w]) === s) ?? null;
}

/** Reads a drafts file. Throws with a plain message when it isn't one. */
export function parsePostDrafts(text: string, fileName = 'drafts.json'): PostDraftsFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file isn’t readable JSON.');
  }
  const file = data as { kind?: unknown; version?: unknown; week?: unknown; posts?: unknown };
  if (!file || typeof file !== 'object' || file.kind !== 'post-drafts' || !Array.isArray(file.posts)) {
    throw new Error('This isn’t a post drafts file (it needs "kind": "post-drafts" and a "posts" list).');
  }
  if (typeof file.version === 'number' && file.version > 1) {
    throw new Error('This drafts file is from a newer version of YOUrigin. Update the app first.');
  }

  const seen = new Set<string>();
  const drafts = (file.posts as unknown[]).map((raw, i): PostDraft => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const warnings: string[] = [];
    let key = str(r.key).trim() || `${fileName}#${i + 1}`;
    if (seen.has(key)) key = `${key}#${i + 1}`;
    seen.add(key);

    const format = pickFormat(r.format);
    if (!format) warnings.push(r.format ? `Unknown format “${str(r.format)}”, set to Single image.` : 'No format given, set to Single image.');
    const world = pickWorld(r.world);
    if (!world) warnings.push(r.world ? `Unknown world “${str(r.world)}”, set to Healing.` : 'No world given, set to Healing.');

    const date = str(r.date);
    const scheduledAt = date ? fromDateTime(date, str(r.time)) : null;
    if (date && scheduledAt === null) warnings.push(`The date “${date}” wasn’t understood, so it isn’t placed yet.`);

    const pieces = (Array.isArray(r.pieces) ? r.pieces : [])
      .map((p): PieceRef => (typeof p === 'string' ? { title: p } : { id: str((p as PieceRef)?.id) || undefined, title: str((p as PieceRef)?.title) || undefined }))
      .filter((p) => p.id || p.title)
      .map((ref) => ({ ref, pieceId: null as string | null }));

    const media = (Array.isArray(r.media) ? r.media : [])
      .map((m) => (typeof m === 'string' ? { name: m } : { name: str((m as { name?: unknown })?.name), note: str((m as { note?: unknown })?.note) || undefined }))
      .filter((m) => m.name.trim());

    const caption = str(r.caption);
    if (!caption.trim() && !str(r.hook).trim()) warnings.push('No caption or hook.');

    return {
      key,
      include: true,
      duplicate: false,
      scheduledAt,
      format: format ?? 'single-image',
      world: world ?? 'healing',
      hook: str(r.hook),
      caption,
      hashtags: normaliseHashtags(Array.isArray(r.hashtags) ? r.hashtags.map(str) : str(r.hashtags)),
      altText: str(r.altText),
      cta: str(r.cta),
      pieces,
      media,
      notes: str(r.notes),
      warnings,
    };
  });

  return { fileName, week: str(file.week), drafts };
}

/**
 * Links each draft to pieces already in the library (by id, then by title) and
 * marks drafts imported before. Never creates pieces: an unmatched title stays
 * a warning so it can be linked by hand.
 */
export function resolvePostDrafts(
  file: PostDraftsFile,
  pieces: Pick<ContentItem, 'id' | 'title' | 'body' | 'deletedAt'>[],
  importedKeys: Set<string>,
): PostDraftsFile {
  const live = pieces.filter((p) => !p.deletedAt);
  const byId = new Map(live.map((p) => [p.id, p]));
  return {
    ...file,
    drafts: file.drafts.map((d) => {
      const warnings = d.warnings.filter((w) => !w.startsWith('No piece called') && !w.startsWith('More than one piece'));
      const linked = d.pieces.map(({ ref }) => {
        if (ref.id && byId.has(ref.id)) return { ref, pieceId: ref.id };
        if (ref.title) {
          const matches = live.filter((p) => sameTitle(displayTitle(p), ref.title as string) || sameTitle(p.title, ref.title as string));
          if (matches.length === 1) return { ref, pieceId: matches[0].id };
          warnings.push(matches.length ? `More than one piece is called “${ref.title}”. Link the right one by hand.` : `No piece called “${ref.title}” was found. Link it by hand if it’s in your library.`);
        } else {
          warnings.push(`No piece called “${ref.id}” was found.`);
        }
        return { ref, pieceId: null };
      });
      const duplicate = importedKeys.has(d.key);
      return { ...d, pieces: linked, warnings, duplicate, include: duplicate ? false : d.include };
    }),
  };
}

/** The ticked drafts as new posts. They are always Drafts, and remember where they came from. */
export function draftsToPosts(file: PostDraftsFile, now = Date.now()): Post[] {
  return file.drafts
    .filter((d) => d.include && !d.duplicate)
    .map((d) =>
      newPost(
        {
          status: 'draft',
          scheduledAt: d.scheduledAt,
          format: d.format,
          world: d.world,
          hook: d.hook,
          caption: d.caption,
          hashtags: d.hashtags,
          altText: d.altText,
          cta: d.cta,
          pieceIds: [...new Set(d.pieces.map((p) => p.pieceId).filter((id): id is string => !!id))],
          media: d.media.map((m) => ({ kind: 'file' as const, name: m.name, ...(m.note ? { note: m.note } : {}) })),
          notes: d.notes,
          origin: { kind: 'claude', draftKey: d.key, fileName: file.fileName, importedAt: now },
        },
        now,
      ),
    );
}
