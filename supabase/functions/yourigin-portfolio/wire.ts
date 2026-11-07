// The portfolio wire format and the visitor-side security rules, shared by
// the `yourigin-portfolio` Edge Function and the YOUrigin app. No imports
// and no Deno or browser APIs beyond Web Crypto, so it runs (and is tested)
// in Deno, browsers and Node alike.

export const THEMES = ['studio', 'gallery', 'venture', 'journal'] as const;
export const PURPOSES = ['professional', 'creative', 'business', 'personal'] as const;
export const ITEM_KINDS = ['project', 'work', 'piece'] as const;
export const TEXT_MODES = ['none', 'excerpt', 'full'] as const;
export const BLOCK_KINDS = ['section', 'title', 'body'] as const;
export const CONTACT_KINDS = ['email', 'website', 'linkedin', 'github', 'instagram', 'cv', 'other'] as const;

/** A picture as stored with a published snapshot: a path in the private "portfolios" bucket. */
export interface StoredImage {
  path: string;
  width: number;
  height: number;
  alt: string;
}

/** A picture as a visitor receives it: a short-lived signed link. */
export interface PublicImage {
  url: string;
  width: number;
  height: number;
  alt: string;
}

export interface WireItem<I> {
  key: string;
  kind: (typeof ITEM_KINDS)[number];
  label: string;
  title: string;
  subtitle: string;
  description: string;
  meta: string[];
  text: { kind: (typeof BLOCK_KINDS)[number]; text: string }[];
  textMode: (typeof TEXT_MODES)[number];
  truncated: boolean;
  image: I | null;
}

export interface WireSnapshot<I> {
  version: 1;
  title: string;
  purpose: (typeof PURPOSES)[number];
  theme: (typeof THEMES)[number];
  ownerName: string;
  ownerLine: string;
  intro: string;
  contact: { kind: (typeof CONTACT_KINDS)[number]; label: string; href: string }[];
  sections: { key: string; heading: string; items: WireItem<I>[] }[];
}

export type StoredSnapshot = WireSnapshot<StoredImage>;
export type PublicSnapshot = WireSnapshot<PublicImage>;

/** What a visitor's browser gets back. */
export interface VisitorResponse {
  portfolio: PublicSnapshot;
  /** Only public portfolios may be listed by search engines. */
  indexable: boolean;
  /** For password-protected portfolios: lets this browser skip the password for a while. */
  pass?: string;
}

export type VisitorError = 'unavailable' | 'password_required' | 'wrong_password' | 'locked' | 'bad_request' | 'try_later';

export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{24}$/;
export const MAX_ITEMS = 60;
const MAX_SECTIONS = 61;
const MAX_TEXT = 60_000;

