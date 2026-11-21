import { describe, expect, it, vi } from 'vitest';

const heicTo = vi.fn(async () => new Blob(['jpeg bytes'], { type: 'image/jpeg' }));
vi.mock('heic-to', () => ({ heicTo }));

const { isHeicFile, readableImage } = await import('./images');

/** A file whose first bytes are an ISO box header with the given brand, as HEIC photos have. */
function boxFile(brand: string, name = 'shared', type = '') {
  const head = new Uint8Array([0, 0, 0, 24, ...[...'ftyp'].map((c) => c.charCodeAt(0)), ...[...brand].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]);
  return new File([head], name, { type });
}

describe('HEIC photos', () => {
  it('are recognised by type, by name, or by their first bytes', async () => {
    expect(await isHeicFile(new File(['x'], 'IMG_1.jpg', { type: 'image/heic' }))).toBe(true);
    expect(await isHeicFile(new File(['x'], 'IMG_2.HEIF', { type: '' }))).toBe(true);
    expect(await isHeicFile(boxFile('heic'))).toBe(true);
    expect(await isHeicFile(boxFile('mif1', 'x', 'application/octet-stream'))).toBe(true);
    expect(await isHeicFile(boxFile('isom'))).toBe(false); // an MP4, not a photo
    expect(await isHeicFile(new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))).toBe(false);
  });

  it('are converted to a JPEG with the same name', async () => {
    const { file, converted } = await readableImage(new File(['heic'], 'Garden at dusk.heic', { type: 'image/heic', lastModified: 5 }));
    expect(converted).toBe(true);
    expect(file).toMatchObject({ name: 'Garden at dusk.jpg', type: 'image/jpeg', lastModified: 5 });
    expect(heicTo).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/jpeg' }));
  });

  it('other images pass through untouched', async () => {
    heicTo.mockClear();
    const png = new File(['png'], 'art.png', { type: 'image/png' });
    expect(await readableImage(png)).toEqual({ file: png, converted: false });
    expect(heicTo).not.toHaveBeenCalled();
  });

  it('a photo that can’t be decoded gives a plain message', async () => {
    heicTo.mockRejectedValueOnce(new Error('libheif: bad data'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(readableImage(new File(['?'], 'broken.heic', { type: 'image/heic' }))).rejects.toThrow(/couldn’t be converted/);
  });
});
