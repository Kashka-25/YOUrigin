// Automatic image shrinker. Everything happens on the device: images are
// resized to print resolution and re-compressed before they're stored or synced.

/** 2700px covers a full 6×9in page at 300dpi — sharp in print, far smaller than phone photos. */
export const PRINT_MAX_EDGE = 2700;
const TARGET_BYTES = 900_000;

export interface ShrunkImage {
  dataUrl: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  originalBytes: number;
  /** The file name to keep: a converted HEIC photo ends in .jpg. */
  name: string;
}

// ---- HEIC / HEIF ---------------------------------------------------------------
// Phones (iPhone, and Samsung with "high efficiency" photos on) save HEIC, which
// only Safari can read. Such photos are converted to JPEG on the device before
// anything else happens. The decoder is only downloaded when one arrives.

const HEIC_TYPE = /^image\/hei[cf](-sequence)?$/i;
const HEIC_NAME = /\.hei[cf]$/i;
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);

/** True for HEIC/HEIF photos, by type, by name, or (when a share arrives without either) by the file's first bytes. */
export async function isHeicFile(file: Blob & { name?: string }): Promise<boolean> {
  if (HEIC_TYPE.test(file.type) || HEIC_NAME.test(file.name ?? '')) return true;
  if (file.type && file.type !== 'application/octet-stream') return false;
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const box = String.fromCharCode(...head.slice(4, 8));
    const brand = String.fromCharCode(...head.slice(8, 12));
    return box === 'ftyp' && HEIC_BRANDS.has(brand);
  } catch {
    return false;
  }
}

/** Converts a HEIC/HEIF photo to a JPEG file with the same name ending in .jpg; anything else is returned as it is. */
export async function readableImage(file: File): Promise<{ file: File; converted: boolean }> {
  if (!(await isHeicFile(file))) return { file, converted: false };
  try {
    const { heicTo } = await import('heic-to');
    const jpeg = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
    const name = `${(file.name || 'photo').replace(/\.hei[cf]$/i, '')}.jpg`;
    return { file: new File([jpeg], name, { type: 'image/jpeg', lastModified: file.lastModified }), converted: true };
  } catch (e) {
    console.error(e);
    throw new Error('This HEIC photo couldn’t be converted. Try sharing it again, or save it as a JPEG first.', { cause: e });
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  // Sample a grid rather than every pixel — fast and reliable enough for artwork.
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] < 250) return true;
  return false;
}

/**
 * Shrinks an image file for storage: at most PRINT_MAX_EDGE on its long side,
 * WebP where the browser supports it (keeps transparency), otherwise JPEG/PNG.
 * Quality steps down only until the file is a sensible size.
 */
export async function shrinkImage(input: File, maxEdge = PRINT_MAX_EDGE): Promise<ShrunkImage> {
  if (input.type === 'image/svg+xml') {
    return { dataUrl: await blobToDataUrl(input), mime: input.type, width: 0, height: 0, bytes: input.size, originalBytes: input.size, name: input.name };
  }
  // HEIC becomes JPEG (and stays JPEG, or PNG if it has transparency), so it opens everywhere.
  const { file, converted } = await readableImage(input);
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  const draw = () => {
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return ctx;
  };
  const ctx = draw();
  const transparent = hasTransparency(ctx, canvas.width, canvas.height);

  let best: Blob | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0 && attempt % 3 === 0) {
      scale *= 0.85; // still too big at lower quality: reduce dimensions a little
      draw();
    }
    const quality = [0.86, 0.78, 0.7][attempt % 3];
    let blob = converted ? null : await toBlob(canvas, 'image/webp', quality);
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, transparent ? 'image/png' : 'image/jpeg', transparent ? undefined : quality);
    if (!blob) break;
    best = blob;
    if (blob.size <= TARGET_BYTES || blob.type === 'image/png') break;
  }
  bitmap.close();

  // Never make a file bigger: keep the original if it was already smaller and not oversized.
  const original = scale === 1 && best && file.size <= best.size && file.size <= TARGET_BYTES * 1.2;
  const out = original || !best ? file : best;
  return {
    dataUrl: await blobToDataUrl(out),
    mime: out.type || file.type,
    width: canvas.width,
    height: canvas.height,
    bytes: out.size,
    originalBytes: input.size,
    name: file.name,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
