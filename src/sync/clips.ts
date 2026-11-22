import type { ClipInfo } from '../domain/types';
import type { YOUriginDB } from '../db/db';
import { randomBytes } from './crypto';

// Videos reach every device without being added on each one.
//
// A video is cut into pieces of CHUNK_SIZE bytes. Each piece is encrypted on the
// device with the sync key (AES-GCM, a fresh 12-byte IV per piece, the video id
// and the piece's place bound in as additional data so pieces can't be swapped)
// and stored as `<user id>/<clip id>/<piece number>` in a private bucket. The
// server only ever holds ciphertext. `clipInfo` (synced like every other record)
// tells other devices the video exists and when its cloud copy is complete.
//
// Uploads and downloads go piece by piece and pick up where they stopped.

export const CHUNK_SIZE = 4 * 1024 * 1024;
const IV_BYTES = 12;

/** Where encrypted pieces are kept. Supabase Storage in the app; a Map in tests. */
export interface ClipStore {
  put(path: string, bytes: Uint8Array): Promise<void>;
  get(path: string): Promise<Uint8Array>;
  remove(paths: string[]): Promise<void>;
}

export function chunkPath(userId: string, clipId: string, index: number): string {
  return `${userId}/${clipId}/${index}`;
}

export function chunkCount(bytes: number, chunkSize = CHUNK_SIZE): number {
  return Math.max(1, Math.ceil(bytes / chunkSize));
}

function aad(clipId: string, index: number, total: number): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`yourigin-clip-v1:${clipId}:${index}/${total}`);
}

/** One piece, encrypted: the IV followed by the ciphertext. */
export async function encryptChunk(key: CryptoKey, clipId: string, index: number, total: number, data: ArrayBuffer): Promise<Uint8Array> {
  const iv = randomBytes(IV_BYTES);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(clipId, index, total) }, key, data);
  const out = new Uint8Array(IV_BYTES + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), IV_BYTES);
  return out;
}

export async function decryptChunk(key: CryptoKey, clipId: string, index: number, total: number, sealed: Uint8Array): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(sealed);
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES), additionalData: aad(clipId, index, total) },
    key,
    bytes.slice(IV_BYTES),
  );
}

/** Makes sure a video on this device has its synced record. Returns it. */
export async function ensureClipInfo(db: YOUriginDB, clipId: string, chunkSize = CHUNK_SIZE): Promise<ClipInfo | null> {
  const [clip, info] = await Promise.all([db.clips.get(clipId), db.clipInfo.get(clipId)]);
  if (info) return info;
  if (!clip) return null;
  const now = Date.now();
  const made: ClipInfo = {
    id: clip.id,
    name: clip.name,
    mime: clip.mime,
    bytes: clip.blob.size,
    width: clip.width,
    height: clip.height,
    duration: clip.duration,
    chunkSize,
    chunks: chunkCount(clip.blob.size, chunkSize),
    uploadedAt: null,
    removedFromCloudAt: null,
    createdAt: clip.createdAt,
    updatedAt: now,
  };
  await db.clipInfo.put(made);
  return made;
}

export type Progress = (done: number, total: number) => void;

/**
 * Uploads a video's encrypted pieces, starting after the last piece already up,
 * then marks the cloud copy complete. Does nothing if it is already up or was removed.
 */
