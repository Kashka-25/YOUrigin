// Portfolios: curated, standalone pages made from chosen Projects, Works and
// pieces, for sending to an employer, collaborator, investor or client.
//
// A portfolio is a private draft on this device (synced encrypted like the
// rest of the library) until it is published. Publishing sends one snapshot:
// exactly what `buildSnapshot` returns, nothing else. The snapshot is built
// only from what the editor shows, so the preview is what a visitor sees.
//
// Portfolios are separate from YOU Showcase on purpose: nothing here reads or
// writes Showcase data, and choosing a piece for a portfolio never shares it
// anywhere else.
//
// Pure rules only (no database, no network), so they can be tested.

import type { Book, BookEntry, ContentItem, Project, Section, Syncable } from '../domain/types';
import { PROJECT_KIND_META, TYPE_LABEL, projectKind } from '../domain/constants';
import { bodyAfterTitle, displayTitle, excerpt, newId } from '../domain/text';

// ---- types ------------------------------------------------------------------

export type PortfolioPurpose = 'professional' | 'creative' | 'business' | 'personal';
export type PortfolioTheme = 'studio' | 'gallery' | 'venture' | 'journal';
/** How a published portfolio is reached. Every option needs the link; none needs an account. */
export type PortfolioVisibility = 'unlisted' | 'password' | 'public';
export type PortfolioItemKind = 'project' | 'work' | 'piece' | 'heading';
export type TextMode = 'none' | 'excerpt' | 'full';
export type ImageChoice = 'default' | 'none';
export type ContactKind = 'email' | 'website' | 'linkedin' | 'github' | 'instagram' | 'cv' | 'other';

export interface PortfolioItem {
  id: string;
  kind: PortfolioItemKind;
  /** The Project, Work or piece it shows ('' for headings). */
  sourceId: string;
  /** Shown instead of the source's title; '' uses the source's title. For headings, the heading. */
  heading: string;
  /** Written for this portfolio. Only this is shown, never the source's own notes. */
  description: string;
  /** How much of the writing to show. Projects have no writing of their own. */
  textMode: TextMode;
  image: ImageChoice;
  /** Describes the picture for people who can't see it. */
  alt: string;
  /** Optional live destination for a Project card; only HTTPS links are published. */
  destinationUrl?: string;
  /** Optional visual width in the portfolio canvas. */
  layoutSpan?: 1 | 2;
  /** Crop used when this item includes an image. */
  imageShape?: 'natural' | 'square' | 'portrait' | 'landscape';
}

export interface ContactLink {
  kind: ContactKind;
  label: string;
  /** An https address, or an email address for kind 'email'. */
  value: string;
}

/** Set once published (phase 2). A draft has none. */
export interface PortfolioPublication {
  remoteId: string;
  /** The secret part of the link. Replacing it ends the old link. */
  shareToken: string;
  status: 'live' | 'disabled';
  visibility: PortfolioVisibility;
  publishedAt: number;
  /** snapshotHash of what was published, to tell when the draft has moved on. */
  publishedHash: string;
  expiresAt: number | null;
  passwordSet: boolean;
}

export interface Portfolio extends Syncable {
  title: string;
  purpose: PortfolioPurpose;
  theme: PortfolioTheme;
  intro: string;
  /** The name shown at the top, as you want to be introduced. */
  ownerName: string;
  /** One line under the name, e.g. "Writer and designer, Bristol". */
  ownerLine: string;
  contactLinks: ContactLink[];
  items: PortfolioItem[];
  /** The sharing option chosen for publishing. New portfolios default to unlisted. */
  visibility: PortfolioVisibility;
  /** Optional end date for the link (ms), chosen before publishing. */
  expiresAt: number | null;
  /** null: a private draft that has never been published. */
  publication: PortfolioPublication | null;
  archived: boolean;
  /** The page's background colour (#rrggbb). Missing: the look's own. */
  background?: string | null;
  /** Set when the draft was built from a starter file, so importing it again extends this one. */
  starterKey?: string;
}

// ---- labels and presets -------------------------------------------------------

export const LIMITS = {
  title: 120,
  intro: 4000,
  ownerName: 80,
  ownerLine: 160,
  heading: 120,
  description: 2000,
  alt: 300,
  items: 60,
  links: 8,
  linkLabel: 40,
  excerpt: 420,
  /** Characters of writing per item when the full text is shown. */
  fullText: 60_000,
} as const;

