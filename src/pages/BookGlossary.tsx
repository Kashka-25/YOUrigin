import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpenText, Check, Pencil, Plus } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { addPage, addSection, renameSection, setSectionStatus } from '../db/books';
import { updateContent } from '../db/content';
import { bookPages } from '../domain/bookPages';
import { displayTitle } from '../domain/text';
import { STATUS_META } from '../domain/constants';
import type { Section, Status } from '../domain/types';
import { DOT_CLASS, StatusDot } from '../components/book/StatusDot';
import { EmptyState, Spinner } from '../components/ui';

/** Chapters and pages of one book, in order, kept live from the Library. */
export function useBookPages(bookId: string | undefined) {
  const lib = useLibrary();
  return useMemo(() => {
    if (!lib || !bookId) return null;
    const book = lib.books.find((b) => b.id === bookId);
    if (!book) return null;
    return {
      book,
      ...bookPages(
        lib.sections.filter((s) => s.bookId === bookId),
        lib.entries.filter((e) => e.bookId === bookId),
        lib.contentById,
      ),
    };
  }, [lib, bookId]);
}

export const pagePath = (bookId: string, pieceId: string) => `/projects/${bookId}/book/${pieceId}`;
export const glossaryPath = (bookId: string) => `/projects/${bookId}/book`;

/**
 * The front glossary of a book: every chapter and page title, built from the book
 * itself, so new and renamed pages appear here on their own. Each title opens its
 * page; each dot shows (and changes) how finished it is.
 */
export function BookGlossary() {
  const { id } = useParams();
  const lib = useLibrary();
  const data = useBookPages(id);
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!lib) return <Spinner />;
  if (!data) return <EmptyState title="Book not found" action={<Link to="/initiatives" className="btn">All projects</Link>} />;
  const { book, chapters, flat } = data;

  const newPage = async (sectionId: string | null) => {
    if (busy) return;
    setBusy(true);
    try {
      const pieceId = await addPage(book.id, sectionId);
      nav(pagePath(book.id, pieceId), { state: { fresh: true } });
    } finally {
      setBusy(false);
    }
  };
  const newChapter = async () => {
    const title = window.prompt('Name of the new chapter', '');
    if (title === null) return;
    await addSection(book.id, title);
  };

  const counts: Record<Status, number> = { none: 0, seed: 0, developing: 0, polished: 0 };
  flat.forEach(({ item }) => counts[item.status]++);
  let n = 0;

  return (
    <div className="min-h-dvh bg-card text-ink">
      <div className="no-print sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-card/95 px-3 py-2 backdrop-blur">
        <Link to={`/projects/${book.id}`} className="btn-ghost">
          <ArrowLeft size={16} /> Builder
        </Link>
        <Link to={`/projects/${book.id}/read`} className="btn-ghost">
          <BookOpenText size={16} /> Read
        </Link>
      </div>

      <main className="mx-auto max-w-[38rem] px-5 pt-10 pb-32">
        <p className="eyebrow text-center">Glossary</p>
        <h1 className="mt-2 text-center font-serif text-4xl leading-tight md:text-5xl">{book.title}</h1>
        {book.subtitle && <p className="mt-2 text-center font-serif text-lg text-ink-2 italic">{book.subtitle}</p>}
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-ink-2">
          <span>
            {flat.length} {flat.length === 1 ? 'page' : 'pages'}
          </span>
          {(['polished', 'developing', 'seed'] as Status[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5" title={STATUS_META[s].meaning}>
              <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${DOT_CLASS[s]}`} />
              {counts[s]} {STATUS_META[s].label.toLowerCase()}
            </span>
          ))}
        </p>

        {chapters.length === 0 && (
          <p className="mt-12 text-center text-ink-2">
            This book has no chapters yet. Start one below, or add a first page.
          </p>
        )}

        <nav aria-label="Glossary" className="mt-10 space-y-10">
          {chapters.map(({ section, pages }) => {
            const start = n;
            n += pages.length;
            return (
              <section key={section?.id ?? 'loose'} aria-label={section?.title ?? 'Not in a chapter yet'}>
                <ChapterHeading section={section} />
                {pages.length === 0 ? (
                  <p className="py-2 pl-10 text-sm text-muted">No pages yet.</p>
                ) : (
                  <ol className="mt-1">
                    {pages.map((item, i) => (
                      <li key={item.id} className="flex items-center gap-1">
                        <StatusDot value={item.status} what={displayTitle(item)} onChange={(s) => void updateContent(item.id, { status: s })} />
                        <Link to={pagePath(book.id, item.id)} className="flex min-w-0 flex-1 items-baseline gap-3 rounded-lg px-1 py-1.5 hover:bg-paper-2">
                          <span className="min-w-0 flex-1 truncate font-serif text-[17px] underline-offset-4 hover:underline">{displayTitle(item)}</span>
                          <span className="shrink-0 text-xs text-muted tabular-nums">{start + i + 1}</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                )}
                <button type="button" disabled={busy} onClick={() => void newPage(section?.id ?? null)} className="btn-ghost mt-1 ml-7 px-2 py-1 text-sm text-ink-2">
                  <Plus size={15} /> New page{section ? ` in ${section.title}` : ''}
                </button>
              </section>
            );
          })}
        </nav>

        <div className="mt-12 flex flex-wrap justify-center gap-2 border-t border-line pt-8">
          {chapters.length === 0 && (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void newPage(null)}>
              <Plus size={16} /> First page
            </button>
          )}
          <button type="button" className="btn" onClick={() => void newChapter()}>
            <Plus size={16} /> New chapter
          </button>
        </div>
      </main>
    </div>
  );
}

/** A chapter's name with its own colour; the pencil renames it. */
function ChapterHeading({ section }: { section: Section | null }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (!section)
    return <h2 className="border-b border-line pb-1.5 pl-10 font-sans text-xs font-semibold tracking-[0.2em] text-muted uppercase">Not in a chapter yet</h2>;
  const save = async () => {
    if (editing !== null) await renameSection(section.id, editing);
    setEditing(null);
  };
  return (
    <div className="flex items-center gap-1 border-b border-line pb-1">
      <StatusDot value={section.status ?? 'none'} what={`Chapter ${section.title}`} onChange={(s) => void setSectionStatus(section.id, s)} />
      {editing === null ? (
        <>
          <h2 className="min-w-0 flex-1 truncate font-sans text-sm font-semibold tracking-[0.2em] text-accent uppercase">{section.title}</h2>
          <button type="button" className="btn-ghost h-8 w-8 justify-center p-0 text-muted" aria-label={`Rename chapter ${section.title}`} onClick={() => setEditing(section.title)}>
            <Pencil size={14} />
          </button>
        </>
      ) : (
        <form
          className="flex min-w-0 flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input autoFocus value={editing} onChange={(e) => setEditing(e.target.value)} onBlur={() => void save()} aria-label="Chapter name" className="input min-w-0 flex-1 py-1 text-sm" />
          <button type="submit" className="btn-ghost h-8 w-8 justify-center p-0" aria-label="Save chapter name">
            <Check size={15} />
          </button>
        </form>
      )}
    </div>
  );
}
