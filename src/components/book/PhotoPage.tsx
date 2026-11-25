import { useState } from 'react';
import type { EntryPhoto } from '../../domain/types';
import { photoLayers } from '../../print/photoPages';
import { AssetImage } from '../AssetImage';
import { TextOnPicture } from '../posts/TextOnPicture';

/**
 * A piece's page set on a photo, as the book shows it: the photo at the page's shape with
 * the piece's own words on it. With `onChange`, tapping the words types straight onto the
 * picture, and what is typed changes the piece itself (its words are linked, not copied).
 */
export function PhotoPage({
  photo,
  title,
  body,
  aspect,
  onChange,
  onTyping,
  className = '',
}: {
  photo: EntryPhoto;
  title: string;
  body: string;
  /** Page width ÷ height, from the book's trim. */
  aspect: number;
  onChange?: (patch: { title?: string; body?: string }) => void;
  /** Called when typing on the picture starts (true) or stops (false). */
  onTyping?: (typing: boolean) => void;
  className?: string;
}) {
  const [typing, setTyping] = useState<string | null>(null);
  const layers = photoLayers(photo, { title, body });
  const poem = layers.find((l) => l.bind === 'body');
  const setEditing = (id: string | null) => {
    setTyping(id);
    onTyping?.(!!id);
  };
  return (
    <div
      className={`relative mx-auto w-full max-w-[28rem] overflow-hidden rounded-sm shadow-lg ${onChange ? 'cursor-text' : ''} ${className}`}
      style={{ aspectRatio: String(aspect) }}
      onClick={() => onChange && poem && !typing && setEditing(poem.id)}
    >
      <AssetImage id={photo.assetId} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <TextOnPicture
        layers={layers}
        editing={onChange ? typing : null}
        onEditingChange={setEditing}
        onEditText={
          onChange
            ? (id, text) => {
                const l = layers.find((x) => x.id === id);
                if (l?.bind === 'body') onChange({ body: text });
                else if (l?.bind === 'title') onChange({ title: text });
              }
            : undefined
        }
      />
    </div>
  );
}
