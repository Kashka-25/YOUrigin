import { useEffect, useRef, useState } from 'react';
import type { BookEntry, ContentItem } from '../../domain/types';
import { updateContent } from '../../db/content';
import { useAutosave } from '../../hooks/useAutosave';
import { AutoTextarea } from '../AutoTextarea';
import { AssetImage } from '../AssetImage';
import { PhotoPage } from './PhotoPage';

/**
 * One piece in the book's reading view. Read as a page; with `editing` on, its title and
 * words can be changed right where they sit, and a piece set on a photo can be typed on
 * the picture itself. Changes save to the piece as you go (it exists once, so every book,
 * post and page showing it follows).
 */
export function ReadingPiece({ item, entry, editing, aspect }: { item: ContentItem; entry: BookEntry | undefined; editing: boolean; aspect: number }) {
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const focused = useRef(false);
  const { state, schedule, flush } = useAutosave<{ title: string; body: string }>((v) => updateContent(item.id, v));

  // Changes made elsewhere (another device, the piece's own page) show here, unless this
  // piece is being typed in right now.
  useEffect(() => {
    if (focused.current || state === 'unsaved' || state === 'saving') return;
    setTitle(item.title);
    setBody(item.body);
  }, [item.title, item.body, state]);

  const set = (patch: Partial<{ title: string; body: string }>) => {
    const next = { title, body, ...patch };
    setTitle(next.title);
    setBody(next.body);
    schedule(next);
  };
  const track = {
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      void flush();
    },
  };

  // Set on a photo in this book: the photo page, with the piece's own words on it.
  if (entry?.photo && item.type !== 'image') {
    return (
      <figure className="my-10">
        <PhotoPage
          photo={entry.photo}
          title={title}
          body={body}
          aspect={aspect}
          onChange={editing ? set : undefined}
          onTyping={(on) => {
            focused.current = on;
            if (!on) void flush();
          }}
        />
        {editing && (
          <figcaption className="no-print mt-2 text-center font-sans text-xs text-muted">
            {state === 'saving' || state === 'unsaved' ? 'Saving…' : 'Tap the words to type on the photo.'}
          </figcaption>
        )}
      </figure>
    );
  }

  if (!editing) {
    return (
      <>
        {item.title && <h3 className="mb-5 text-[1.4em] leading-snug font-normal">{item.title}</h3>}
        {item.type === 'image' && item.assetId && <AssetImage id={item.assetId} alt={item.title} className="mx-auto my-4 max-h-[80dvh] max-w-full" />}
        <div className={`writing ${item.type === 'prompt' ? 'italic' : ''} ${item.type === 'image' ? 'text-center text-[0.85em] italic' : ''}`}>{item.body}</div>
      </>
    );
  }

  const plain = 'w-full resize-none border-0 bg-transparent p-0 text-inherit focus:outline-none focus:ring-0';
  return (
    <>
      <input
        className={`${plain} mb-5 block text-[1.4em] leading-snug font-normal placeholder:text-muted/60`}
        value={title}
        placeholder="Title"
        aria-label="Title"
        onChange={(e) => set({ title: e.target.value })}
        {...track}
      />
      {item.type === 'image' && item.assetId && <AssetImage id={item.assetId} alt={item.title} className="mx-auto my-4 max-h-[80dvh] max-w-full" />}
      <span onFocus={track.onFocus} onBlur={track.onBlur}>
        <AutoTextarea
          id={`read-${item.id}`}
          minHeight={40}
          className={`writing ${plain} leading-[inherit] ${item.type === 'prompt' ? 'italic' : ''} ${item.type === 'image' ? 'text-center text-[0.85em] italic' : ''}`}
          ariaLabel={`Words of ${item.title || 'this piece'}`}
          placeholder="Write…"
          value={body}
          onChange={(v) => set({ body: v })}
        />
      </span>
      {(state === 'saving' || state === 'unsaved' || state === 'error') && (
        <p className="no-print mt-1 font-sans text-xs text-muted">{state === 'error' ? 'Couldn’t save. Keep this open and try again.' : 'Saving…'}</p>
      )}
    </>
  );
}