export interface PurposeMeta {
  label: string;
  blurb: string;
  theme: PortfolioTheme;
  title: string;
  introHint: string;
  /** The first heading a new portfolio of this kind starts with. */
  firstHeading: string;
  links: ContactKind[];
}

export const PURPOSES: Record<PortfolioPurpose, PurposeMeta> = {
  professional: {
    label: 'Professional',
    blurb: 'For employers and recruiters: your experience and strongest work, clearly laid out.',
    theme: 'studio',
    title: 'Selected work',
    introHint: 'Who you are, what you do best and the kind of role or work you are looking for.',
    firstHeading: 'Selected work',
    links: ['email', 'linkedin', 'cv', 'website'],
  },
  creative: {
    label: 'Creative',
    blurb: 'For galleries, publishers and collaborators: your art and writing given room to breathe.',
    theme: 'gallery',
    title: 'Portfolio',
    introHint: 'What you make, what draws you to it and what you are working on now.',
    firstHeading: 'Work',
    links: ['email', 'instagram', 'website'],
  },
  business: {
    label: 'Entrepreneurial',
    blurb: 'For investors, partners and clients: the ventures you have built and where they are going.',
    theme: 'venture',
    title: 'Ventures',
    introHint: 'The problems you work on, what you have built so far and what you are looking for.',
    firstHeading: 'Ventures',
    links: ['email', 'website', 'linkedin'],
  },
  personal: {
    label: 'Personal projects',
    blurb: 'For friends and fellow makers: the things you build and explore for the love of it.',
    theme: 'journal',
    title: 'Things I make',
    introHint: 'A few words about you and what these projects mean to you.',
    firstHeading: 'Projects',
    links: ['website', 'instagram'],
  },
};

export const PURPOSE_ORDER: PortfolioPurpose[] = ['professional', 'creative', 'business', 'personal'];

export const THEMES: Record<PortfolioTheme, { label: string; blurb: string }> = {
  studio: { label: 'Studio', blurb: 'Clean and modern' },
  gallery: { label: 'Gallery', blurb: 'Quiet, image-led' },
  venture: { label: 'Venture', blurb: 'Bold and crisp' },
  journal: { label: 'Journal', blurb: 'Warm and bookish' },
};

export const VISIBILITY: Record<PortfolioVisibility, { label: string; blurb: string }> = {
  unlisted: { label: 'Unlisted', blurb: 'Only people you send the link to can open it. Search engines are asked not to list it.' },
  password: { label: 'Password', blurb: 'The link and a password you share separately. Search engines are asked not to list it.' },
  public: { label: 'Public', blurb: 'Anyone with the link can open it, and search engines may list it.' },
};

export const CONTACT_KINDS: Record<ContactKind, string> = {
  email: 'Email',
  website: 'Website',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  instagram: 'Instagram',
  cv: 'CV / résumé',
  other: 'Link',
};

export const TEXT_MODES: Record<TextMode, string> = {
  none: 'No text',
  excerpt: 'An excerpt',
  full: 'The full text',
};

// ---- background -------------------------------------------------------------

/** Quiet, warm backgrounds to choose from; any other colour can be picked too. */
export const BACKGROUNDS: { value: string; label: string }[] = [
  { value: '#fbf8f2', label: 'Ivory' },
  { value: '#f4ede1', label: 'Linen' },
  { value: '#efe2d6', label: 'Clay' },
  { value: '#f3e4e1', label: 'Blush' },
  { value: '#e6eadf', label: 'Sage' },
  { value: '#e5eaee', label: 'Mist' },
  { value: '#1f2a24', label: 'Forest' },
  { value: '#1d1a22', label: 'Night' },
];

export function cleanBackground(v: unknown): string | null {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
}

/** 0 (black) to 1 (white), as the eye sees it. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isDarkBackground(hex: string): boolean {
  return luminance(hex) < 0.18;
}

/**
 * The page colours for a chosen background. Cards, lines and text follow it,
 * so a dark background gets light text and every choice stays readable.
 */
