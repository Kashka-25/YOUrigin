import { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { useToast } from '../Toast';
import { addToGallery, carouselFromGallery, ideasFromGallery } from '../../db/gallery';
import { useNavigate } from 'react-router-dom';
import { DEMO } from '../../demo/mode';
import { POST_MEDIA_ACCEPT } from '../../io/postMedia';
import { Link } from 'react-router-dom';
import { useLibrary } from '../../hooks/useLibrary';
import { EmptyState } from '../ui';
import { ArtGrid } from './ArtGrid';
import { isArtwork } from './art';

/**
 * The Gallery: every picture and video as tiles, narrowed by collection, tag or project.
 * Lives in Posts (beside Ideas); `addable` adds a button for photos and videos from this device.
 */
export function GalleryView({ addable = false }: { addable?: boolean }) {
  const lib = useLibrary();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  // Select mode (Posts only): pictures tapped in order become a carousel, or separate ideas.
  const [selecting, setSelecting] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const stopSelecting = () => {
    setSelecting(false);
    setChosen([]);
  };
  const makeCarousel = async () => {
    const id = await carouselFromGallery(chosen);
    stopSelecting();
    if (id) navigate(`/posts/${id}`);
  };
  const makeIdeas = async () => {
    const n = await ideasFromGallery(chosen);
    stopSelecting();
    toast(n ? `${n} idea${n === 1 ? '' : 's'} added. They’re in Ideas.` : 'Nothing was added.');
  };
  const add = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const { images, videos } = await addToGallery(files);
      const parts = [images ? `${images} ${images === 1 ? 'photo' : 'photos'}` : '', videos ? `${videos} ${videos === 1 ? 'video' : 'videos'}` : ''].filter(Boolean);
      toast(parts.length ? `Added ${parts.join(' and ')}.` : 'Those files aren’t photos or videos.');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const [scope, setScope] = useState('');
  const [mine, setMine] = useState(true);
  if (!lib) return null;

  const art = lib.items.filter((i) => isArtwork(i) && !i.archived);
  const inScope = art.filter((i) => {
    if (!!i.inspiration === mine) return false;
    const [kind, id] = scope.split(':');
    if (kind === 'c') return !!lib.collections.find((c) => c.id === id)?.contentIds.includes(i.id);
    if (kind === 't') return i.tagIds.includes(id);
    if (kind === 'p') return lib.entries.some((e) => e.bookId === id && e.contentId === i.id);
    return true;
  });
  const tagsOnArt = lib.tags.filter((t) => art.some((i) => i.tagIds.includes(t.id))).sort((a, b) => a.name.localeCompare(b.name));
  const projectsWithArt = lib.books.filter((b) => !b.archived && lib.entries.some((e) => e.bookId === b.id && art.some((i) => i.id === e.contentId)));
  const collectionsWithArt = lib.collections.filter((c) => art.some((i) => c.contentIds.includes(i.id)));

  return (
    <div className="mt-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full border border-line p-0.5 text-sm" role="group" aria-label="Whose art">
          {[
            [true, 'My art'],
            [false, 'Inspiration'],
          ].map(([v, label]) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={mine === v}
              onClick={() => setMine(v as boolean)}
              className={`rounded-full px-3 py-1 ${mine === v ? 'bg-paper-2 font-semibold text-ink' : 'text-ink-2'}`}
            >
              {label as string}
            </button>
          ))}
        </div>
        {(collectionsWithArt.length > 0 || tagsOnArt.length > 0 || projectsWithArt.length > 0) && (
          <select aria-label="Show" className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink-2" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">Everything</option>
            {projectsWithArt.length > 0 && (
              <optgroup label="Projects">
                {projectsWithArt.map((b) => (
                  <option key={b.id} value={`p:${b.id}`}>
                    {b.title}
                  </option>
                ))}
              </optgroup>
            )}
            {collectionsWithArt.length > 0 && (
              <optgroup label="Collections">
                {collectionsWithArt.map((c) => (
                  <option key={c.id} value={`c:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            {tagsOnArt.length > 0 && (
              <optgroup label="Tags">
                {tagsOnArt.map((t) => (
                  <option key={t.id} value={`t:${t.id}`}>
                    #{t.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}
        <span className="ml-auto text-sm text-muted tabular-nums">{inScope.length}</span>
        {addable && (
          <>
            <button type="button" className={selecting ? 'btn-primary' : 'btn'} aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
              {selecting ? 'Done' : 'Select'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>
              <ImagePlus size={16} /> {busy ? 'Adding…' : 'Add photos & videos'}
            </button>
            <input
              ref={input}
              type="file"
              accept={POST_MEDIA_ACCEPT}
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-label="Photos and videos for the Gallery"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                void add(files);
              }}
            />
          </>
        )}
      </div>
      {selecting && <p className="mb-3 text-sm text-ink-2">{chosen.length ? `${chosen.length} selected, in the order you tapped them.` : 'Tap pictures in the order you want them.'}</p>}
      <ArtGrid
        chosen={selecting ? chosen : undefined}
        onToggle={toggle}
        onLongPress={addable ? (id) => {
          setSelecting(true);
          setChosen((c) => (c.includes(id) ? c : [...c, id]));
        } : undefined}
        items={inScope.sort((a, b) => b.createdAt - a.createdAt)}
        empty={
          <EmptyState
            title={mine ? 'No art here yet' : 'No inspiration saved yet'}
            action={
              addable ? (
                <button type="button" className="btn-primary" onClick={() => input.current?.click()}>
                  Add photos & videos
                </button>
              ) : (
                <Link to="/?focus=1" className="btn-primary">
                  Add art
                </Link>
              )
            }
          >
            {mine ? 'Share photos and videos to YOUrigin from your phone’s gallery, or add them here.' : 'Mark an image as Inspiration on its page to keep it here, apart from your own work.'}
          </EmptyState>
        }
      />
      {selecting && chosen.length > 0 && (
        <div className={`sticky ${DEMO ? 'bottom-[calc(124px+env(safe-area-inset-bottom))]' : 'bottom-[calc(64px+env(safe-area-inset-bottom))]'} z-20 mt-4 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-line bg-card/95 p-3 backdrop-blur md:bottom-0`}>
          <button type="button" className={chosen.length > 1 ? 'btn' : 'btn-primary'} onClick={() => void makeIdeas()}>
            {chosen.length > 1 ? 'Make separate ideas' : 'Make an idea'}
          </button>
          {chosen.length > 1 && (
            <button type="button" className="btn-primary" onClick={() => void makeCarousel()}>
              Make a carousel ({chosen.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
