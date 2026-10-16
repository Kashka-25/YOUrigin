import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../../hooks/useLibrary';
import { EmptyState } from '../ui';
import { ArtGrid } from './ArtGrid';
import { isArtwork } from './art';

/** The Library's Gallery: every artwork as pictures, narrowed by collection, tag or project. */
export function GalleryView() {
  const lib = useLibrary();
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
      </div>
      <ArtGrid
        items={inScope.sort((a, b) => b.createdAt - a.createdAt)}
        empty={
          <EmptyState
            title={mine ? 'No art here yet' : 'No inspiration saved yet'}
            action={
              <Link to="/?focus=1" className="btn-primary">
                Add art
              </Link>
            }
          >
            {mine ? 'Add pictures of your work from Gather.' : 'Mark an image as Inspiration on its page to keep it here, apart from your own work.'}
          </EmptyState>
        }
      />
    </div>
  );
}
