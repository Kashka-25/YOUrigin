import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { db } from '../../db/db';
import { createContent } from '../../db/content';
import { defaultPhotoLayers } from '../../print/photoPages';
import type { BookEntry, ContentItem } from '../../domain/types';
import { ReadingPiece } from './ReadingPiece';

// The picture's words lay out from the frame's size, which jsdom doesn't measure.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 400 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 620 });
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(cleanup);

async function poem(): Promise<ContentItem> {
  const id = await createContent({ title: 'North Star', body: 'The one in my heart.', type: 'poem', status: 'seed', tagNames: [] });
  return (await db.content.get(id))!;
}
const entryFor = (item: ContentItem, photo?: BookEntry['photo']): BookEntry => ({ id: 'e', bookId: 'b', sectionId: 's', contentId: item.id, order: 0, createdAt: 1, updatedAt: 1, ...(photo ? { photo } : {}) });

describe('editing while reading a book', () => {
  it('reads as plain text until editing is on', async () => {
    const item = await poem();
    render(<ReadingPiece item={item} entry={entryFor(item)} editing={false} aspect={0.65} />);
    expect(screen.getByText('North Star')).toBeTruthy();
    expect(screen.getByText('The one in my heart.')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('changes the title and words where they sit, and saves them to the piece', async () => {
    const item = await poem();
    render(<ReadingPiece item={item} entry={entryFor(item)} editing aspect={0.65} />);
    const words = screen.getByLabelText('Words of North Star');
    await act(async () => {
      fireEvent.focus(words);
      fireEvent.change(words, { target: { value: 'The brightest star of all;\nThe one in my heart.' } });
      fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'North Star (ii)' } });
      fireEvent.blur(words);
    });
    await act(() => new Promise((r) => setTimeout(r, 50)));
    const saved = (await db.content.get(item.id))!;
    expect(saved.body).toBe('The brightest star of all;\nThe one in my heart.');
    expect(saved.title).toBe('North Star (ii)');
  });

  it('shows a piece set on a photo as its photo page, and typing on the picture edits the poem itself', async () => {
    const item = await poem();
    const photo = { assetId: 'photo', layers: defaultPhotoLayers('Cassidy Rae') };
    const { container } = render(<ReadingPiece item={item} entry={entryFor(item, photo)} editing aspect={0.65} />);
    expect(container.querySelector('figure')).toBeTruthy();
    // No plain text box: the words live on the picture.
    expect(screen.queryByLabelText('Words of North Star')).toBeNull();
    await act(async () => {
      fireEvent.click(container.querySelector('figure > div')!);
    });
    const onPicture = screen.getByLabelText('Words on the picture') as HTMLTextAreaElement;
    expect(onPicture.value).toBe('The one in my heart.');
    await act(async () => {
      fireEvent.change(onPicture, { target: { value: 'The one in my heart, still.' } });
      fireEvent.blur(onPicture);
    });
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect((await db.content.get(item.id))!.body).toBe('The one in my heart, still.');
    // The name beneath is the page's own words, not the poem's.
    expect((await db.content.get(item.id))!.title).toBe('North Star');
  });

  it('can’t be typed on when only reading', async () => {
    const item = await poem();
    const photo = { assetId: 'photo', layers: defaultPhotoLayers('') };
    const { container } = render(<ReadingPiece item={item} entry={entryFor(item, photo)} editing={false} aspect={0.65} />);
    await act(async () => {
      fireEvent.click(container.querySelector('figure > div')!);
    });
    expect(screen.queryByLabelText('Words on the picture')).toBeNull();
  });
});
