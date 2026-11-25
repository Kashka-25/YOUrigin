import { useMemo, useState } from 'react';
import { ImageIcon, Images, Type, Undo2 } from 'lucide-react';
import type { BookEntry, ContentItem } from '../../domain/types';
import { useLibrary } from '../../hooks/useLibrary';
import { usePosts } from '../../db/posts';
import { setEntryPhoto } from '../../db/books';
import { useTextStyles } from '../../db/textStyles';
import { resolveDesign } from '../../print/design';
import { defaultPhotoLayers, pageAspect, photoLayers } from '../../print/photoPages';
import { isArtwork } from '../art/art';
import { Modal } from '../Modal';
import { AssetImage } from '../AssetImage';
import { TextOnPicture } from '../posts/TextOnPicture';
import { TextStudio } from '../posts/TextStudio';

/** Photos to set a page on: Gallery photos first, then the photos used in posts (each once). */
function PhotoPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (assetId: string) => void }) {
  const lib = useLibrary();
  const posts = usePosts();
  const gallery = useMemo(
    () => (lib?.items ?? []).filter((i) => isArtwork(i) && !i.archived && i.assetId && !i.clipId).sort((a, b) => b.createdAt - a.createdAt).map((i) => i.assetId!),
    [lib],
  );
  const fromPosts = useMemo(() => {
    const seen = new Set(gallery);
    const out: string[] = [];
    for (const p of [...(posts ?? [])].sort((a, b) => b.updatedAt - a.updatedAt)) {
      for (const m of p.media) {
        if (m.kind === 'asset' && !seen.has(m.assetId)) {
          seen.add(m.assetId);
          out.push(m.assetId);
        }
      }
    }
    return out;
  }, [posts, gallery]);
  const grid = (ids: string[], label: string) => (
    <ol className="grid grid-cols-3 gap-1 sm:grid-cols-4" aria-label={label}>
      {ids.map((id) => (
        <li key={id}>
          <button type="button" className="block aspect-[4/5] w-full overflow-hidden rounded-md bg-paper-2 hover:ring-2 hover:ring-accent" onClick={() => onPick(id)} aria-label="Use this photo">
            <AssetImage id={id} alt="" className="h-full w-full object-cover" />
          </button>
        </li>
      ))}
    </ol>
  );
  return (
    <Modal open={open} onClose={onClose} title="Choose a photo">
      <div className="max-h-[65vh] space-y-4 overflow-y-auto">
        {gallery.length > 0 && (
          <section>
            <h3 className="label">Gallery</h3>
            {grid(gallery, 'Gallery photos')}
          </section>
        )}
        {fromPosts.length > 0 && (
          <section>
            <h3 className="label">From your posts</h3>
            {grid(fromPosts, 'Photos in your posts')}
          </section>
        )}
        {!gallery.length && !fromPosts.length && <p className="py-6 text-sm text-ink-2">No photos yet. Add some to your Gallery or to a post first.</p>}
      </div>
    </Modal>
  );
}

/**
 * Sets a piece on a photo in one book: its own page, edge to edge, with the piece's words
 * placed on the picture. The words stay linked to the piece, so it is still written once.
 */
export function PhotoPageControl({ entry, item }: { entry: BookEntry; item: ContentItem }) {
  const lib = useLibrary();
  const styles = useTextStyles();
  const [picking, setPicking] = useState(false);
  const [writing, setWriting] = useState(false);
  const book = lib?.books.find((b) => b.id === entry.bookId);
  if (!book) return null;
  const design = resolveDesign(book);
  const aspect = pageAspect(design);
  const photo = entry.photo;
  const layers = photo ? photoLayers(photo, item) : [];

  const pick = (assetId: string) => {
    setPicking(false);
    void setEntryPhoto(entry.id, { assetId, layers: photo?.layers ?? defaultPhotoLayers(design.author, styles) });
    setWriting(true);
  };

  return (
    <section>
      <h2 className="label flex items-center gap-1">
        <ImageIcon size={12} aria-hidden /> On a photo
      </h2>
      <p className="mb-1.5 text-xs text-muted">In “{book.title}”: its own page, edge to edge, with the words on the picture.</p>
      {photo ? (
        <>
          <button
            type="button"
            className="relative mb-2 block w-32 overflow-hidden rounded-md border border-line"
            style={{ aspectRatio: String(aspect) }}
            onClick={() => setWriting(true)}
            aria-label="Place the words on the photo"
          >
            <AssetImage id={photo.assetId} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <TextOnPicture layers={layers} />
          </button>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="btn min-h-9 px-3 text-sm" onClick={() => setWriting(true)}>
              <Type size={15} /> Place the words
            </button>
            <button type="button" className="btn min-h-9 px-3 text-sm" onClick={() => setPicking(true)}>
              <Images size={15} /> Change photo
            </button>
            <button type="button" className="btn-ghost min-h-9 px-2 text-sm" onClick={() => void setEntryPhoto(entry.id, undefined)}>
              <Undo2 size={15} /> Back on the page
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="btn min-h-9 px-3 text-sm" onClick={() => setPicking(true)}>
          <Images size={15} /> Set it on a photo
        </button>
      )}
      <PhotoPicker open={picking} onClose={() => setPicking(false)} onPick={pick} />
      {photo && writing && (
        <TextStudio
          open
          onClose={() => setWriting(false)}
          assetId={photo.assetId}
          layers={layers}
          tall={false}
          aspect={aspect}
          title="Words on the photo"
          world="worlds-stories"
          slideName={`${book.title} - ${item.title || 'page'}`}
          onChange={(next) => void setEntryPhoto(entry.id, { ...photo, layers: next })}
        />
      )}
    </section>
  );
}