export function backgroundStyle(background: string | null | undefined): Record<string, string> | undefined {
  const bg = cleanBackground(background);
  if (!bg) return undefined;
  const base = {
    '--pf-bg': bg,
    '--pf-hero-bg': bg,
  };
  if (isDarkBackground(bg)) {
    return {
      ...base,
      '--pf-surface': `color-mix(in srgb, ${bg} 88%, #ffffff)`,
      '--pf-ink': '#f4efe7',
      '--pf-ink-2': '#d9d1c5',
      '--pf-muted': '#aaa197',
      '--pf-line': `color-mix(in srgb, ${bg} 78%, #ffffff)`,
      '--pf-accent': '#e2b97f',
      '--pf-hero-ink': '#f4efe7',
      '--pf-hero-muted': '#c4bbb0',
    };
  }
  return {
    ...base,
    '--pf-surface': `color-mix(in srgb, ${bg} 55%, #ffffff)`,
    '--pf-line': `color-mix(in srgb, ${bg} 82%, #000000)`,
    '--pf-hero-ink': 'var(--pf-ink)',
    '--pf-hero-muted': 'var(--pf-muted)',
  };
}

// ---- creating ---------------------------------------------------------------

export function newPortfolio(purpose: PortfolioPurpose, ownerName = '', now = Date.now()): Portfolio {
  const meta = PURPOSES[purpose];
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    title: meta.title,
    purpose,
    theme: meta.theme,
    intro: '',
    ownerName: ownerName.trim().slice(0, LIMITS.ownerName),
    ownerLine: '',
    contactLinks: [],
    items: [headingItem(meta.firstHeading)],
    visibility: 'unlisted',
    expiresAt: null,
    publication: null,
    archived: false,
  };
}

function baseItem(kind: PortfolioItemKind, sourceId: string): PortfolioItem {
  return { id: newId(), kind, sourceId, heading: '', description: '', textMode: 'none', image: 'default', alt: '', layoutSpan: 1, imageShape: 'natural' };
}

export function headingItem(text: string): PortfolioItem {
  return { ...baseItem('heading', ''), heading: text.slice(0, LIMITS.heading) };
}

/** The description starts from the Project's own, so you can see and edit what will be shown. */
export function itemFromProject(p: Project): PortfolioItem {
  return { ...baseItem('project', p.id), description: p.description.slice(0, LIMITS.description) };
}

export function itemFromWork(b: Book): PortfolioItem {
  return { ...baseItem('work', b.id), description: b.description.slice(0, LIMITS.description) };
}

export function itemFromPiece(c: ContentItem): PortfolioItem {
  const image = c.type === 'image';
  return { ...baseItem('piece', c.id), textMode: image ? 'none' : 'excerpt' };
}

