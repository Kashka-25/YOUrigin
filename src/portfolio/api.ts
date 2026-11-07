// Publishing portfolios to the YOU Supabase project (the yourigin_portfolios
// table, the private "portfolios" bucket and the owner functions in
// supabase/migrations/20261107120000_yourigin_portfolios.sql).
//
// Only the snapshot a visitor sees leaves the device, plus display-sized
// copies of its pictures; the draft itself stays private and encrypted. This
// never touches YOU Showcase data: a portfolio and a Showcase share are
// separate things, and publishing one never publishes the other.

import { useEffect, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { getClient } from '../sync/supabase';
import { db } from '../db/db';
import { shrinkImage } from '../io/images';
import type { Portfolio, PortfolioPublication, PortfolioSnapshot } from './model';
import { portfolioFilePrefix, type StoredSnapshot } from '../../supabase/functions/yourigin-portfolio/wire';

const BUCKET = 'portfolios';
/** Long edge of the pictures visitors see. The originals never leave this device. */
export const DISPLAY_MAX_EDGE = 1600;
const DISPLAY_MAX_BYTES = 2 * 1024 * 1024;

// ---- account -----------------------------------------------------------------

/** The signed-in YOU account on this device (the same one Sync and sharing use). */
export function useYouSession(): { session: Session | null; ready: boolean } {
  const [state, setState] = useState<{ session: Session | null; ready: boolean }>({ session: null, ready: false });
  useEffect(() => {
    let live = true;
    let unsub: (() => void) | undefined;
    void getClient().then(async (c) => {
      const { data } = await c.auth.getSession();
      if (live) setState({ session: data.session, ready: true });
      const { data: sub } = c.auth.onAuthStateChange((_e, s) => live && setState({ session: s, ready: true }));
      unsub = () => sub.subscription.unsubscribe();
    });
    return () => {
      live = false;
      unsub?.();
    };
  }, []);
  return state;
}

async function signedIn(): Promise<{ c: SupabaseClient; uid: string }> {
  const c = await getClient();
  const { data } = await c.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('Sign in with your YOU account to publish.');
  return { c, uid };
}

/** Plain words for what the server says. */
function friendly(message: string): Error {
  if (/not allowed to publish/i.test(message)) {
    return new Error('This account can’t publish portfolios yet. Publishing is open to YOUrigin’s allowlisted accounts for now.');
  }
  if (/No such portfolio/i.test(message)) return new Error('This portfolio is no longer published.');
  if (/row-level security/i.test(message)) return new Error('This account can’t upload pictures for portfolios yet.');
  return new Error(message);
}

// ---- links -------------------------------------------------------------------

/**
 * The visitor's link: the app's own address with p/ added, and the token
 * after # so it never reaches the web host's logs or other sites.
 * VITE_PORTFOLIO_BASE_URL can point at a custom domain later.
 */
export function shareUrl(token: string, base = import.meta.env.VITE_PORTFOLIO_BASE_URL || window.location.href.split('#')[0]): string {
  return `${new URL('p/', base).href}#${token}`;
}

// ---- pictures ----------------------------------------------------------------

function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

const extFor = (mime: string) => (mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : 'jpg');
const safeName = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || 'image';

/** The display copy of one stored picture, ready to upload. */
async function displayCopy(assetId: string): Promise<{ file: File; width: number; height: number }> {
  const asset = await db.assets.get(assetId);
  if (!asset) throw new Error('A picture in this portfolio is missing from this device.');
  if (asset.mime === 'image/svg+xml') throw new Error('SVG pictures can’t be published yet. Export it as PNG or JPEG first.');
  const shrunk = await shrinkImage(dataUrlToFile(asset.dataUrl, asset.name || 'image'), DISPLAY_MAX_EDGE);
  if (shrunk.bytes > DISPLAY_MAX_BYTES) throw new Error('A picture is still too large to publish after shrinking.');
  return { file: dataUrlToFile(shrunk.dataUrl, `display.${extFor(shrunk.mime)}`), width: shrunk.width, height: shrunk.height };
}

async function listFolder(c: SupabaseClient, prefix: string): Promise<string[]> {
  const { data, error } = await c.storage.from(BUCKET).list(prefix.replace(/\/$/, ''), { limit: 1000 });
  if (error) throw friendly(error.message);
  return (data ?? []).map((f) => `${prefix}${f.name}`);
}

/**
 * Uploads what the snapshot's pictures need (each picture once, named by its
 * asset) and returns the snapshot as stored, with storage paths.
 */
export async function toStoredSnapshot(
  snapshot: PortfolioSnapshot,
  prefix: string,
  upload: (path: string, file: File) => Promise<void>,
  existing: Set<string>,
  copy: (assetId: string) => Promise<{ file: File; width: number; height: number }> = displayCopy,
): Promise<StoredSnapshot> {
  const done = new Map<string, { path: string; width: number; height: number }>();
  const placed = async (ref: string) => {
    if (done.has(ref)) return done.get(ref)!;
    const made = await copy(ref);
    const path = `${prefix}${safeName(ref)}.${extFor(made.file.type)}`;
    if (!existing.has(path)) await upload(path, made.file);
    const out = { path, width: made.width, height: made.height };
    done.set(ref, out);
    return out;
  };
  const sections: StoredSnapshot['sections'] = [];
  for (const sec of snapshot.sections) {
    const items: StoredSnapshot['sections'][number]['items'] = [];
    for (const item of sec.items) {
      const image = item.image ? { ...(await placed(item.image.ref)), alt: item.image.alt } : null;
      items.push({ ...item, image });
    }
    sections.push({ ...sec, items });
  }
  return { ...snapshot, sections };
}

// ---- publishing --------------------------------------------------------------

interface ServerResult {
  id: string;
  local_id: string;
  share_token: string;
  status: 'live' | 'disabled';
  visibility: Portfolio['visibility'];
  password_set: boolean;
  expires_at: string | null;
  published_at: string;
  view_count?: number;
}

function toPublication(r: ServerResult, publishedHash: string): PortfolioPublication {
  return {
    remoteId: r.id,
    shareToken: r.share_token,
    status: r.status,
    visibility: r.visibility,
    publishedAt: Date.parse(r.published_at),
    publishedHash,
    expiresAt: r.expires_at ? Date.parse(r.expires_at) : null,
    passwordSet: r.password_set,
  };
}

async function savePublication(localId: string, publication: PortfolioPublication | null): Promise<void> {
  // Only the publication record changes; the draft's own edits are left alone.
  await db.portfolios.update(localId, { publication, updatedAt: Date.now() });
}

/**
 * Publishes the portfolio, or replaces what its published version shows.
 * password: a new password (password visibility only); omit to keep the current one.
 */
export async function publishPortfolio(p: Portfolio, snapshot: PortfolioSnapshot, hash: string, password?: string): Promise<PortfolioPublication> {
  const { c, uid } = await signedIn();
  const prefix = await portfolioFilePrefix(uid, p.id);
  const existing = new Set(await listFolder(c, prefix));
  const uploaded: string[] = [];
  const stored = await toStoredSnapshot(snapshot, prefix, async (path, file) => {
    const { error } = await c.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: true });
    if (error) throw friendly(error.message);
    uploaded.push(path);
  }, existing);

  const { data, error } = await c.rpc('yourigin_publish_portfolio', {
    p_local_id: p.id,
    p_snapshot: stored,
    p_visibility: p.visibility,
    p_expires_at: p.expiresAt ? new Date(p.expiresAt).toISOString() : null,
    p_password: p.visibility === 'password' && password ? password : null,
  });
  if (error) {
    if (uploaded.length) await c.storage.from(BUCKET).remove(uploaded);
    throw friendly(error.message);
  }
  // Pictures no longer shown are removed (best effort; they're private either way).
  const keep = new Set(stored.sections.flatMap((s) => s.items.map((i) => i.image?.path)).filter(Boolean));
  const stale = [...existing].filter((path) => !keep.has(path));
  if (stale.length) await c.storage.from(BUCKET).remove(stale);

  const publication = toPublication(data as ServerResult, hash);
  await savePublication(p.id, publication);
  return publication;
}

