// Showcase calls to the YOU Supabase project. Uses the same sign-in as Sync
// (one YOU account), but sharing doesn't need the Sync allowlist: any artist
// with a YOU account can share. Only what's shared leaves this device, as a
// plaintext public copy; nothing here touches the encrypted sync tables.

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getClient } from '../sync/supabase';
import { isSyncEnabled } from '../sync/runtime';
import { shrinkImage } from '../io/images';
import { db } from '../db/db';
import type { ContentItem } from '../domain/types';
import {
  DISPLAY_MAX_BYTES,
  DISPLAY_MAX_EDGE,
  normalizeHandle,
  normalizeUrl,
  toCreditRows,
  toWorkRow,
  type ArtistProfile,
  type CreditDraft,
  type Placement,
  type SaveMode,
  type ShareDraft,
  type ShareKind,
  type ShareStatus,
} from './model';

const BUCKET = 'showcase';

export interface SharedWork {
  id: string;
  sourceId: string | null;
  kind: ShareKind;
  title: string;
  body: string;
  altText: string;
  imagePath: string | null;
  placements: Placement[];
  saveMode: SaveMode;
  suggestedAmount: string | null;
  status: ShareStatus;
  reviewNote: string | null;
  submittedAt: string;
  liveAt: string | null;
  kronkPostUrl: string | null;
  credits: CreditDraft[];
}

// ---- account -------------------------------------------------------------

