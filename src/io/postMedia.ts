import JSZip from 'jszip';

// Images and videos that arrive with a drafts file (picked together, as a folder,
// or inside a .zip) are matched to posts by file name. See docs/POSTS.md.

export const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm';
export const POST_IMPORT_ACCEPT = '.json,application/json,.zip,application/zip,image/*,.heic,.heif,video/*,.mp4,.mov,.m4v,.webm';
export const POST_MEDIA_ACCEPT = 'image/*,.heic,.heif,video/*,.mp4,.mov,.m4v,.webm,.zip,application/zip';

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|heic|heif|svg)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm)$/i;

/** The last part of a path ("To post/2026-11-23/slide-01.jpg" → "slide-01.jpg"). */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** How a media name is compared: by file name only, ignoring case. */
export function mediaKey(name: string): string {
  return baseName(name).trim().toLocaleLowerCase();
}

export function isImageFile(f: Pick<File, 'name' | 'type'>): boolean {
  return f.type.startsWith('image/') || IMAGE_EXT.test(f.name);
}

export function isVideoFile(f: Pick<File, 'name' | 'type'>): boolean {
  return f.type.startsWith('video/') || VIDEO_EXT.test(f.name);
}

function isZip(f: Pick<File, 'name' | 'type'>): boolean {
  return f.type === 'application/zip' || f.type === 'application/x-zip-compressed' || /\.zip$/i.test(f.name);
}

function isDraftsJson(f: Pick<File, 'name' | 'type'>): boolean {
  return f.type === 'application/json' || /\.json$/i.test(f.name);
}

function mimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return (
    {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      heic: 'image/heic',
      heif: 'image/heif',
      svg: 'image/svg+xml',
      mp4: 'video/mp4',
      m4v: 'video/mp4',
      mov: 'video/quicktime',
      webm: 'video/webm',
      json: 'application/json',
    } as Record<string, string>
  )[ext] ?? 'application/octet-stream';
}

export interface ImportBundle {
  /** Drafts files found (usually one). */
  drafts: File[];
  /** Images and videos by file name (see mediaKey). */
  media: Map<string, File>;
}

/** Sorts picked files into drafts files and media, opening any .zip on the way. */
export async function collectImportFiles(files: File[]): Promise<ImportBundle> {
  const drafts: File[] = [];
  const media = new Map<string, File>();
  const take = (f: File) => {
    if (isDraftsJson(f)) drafts.push(f);
    else if (isImageFile(f) || isVideoFile(f)) media.set(mediaKey(f.name), f);
  };
  for (const f of files) {
    if (!isZip(f)) {
      take(f);
      continue;
    }
    const zip = await JSZip.loadAsync(await f.arrayBuffer());
    for (const entry of Object.values(zip.files)) {
      const name = baseName(entry.name);
      if (entry.dir || !name || name.startsWith('.') || entry.name.includes('__MACOSX')) continue;
      const blob = await entry.async('blob');
      take(new File([blob], name, { type: mimeFor(name) }));
    }
  }
  return { drafts, media };
}

/** Finds the file a post's media name refers to, if it was picked. */
export function findMedia(media: Map<string, File>, name: string): File | undefined {
  return media.get(mediaKey(name));
}
