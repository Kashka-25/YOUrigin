import { useSyncExternalStore } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db } from '../db/db';
import { DEMO } from '../demo/mode';
import { clipPass, downloadClip, removeCloudCopy, type ClipStore } from './clips';
import { getState, isSyncEnabled } from './runtime';
import { getClient } from './supabase';

// Runs video sync next to record sync: after each successful sync, and when a
// video is added or asked for. One pass at a time; errors never stop record sync.

export const CLIP_BUCKET = 'yourigin-clips';

/** Encrypted pieces in a private Supabase Storage bucket; row-level security limits each account to its own folder. */
export class SupabaseClipStore implements ClipStore {
  constructor(private client: SupabaseClient) {}

  async put(path: string, bytes: Uint8Array): Promise<void> {
    const { error } = await this.client.storage
      .from(CLIP_BUCKET)
      .upload(path, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }), { upsert: true, contentType: 'application/octet-stream' });
    if (error) throw new Error(error.message);
  }

  async get(path: string): Promise<Uint8Array> {
    const { data, error } = await this.client.storage.from(CLIP_BUCKET).download(path);
    if (error || !data) throw new Error(error?.message ?? 'This video piece could not be fetched.');
    return new Uint8Array(await data.arrayBuffer());
  }

  async remove(paths: string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await this.client.storage.from(CLIP_BUCKET).remove(paths.slice(i, i + 100));
      if (error) throw new Error(error.message);
    }
  }
}

/** Forgotten passphrase: the old pieces can't be read with a new key, so they all go. */
export async function deleteAllCloudClips(client: SupabaseClient, userId: string): Promise<void> {
  const bucket = client.storage.from(CLIP_BUCKET);
  const { data: folders, error } = await bucket.list(userId, { limit: 1000 });
  if (error) throw new Error(error.message);
  for (const folder of folders ?? []) {
    const { data: files } = await bucket.list(`${userId}/${folder.name}`, { limit: 1000 });
    const paths = (files ?? []).map((f) => `${userId}/${folder.name}/${f.name}`);
    if (paths.length) await new SupabaseClipStore(client).remove(paths);
  }
}

// ---- per-device settings ---------------------------------------------------------

export interface ClipSettings {
  /** Fetch videos added on other devices without being asked. */
  autoDownload: boolean;
  /** Days a posted video's cloud copy is kept. */
  keepDays: number;
}

const SETTINGS_KEY = 'yourigin.clips.settings';
export const DEFAULT_CLIP_SETTINGS: ClipSettings = { autoDownload: false, keepDays: 14 };

export function getClipSettings(): ClipSettings {
  try {
    return { ...DEFAULT_CLIP_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<ClipSettings>) };
  } catch {
    return DEFAULT_CLIP_SETTINGS;
  }
}

export function setClipSettings(patch: Partial<ClipSettings>): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...getClipSettings(), ...patch }));
  } catch {
    /* storage unavailable */
  }
  notify();
  if (patch.autoDownload) scheduleClipSync(0);
}

// ---- status --------------------------------------------------------------------

export interface ClipSyncStatus {
  running: boolean;
  /** The video moving right now. */
  current?: { direction: 'up' | 'down'; name: string; done: number; total: number };
  /** Per video, how far a download has come (for the button on the post). */
  downloads: Record<string, { done: number; total: number }>;
  error?: string;
  settings: ClipSettings;
}

let status: ClipSyncStatus = { running: false, downloads: {}, settings: getClipSettings() };
const listeners = new Set<() => void>();
function setStatus(patch: Partial<ClipSyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}
function notify() {
  setStatus({ settings: getClipSettings() });
}

export function useClipSyncStatus(): ClipSyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

// ---- running -------------------------------------------------------------------

async function context(): Promise<{ store: ClipStore; key: CryptoKey; userId: string; client: SupabaseClient } | null> {
  if (DEMO || !isSyncEnabled()) return null;
  const [key, userId] = await Promise.all([getState('cryptoKey'), getState('userId')]);
  if (!key || !userId) return null;
  const client = await getClient();
  return { store: new SupabaseClipStore(client), key, userId, client };
}

let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export function scheduleClipSync(delay = 2000): void {
  if (DEMO || !isSyncEnabled()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void runClipSync(), delay);
}

export async function runClipSync(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  running = (async () => {
    try {
      const ctx = await context();
      if (!ctx) return;
      setStatus({ running: true, error: undefined });
      const settings = getClipSettings();
      await clipPass(db, ctx.store, ctx.key, ctx.userId, {
        ...settings,
        onProgress: (direction, name, done, total) => setStatus({ current: { direction, name, done, total } }),
      });
    } catch (e) {
      setStatus({ error: friendlyClipError(e) });
    } finally {
      setStatus({ running: false, current: undefined });
      running = null;
    }
  })();
  await running;
  if (again) {
    again = false;
    scheduleClipSync(1000);
  }
}

/** Fetches one video now, because someone tapped "Download" on it. */
export async function downloadClipNow(clipId: string): Promise<void> {
  const ctx = await context();
  if (!ctx) throw new Error('Turn on sync in Settings to bring videos from your other devices.');
  try {
    await downloadClip(db, ctx.store, ctx.key, ctx.userId, clipId, (done, total) =>
      setStatus({ downloads: { ...status.downloads, [clipId]: { done, total } } }),
    );
  } catch (e) {
    throw new Error(friendlyClipError(e), { cause: e });
  } finally {
    const rest = { ...status.downloads };
    delete rest[clipId];
    setStatus({ downloads: rest });
  }
}

/** Removes one video's cloud copy now. Devices that have it keep theirs. */
export async function removeCloudCopyNow(clipId: string): Promise<void> {
  const ctx = await context();
  if (!ctx) throw new Error('Turn on sync in Settings first.');
  await removeCloudCopy(db, ctx.store, ctx.userId, clipId);
}

function friendlyClipError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/OperationError|decrypt/i.test(message)) return 'A video couldn’t be unlocked. Was a different sync passphrase used on another device?';
  if (/exceeded|quota|too large|413/i.test(message)) return 'The cloud space for videos is full. Remove some cloud copies in Settings.';
  if (/not found|404|Object not found/i.test(message)) return 'This video’s cloud copy isn’t there any more.';
  if (/Failed to fetch|NetworkError|network/i.test(message)) return 'Couldn’t reach the server. Videos will carry on when you’re back online.';
  return message;
}
