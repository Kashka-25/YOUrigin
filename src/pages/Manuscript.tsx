import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, List, Printer, Type } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { orderedBook } from '../io/export';
import { EmptyState, Spinner, StatusBadge } from '../components/ui';
import { AssetImage } from '../components/AssetImage';
import { PageFlowToggle } from '../components/book/PageFlowToggle';
import { readingPages, type ReadingPage, type ReadingPart } from '../domain/readingPages';
import { keyTurn, prefersReducedMotion, usePageFlow } from '../hooks/usePageFlow';
import { projectKind } from '../domain/constants';
import { displayTitle } from '../domain/text';
import type { Book, ContentItem, Section, Status } from '../domain/types';
import { glossaryPath } from './BookGlossary';

const STATUS_DOT: Record<Status, string> = { none: 'border border-line bg-transparent', seed: 'bg-seed', developing: 'bg-developing', polished: 'bg-polished' };

/** Scroll to an element by id (plain #anchors would clash with the app's hash routing). */
function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const SIZES = ['text-[1.05rem]', 'text-[1.2rem]', 'text-[1.35rem]'];

type Look = { size: string; showStatus: boolean };

/**
 * Read: the book as a reader meets it. In Pages (the default on a new device) one
 * piece per page, turned sideways; in Scroll the whole book runs top to bottom.
 */
export function Manuscript() {
  const { id } = useParams();
  const lib = useLibrary();
  const [params] = useSearchParams();
  const [size, setSize] = useState(1);
  const [showStatus, setShowStatus] = useState(false);
  const [flow, setFlow] = usePageFlow();

  const data = useMemo(() => {
    if (!lib || !id) return null;
    const book = lib.books.find((b) => b.id === id);
    if (!book) return null;
    const parts = orderedBook(
      lib.sections.filter((s) => s.bookId === id),
      lib.entries.filter((e) => e.bookId === id),
      lib.contentById,
    );
    return { book, parts };
  }, [lib, id]);

  const printing = !!params.get('print');
  useEffect(() => {
    if (data && printing) setTimeout(() => window.print(), 400);
  }, [data, printing]);

  if (!lib) return <Spinner />;
  if (!data) return <EmptyState title="Project not found" />;
  const { book, parts } = data;
  const paged = flow === 'pages' && !printing;
  const look = { size: SIZES[size], showStatus };

  const toolbar = (
    <div className={`no-print z-20 flex items-center gap-1 border-b border-line bg-card/95 px-2 py-2 backdrop-blur ${paged ? '' : 'sticky top-0'}`}>
      <Link to={`/projects/${book.id}`} className="btn-ghost px-2">
        <ArrowLeft size={16} /> Builder
      </Link>
      {projectKind(book) === 'book' && (
        <Link to={glossaryPath(book.id)} className="btn-ghost px-2" title="Every chapter and page, one tap to write" aria-label="Glossary">
          <List size={16} /> <span className="hidden sm:inline">Glossary</span>
        </Link>
      )}
      <div className="ml-auto flex items-center gap-1">
        <PageFlowToggle value={flow} onChange={setFlow} />
        <label className="mx-1 flex items-center gap-1.5 text-xs text-ink-2" title="Show how finished each piece is">
          <input type="checkbox" checked={showStatus} onChange={(e) => setShowStatus(e.target.checked)} aria-label="Show status" />
          <span className="hidden sm:inline">Show status</span>
        </label>
        <button type="button" className="btn-ghost px-2" onClick={() => setSize((s) => (s + 1) % SIZES.length)} aria-label="Change text size">
          <Type size={16} />
        </button>
        <button type="button" className="btn-ghost px-2" onClick={() => window.print()} aria-label="Print or save as PDF">
          <Printer size={16} />
        </button>
      </div>
    </div>
  );

  if (paged)
    return (
      <div className="flex h-dvh flex-col bg-card print:block print:h-auto">
        {toolbar}
        <PagedBook book={book} parts={parts} look={look} />
        {/* Printing always gives the whole book, top to bottom. */}
        <div className="hidden print:block">
          <ScrollBook book={book} parts={parts} look={look} />
        </div>
      </div>
    );

  return (
    <div className="min-h-dvh bg-card">
      {toolbar}
      <ScrollBook book={book} parts={parts} look={look} />
    </div>
  );
}

function Cover({ book }: { book: Book }) {
  return (
    <>
      <h1 className="text-5xl leading-tight font-normal md:text-6xl">{book.title}</h1>
      {book.subtitle && <p className="mt-4 text-xl text-ink-2 italic">{book.subtitle}</p>}
      {book.description && <p className="mt-10 max-w-md text-base text-ink-2">{book.description}</p>}
    </>
  );
}