export async function uploadClip(db: YOUriginDB, store: ClipStore, key: CryptoKey, userId: string, clipId: string, onProgress?: Progress): Promise<boolean> {
  const info = await ensureClipInfo(db, clipId);
  const clip = await db.clips.get(clipId);
  if (!info || !clip || info.uploadedAt || info.removedFromCloudAt) return false;
  // A different file was added under this id on this device since the record was made.
  if (clip.blob.size !== info.bytes) return false;
  const start = Math.min(clip.uploadedChunks ?? 0, info.chunks);
  for (let i = start; i < info.chunks; i++) {
    const piece = await clip.blob.slice(i * info.chunkSize, (i + 1) * info.chunkSize).arrayBuffer();
    await store.put(chunkPath(userId, clipId, i), await encryptChunk(key, clipId, i, info.chunks, piece));
    // A whole-record put, never update(): a partial update could copy the stored video.
    await db.clips.put({ ...clip, uploadedChunks: i + 1 });
    if (i + 1 < info.chunks) await markUploadProgress(db, clipId, i + 1);
    onProgress?.(i + 1, info.chunks);
  }
  const now = Date.now();
  // Another device may have finished (or removed) it meanwhile; only mark a still-pending copy.
  await db.transaction('rw', db.clipInfo, async () => {
    const latest = await db.clipInfo.get(clipId);
    if (latest && !latest.uploadedAt && !latest.removedFromCloudAt) await db.clipInfo.update(clipId, { uploadedAt: now, uploadedChunks: info.chunks, updatedAt: now });
  });
  return true;
}

/** Records how many pieces are up, so the other devices can show it (it syncs with the record). */
async function markUploadProgress(db: YOUriginDB, clipId: string, uploadedChunks: number): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.clipInfo, async () => {
    const latest = await db.clipInfo.get(clipId);
    if (latest && !latest.uploadedAt && !latest.removedFromCloudAt && (latest.uploadedChunks ?? 0) < uploadedChunks) {
      await db.clipInfo.update(clipId, { uploadedChunks, updatedAt: now });
    }
  });
}

/** How an upload happening on another device looks from here. */
export function uploadState(info: Pick<ClipInfo, 'chunks' | 'uploadedChunks' | 'updatedAt'>, now = Date.now()): { done: number; total: number; paused: boolean } {
  const done = Math.min(info.uploadedChunks ?? 0, info.chunks);
  // No piece for a few minutes: that device was closed or put away part-way.
  return { done, total: info.chunks, paused: now - info.updatedAt > UPLOAD_PAUSED_AFTER };
}
export const UPLOAD_PAUSED_AFTER = 3 * 60 * 1000;

/**
 * Downloads and decrypts a video whose cloud copy is complete, keeping each
 * piece on this device as it arrives so a dropped connection resumes, not restarts.
 */
export async function downloadClip(db: YOUriginDB, store: ClipStore, key: CryptoKey, userId: string, clipId: string, onProgress?: Progress): Promise<boolean> {
  if (await db.clips.get(clipId)) return false;
  const info = await db.clipInfo.get(clipId);
  if (!info?.uploadedAt || info.removedFromCloudAt) return false;
  const have = new Set((await db.clipChunks.where('clipId').equals(clipId).primaryKeys()).map(([, i]) => i));
  onProgress?.(have.size, info.chunks);
  for (let i = 0; i < info.chunks; i++) {
    if (have.has(i)) continue;
    const data = await decryptChunk(key, clipId, i, info.chunks, await store.get(chunkPath(userId, clipId, i)));
    await db.clipChunks.put({ clipId, index: i, data });
    have.add(i);
    onProgress?.(have.size, info.chunks);
  }
  const parts = await db.clipChunks.where('clipId').equals(clipId).sortBy('index');
  const blob = new Blob(
    parts.map((p) => p.data),
    { type: info.mime },
  );
  if (blob.size !== info.bytes) {
    await db.clipChunks.where('clipId').equals(clipId).delete();
    throw new Error('This video arrived incomplete. Try again.');
  }
  const now = Date.now();
  await db.transaction('rw', db.clips, db.clipChunks, async () => {
    await db.clips.put({
      id: clipId,
      name: info.name,
      mime: info.mime,
      blob,
      bytes: info.bytes,
      width: info.width,
      height: info.height,
      duration: info.duration,
      createdAt: info.createdAt,
      updatedAt: now,
      uploadedChunks: info.chunks,
    });
    await db.clipChunks.where('clipId').equals(clipId).delete();
  });
  return true;
}

