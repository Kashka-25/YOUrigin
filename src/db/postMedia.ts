import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { removeAssetIfUnused, saveImage } from './assets';
import { newId } from '../domain/text';
import { findMedia, isImageFile, isVideoFile, mediaKey } from '../io/postMedia';
import type { Clip } from '../domain/types';
import type { Post, PostMedia } from '../posts/model';

// Pictures for posts are ordinary assets (synced, end-to-end encrypted).
// Videos are clips: kept on the device they were added on, because they are far
// larger than sync's ~3 MB requests. A still frame of each video is saved as an
// asset, so the post shows its picture on every device.

export interface ClipProbe {
  width: number;
  height: number;
  duration: number;
  /** A JPEG still from early in the video, when the browser could decode one. */
  poster: File | null;
}

/** Reads a video's size and length and grabs a still frame. Gives up quietly after `timeoutMs`. */
export async function probeVideo(file: Blob, name: string, timeoutMs = 8000): Promise<ClipProbe> {
  const fallback: ClipProbe = { width: 0, height: 0, duration: 0, poster: null };
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return fallback;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  const event = (name: string) =>
    new Promise<void>((resolve, reject) => {
      video.addEventListener(name, () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('This video couldn’t be read.')), { once: true });
    });
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs));
  try {
    await Promise.race([event('loadedmetadata'), timeout]);
    const info = { width: video.videoWidth, height: video.videoHeight, duration: Number.isFinite(video.duration) ? video.duration : 0 };
    let poster: File | null = null;
    try {
      video.currentTime = Math.min(1, info.duration / 3 || 0);
      await Promise.race([event('seeked'), timeout]);
      const canvas = document.createElement('canvas');
      canvas.width = info.width || 1080;
      canvas.height = info.height || 1920;
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
      if (blob) poster = new File([blob], `${name.replace(/\.[^.]+$/, '')}-still.jpg`, { type: 'image/jpeg' });
    } catch {
      /* no still frame: the post shows the video's name instead */
    }
    return { ...info, poster };
  } catch {
    return fallback;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Stores a video on this device, plus a still frame as a synced asset. */
export async function saveClip(file: File, probe: (f: File) => Promise<ClipProbe> = (f) => probeVideo(f, f.name)): Promise<{ clipId: string; posterAssetId?: string }> {
  const info = await probe(file);
  const now = Date.now();
  const clip: Clip = {
    id: newId(),
    name: file.name,
    mime: file.type || 'video/mp4',
    blob: file,
    bytes: file.size,
    width: info.width,
    height: info.height,
    duration: info.duration,
    createdAt: now,
    updatedAt: now,
  };
  await db.clips.add(clip);
  let posterAssetId: string | undefined;
  if (info.poster) {
    try {
      posterAssetId = (await saveImage(info.poster)).asset.id;
    } catch {
      /* keep the video even if its still frame couldn't be stored */
    }
  }
  return { clipId: clip.id, ...(posterAssetId ? { posterAssetId } : {}) };
}

export interface MediaSavers {
  image: (f: File) => Promise<string>;
  clip: (f: File) => Promise<{ clipId: string; posterAssetId?: string }>;
}

export const defaultSavers: MediaSavers = {
  image: async (f) => (await saveImage(f)).asset.id,
  clip: (f) => saveClip(f),
};

/** Turns a picked image or video into post media. */
export async function mediaFromFile(file: File, savers: MediaSavers = defaultSavers): Promise<PostMedia | null> {
  if (isVideoFile(file)) return { kind: 'clip', name: file.name, ...(await savers.clip(file)) };
  if (isImageFile(file)) return { kind: 'asset', assetId: await savers.image(file) };
  return null;
}

/**
 * Replaces media that is only a file name with the picked file of that name.
 * The same file used by several posts is stored once (content exists once).
 */
export async function fillMedia(
  media: PostMedia[],
  files: Map<string, File>,
  savers: MediaSavers = defaultSavers,
  stored: Map<string, PostMedia> = new Map(),
): Promise<{ media: PostMedia[]; filled: number }> {
  let filled = 0;
  const out: PostMedia[] = [];
  for (const m of media) {
    if (m.kind !== 'file') {
      out.push(m);
      continue;
    }
    const file = findMedia(files, m.name);
    if (!file) {
      out.push(m);
      continue;
    }
    const key = mediaKey(m.name);
    let made = stored.get(key);
    if (!made) {
      made = (await mediaFromFile(file, savers)) ?? undefined;
      if (made) stored.set(key, made);
    }
    if (made) {
      out.push(made);
      filled++;
    } else {
      out.push(m);
    }
  }
  return { media: out, filled };
}

/** Fills in the media of new posts (from a drafts import) before they are saved. */
export async function withMediaFiles(posts: Post[], files: Map<string, File>, savers: MediaSavers = defaultSavers): Promise<Post[]> {
  if (!files.size) return posts;
  const stored = new Map<string, PostMedia>();
  const out: Post[] = [];
  for (const p of posts) out.push({ ...p, media: (await fillMedia(p.media, files, savers, stored)).media });
  return out;
}

/** Adds picked images and videos to the posts already here whose media names match them. */
export async function attachMediaToPosts(files: Map<string, File>, savers: MediaSavers = defaultSavers): Promise<{ posts: number; files: number; placed: number }> {
  const posts = (await db.posts.toArray()).filter((p) => !p.deletedAt && p.media.some((m) => m.kind === 'file' && findMedia(files, m.name)));
  const stored = new Map<string, PostMedia>();
  let filled = 0;
  for (const p of posts) {
    const r = await fillMedia(p.media, files, savers, stored);
    filled += r.filled;
    await db.posts.update(p.id, { media: r.media, updatedAt: Date.now() });
  }
  return { posts: posts.length, files: stored.size, placed: filled };
}

/** After media leaves a post: removes its stored picture or video if nothing else uses it. */
export async function removeMediaIfUnused(m: PostMedia): Promise<void> {
  if (m.kind === 'asset') return removeAssetIfUnused(m.assetId);
  if (m.kind !== 'clip') return;
  const used = await db.posts.filter((p) => p.media.some((x) => x.kind === 'clip' && x.clipId === m.clipId)).count();
  if (!used) {
    await db.clips.delete(m.clipId);
    await removeAssetIfUnused(m.posterAssetId);
  }
}

/** A playable address for a stored video, or null while loading / when it isn't on this device. */
export function useClipUrl(clipId: string | undefined): { url: string | null; missing: boolean } {
  const clip = useLiveQuery(async () => (clipId ? ((await db.clips.get(clipId)) ?? null) : null), [clipId]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!clip) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(clip.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [clip]);
  return { url, missing: clip === null };
}
