import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { orderedBook } from '../io/export';
import { EmptyState, Spinner } from '../components/ui';
import { analyseLyric } from '../domain/lyrics';
import { displayTitle } from '../domain/text';

const SIZES = ['text-[1.35rem]', 'text-[1.65rem]', 'text-[2rem]', 'text-[2.5rem]'];

/**
 * Stage view: a set list or album, one song at a time in large type, for
 * performing. Works offline, keeps the screen awake where the phone allows,
 * and never edits anything.
 */
export function Stage() {
  const { id } = useParams();
  const lib = useLibrary();
  const [params, setParams] = useSearchParams();
  const [size, setSize] = useState(1);
  const index = Math.max(0, Number(params.get('song') ?? 0) || 0);

  const data = useMemo(() => {
    if (!lib || !id) return null;
    const book = lib.books.find((b) => b.id === id);
    if (!book) return null;
    const parts = orderedBook(
      lib.sections.filter((s) => s.bookId === id),
      lib.entries.filter((e) => e.bookId === id),
      lib.contentById,
    );
    const songs = parts.flatMap((p) => p.items.filter((i) => i.type !== 'image').map((item) => ({ item, set: p.section.title })));
    return { book, songs };
  }, [lib, id]);

  const count = data?.songs.length ?? 0;
  const go = useCallback(
    (n: number) => {
      if (!count) return;
      const next = Math.min(count - 1, Math.max(0, n));
      setParams({ song: String(next) }, { replace: true });
      window.scrollTo({ top: 0 });
    },
    [count, setParams],
  );

  // Arrow keys and page keys (which most page-turner pedals send) move between songs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown'].includes(e.key)) go(index + 1);
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index]);

  // Keep the screen on while performing, where the browser allows it.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = () => {
      if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
      navigator.wakeLock.request('screen').then(
        (l) => {
          lock = l;
        },
        () => {},
      );
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => {});
    };
  }, []);

  // A sideways swipe moves between songs.
  const touch = useRef<{ x: number; y: number } | null>(null);

  if (!lib) return <Spinner />;
  if (!data) return <EmptyState title="Work not found" />;
  const { book, songs } = data;
  if (!songs.length)
    return (
      <div className="mx-auto max-w-xl p-8">
        <EmptyState title="No songs yet">
          <Link to={`/projects/${book.id}`} className="underline">
            Add songs to {book.title}
          </Link>{' '}
          and they’ll appear here in order.
        </EmptyState>
      </div>
    );
  const at = Math.min(index, songs.length - 1);
  const current = songs[at];
  const stanzas = analyseLyric(current.item.body);
  const nextSong = songs[at + 1];

  return (
    <div
      className="min-h-dvh bg-paper text-ink"
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x;
        const dy = e.changedTouches[0].clientY - t.y;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) go(at + (dx < 0 ? 1 : -1));
      }}
    >
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-paper/95 px-3 py-2 backdrop-blur">
        <Link to={`/projects/${book.id}`} className="btn-ghost" aria-label={`Back to ${book.title}`}>
          <ArrowLeft size={16} /> <span className="hidden sm:inline">{book.title}</span>
        </Link>
        <span className="ml-auto font-mono text-sm text-muted" aria-live="polite">
          {at + 1} / {songs.length}
        </span>
        <button type="button" className="btn-ghost" onClick={() => setSize((s) => Math.max(0, s - 1))} aria-label="Smaller text" disabled={size === 0}>
          <Minus size={16} />
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setSize((s) => Math.min(SIZES.length - 1, s + 1))}
          aria-label="Larger text"
          disabled={size === SIZES.length - 1}
        >
          <Plus size={16} />
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-5 pt-6 pb-36">
        <p className="eyebrow">{current.set}</p>
        <h1 className="mt-1 font-serif text-4xl leading-tight md:text-5xl">{displayTitle(current.item)}</h1>
        <div className={`mt-6 space-y-7 font-serif leading-snug ${SIZES[size]}`}>
          {stanzas.map((s, i) => (
            <section key={i}>
              {s.label && <h2 className="mb-1 font-display text-xs tracking-[.2em] text-gold uppercase">{s.label}</h2>}
              {s.lines.map((l, j) => (
                <p key={j}>{l.text}</p>
              ))}
            </section>
          ))}
        </div>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-line bg-paper/95 px-3 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur"
        aria-label="Songs"
      >
        <button type="button" className="btn min-h-12 flex-1 justify-center" onClick={() => go(at - 1)} disabled={at === 0}>
          <ChevronLeft size={18} /> Previous
        </button>
        <button type="button" className="btn-primary min-h-12 min-w-0 flex-[2] justify-center" onClick={() => go(at + 1)} disabled={!nextSong}>
          {nextSong ? (
            <>
              <span className="truncate">Next: {displayTitle(nextSong.item)}</span> <ChevronRight size={18} className="shrink-0" />
            </>
          ) : (
            'End of the set'
          )}
        </button>
      </nav>
    </div>
  );
}
