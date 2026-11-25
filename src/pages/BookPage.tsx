import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, List, Plus, SlidersHorizontal } from 'lucide-react';
import { db } from '../db/db';
import { addPage } from '../db/books';
import { snapshotRevision, updateContent } from '../db/content';
import { useAutosave } from '../hooks/useAutosave';
import { useLibrary } from '../hooks/useLibrary';
import { shiftHighlights } from '../domain/highlights';
import { displayTitle } from '../domain/text';
import type { ContentItem, Highlight } from '../domain/types';
import { AutoTextarea } from '../components/AutoTextarea';
import { AssetImage } from '../components/AssetImage';
import { StatusDot } from '../components/book/StatusDot';
import { PhotoPage } from '../components/book/PhotoPage';
import { resolveDesign } from '../print/design';
import { pageAspect } from '../print/photoPages';
import { EmptyState, SaveIndicator, Spinner } from '../components/ui';
import { glossaryPath, pagePath, useBookPages } from './BookGlossary';

/**
 * The clean writing view: one page of a book at a time, its title and its words.
 * The glossary, Previous / Next and a new page are always one tap away.
 */
export function BookPage() {
  const { id, pieceId } = useParams();
  const lib = useLibrary();
  const data = useBookPages(id);
  // null once looked up and missing; undefined only while loading.
  const item = useLiveQuery(async () => (pieceId ? ((await db.content.get(pieceId)) ?? null) : null), [pieceId]);
  if (!lib || item === undefined) return <Spinner />;
  if (!data) return <EmptyState title="Book not found" action={<Link to="/initiatives" className="btn">All projects</Link>} />;
  if (!item || item.deletedAt)
    return (
      <EmptyState title="This page could not be found" action={<Link to={glossaryPath(data.book.id)} className="btn">Back to the glossary</Link>}>
        It may have been moved to the Trash.
      </EmptyState>
    );
  return <PageEditor key={item.id} item={item} data={data} />;
}

