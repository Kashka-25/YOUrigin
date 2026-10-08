import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer, Type } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { orderedBook } from '../io/export';
import { EmptyState, Spinner, StatusBadge } from '../components/ui';
import { AssetImage } from '../components/AssetImage';
import { displayTitle } from '../domain/text';
import type { Status } from '../domain/types';

const STATUS_DOT: Record<Status, string> = { seed: 'bg-seed', developing: 'bg-developing', polished: 'bg-polished' };

/** Scroll to an element by id (plain #anchors would clash with the app's hash routing). */
function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const SIZES = ['text-[1.05rem]', 'text-[1.2rem]', 'text-[1.35rem]'];

export function Manuscript() {
  const { id } = useParams();
  const lib = useLibrary();
  const [params] = useSearchParams();
  const [size, setSize] = useState(1);
  const [showStatus, setShowStatus] = useState(false);

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

  useEffect(() => {
    if (data && params.get('print')) setTimeout(() => window.print(), 400);
  }, [data, params]);

  if (!lib) return <Spinner />;
  if (!data) return <EmptyState title="Book not found" />;
  const { book, parts } = data;
  const nonEmpty = parts.filter((p) => p.items.length);

  return (
    <div className="min-h-dvh bg-card">
      <div className="no-print sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-card/95 px-4 py-2 backdrop-blur">
        <Link to={`/books/${book.id}`} className="btn-ghost">
          <ArrowLeft size={16} /> Builder
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <label className="mr-2 flex items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" checked={showStatus} onChange={(e) => setShowStatus(e.target.checked)} /> Show status
          </label>
          <button type="button" className="btn-ghost" onClick={() => setSize((s) => (s + 1) % SIZES.length)} aria-label="Change text size">
            <Type size={16} />
          </button>
          <button type="button" className="btn-ghost" onClick={() => window.print()} aria-label="Print or save as PDF">
            <Printer size={16} />
          </button>
        </div>
      </div>

      <article className={`mx-auto max-w-[38rem] px-6 pb-32 font-serif ${SIZES[size]} leading-[1.75] text-ink`}>
        <header className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
          <h1 className="text-5xl leading-tight font-normal md:text-6xl">{book.title}</h1>
          {book.subtitle && <p className="mt-4 text-xl text-ink-2 italic">{book.subtitle}</p>}
          {book.description && <p className="mt-10 max-w-md text-base text-ink-2">{book.description}</p>}
        </header>

        {nonEmpty.length > 1 && (
          <details open className="group print-break py-16" aria-label="Contents">
            <summary className="mb-6 flex cursor-pointer list-none items-center justify-center gap-2 text-center font-sans text-sm font-semibold tracking-[0.2em] text-muted uppercase [&::-webkit-details-marker]:hidden">
              Contents
              <span className="no-print text-xs tracking-normal normal-case transition-transform group-open:rotate-180" aria-hidden>
                ▾
              </span>
            </summary>
            <ol className="space-y-5">
              {nonEmpty.map(({ section, items }) => (
                <li key={section.id}>
                  <button type="button" onClick={() => jump(`s-${section.id}`)} className="text-left font-semibold hover:underline">
                    {section.title}
                  </button>
                  <ol className="mt-1 space-y-0.5 pl-4 text-[0.9em]">
                    {items.map((item) => (
                      <li key={item.id} className="flex items-center gap-2">
                        {showStatus && <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[item.status]}`} aria-label={item.status} />}
                        <button type="button" onClick={() => jump(`p-${item.id}`)} className="truncate text-left text-ink-2 hover:text-ink hover:underline">
                          {displayTitle(item)}
                        </button>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          </details>
        )}

        {nonEmpty.length === 0 && (
          <p className="py-20 text-center text-ink-2 italic">
            This book has no placed pieces yet. Return to the Builder and drag material into its sections.
          </p>
        )}

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
                {item.title && <h3 className="mb-5 text-[1.4em] leading-snug font-normal">{item.title}</h3>}
                {showStatus && (
                  <p className="no-print mb-3">
                    <Link to={`/item/${item.id}`}>
                      <StatusBadge status={item.status} />
                    </Link>
                  </p>
                )}
                {item.type === 'image' && item.assetId && <AssetImage id={item.assetId} alt={item.title} className="mx-auto my-4 max-h-[80dvh] max-w-full" />}
                <div className={`writing ${item.type === 'prompt' ? 'italic' : ''} ${item.type === 'image' ? 'text-center text-[0.85em] italic' : ''}`}>{item.body}</div>
              </div>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
