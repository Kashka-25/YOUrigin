import type { ContentItem, ContentType, Status } from './types';
import { TYPE_LABEL } from './constants';
import { displayTitle, normaliseTagName } from './text';

/** Lookup tables the UI builds once from the live database. */
export interface LibraryContext {
  tagName: Map<string, string>;
  tagIdByName: Map<string, string>;
  /** contentId -> book ids */
  booksOf: Map<string, Set<string>>;
  /** contentId -> collection ids */
  collectionsOf: Map<string, Set<string>>;
  bookTitle: Map<string, string>;
  collectionName: Map<string, string>;
}

export interface ParsedQuery {
  text: string[];
  tags: string[];
}

/** "#water ocean shore" -> tags [water], text [ocean, shore]. */
export function parseQuery(q: string): ParsedQuery {
  const text: string[] = [];
  const tags: string[] = [];
  for (const tok of q.trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok.startsWith('#') && tok.length > 1) tags.push(normaliseTagName(tok));
    else text.push(tok.toLowerCase());
  }
  return { text, tags };
}

export function isOrphan(item: ContentItem, ctx: LibraryContext): boolean {
  return !(ctx.booksOf.get(item.id)?.size || ctx.collectionsOf.get(item.id)?.size);
}

function haystack(item: ContentItem, ctx: LibraryContext): string {
  const parts = [item.title, item.body, TYPE_LABEL[item.type], item.notes];
  for (const t of item.tagIds) parts.push('#' + (ctx.tagName.get(t) ?? ''));
  for (const b of ctx.booksOf.get(item.id) ?? []) parts.push(ctx.bookTitle.get(b) ?? '');
  for (const c of ctx.collectionsOf.get(item.id) ?? []) parts.push(ctx.collectionName.get(c) ?? '');
  return parts.join('\n').toLowerCase();
}

export function matchesQuery(item: ContentItem, q: ParsedQuery, ctx: LibraryContext): boolean {
  for (const tag of q.tags) {
    // Tag tokens match a tag exactly, or a tag that starts with the token while typing.
    const ok = item.tagIds.some((id) => {
      const n = ctx.tagName.get(id) ?? '';
      return n === tag || n.startsWith(tag);
    });
    if (!ok) return false;
  }
  if (q.text.length === 0) return true;
  const hay = haystack(item, ctx);
  return q.text.every((t) => hay.includes(t));
}

export type SortKey = 'updated' | 'created' | 'title' | 'status';

export interface LibraryFilters {
  query: string;
  statuses: Status[];
  types: ContentType[];
  /** Intersection: item must carry every tag. */
  tagIds: string[];
  bookId: string | null;
  collectionId: string | null;
  orphansOnly: boolean;
  showArchived: boolean;
  sort: SortKey;
}

export const EMPTY_FILTERS: LibraryFilters = {
  query: '',
  statuses: [],
  types: [],
  tagIds: [],
  bookId: null,
  collectionId: null,
  orphansOnly: false,
  showArchived: false,
  sort: 'updated',
};

const STATUS_ORDER: Record<Status, number> = { seed: 0, developing: 1, polished: 2 };

export function filterItems(items: ContentItem[], f: LibraryFilters, ctx: LibraryContext): ContentItem[] {
  const q = parseQuery(f.query);
  const out = items.filter((item) => {
    if (item.deletedAt) return false;
    if (item.archived !== f.showArchived) return false;
    if (f.statuses.length && !f.statuses.includes(item.status)) return false;
    if (f.types.length && !f.types.includes(item.type)) return false;
    if (f.tagIds.length && !f.tagIds.every((t) => item.tagIds.includes(t))) return false;
    if (f.bookId && !ctx.booksOf.get(item.id)?.has(f.bookId)) return false;
    if (f.collectionId && !ctx.collectionsOf.get(item.id)?.has(f.collectionId)) return false;
    if (f.orphansOnly && !isOrphan(item, ctx)) return false;
    return matchesQuery(item, q, ctx);
  });
  const sorters: Record<SortKey, (a: ContentItem, b: ContentItem) => number> = {
    updated: (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt,
    created: (a, b) => b.createdAt - a.createdAt,
    title: (a, b) => displayTitle(a).localeCompare(displayTitle(b)),
    status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.updatedAt - a.updatedAt,
  };
  return out.sort(sorters[f.sort]);
}
