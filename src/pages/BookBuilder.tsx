import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BookImage, BookOpenText, Download, Settings2, Sparkles, ArrowLeft, LayoutTemplate } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { computeBookProgress } from '../domain/progress';
import { BOOK_TYPE_LABEL, COVER_COLOURS } from '../domain/constants';
import type { Book, BookType } from '../domain/types';
import { BookDashboard } from '../components/book/BookDashboard';
import { StructureBoard } from '../components/book/StructureBoard';
import { MaterialShelf, relevantToBook } from '../components/book/MaterialShelf';
import { EmptyState, Spinner } from '../components/ui';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { addSection, deleteBook, moveEntry, templateFromBook, updateBook } from '../db/books';
import { bookToMarkdown, download, slug, today } from '../io/export';
import { coverColour } from '../components/BookCover';
import { providerFor, type ProposedSection } from '../ai';
import { useSettings } from '../db/settings';
import { displayTitle } from '../domain/text';
import { ContentsList } from '../components/book/ContentsList';
import { ChevronDown, Maximize2 } from 'lucide-react';

export function BookBuilder() {
  const { id } = useParams();
  const lib = useLibrary();
  const [editOpen, setEditOpen] = useState(false);

  const data = useMemo(() => {
    if (!lib || !id) return null;
    const book = lib.books.find((b) => b.id === id);
    if (!book) return null;
    const sections = lib.sections.filter((s) => s.bookId === id);
    const entries = lib.entries.filter((e) => e.bookId === id);
    const progress = computeBookProgress(sections, entries, lib.contentById);
    const contentIds = new Set(entries.map((e) => e.contentId));
    const relevantOrphans = relevantToBook(lib.items, contentIds, book.title, lib.ctx).filter(
      (x) => !lib.ctx.booksOf.get(x.item.id)?.size && !lib.ctx.collectionsOf.get(x.item.id)?.size,
    );
    return { book, sections, entries, progress, contentIds, relevantOrphans };
  }, [lib, id]);

  if (!lib) return <Spinner />;
  if (!data)
    return (
      <EmptyState title="Book not found" action={<Link to="/books" className="btn">All books</Link>}>
        It may have been deleted. Your writing is still in the Library.
      </EmptyState>
    );

  const { book, sections, entries, progress, contentIds, relevantOrphans } = data;
  const trayIds = entries.filter((e) => !e.sectionId).map((e) => e.contentId);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 md:px-8 md:pt-10">
      <Link to="/books" className="btn-ghost -ml-3">
        <ArrowLeft size={16} /> Books
      </Link>
      <header className="mt-3 flex flex-wrap items-start gap-4">
        <div className="h-20 w-2 shrink-0 rounded-full" style={{ background: coverColour(book.cover) }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{BOOK_TYPE_LABEL[book.type]}</p>
          <h1 className="page-title">{book.title}</h1>
          {book.subtitle && <p className="mt-1 font-serif text-lg text-ink-2 italic">{book.subtitle}</p>}
          {book.description && <p className="mt-2 max-w-2xl text-sm text-ink-2">{book.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/books/${book.id}/print`} className="btn-primary">
            <LayoutTemplate size={16} /> Design & print
          </Link>
          <Link to={`/books/${book.id}/cover`} className="btn">
            <BookImage size={16} /> Cover
          </Link>
          <Link to={`/books/${book.id}/read`} className="btn">
            <BookOpenText size={16} /> Read
          </Link>
          <ExportMenu book={book} />
          <button type="button" className="btn" onClick={() => setEditOpen(true)} aria-label="Book settings">
            <Settings2 size={16} />
          </button>
        </div>
      </header>

      <div className="mt-6">
        <BookDashboard progress={progress} />
      </div>

      <details className="group mt-4 rounded-2xl border border-line bg-card">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 hover:bg-paper-2 [&::-webkit-details-marker]:hidden">
          <span className="font-serif text-xl">Contents</span>
          <span className="text-sm text-muted">· {progress.counts.total} pieces, colour-coded by status</span>
          <ChevronDown size={18} className="ml-auto text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-4 pb-4">
          <div className="mb-3 flex justify-end">
            <Link to={`/books/${book.id}/contents`} className="btn-ghost px-2 py-1 text-xs">
              <Maximize2 size={13} /> Open as a page
            </Link>
          </div>
          <ContentsList bookId={book.id} compact />
        </div>
      </details>

      {relevantOrphans.length > 0 && (
        <p className="mt-3 text-sm text-ink-2">
          <Sparkles size={14} className="mr-1 inline text-ai" aria-hidden />
          {relevantOrphans.length} unclaimed piece{relevantOrphans.length === 1 ? '' : 's'} may belong here — see <em>Relevant</em> on the material shelf.
        </p>
      )}

      <div className="mt-8">
        <StructureBoard
          bookId={book.id}
          sections={sections}
          entries={entries}
          contentById={lib.contentById}
          sectionProgress={progress.sections}
          traySlot={trayIds.length >= 2 ? <StructureSuggest bookId={book.id} contentIds={trayIds} entries={entries} /> : null}
          shelf={<MaterialShelf bookId={book.id} bookTitle={book.title} items={lib.items} bookContentIds={contentIds} ctx={lib.ctx} />}
        />
      </div>

      {editOpen && <BookSettings book={book} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

function ExportMenu({ book }: { book: Book }) {
  const lib = useLibrary();
  const [open, setOpen] = useState(false);
  if (!lib) return null;
  const sections = lib.sections.filter((s) => s.bookId === book.id);
  const entries = lib.entries.filter((e) => e.bookId === book.id);
  const name = `${slug(book.title)}-${today()}`;
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Download size={16} /> Export
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Export this book">
        <div className="space-y-3">
          <button
            type="button"
            className="btn w-full justify-start"
            onClick={() => download(`${name}.md`, bookToMarkdown(book, sections, entries, lib.contentById), 'text/markdown')}
          >
            Markdown manuscript (.md)
          </button>
          <button
            type="button"
            className="btn w-full justify-start"
            onClick={() => {
              const content = entries.map((e) => lib.contentById.get(e.contentId)).filter(Boolean);
              download(`${name}.json`, JSON.stringify({ app: 'YOUrigin', kind: 'book', book, sections, entries, content }, null, 2), 'application/json');
            }}
          >
            Structured data (.json)
          </button>
          <Link to={`/books/${book.id}/print`} className="btn w-full justify-start">
            Print-ready PDF — designed pages (Design & print)
          </Link>
          <Link to={`/books/${book.id}/read?print=1`} className="btn w-full justify-start">
            Simple reading copy (print from Read view)
          </Link>
        </div>
      </Modal>
    </>
  );
}

function StructureSuggest({ bookId, contentIds, entries }: { bookId: string; contentIds: string[]; entries: { id: string; contentId: string }[] }) {
  const lib = useLibrary();
  const settings = useSettings();
  const [proposals, setProposals] = useState<ProposedSection[] | null>(null);
  if (!lib) return null;
  const items = contentIds.map((id) => lib.contentById.get(id)!).filter(Boolean);

  const create = async (p: ProposedSection) => {
    const sectionId = await addSection(bookId, p.title);
    for (const [i, cid] of p.itemIds.entries()) {
      const entry = entries.find((e) => e.contentId === cid);
      if (entry) await moveEntry(entry.id, sectionId, i);
    }
    setProposals((prev) => prev?.filter((x) => x !== p) ?? null);
  };

  return (
    <div className="mb-2">
      {!proposals ? (
        <button
          type="button"
          className="btn-ghost px-2 text-xs text-ai"
          onClick={async () => setProposals(await providerFor(settings).suggestStructure(items, lib.ai))}
        >
          <Sparkles size={13} /> How could these form sections?
        </button>
      ) : (
        <div className="rounded-xl border border-dashed border-ai bg-ai-bg/50 p-3">
          <p className="text-xs font-semibold text-ai">Suggested groupings — nothing moves unless you choose</p>
          <ul className="mt-2 space-y-2">
            {proposals.map((p) => (
              <li key={p.title} className="flex items-start justify-between gap-2 text-sm">
                <div>
                  <p className="font-serif text-base">{p.title}</p>
                  <p className="text-xs text-muted">{p.itemIds.map((i) => displayTitle(lib.contentById.get(i)!)).join(' · ')}</p>
                </div>
                <button type="button" className="btn shrink-0 px-3 py-1 text-xs" onClick={() => void create(p)}>
                  Create section
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-ghost mt-2 px-2 text-xs" onClick={() => setProposals(null)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function BookSettings({ book, onClose }: { book: Book; onClose: () => void }) {
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [form, setForm] = useState({
    title: book.title,
    subtitle: book.subtitle,
    description: book.description,
    cover: book.cover,
    type: book.type,
    notes: book.notes,
  });
  const [tplName, setTplName] = useState('');
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  return (
    <Modal open onClose={onClose} title="Book settings" wide>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await updateBook(book.id, form);
          onClose();
        }}
      >
        <div className="sm:col-span-2">
          <label className="label" htmlFor="bs-title">
            Title
          </label>
          <input id="bs-title" className="input font-serif text-lg" value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="bs-sub">
            Subtitle
          </label>
          <input id="bs-sub" className="input" value={form.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="bs-desc">
            Description
          </label>
          <textarea id="bs-desc" className="input" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="bs-type">
            Type
          </label>
          <select id="bs-type" className="input" value={form.type} onChange={(e) => set({ type: e.target.value as BookType })}>
            {Object.entries(BOOK_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <fieldset>
          <legend className="label">Cover</legend>
          <div className="flex gap-2">
            {COVER_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set({ cover: c })}
                aria-label={`Cover colour ${c}`}
                aria-pressed={form.cover === c}
                className={`h-8 w-8 rounded-full border-2 ${form.cover === c ? 'border-ink' : 'border-transparent'}`}
                style={{ background: coverColour(c) }}
              />
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="bs-notes">
            Notes
          </label>
          <textarea id="bs-notes" className="input" rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Save
          </button>
        </div>
      </form>

      <div className="mt-8 space-y-4 border-t border-line pt-6">
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await templateFromBook(book.id, tplName || `${book.title} structure`);
            setTplName('');
            toast('Saved as a template');
          }}
        >
          <input className="input" placeholder="Template name" value={tplName} onChange={(e) => setTplName(e.target.value)} aria-label="Template name" />
          <button type="submit" className="btn shrink-0">
            Save structure as template
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await updateBook(book.id, { archived: !book.archived });
              onClose();
            }}
          >
            {book.archived ? 'Unarchive book' : 'Archive book'}
          </button>
          <button
            type="button"
            className="btn text-seed"
            onClick={async () => {
              const ok = await confirm({
                title: `Delete “${book.title}”?`,
                message: 'The book’s structure (sections and placements) will be removed. Every piece of writing stays safely in your Library.',
                confirmLabel: 'Delete book',
                danger: true,
              });
              if (!ok) return;
              await deleteBook(book.id);
              nav('/books');
            }}
          >
            Delete book
          </button>
        </div>
      </div>
    </Modal>
  );
}