function Contents({ parts, showStatus, onChapter, onPiece }: { parts: ReadingPart[]; showStatus: boolean; onChapter: (s: Section) => void; onPiece: (i: ContentItem) => void }) {
  return (
    <ol className="space-y-5">
      {parts.map(({ section, items }) => (
        <li key={section.id}>
          <button type="button" onClick={() => onChapter(section)} className="text-left font-semibold hover:underline">
            {section.title}
          </button>
          <ol className="mt-1 space-y-0.5 pl-4 text-[0.9em]">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                {showStatus && <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[item.status]}`} aria-label={item.status} />}
                <button type="button" onClick={() => onPiece(item)} className="truncate text-left text-ink-2 hover:text-ink hover:underline">
                  {displayTitle(item)}
                </button>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

function Piece({ item, showStatus }: { item: ContentItem; showStatus: boolean }) {
  return (
    <>
      {item.title && <h3 className="mb-5 text-[1.4em] leading-snug font-normal">{item.title}</h3>}
      {showStatus && (
        <p className="no-print mb-3">
          <Link to={`/item/${item.id}`}>
            <StatusBadge status={item.status} />
          </Link>
        </p>
      )}
      {item.type === 'image' && item.assetId && <AssetImage id={item.assetId} alt={item.title} className="mx-auto my-4 max-h-[70dvh] max-w-full" />}
      <div className={`writing ${item.type === 'prompt' ? 'italic' : ''} ${item.type === 'image' ? 'text-center text-[0.85em] italic' : ''}`}>{item.body}</div>
    </>
  );
}

const EMPTY_NOTE = 'This book has no placed pieces yet. Return to the Builder and drag material into its sections.';

/** The whole book as one long page, top to bottom. */
function ScrollBook({ book, parts, look }: { book: Book; parts: ReadingPart[]; look: Look }) {
  const nonEmpty = parts.filter((p) => p.items.length);
  return (
    <article className={`mx-auto max-w-[38rem] px-6 pb-32 font-serif ${look.size} leading-[1.75] text-ink`}>
      <header className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
        <Cover book={book} />
      </header>

      {nonEmpty.length > 1 && (
        <details open className="group print-break py-16" aria-label="Contents">
          <summary className="mb-6 flex cursor-pointer list-none items-center justify-center gap-2 text-center font-sans text-sm font-semibold tracking-[0.2em] text-muted uppercase [&::-webkit-details-marker]:hidden">
            Contents
            <span className="no-print text-xs tracking-normal normal-case transition-transform group-open:rotate-180" aria-hidden>
              ▾
            </span>
          </summary>
          <Contents parts={nonEmpty} showStatus={look.showStatus} onChapter={(s) => jump(`s-${s.id}`)} onPiece={(i) => jump(`p-${i.id}`)} />
        </details>
      )}

      {nonEmpty.length === 0 && <p className="py-20 text-center text-ink-2 italic">{EMPTY_NOTE}</p>}

      {nonEmpty.map(({ section, items }) => (
        <section key={section.id} id={`s-${section.id}`} className="print-break scroll-mt-16 pt-24">
          <h2 className="mb-14 text-center text-sm font-sans font-semibold tracking-[0.25em] text-muted uppercase">{section.title}</h2>
          {items.map((item, i) => (
            <div key={item.id} id={`p-${item.id}`} className="manuscript-piece scroll-mt-16">
              {i > 0 && (
                <p className="my-12 text-center text-muted" aria-hidden>
                  ⁂
                </p>
              )}
              <Piece item={item} showStatus={look.showStatus} />
            </div>
          ))}
        </section>
      ))}
    </article>
  );
}

const placeKey = (bookId: string) => `yourigin.read.page.${bookId}`;

function savedPlace(bookId: string) {
  try {
    return Number(sessionStorage.getItem(placeKey(bookId))) || 0;
  } catch {
    return 0;
  }
}

/**
 * One piece per page, turned sideways like a book: swipe, the arrow keys, or
 * ‹ previous / next ›. The place is kept for this visit, so coming back from the
 * glossary opens on the same page.
 */
function PagedBook({ book, parts, look }: { book: Book; parts: ReadingPart[]; look: Look }) {
  const pages = useMemo(() => readingPages(parts), [parts]);
  const nonEmpty = parts.filter((p) => p.items.length);
  const strip = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(() => savedPlace(book.id));
  const last = pages.length - 1;
  const here = Math.min(at, last);

  const turnTo = (i: number, smooth = true) => {
    const el = strip.current;
    if (!el || i < 0) return;
    const to = Math.min(last, i);
    el.scrollTo({ left: to * el.clientWidth, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
    setAt(to);
  };
  // Window listeners read the latest page and turn function through refs.
  const live = useRef({ turnTo, here });
  useEffect(() => {
    live.current = { turnTo, here };
  });

  // Open on the page last read in this visit; stay on it if the window changes size.
  useLayoutEffect(() => {
    live.current.turnTo(live.current.here, false);
    const onResize = () => live.current.turnTo(live.current.here, false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [book.id]);

  useEffect(() => {
    try {
      sessionStorage.setItem(placeKey(book.id), String(here));
    } catch {
      /* private mode */
    }
  }, [book.id, here]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = keyTurn(e);
      if (!dir) return;
      e.preventDefault();
      live.current.turnTo(live.current.here + (dir === 'next' ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A swipe moves the pages natively; this keeps the page number in step.
  const onScroll = () => {
    const el = strip.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== at) setAt(i);
  };

  const pageOf = (item: ContentItem) => pages.findIndex((p) => p.kind === 'piece' && p.item.id === item.id);
  const page = pages[here];
  const label = (p: ReadingPage | undefined) => (!p ? '' : p.kind === 'piece' ? displayTitle(p.item) : p.kind === 'contents' ? 'Contents' : p.kind === 'cover' ? 'Cover' : '');
  const pieceCount = pages.filter((p) => p.kind === 'piece').length;
  const pieceNo = page?.kind === 'piece' ? pages.slice(0, here + 1).filter((p) => p.kind === 'piece').length : 0;

  return (
    <>
      <div
        ref={strip}
        onScroll={onScroll}
        className={`book-pages no-print flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden font-serif ${look.size} leading-[1.75] text-ink`}
        aria-roledescription="book"
        aria-label={book.title}
      >
        {pages.map((p, i) => (
          <section
            key={p.kind === 'piece' ? p.item.id : p.kind}
            className="h-full w-full shrink-0 overflow-y-auto"
            aria-roledescription="page"
            aria-label={label(p) || `Page ${i + 1}`}
            aria-hidden={i !== here}
            inert={i !== here}
          >
            <div className="mx-auto flex min-h-full max-w-[38rem] flex-col px-6 pt-10 pb-16">
              {p.kind === 'cover' && (
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <Cover book={book} />
                </div>
              )}
              {p.kind === 'contents' && (
                <>
                  <h2 className="mb-6 text-center font-sans text-sm font-semibold tracking-[0.2em] text-muted uppercase">Contents</h2>
                  <Contents
                    parts={nonEmpty}
                    showStatus={look.showStatus}
                    onChapter={(s) => turnTo(pages.findIndex((x) => x.kind === 'piece' && x.section.id === s.id))}
                    onPiece={(item) => turnTo(pageOf(item))}
                  />
                </>
              )}
              {p.kind === 'empty' && <p className="py-20 text-center text-ink-2 italic">{EMPTY_NOTE}</p>}
              {p.kind === 'piece' && (
                <>
                  <p className={`text-center font-sans font-semibold tracking-[0.25em] text-muted uppercase ${p.first ? 'mb-12 text-sm' : 'mb-8 text-[0.65rem] opacity-70'}`}>
                    {p.section.title}
                  </p>
                  <div className="manuscript-piece">
                    <Piece item={p.item} showStatus={look.showStatus} />
                  </div>
                </>
              )}
            </div>
          </section>
        ))}
      </div>

      <nav aria-label="Turn the page" className="no-print border-t border-line/70 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-[38rem] items-center gap-1 px-2 py-1.5">
          <button type="button" className="btn-ghost min-w-0 flex-1 justify-start px-2" disabled={here === 0} onClick={() => turnTo(here - 1)} title={label(pages[here - 1])}>
            <ChevronLeft size={18} className="shrink-0" />
            <span className="truncate">{here === 0 ? 'Previous' : label(pages[here - 1])}</span>
          </button>
          <span className="shrink-0 px-2 text-xs text-muted tabular-nums" aria-live="polite">
            {pieceNo ? `${pieceNo} of ${pieceCount}` : label(page)}
          </span>
          <button type="button" className="btn-ghost min-w-0 flex-1 justify-end px-2" disabled={here >= last} onClick={() => turnTo(here + 1)} title={label(pages[here + 1])}>
            <span className="truncate">{here >= last ? 'The end' : label(pages[here + 1])}</span>
            <ChevronRight size={18} className="shrink-0" />
          </button>
        </div>
      </nav>
    </>
  );
}