/** Only your own pictures: inspiration images are other people's work kept for reference. */
export function canAddPiece(c: ContentItem): boolean {
  if (c.deletedAt) return false;
  if (c.type === 'image') return !!c.assetId && !c.inspiration;
  return c.body.trim().length > 0;
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// ---- the snapshot: everything a visitor can see -------------------------------

export interface PortfolioSources {
  projects: Map<string, Project>;
  works: Map<string, Book>;
  content: Map<string, ContentItem>;
  sections: Section[];
  entries: BookEntry[];
}

export type TextBlock = { kind: 'section' | 'title' | 'body'; text: string };

export interface SnapshotImage {
  /** Local asset id. Publishing uploads a display copy and swaps this for its storage path. On the public page, the picture's link. */
  ref: string;
  alt: string;
  /** Known once published; lets the page keep its layout steady while pictures load. */
  width?: number;
  height?: number;
}

export interface SnapshotItem {
  key: string;
  kind: Exclude<PortfolioItemKind, 'heading'>;
  /** A short label above the title, e.g. "Album" or "Poem". */
  label: string;
  title: string;
  subtitle: string;
  description: string;
  /** Small facts shown under the title, e.g. medium and year for artwork. */
  meta: string[];
  text: TextBlock[];
  textMode: TextMode;
  /** The full text was longer than the limit and was cut. */
  truncated: boolean;
  image: SnapshotImage | null;
  /** Safe external destination for a Project card. */
  destinationUrl?: string | null;
  layoutSpan?: 1 | 2;
  imageShape?: 'natural' | 'square' | 'portrait' | 'landscape';
}

export interface SnapshotSection {
  key: string;
  heading: string;
  description: string;
  items: SnapshotItem[];
}

export interface ContactSnapshot {
  kind: ContactKind;
  label: string;
  href: string;
}

export interface PortfolioSnapshot {
  version: 1;
  title: string;
  purpose: PortfolioPurpose;
  theme: PortfolioTheme;
  ownerName: string;
  ownerLine: string;
  intro: string;
  contact: ContactSnapshot[];
  sections: SnapshotSection[];
  /** #rrggbb, or missing for the look's own background. */
  background?: string | null;
}

export interface ItemProblem {
  itemId: string;
  message: string;
}

/** The source behind an item, or a plain reason it can't be shown. */
export function resolveItem(
  item: PortfolioItem,
  src: PortfolioSources,
): { project?: Project; work?: Book; piece?: ContentItem; problem?: string } {
  if (item.kind === 'heading') return {};
  if (item.kind === 'project') {
    const project = src.projects.get(item.sourceId);
    return project ? { project } : { problem: 'This Project no longer exists.' };
  }
  if (item.kind === 'work') {
    const work = src.works.get(item.sourceId);
    return work ? { work } : { problem: 'This Work no longer exists.' };
  }
  const piece = src.content.get(item.sourceId);
  if (!piece) return { problem: 'This piece no longer exists.' };
  if (piece.deletedAt) return { problem: 'This piece is in the Trash.' };
  if (piece.type === 'image' && piece.inspiration) return { problem: 'Inspiration images are other people’s work and can’t be shown.' };
  if (piece.type === 'image' && !piece.assetId) return { problem: 'This picture is missing from this device.' };
  return { piece };
}

function capBlocks(blocks: TextBlock[], max: number): { text: TextBlock[]; truncated: boolean } {
  const out: TextBlock[] = [];
  let used = 0;
  for (const b of blocks) {
    const room = max - used;
    if (room <= 0) return { text: out, truncated: true };
    if (b.text.length > room) {
      out.push({ ...b, text: `${b.text.slice(0, room).trimEnd()}…` });
      return { text: out, truncated: true };
    }
    out.push(b);
    used += b.text.length;
  }
  return { text: out, truncated: false };
}

/** The written pieces placed in a Work, in reading order (sections, then their pieces). Tray pieces are left out. */
export function workReadingOrder(work: Book, src: PortfolioSources): { section: Section; pieces: ContentItem[] }[] {
  const sections = src.sections.filter((s) => s.bookId === work.id).sort((a, b) => a.order - b.order);
  return sections.map((section) => ({
    section,
    pieces: src.entries
      .filter((e) => e.bookId === work.id && e.sectionId === section.id)
      .sort((a, b) => a.order - b.order)
      .map((e) => src.content.get(e.contentId))
      .filter((c): c is ContentItem => !!c && !c.deletedAt && c.type !== 'image' && c.body.trim().length > 0),
  }));
}

function workText(work: Book, mode: TextMode, src: PortfolioSources): { text: TextBlock[]; truncated: boolean } {
  if (mode === 'none') return { text: [], truncated: false };
  const order = workReadingOrder(work, src);
  if (mode === 'excerpt') {
    const first = order.flatMap((s) => s.pieces)[0];
    if (!first) return { text: [], truncated: false };
    return { text: [{ kind: 'body', text: excerpt(bodyAfterTitle(first), LIMITS.excerpt) }], truncated: false };
  }
  const blocks: TextBlock[] = [];
  const titledSections = order.filter((s) => s.pieces.length).length > 1;
  for (const { section, pieces } of order) {
    if (!pieces.length) continue;
    if (titledSections && section.title.trim()) blocks.push({ kind: 'section', text: section.title.trim() });
    for (const p of pieces) {
      blocks.push({ kind: 'title', text: displayTitle(p) });
      blocks.push({ kind: 'body', text: bodyAfterTitle(p).replace(/^\n+/, '').trimEnd() });
    }
  }
  return capBlocks(blocks, LIMITS.fullText);
}

function pieceText(piece: ContentItem, mode: TextMode): { text: TextBlock[]; truncated: boolean } {
  if (mode === 'none') return { text: [], truncated: false };
  // An image's text is its caption.
  const body = (piece.type === 'image' ? piece.body : bodyAfterTitle(piece)).replace(/^\n+/, '').trimEnd();
  if (!body.trim()) return { text: [], truncated: false };
  if (mode === 'excerpt') {
    const short = excerpt(body, LIMITS.excerpt);
    return { text: [{ kind: 'body', text: short }], truncated: false };
  }
  return capBlocks([{ kind: 'body', text: body }], LIMITS.fullText);
}

function artMeta(piece: ContentItem): string[] {
  if (piece.type !== 'image' || !piece.art) return [];
  return [piece.art.medium, piece.art.size, piece.art.madeOn].map((s) => (s ?? '').trim()).filter(Boolean);
}

/** The picture an item shows: chosen per item, from the source's own artwork. */
function itemImage(item: PortfolioItem, r: ReturnType<typeof resolveItem>): SnapshotImage | null {
  if (item.image === 'none') return null;
  const ref = r.piece?.type === 'image' ? r.piece.assetId : r.work?.coverAssetId ?? r.project?.coverAssetId;
  return ref ? { ref, alt: item.alt.trim().slice(0, LIMITS.alt) } : null;
}

function snapshotItem(item: PortfolioItem, src: PortfolioSources): SnapshotItem | null {
  const r = resolveItem(item, src);
  if (r.problem) return null;
  const custom = item.heading.trim();
  const description = item.description.trim().slice(0, LIMITS.description);
  const image = itemImage(item, r);
  if (r.project) {
    return {
      key: item.id, kind: 'project', label: 'Project',
      title: custom || r.project.title, subtitle: '', description, meta: [],
      text: [], textMode: 'none', truncated: false, image,
      destinationUrl: normalizeHttps(item.destinationUrl ?? ''),
      layoutSpan: item.layoutSpan ?? 1, imageShape: item.imageShape ?? 'natural',
    };
  }
  if (r.work) {
    const t = workText(r.work, item.textMode, src);
    return {
      key: item.id, kind: 'work', label: PROJECT_KIND_META[projectKind(r.work)].label,
      title: custom || r.work.title || 'Untitled', subtitle: r.work.subtitle.trim(), description, meta: [],
      text: t.text, textMode: item.textMode, truncated: t.truncated, image,
      layoutSpan: item.layoutSpan ?? 1, imageShape: item.imageShape ?? 'natural',
    };
  }
  const piece = r.piece!;
  const t = pieceText(piece, item.textMode);
  return {
    key: item.id, kind: 'piece', label: piece.type === 'image' ? 'Artwork' : TYPE_LABEL[piece.type],
    title: custom || (piece.type === 'image' && !piece.title.trim() ? 'Untitled' : displayTitle(piece)), subtitle: '', description,
    meta: artMeta(piece), text: t.text, textMode: item.textMode, truncated: t.truncated, image,
    layoutSpan: item.layoutSpan ?? 1, imageShape: item.imageShape ?? 'natural',
  };
}

export function contactHref(link: ContactLink): string | null {
  const v = link.value.trim();
  if (!v) return null;
  if (link.kind === 'email') {
    return /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i.test(v) ? `mailto:${v}` : null;
  }
  return normalizeHttps(v);
}

/** Adds https:// when missing. Only https links are allowed; anything else is null. */
export function normalizeHttps(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Everything a visitor will see, and nothing else. Items whose source is gone
 * are left out and reported, so the preview never shows what can't be published.
 */
export function buildSnapshot(p: Portfolio, src: PortfolioSources): { snapshot: PortfolioSnapshot; problems: ItemProblem[] } {
  const problems: ItemProblem[] = [];
  const sections: SnapshotSection[] = [];
  let current: SnapshotSection | null = null;
  for (const item of p.items) {
    if (item.kind === 'heading') {
      current = { key: item.id, heading: item.heading.trim().slice(0, LIMITS.heading), description: item.description.trim().slice(0, LIMITS.description), items: [] };
      sections.push(current);
      continue;
    }
    const r = resolveItem(item, src);
    if (r.problem) {
      problems.push({ itemId: item.id, message: r.problem });
      continue;
    }
    const s = snapshotItem(item, src);
    if (!s) continue;
    if (!current) {
      current = { key: 'start', heading: '', description: '', items: [] };
      sections.push(current);
    }
    current.items.push(s);
  }
  const contact = p.contactLinks
    .map((l) => ({ kind: l.kind, label: l.label.trim().slice(0, LIMITS.linkLabel) || CONTACT_KINDS[l.kind], href: contactHref(l) }))
    .filter((l): l is ContactSnapshot => !!l.href);
  return {
    snapshot: {
      version: 1,
      title: p.title.trim().slice(0, LIMITS.title),
      purpose: p.purpose,
      theme: p.theme,
      ownerName: p.ownerName.trim().slice(0, LIMITS.ownerName),
      ownerLine: p.ownerLine.trim().slice(0, LIMITS.ownerLine),
      intro: p.intro.trim().slice(0, LIMITS.intro),
      contact,
      // Only when chosen, so pages that never had one keep the same fingerprint.
      ...(cleanBackground(p.background) ? { background: cleanBackground(p.background) } : {}),
      // Headings with nothing under them aren't shown.
      sections: sections.filter((s) => s.items.length || s.description.trim()),
    },
    problems,
  };
}

export function snapshotItemCount(s: PortfolioSnapshot): number {
  return s.sections.reduce((n, sec) => n + sec.items.length, 0);
}

/** A short fingerprint of a snapshot (FNV-1a), to tell when the draft differs from what was published. */
export function snapshotHash(s: PortfolioSnapshot): string {
  const text = JSON.stringify(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ---- checks -----------------------------------------------------------------

/** Problems with the draft itself, in plain words. Empty means it's fine to keep. */
export function validatePortfolio(p: Portfolio): string[] {
  const out: string[] = [];
  if (p.title.length > LIMITS.title) out.push(`The title can be up to ${LIMITS.title} characters.`);
  if (p.intro.length > LIMITS.intro) out.push(`The introduction can be up to ${LIMITS.intro} characters.`);
  if (p.ownerName.length > LIMITS.ownerName) out.push(`Your name can be up to ${LIMITS.ownerName} characters.`);
  if (p.ownerLine.length > LIMITS.ownerLine) out.push(`The line under your name can be up to ${LIMITS.ownerLine} characters.`);
  const shown = p.items.filter((i) => i.kind !== 'heading').length;
  if (shown > LIMITS.items) out.push(`A portfolio can show up to ${LIMITS.items} items.`);
  if (p.contactLinks.length > LIMITS.links) out.push(`Up to ${LIMITS.links} contact links.`);
  p.contactLinks.forEach((l, i) => {
    if (!contactHref(l)) {
      out.push(l.kind === 'email' ? `Contact ${i + 1} needs a valid email address.` : `Contact ${i + 1} must be a web address starting https://.`);
    }
  });
  p.items.forEach((item, i) => {
    if (item.description.length > LIMITS.description) out.push(`Item ${i + 1}'s description can be up to ${LIMITS.description} characters.`);
    if (item.heading.length > LIMITS.heading) out.push(`Item ${i + 1}'s title can be up to ${LIMITS.heading} characters.`);
  });
  return out;
}

/** What stops publishing, on top of the draft checks. */
export function publishBlockers(p: Portfolio, built: { snapshot: PortfolioSnapshot; problems: ItemProblem[] }): string[] {
  const out = validatePortfolio(p);
  if (!p.title.trim()) out.push('Give the portfolio a title.');
  if (!p.ownerName.trim()) out.push('Add the name you want to be introduced by.');
  if (!snapshotItemCount(built.snapshot)) out.push('Add at least one Project, Work or piece.');
  if (built.problems.length) out.push('Remove or replace the items that can no longer be shown.');
  if (p.expiresAt !== null && p.expiresAt <= Date.now()) out.push('The end date for the link has already passed.');
  return out;
}

export type PortfolioState = 'draft' | 'live' | 'changed' | 'disabled' | 'expired';

export function portfolioState(p: Portfolio, currentHash: string | null, now = Date.now()): PortfolioState {
  const pub = p.publication;
  if (!pub) return 'draft';
  if (pub.status === 'disabled') return 'disabled';
  if (pub.expiresAt !== null && pub.expiresAt <= now) return 'expired';
  if (currentHash !== null && currentHash !== pub.publishedHash) return 'changed';
  return 'live';
}

export const STATE_LABELS: Record<PortfolioState, string> = {
  draft: 'Private draft',
  live: 'Published',
  changed: 'Published, with changes not yet published',
  disabled: 'Link turned off',
  expired: 'Link expired',
};