function PageEditor({ item, data }: { item: ContentItem; data: NonNullable<ReturnType<typeof useBookPages>> }) {
  const nav = useNavigate();
  const lib = useLibrary();
  const location = useLocation();
  const { book, flat } = data;
  const at = flat.findIndex((p) => p.item.id === item.id);
  const here = at >= 0 ? flat[at] : null;
  const prev = at > 0 ? flat[at - 1].item : null;
  const next = at >= 0 && at < flat.length - 1 ? flat[at + 1].item : null;

  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [adding, setAdding] = useState(false);
  // Highlighter marks made in the full editor keep to their words while writing here.
  const marks = useRef<Highlight[]>(item.highlights ?? []);
  const latest = useRef({ title, body });
  useEffect(() => {
    latest.current = { title, body };
  });

  const save = useCallback(
    async (v: { title: string; body: string }) => {
      await snapshotRevision(item.id);
      await updateContent(item.id, { ...v, ...(item.highlights ? { highlights: marks.current } : {}) });
    },
    [item.id, item.highlights],
  );
  const { state, schedule, flush } = useAutosave(save);
  const changeBody = (nextBody: string) => {
    marks.current = shiftHighlights(latest.current.body, nextBody, marks.current);
    setBody(nextBody);
    schedule({ title: latest.current.title, body: nextBody });
  };
  const changeTitle = (nextTitle: string) => {
    setTitle(nextTitle);
    schedule({ title: nextTitle, body: latest.current.body });
  };

  // Changes arriving from elsewhere (another device, a restore) show once nothing is waiting to save.
  useEffect(() => {
    if (state !== 'saved') return;
    setTitle(item.title);
    if (item.body !== latest.current.body) marks.current = shiftHighlights(latest.current.body, item.body, marks.current);
    setBody(item.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.title, item.body]);

  // A page that was just added opens ready to name.
  const fresh = (location.state as { fresh?: boolean } | null)?.fresh;
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (fresh) titleRef.current?.focus();
  }, [fresh]);

  const go = (to: string, state?: unknown) => {
    void flush();
    nav(to, { state });
  };
  const newPage = async () => {
    if (adding) return;
    setAdding(true);
    try {
      await flush();
      const id = await addPage(book.id, here ? (here.section?.id ?? null) : null, here ? item.id : null);
      nav(pagePath(book.id, id), { state: { fresh: true } });
    } finally {
      setAdding(false);
    }
  };

  // Alt + ← / → turn the page on a keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const to = e.key === 'ArrowLeft' ? prev : e.key === 'ArrowRight' ? next : null;
      if (!to) return;
      e.preventDefault();
      go(pagePath(book.id, to.id));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const chapter = here ? (here.section?.title ?? 'Not in a chapter yet') : 'Not in this book';
  // Set on a photo in this book: the page shows the photo, and the words can be typed on it.
  const photo = lib?.entries.find((e) => e.bookId === book.id && e.contentId === item.id)?.photo;

  return (
    <div className="min-h-dvh bg-card text-ink">
      <header className="sticky top-0 z-20 flex items-center gap-1 border-b border-line/70 bg-card/95 px-2 py-1.5 backdrop-blur">
        <button type="button" className="btn-ghost" onClick={() => go(glossaryPath(book.id))}>
          <List size={16} /> Glossary
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-xs text-muted">
          <span className="font-semibold tracking-[0.15em] uppercase">{chapter}</span>
          {at >= 0 && <span className="tabular-nums"> · {at + 1} of {flat.length}</span>}
        </span>
        <span className="hidden sm:inline">
          <SaveIndicator state={state} />
        </span>
        <button type="button" className="btn-ghost" disabled={adding} onClick={() => void newPage()} title="Add a blank page after this one, in the same chapter">
          <Plus size={16} /> New page
        </button>
      </header>

      <main className="mx-auto max-w-[38rem] px-5 pt-10 pb-40">
        <div className="flex items-center gap-1">
          <span className="-ml-2">
            <StatusDot value={item.status} what={displayTitle(item)} size="lg" onChange={(s) => void updateContent(item.id, { status: s })} />
          </span>
          <label htmlFor="page-title" className="sr-only">
            Title
          </label>
          <input
            id="page-title"
            ref={titleRef}
            value={title}
            onChange={(e) => changeTitle(e.target.value)}
            onBlur={() => void flush()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('page-words')?.focus();
              }
            }}
            placeholder="Title"
            className="min-w-0 flex-1 bg-transparent font-serif text-3xl leading-tight text-ink placeholder:text-muted/60 focus:outline-none focus-visible:outline-none md:text-4xl"
          />
        </div>
        {item.type === 'image' && item.assetId && <AssetImage id={item.assetId} alt={title} className="mt-6 max-h-[70dvh] w-auto max-w-full rounded-xl" />}
        {photo && item.type !== 'image' && (
          <figure className="mt-6">
            <PhotoPage
              photo={photo}
              title={title}
              body={body}
              aspect={pageAspect(resolveDesign(book))}
              onChange={(patch) => {
                if (patch.body !== undefined) changeBody(patch.body);
                if (patch.title !== undefined) changeTitle(patch.title);
              }}
              onTyping={(on) => !on && void flush()}
            />
            <figcaption className="mt-2 text-center text-xs text-muted">On a photo in this book. Tap the words to type on it, or write below.</figcaption>
          </figure>
        )}
        <label htmlFor="page-words" className="sr-only">
          Words
        </label>
        <AutoTextarea
          id="page-words"
          value={body}
          onChange={changeBody}
          onBlur={() => void flush()}
          placeholder="Begin here…"
          className="writing mt-6 block w-full resize-none bg-transparent text-[1.2rem] leading-[1.8] text-ink placeholder:text-muted/60 focus:outline-none focus-visible:outline-none"
        />
        <p className="mt-10 flex justify-between gap-3 text-xs text-muted">
          <span className="sm:hidden">
            <SaveIndicator state={state} />
          </span>
          <Link to={`/item/${item.id}?book=${book.id}`} onClick={() => void flush()} className="ml-auto inline-flex items-center gap-1 hover:text-ink">
            <SlidersHorizontal size={13} /> More tools for this page
          </Link>
        </p>
      </main>

      <nav aria-label="Turn the page" className="fixed inset-x-0 bottom-0 z-20 border-t border-line/70 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-[38rem] items-center gap-1 px-2 py-1.5">
          {prev ? (
            <button type="button" className="btn-ghost min-w-0 flex-1 justify-start px-2" onClick={() => go(pagePath(book.id, prev.id))} title={displayTitle(prev)}>
              <ChevronLeft size={18} className="shrink-0" />
              <span className="truncate">{displayTitle(prev)}</span>
            </button>
          ) : (
            <span className="flex-1 px-2 text-sm text-muted">First page</span>
          )}
          <button type="button" className="btn-ghost shrink-0 px-2" onClick={() => go(glossaryPath(book.id))} aria-label="Glossary">
            <List size={18} />
          </button>
          {next ? (
            <button type="button" className="btn-ghost min-w-0 flex-1 justify-end px-2" onClick={() => go(pagePath(book.id, next.id))} title={displayTitle(next)}>
              <span className="truncate">{displayTitle(next)}</span>
              <ChevronRight size={18} className="shrink-0" />
            </button>
          ) : (
            <button type="button" className="btn-ghost flex-1 justify-end px-2" disabled={adding} onClick={() => void newPage()}>
              <Plus size={16} /> New page
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