export function useShowcaseSession(): { session: Session | null; ready: boolean } {
  const [state, setState] = useState<{ session: Session | null; ready: boolean }>({ session: null, ready: false });
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let live = true;
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

/** Signs in for sharing only. When Sync is on, its sign-in is used instead. */
export async function showcaseSignIn(email: string, password: string): Promise<void> {
  if (isSyncEnabled()) throw new Error('Sync is on: sign in from Sync between devices, above.');
  const c = await getClient();
  const { error } = await c.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(error.message);
}

export async function showcaseSignOut(): Promise<void> {
  if (isSyncEnabled()) return; // that sign-in belongs to Sync
  const c = await getClient();
  await c.auth.signOut({ scope: 'local' });
}

async function userId(): Promise<string> {
  const c = await getClient();
  const { data } = await c.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Sign in with your YOU account to share.');
  return id;
}

// ---- artist profile ------------------------------------------------------

export async function loadProfile(): Promise<ArtistProfile | null> {
  const c = await getClient();
  const uid = await userId();
  const { data, error } = await c.from('artist_profiles').select('display_name,bio,links,kronk_handle').eq('user_id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { displayName: data.display_name, bio: data.bio ?? '', links: Array.isArray(data.links) ? data.links : [], kronkHandle: data.kronk_handle ?? '' };
}

/**
 * Your YOU profile (same account), used to start your artist profile so
 * there's one of you across both apps.
 */
export async function loadYouProfile(): Promise<{ name: string; bio: string } | null> {
  const c = await getClient();
  const uid = await userId();
  const { data, error } = await c.from('profiles').select('name,bio').eq('user_id', uid).maybeSingle();
  if (error) return null;
  return data ? { name: (data.name ?? '').trim(), bio: (data.bio ?? '').trim() } : null;
}

export async function saveProfile(p: ArtistProfile): Promise<void> {
  const c = await getClient();
  const uid = await userId();
  const { error } = await c.from('artist_profiles').upsert(
    {
      user_id: uid,
      display_name: p.displayName.trim(),
      bio: p.bio.trim(),
      links: p.links.map((l) => ({ kind: l.kind, label: l.label.trim(), url: normalizeUrl(l.url) })).filter((l) => l.url),
      kronk_handle: normalizeHandle(p.kronkHandle) || null,
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    if (/artist_profiles_kronk_handle_key|duplicate key/i.test(error.message)) throw new Error('Another artist already uses that Kronk handle.');
    throw new Error(error.message);
  }
}

// ---- shares --------------------------------------------------------------

function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

/** The display-sized copy YOU will show: at most 1600px, WebP where possible. */
export async function makeDisplayCopy(assetId: string): Promise<{ file: File; width: number; height: number; dataUrl: string }> {
  const asset = await db.assets.get(assetId);
  if (!asset) throw new Error('This image is missing from this device.');
  if (asset.mime === 'image/svg+xml') throw new Error('SVG images can’t be shared yet. Export it as PNG or JPEG first.');
  const shrunk = await shrinkImage(dataUrlToFile(asset.dataUrl, asset.name || 'image'), DISPLAY_MAX_EDGE);
  if (shrunk.bytes > DISPLAY_MAX_BYTES) throw new Error('This image is still too large to share after shrinking.');
  const ext = shrunk.mime === 'image/webp' ? 'webp' : shrunk.mime === 'image/png' ? 'png' : 'jpg';
  return { file: dataUrlToFile(shrunk.dataUrl, `display.${ext}`), width: shrunk.width, height: shrunk.height, dataUrl: shrunk.dataUrl };
}

const WORK_FIELDS =
  'id,source_id,kind,title,body,alt_text,image_path,placements,save_mode,suggested_amount,status,review_note,submitted_at,live_at,kronk_post_url,credits:showcase_credits(name,url,kronk_handle,position)';

interface WorkRow {
  id: string;
  source_id: string | null;
  kind: ShareKind;
  title: string;
  body: string;
  alt_text: string;
  image_path: string | null;
  placements: Placement[];
  save_mode: SaveMode;
  suggested_amount: string | null;
  status: ShareStatus;
  review_note: string | null;
  submitted_at: string;
  live_at: string | null;
  kronk_post_url: string | null;
  credits: { name: string; url: string | null; kronk_handle: string | null; position: number }[] | null;
}

function fromRow(r: WorkRow): SharedWork {
  return {
    id: r.id,
    sourceId: r.source_id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    altText: r.alt_text,
    imagePath: r.image_path,
    placements: r.placements,
    saveMode: r.save_mode,
    suggestedAmount: r.suggested_amount,
    status: r.status,
    reviewNote: r.review_note,
    submittedAt: r.submitted_at,
    liveAt: r.live_at,
    kronkPostUrl: r.kronk_post_url,
    credits: [...(r.credits ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ name: c.name, url: c.url ?? '', kronkHandle: c.kronk_handle ?? '' })),
  };
}

export async function listMyShares(): Promise<SharedWork[]> {
  const c = await getClient();
  const uid = await userId();
  const { data, error } = await c.from('showcase_works').select(WORK_FIELDS).eq('user_id', uid).order('submitted_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as WorkRow[]).map(fromRow);
}

export async function findShare(sourceId: string): Promise<SharedWork | null> {
  const c = await getClient();
  const uid = await userId();
  const { data, error } = await c.from('showcase_works').select(WORK_FIELDS).eq('user_id', uid).eq('source_id', sourceId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data as unknown as WorkRow) : null;
}

/** How many people keep each of your pieces in their collection (never who). */
export async function saveCounts(): Promise<Record<string, number>> {
  const c = await getClient();
  const { data, error } = await c.rpc('showcase_save_counts');
  if (error) throw new Error(error.message);
  return Object.fromEntries(((data ?? []) as { work_id: string; saves: number }[]).map((r) => [r.work_id, Number(r.saves)]));
}

/**
 * Shares (or re-shares) a piece. A new display copy is uploaded for images;
 * the row is upserted by piece, which sends it back to waiting for review;
 * then the "offered by" credits are replaced.
 */
export async function sharePiece(item: ContentItem, draft: ShareDraft): Promise<SharedWork> {
  const c = await getClient();
  const uid = await userId();
  const before = await findShare(item.id);

  let image: { path: string; width: number; height: number } | null = null;
  if (draft.kind === 'image') {
    if (!item.assetId) throw new Error('This piece has no image.');
    const copy = await makeDisplayCopy(item.assetId);
    const path = `${uid}/${item.id}-${Date.now().toString(36)}.${copy.file.name.split('.').pop()}`;
    const up = await c.storage.from(BUCKET).upload(path, copy.file, { contentType: copy.file.type, upsert: false });
    if (up.error) throw new Error(up.error.message);
    image = { path, width: copy.width, height: copy.height };
  }

  const { data, error } = await c
    .from('showcase_works')
    .upsert({ user_id: uid, ...toWorkRow(draft, item.id, image) }, { onConflict: 'user_id,source_id' })
    .select('id')
    .single();
  if (error) {
    if (image) await c.storage.from(BUCKET).remove([image.path]);
    throw new Error(error.message);
  }
  const workId = (data as { id: string }).id;

  const del = await c.from('showcase_credits').delete().eq('work_id', workId);
  if (del.error) throw new Error(del.error.message);
  const rows = toCreditRows(workId, draft.credits);
  if (rows.length) {
    const ins = await c.from('showcase_credits').insert(rows);
    if (ins.error) throw new Error(ins.error.message);
  }

  if (image && before?.imagePath && before.imagePath !== image.path) await c.storage.from(BUCKET).remove([before.imagePath]);
  return (await findShare(item.id))!;
}

/** Takes a piece off YOU for good: the row, its credits, saves and image. */
export async function unshare(work: SharedWork): Promise<void> {
  const c = await getClient();
  const { error } = await c.from('showcase_works').delete().eq('id', work.id);
  if (error) throw new Error(error.message);
  if (work.imagePath) await c.storage.from(BUCKET).remove([work.imagePath]);
}

/** The link to the artist's own Kronk post, shown on YOU as "Also shared on Kronk". */
export async function setKronkPostUrl(work: SharedWork, url: string): Promise<void> {
  const clean = normalizeUrl(url);
  if (clean === null) throw new Error('That needs to be a web address starting https://.');
  const c = await getClient();
  const { error } = await c.from('showcase_works').update({ kronk_post_url: clean || null }).eq('id', work.id);
  if (error) throw new Error(error.message);
}
