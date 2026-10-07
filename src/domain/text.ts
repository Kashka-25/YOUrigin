import type { ContentItem } from './types';

const HASHTAG_RE = /(^|[\s(])#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;

export function normaliseTagName(raw: string): string {
  return raw.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-');
}

/** All distinct hashtags in a piece of text, normalised, in order of appearance. */
export function extractHashtags(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(HASHTAG_RE)) seen.add(normaliseTagName(m[2]));
  return [...seen];
}

const TAG_ONLY_LINE = /^\s*(#[\p{L}\p{N}][\p{L}\p{N}_-]*[\s,]*)+$/u;

/**
 * Splits a capture into body + tags. Lines made up *only* of hashtags are
 * metadata and are removed from the body; hashtags inside sentences stay where
 * the writer put them (and are also extracted as tags).
 */
export function parseCapture(raw: string): { body: string; tags: string[] } {
  const tags = extractHashtags(raw);
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const kept = lines.filter((l) => !TAG_ONLY_LINE.test(l));
  return { body: trimBlankEdges(kept.join('\n')), tags };
}

/** Remove leading/trailing blank lines but keep internal whitespace exactly. */
export function trimBlankEdges(text: string): string {
  return text.replace(/^(\s*\n)+/, '').replace(/(\n\s*)+$/, '');
}

export function firstLine(body: string): string {
  const line = body.split('\n').find((l) => l.trim().length > 0) ?? '';
  return line.trim();
}

export function displayTitle(item: Pick<ContentItem, 'title' | 'body'>): string {
  if (item.title.trim()) return item.title.trim();
  const line = firstLine(item.body);
  if (!line) return 'Untitled';
  return line.length > 72 ? line.slice(0, 70).trimEnd() + '…' : line;
}

/** The body without the line already shown as the title (when the title is derived). */
export function bodyAfterTitle(item: Pick<ContentItem, 'title' | 'body'>): string {
  if (item.title.trim()) return item.body;
  const lines = item.body.split('\n');
  const first = lines.findIndex((l) => l.trim().length > 0);
  if (first < 0 || lines[first].trim().length > 72) return item.body;
  return lines.slice(first + 1).join('\n');
}

export function excerpt(body: string, max = 220): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1).trimEnd() + '…' : flat;
}

export function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export type SplitMode = 'none' | 'separator' | 'blank-lines';

/**
 * Split a block of text into several pieces.
 * - separator: lines containing only ---, ***, ~~~ or ###
 * - blank-lines: two or more consecutive blank lines
 * Text inside each piece is kept exactly (only outer blank lines trimmed).
 */
export function splitPieces(text: string, mode: SplitMode): string[] {
  const norm = text.replace(/\r\n/g, '\n');
  let parts: string[];
  if (mode === 'separator') parts = norm.split(/\n[ \t]*(?:-{3,}|\*{3,}|~{3,}|#{3,})[ \t]*\n/);
  else if (mode === 'blank-lines') parts = norm.split(/\n[ \t]*\n(?:[ \t]*\n)+/);
  else parts = [norm];
  return parts.map(trimBlankEdges).filter((p) => p.trim().length > 0);
}

/** Pull a markdown "# Title" from the first line, if present. */
export function extractMarkdownTitle(text: string): { title: string; body: string } {
  const m = text.match(/^\s*#\s+(.+)\n/);
  if (!m) return { title: '', body: text };
  return { title: m[1].trim(), body: trimBlankEdges(text.slice(m[0].length)) };
}

const STOPWORDS = new Set(
  `a about above after again against all am an and any are as at be because been before being below between both but by
can could did do does doing down during each few for from further had has have having he her here hers herself him himself his
how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out
over own same she should so some such than that the their theirs them themselves then there these they this those through to too
under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves
like one even still let us also into onto upon yet ever never always every much many thing things something nothing anything
again back way ways just only really little may might must shall said say says go goes going gone come comes came make made
know knew known see seen get got want wanted s t don doesn didn isn wasn ll re ve d m im youre`.split(/\s+/),
);

/** Significant lowercase words, light-stemmed, for similarity & theme work. */
export function keywords(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  const out: string[] = [];
  for (let w of words) {
    w = w.replace(/'s$/, '').replace(/'/g, '');
    if (w.length < 3 || STOPWORDS.has(w)) continue;
    out.push(stem(w));
  }
  return out;
}

export function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('es') && /(sh|ch|x|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  return w;
}

/** Collision-safe id that also works outside secure contexts (e.g. LAN http). */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