/** Removes a video's cloud copy. Devices that have the video keep it. */
export async function removeCloudCopy(db: YOUriginDB, store: ClipStore, userId: string, clipId: string): Promise<void> {
  const info = await db.clipInfo.get(clipId);
  const chunks = info?.chunks ?? chunkCount((await db.clips.get(clipId))?.bytes ?? 0);
  await store.remove(Array.from({ length: chunks }, (_, i) => chunkPath(userId, clipId, i)));
  if (info) {
    const now = Date.now();
    await db.clipInfo.update(clipId, { removedFromCloudAt: now, updatedAt: now });
  }
}

/**
 * Videos whose cloud copy can go: every post using them has been posted for at
 * least `keepDays` days, or no post uses them any more (after a day's grace, so a
 * post still on its way from another device isn't missed).
 */
export async function cloudCopiesToRemove(db: YOUriginDB, keepDays: number, now = Date.now()): Promise<string[]> {
  const day = 24 * 60 * 60 * 1000;
  const [infos, posts] = await Promise.all([db.clipInfo.toArray(), db.posts.toArray()]);
  const out: string[] = [];
  for (const info of infos) {
    if (info.removedFromCloudAt || !info.uploadedAt) continue;
    const using = posts.filter((p) => !p.deletedAt && p.media.some((m) => m.kind === 'clip' && m.clipId === info.id));
    if (!using.length) {
      if (now - info.updatedAt > day) out.push(info.id);
      continue;
    }
    if (using.every((p) => p.status === 'posted' && p.postedAt !== null && now - p.postedAt >= keepDays * day)) out.push(info.id);
  }
  return out;
}

export interface ClipPassResult {
  uploaded: number;
  downloaded: number;
  removed: number;
}

/**
 * One pass: give local videos their records, upload what isn't up yet,
 * download what this device wants, and remove cloud copies that have served.
 */
export async function clipPass(
  db: YOUriginDB,
  store: ClipStore,
  key: CryptoKey,
  userId: string,
  opts: { autoDownload: boolean; keepDays: number; onProgress?: (what: 'up' | 'down', name: string, done: number, total: number) => void },
): Promise<ClipPassResult> {
  const result: ClipPassResult = { uploaded: 0, downloaded: 0, removed: 0 };
  const used = new Set(
    (await db.posts.toArray()).flatMap((p) => (p.deletedAt ? [] : p.media.flatMap((m) => (m.kind === 'clip' ? [m.clipId] : [])))),
  );

  for (const clip of await db.clips.toArray()) {
    if (!used.has(clip.id)) continue;
    const info = await ensureClipInfo(db, clip.id);
    if (!info || info.uploadedAt || info.removedFromCloudAt) continue;
    if (await uploadClip(db, store, key, userId, clip.id, (d, t) => opts.onProgress?.('up', clip.name, d, t))) result.uploaded++;
  }

  const local = new Set(await db.clips.toCollection().primaryKeys());
  const partial = new Set((await db.clipChunks.toCollection().primaryKeys()).map(([id]) => id));
  for (const info of await db.clipInfo.toArray()) {
    if (local.has(info.id) || !info.uploadedAt || info.removedFromCloudAt || !used.has(info.id)) continue;
    // Downloads someone started by hand always finish; others only with auto-download on.
    if (!opts.autoDownload && !partial.has(info.id)) continue;
    if (await downloadClip(db, store, key, userId, info.id, (d, t) => opts.onProgress?.('down', info.name, d, t))) result.downloaded++;
  }

  for (const id of await cloudCopiesToRemove(db, opts.keepDays)) {
    await removeCloudCopy(db, store, userId, id);
    result.removed++;
  }
  return result;
}

/** Bytes of video currently kept in the cloud. */
export async function cloudBytes(db: YOUriginDB): Promise<number> {
  return (await db.clipInfo.toArray()).filter((i) => i.uploadedAt && !i.removedFromCloudAt).reduce((n, i) => n + i.bytes, 0);
}
