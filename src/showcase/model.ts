// Showcase: sharing a piece from YOUrigin to be displayed on YOU, credited,
// with the artist's links for how to support them. Everything in YOUrigin
// stays private and encrypted; a share is a separate, deliberate public copy
// that waits for approval before anyone sees it.
//
// Pure rules only (no network), so they can be tested. Calls live in api.ts.

import type { ContentItem } from '../domain/types';
import { displayTitle } from '../domain/text';

export type ShareKind = 'image' | 'words';
export type Placement = 'home_background' | 'featured_words' | 'gallery';
export type SaveMode = 'free' | 'contribution';
export type ShareStatus = 'waiting' | 'live' | 'declined' | 'removed';
export type LinkKind = 'kofi' | 'paypal' | 'patreon' | 'instagram' | 'website' | 'other';

export const PLACEMENT_LABELS: Record<Placement, string> = {
  home_background: 'YOU home background',
  featured_words: 'Featured words card',
  gallery: 'Showcase gallery',
};

export const LINK_KINDS: Record<LinkKind, string> = {
  kofi: 'Ko-fi',
  paypal: 'PayPal',
  patreon: 'Patreon',
  instagram: 'Instagram',
  website: 'Website',
  other: 'Other link',
};

export const STATUS_LABELS: Record<ShareStatus, string> = {
  waiting: 'Waiting for approval',
  live: 'Live on YOU',
  declined: 'Not approved',
  removed: 'Taken down',
};

export const LIMITS = { title: 120, body: 4000, alt: 300, amount: 40, name: 60, bio: 280, links: 8, credits: 6 };

/** Long edge of the copy YOU shows. The original never leaves this device. */
export const DISPLAY_MAX_EDGE = 1600;
/** The bucket refuses anything bigger. */
export const DISPLAY_MAX_BYTES = 2 * 1024 * 1024;

export interface ArtistLink {
  kind: LinkKind;
  label: string;
  url: string;
}

export interface ArtistProfile {
  displayName: string;
  bio: string;
  links: ArtistLink[];
  kronkHandle: string;
}

export interface CreditDraft {
  name: string;
  url: string;
  kronkHandle: string;
}

export interface ShareDraft {
  kind: ShareKind;
  title: string;
  /** The words (written work) or the caption (image). */
  body: string;
  altText: string;
  placements: Placement[];
  saveMode: SaveMode;
  suggestedAmount: string;
  credits: CreditDraft[];
  rights: boolean;
}

/** Images share as images; any piece with words shares as written work. */
export function shareKindFor(item: Pick<ContentItem, 'type' | 'assetId' | 'body'>): ShareKind | null {
  if (item.type === 'image') return item.assetId ? 'image' : null;
  return item.body.trim() ? 'words' : null;
}

export function placementsFor(kind: ShareKind): Placement[] {
  return kind === 'image' ? ['home_background', 'gallery'] : ['featured_words', 'gallery'];
}

export function newDraft(item: ContentItem): ShareDraft | null {
  const kind = shareKindFor(item);
  if (!kind) return null;
  return {
    kind,
    title: (item.title || (kind === 'words' ? displayTitle(item) : '')).slice(0, LIMITS.title),
    body: item.body.slice(0, LIMITS.body),
    altText: '',
    placements: placementsFor(kind),
    saveMode: 'free',
    suggestedAmount: '',
    credits: [],
    rights: false,
  };
}

/** "ana@kronk.social" or "@ana@kronk.social" → "@ana@kronk.social"; "" stays ""; anything else null. */
export function normalizeHandle(raw: string): string | null {
  const s = raw.trim();
  if (!s) return '';
  const m = s.replace(/^@/, '').match(/^([a-z0-9_]{1,30})@([a-z0-9.-]+\.[a-z]{2,})$/i);
  return m ? `@${m[1]}@${m[2].toLowerCase()}` : null;
}

/** Adds https:// when it's missing. Only https links are allowed; "" stays "". */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Problems that stop a share, in plain words. Empty means it can go. */
export function validateShare(d: ShareDraft): string[] {
  const out: string[] = [];
  if (!d.rights) out.push('Tick the box to say you made this (or have permission).');
  const allowed = placementsFor(d.kind);
  if (!d.placements.length) out.push('Choose at least one place it can appear.');
  if (d.placements.some((p) => !allowed.includes(p))) out.push('That place is not available for this kind of piece.');
  if (d.kind === 'words' && !d.body.trim()) out.push('There are no words to share.');
  if (d.body.length > LIMITS.body) out.push(`Written pieces can be up to ${LIMITS.body} characters.`);
  if (d.title.length > LIMITS.title) out.push(`The title can be up to ${LIMITS.title} characters.`);
  if (d.altText.length > LIMITS.alt) out.push(`The description can be up to ${LIMITS.alt} characters.`);
  if (d.suggestedAmount.length > LIMITS.amount) out.push(`The suggested amount can be up to ${LIMITS.amount} characters.`);
  if (d.credits.length > LIMITS.credits) out.push(`Up to ${LIMITS.credits} "offered by" credits.`);
  d.credits.forEach((c, i) => {
    const n = i + 1;
    if (!c.name.trim()) out.push(`Credit ${n} needs a name.`);
    if (c.name.trim().length > LIMITS.name) out.push(`Credit ${n}'s name is too long.`);
    if (normalizeUrl(c.url) === null) out.push(`Credit ${n}'s link must be a web address starting https://.`);
    if (normalizeHandle(c.kronkHandle) === null) out.push(`Credit ${n}'s Kronk handle should look like @name@server.`);
  });
  return out;
}