async function ownerCall(p: Portfolio, fn: string, args: Record<string, unknown>): Promise<PortfolioPublication> {
  if (!p.publication) throw new Error('This portfolio isn’t published.');
  const { c } = await signedIn();
  const { data, error } = await c.rpc(fn, { p_id: p.publication.remoteId, ...args });
  if (error) throw friendly(error.message);
  const publication = toPublication(data as ServerResult, p.publication.publishedHash);
  await savePublication(p.id, publication);
  return publication;
}

/** Turns the link off (visitors see "no longer available") or back on. */
export function setPortfolioLive(p: Portfolio, live: boolean): Promise<PortfolioPublication> {
  return ownerCall(p, 'yourigin_set_portfolio_status', { p_status: live ? 'live' : 'disabled' });
}

/** A new link; the old one, and any access given through it, stops working at once. */
export function replacePortfolioLink(p: Portfolio): Promise<PortfolioPublication> {
  return ownerCall(p, 'yourigin_rotate_portfolio_link', {});
}

/** Deletes the published copy and its pictures. The draft stays on this device. */
export async function unpublishPortfolio(p: Portfolio): Promise<void> {
  const { c, uid } = await signedIn();
  if (p.publication) {
    const { error } = await c.rpc('yourigin_unpublish_portfolio', { p_id: p.publication.remoteId });
    if (error && !/No such portfolio/i.test(error.message)) throw friendly(error.message);
  }
  const files = await listFolder(c, await portfolioFilePrefix(uid, p.id));
  if (files.length) await c.storage.from(BUCKET).remove(files);
  await savePublication(p.id, null);
}

export interface PublishedStatus {
  publication: PortfolioPublication | null;
  views: number;
}

/**
 * What the server has for this portfolio, so this device's record matches it
 * (it may have been changed from another device, or sync may have carried an
 * older copy of the record).
 */
export async function refreshPublication(p: Portfolio): Promise<PublishedStatus> {
  const { c } = await signedIn();
  const { data, error } = await c
    .from('yourigin_portfolios')
    .select('id,local_id,share_token,status,visibility,expires_at,published_at,view_count,access_version')
    .eq('local_id', p.id)
    .maybeSingle();
  if (error) throw friendly(error.message);
  if (!data) {
    if (p.publication) await savePublication(p.id, null);
    return { publication: null, views: 0 };
  }
  const r = data as ServerResult & { access_version: number };
  const publication = toPublication(
    { ...r, password_set: r.visibility === 'password' },
    p.publication?.remoteId === r.id && p.publication.publishedAt === Date.parse(r.published_at) ? p.publication.publishedHash : '',
  );
  if (JSON.stringify(publication) !== JSON.stringify(p.publication)) await savePublication(p.id, publication);
  return { publication, views: Number(r.view_count ?? 0) };
}