// ---- cleaning a stored snapshot before it is shown --------------------------
// The snapshot was written by the owner's app, but the visitor's browser must
// never depend on that: only known fields, known values, safe links and
// pictures from the owner's own folder get through.

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const pick = <T extends readonly string[]>(v: unknown, allowed: T, fallback: T[number]): T[number] =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T[number]) : fallback;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Only https and mailto links are ever shown. */
export function safeHref(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2000) return null;
  if (/^mailto:[^\s@<>()"']+@[^\s@<>()"']+\.[a-z]{2,}$/i.test(v)) return v;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && u.hostname.includes('.') ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * The folder holding one portfolio's pictures: <hash>/<local id>/, where the
 * hash is a one-way digest of the owner's account id and the local id. It
 * matches yourigin_private.portfolio_folder in the database, so storage rules
 * can tie it to its owner while signed links never show the account id.
 */
export async function portfolioFilePrefix(ownerId: string, localId: string): Promise<string> {
  return `${(await sha256Hex(`${ownerId}:${localId}`)).slice(0, 32)}/${localId}/`;
}

/** A picture path, only if it sits directly in this portfolio's own folder. */
export function imagePathFor(prefix: string, path: unknown): string | null {
  if (typeof path !== 'string' || !path.startsWith(prefix)) return null;
  return /^[A-Za-z0-9._-]{1,120}$/.test(path.slice(prefix.length)) && !path.includes('..') ? path : null;
}

function dim(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 10_000 ? Math.round(v) : 0;
}

/** prefix: from portfolioFilePrefix; pictures anywhere else are dropped. */
export function cleanSnapshot(raw: unknown, prefix: string): StoredSnapshot {
  const s = obj(raw);
  let items = 0;
  let textBudget = MAX_TEXT * MAX_ITEMS;
  const sections = arr(s.sections)
    .slice(0, MAX_SECTIONS)
    .map((secRaw, si) => {
      const sec = obj(secRaw);
      const out: WireItem<StoredImage>[] = [];
      for (const itemRaw of arr(sec.items)) {
        if (items >= MAX_ITEMS) break;
        const it = obj(itemRaw);
        const text: WireItem<StoredImage>['text'] = [];
        let used = 0;
        for (const b of arr(it.text)) {
          const block = obj(b);
          const t = str(block.text, Math.min(MAX_TEXT - used, textBudget));
          if (!t) continue;
          used += t.length;
          textBudget -= t.length;
          text.push({ kind: pick(block.kind, BLOCK_KINDS, 'body'), text: t });
          if (used >= MAX_TEXT || textBudget <= 0) break;
        }
        const img = obj(it.image);
        const path = imagePathFor(prefix, img.path);
        out.push({
          key: str(it.key, 64) || `i${items}`,
          kind: pick(it.kind, ITEM_KINDS, 'piece'),
          label: str(it.label, 40),
          title: str(it.title, 200),
          subtitle: str(it.subtitle, 200),
          description: str(it.description, 2000),
          meta: arr(it.meta).slice(0, 6).map((m) => str(m, 80)).filter(Boolean),
          text,
          textMode: pick(it.textMode, TEXT_MODES, 'none'),
          truncated: it.truncated === true,
          image: path ? { path, width: dim(img.width), height: dim(img.height), alt: str(img.alt, 300) } : null,
        });
        items++;
      }
      return { key: str(sec.key, 64) || `s${si}`, heading: str(sec.heading, 120), items: out };
    })
    .filter((sec) => sec.items.length);
  return {
    version: 1,
    title: str(s.title, 120),
    purpose: pick(s.purpose, PURPOSES, 'professional'),
    theme: pick(s.theme, THEMES, 'studio'),
    ownerName: str(s.ownerName, 80),
    ownerLine: str(s.ownerLine, 160),
    intro: str(s.intro, 4000),
    contact: arr(s.contact)
      .slice(0, 8)
      .map((c) => obj(c))
      .map((c) => ({ kind: pick(c.kind, CONTACT_KINDS, 'other'), label: str(c.label, 40), href: safeHref(c.href) }))
      .filter((c): c is PublicSnapshot['contact'][number] => !!c.href && !!c.label),
    sections,
  };
}

export function imagePaths(s: StoredSnapshot): string[] {
  return [...new Set(s.sections.flatMap((sec) => sec.items.map((i) => i.image?.path)).filter((p): p is string => !!p))];
}

/** Swaps each picture's path for its signed link; pictures without one are left out. */
export function withImageUrls(s: StoredSnapshot, urls: Record<string, string>): PublicSnapshot {
  return {
    ...s,
    sections: s.sections.map((sec) => ({
      ...sec,
      items: sec.items.map((i) => {
        const url = i.image ? urls[i.image.path] : undefined;
        return { ...i, image: i.image && url ? { url, width: i.image.width, height: i.image.height, alt: i.image.alt } : null };
      }),
    })),
  };
}

// ---- access passes -----------------------------------------------------------
// After a correct password the visitor's browser gets a pass, so reloading
// doesn't ask again. A pass names the portfolio, its access version and the
// link it was issued for, and is checked against the current row on every
// request: turning the portfolio off, ending or replacing its link, or
// changing or removing its password all end every pass at once, and for good.

export const PASS_HOURS = 12;

export interface PassClaims {
  /** Portfolio id. */
  p: string;
  /** Access version it was issued for (moves on with password changes and turning off). */
  v: number;
  /** Hash of the link token it was issued for. */
  t: string;
  /** Expiry, ms since epoch. */
  e: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Ties a pass to the link it was issued for, without putting the link itself in the pass. */
export async function tokenTag(shareToken: string): Promise<string> {
  return (await sha256Hex(`yourigin-portfolio-link:${shareToken}`)).slice(0, 32);
}

export async function signPass(secret: string, claims: PassClaims): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

/** True only for an untampered, unexpired pass issued for exactly this portfolio, access version and link. */
export async function verifyPass(secret: string, pass: unknown, current: { id: string; accessVersion: number; shareToken: string }, now: number): Promise<boolean> {
  if (typeof pass !== 'string' || pass.length > 600) return false;
  const [body, sig, extra] = pass.split('.');
  if (!body || !sig || extra !== undefined) return false;
  const sigBytes = fromB64url(sig);
  if (!sigBytes) return false;
  // crypto.subtle.verify compares in constant time.
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sigBytes as BufferSource, enc.encode(body));
  if (!ok) return false;
  let claims: PassClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromB64url(body) ?? new Uint8Array()));
  } catch {
    return false;
  }
  return (
    claims.p === current.id &&
    claims.v === current.accessVersion &&
    claims.t === (await tokenTag(current.shareToken)) &&
    typeof claims.e === 'number' &&
    claims.e > now
  );
}

/** A scrambled stand-in for the visitor's address, for counting password tries. The address itself is never stored. */
export async function clientKey(secret: string, address: string, portfolioId: string): Promise<string> {
  return (await sha256Hex(`${secret}|${portfolioId}|${address}`)).slice(0, 32);
}