export function validateProfile(p: ArtistProfile): string[] {
  const out: string[] = [];
  if (!p.displayName.trim()) out.push('Add the name you want to be credited as.');
  if (p.displayName.trim().length > LIMITS.name) out.push(`Your name can be up to ${LIMITS.name} characters.`);
  if (p.bio.length > LIMITS.bio) out.push(`The line about you can be up to ${LIMITS.bio} characters.`);
  if (p.links.length > LIMITS.links) out.push(`Up to ${LIMITS.links} links.`);
  p.links.forEach((l, i) => {
    if (!normalizeUrl(l.url)) out.push(`Link ${i + 1} must be a web address starting https://.`);
  });
  if (normalizeHandle(p.kronkHandle) === null) out.push('Your Kronk handle should look like @name@server.');
  return out;
}

/** The row stored in showcase_works (user_id and review fields are set by the server). */
export function toWorkRow(d: ShareDraft, sourceId: string, image: { path: string; width: number; height: number } | null) {
  return {
    source_id: sourceId,
    kind: d.kind,
    title: d.title.trim(),
    body: d.body.trim(),
    alt_text: d.kind === 'image' ? d.altText.trim() : '',
    image_path: image?.path ?? null,
    image_width: image?.width || null,
    image_height: image?.height || null,
    placements: d.placements.filter((p) => placementsFor(d.kind).includes(p)),
    save_mode: d.saveMode,
    suggested_amount: d.saveMode === 'contribution' && d.suggestedAmount.trim() ? d.suggestedAmount.trim() : null,
    rights_confirmed_at: new Date().toISOString(),
    submitted_at: new Date().toISOString(),
  };
}

export function toCreditRows(workId: string, credits: CreditDraft[]) {
  return credits.map((c, i) => ({
    work_id: workId,
    role: 'offered_by' as const,
    name: c.name.trim(),
    url: normalizeUrl(c.url) || null,
    kronk_handle: normalizeHandle(c.kronkHandle) || null,
    position: i,
  }));
}

// ---- Kronk ---------------------------------------------------------------
// Kronk is a Mastodon server. Until accounts are linked, sharing there opens
// the artist's own Kronk with a credited post already written (Mastodon's
// standard /share link), so nothing needs a token and the artist posts it.

const KRONK_LIMIT = 500;

export function kronkServer(handle: string): string | null {
  const h = normalizeHandle(handle);
  return h ? h.split('@')[2] : null;
}

/** The post text: the piece, its credits, and how to support the artist. At most 500 characters. */
export function kronkPostText(d: Pick<ShareDraft, 'kind' | 'title' | 'body' | 'credits'>, profile: Pick<ArtistProfile, 'displayName' | 'links'>): string {
  const offered = d.credits
    .filter((c) => c.name.trim())
    .map((c) => normalizeHandle(c.kronkHandle) || c.name.trim());
  const tail = [
    offered.length ? `Offered by ${offered.join(', ')}` : '',
    profile.links.length ? `Support ${profile.displayName.trim() || 'me'}: ${profile.links.map((l) => normalizeUrl(l.url)).filter(Boolean)[0] ?? ''}` : '',
    d.kind === 'image' ? '#art #YOUrigin' : '#poetry #writing #YOUrigin',
  ]
    .filter(Boolean)
    .join('\n');
  const head = d.title.trim();
  const room = KRONK_LIMIT - tail.length - head.length - 4;
  let words = d.body.trim();
  if (words.length > room) words = room > 1 ? `${words.slice(0, room - 1).trimEnd()}…` : '';
  return [head, words, tail].filter(Boolean).join('\n\n').slice(0, KRONK_LIMIT);
}

/** Opens the artist's Kronk with the post written, or null without a handle. */
export function kronkShareUrl(handle: string, text: string): string | null {
  const server = kronkServer(handle);
  return server ? `https://${server}/share?text=${encodeURIComponent(text)}` : null;
}
