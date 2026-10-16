import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react';
import { useLibrary, type LibraryData } from '../hooks/useLibrary';
import { computeBookProgress } from '../domain/progress';
import { BOOK_TYPE_LABEL, PROJECT_KIND_META, projectKind } from '../domain/constants';
import { countLabel, groupByShelf, shelfNames } from '../domain/projects';
import type { Book, BookType, ProjectKind, Template } from '../domain/types';
import { createBook, deleteTemplate, renameShelf, saveTemplate } from '../db/books';
import { Modal, useConfirm } from '../components/Modal';
import { EmptyState, ProgressBar, Spinner } from '../components/ui';
import { coverColour } from '../components/BookCover';
import { ProjectKindPicker } from '../components/ProjectKindPicker';

const TITLE_HINT: Record<ProjectKind, string> = {
  book: 'YOU — Water',
  album: 'Album title',
  setlist: 'Friday at the Lantern',
  ideas: 'App ideas',
  custom: 'Title',
};

export function Books() {
  const lib = useLibrary();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<ProjectKind>('book');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [shelf, setShelf] = useState('');
  const [templateId, setTemplateId] = useState('tpl-poetry');
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [author, setAuthor] = useState<string | null>(null);
  const [copyrightPage, setCopyrightPage] = useState<boolean | null>(null);
  const [dedicationPage, setDedicationPage] = useState<boolean | null>(null);
  const [acksPage, setAcksPage] = useState<boolean | null>(null);

  if (!lib) return <Spinner />;
  const projects = lib.books.filter((b) => !b.archived);
  const groups = groupByShelf(projects);
  const shelves = shelfNames(lib.books);
  const archived = lib.books.filter((b) => b.archived);
  const templates = [...lib.templates].sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name));
  // Suggest the author name used most recently; the copyright choice follows the template unless changed.
  const lastAuthor = [...lib.books].sort((a, b) => b.updatedAt - a.updatedAt).find((b) => b.design?.author?.trim())?.design?.author ?? '';
  const authorValue = author ?? lastAuthor;
  const chosen = templates.find((t) => t.id === templateId);
  const withCopyright = copyrightPage ?? chosen?.copyrightPage ?? true;
  const withDedication = dedicationPage ?? chosen?.dedicationPage ?? false;
  const withAcks = acksPage ?? chosen?.acknowledgementsPage ?? false;
  const isBook = kind === 'book';
  const startNew = (onShelf = '') => {
    setShelf(onShelf);
    setCreating(true);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 md:px-8 md:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Books, albums, set lists, ideas</p>
          <h1 className="page-title">Projects</h1>
        </div>
        <button type="button" className="btn-primary" onClick={() => startNew()}>
          <Plus size={16} /> New project
        </button>
      </div>

      {projects.length === 0 ? (
        <EmptyState title="No projects yet" action={<button className="btn-primary" onClick={() => startNew()}>Start a project</button>}>
          A project gives your pieces a shape: a book, an album, a set list. One piece can sit in many projects.
        </EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.shelf || '-'} className="mt-8" aria-label={g.shelf || 'Other projects'}>
            {shelves.length > 0 && (
              <div className="mb-3 flex items-center gap-2 border-b border-line pb-1.5">
                <h2 className="font-serif text-2xl">{g.shelf || 'Other'}</h2>
                <span className="text-sm text-muted">{g.projects.length}</span>
                {g.shelf && (
                  <>
                    <button type="button" className="btn-ghost p-1" onClick={() => setRenaming(g.shelf)} aria-label={`Rename shelf ${g.shelf}`}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" className="btn-ghost ml-auto px-2 py-1 text-xs" onClick={() => startNew(g.shelf)} aria-label={`New project on ${g.shelf}`}>
                      <Plus size={14} /> Add
                    </button>
                  </>
                )}
              </div>
            )}
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {g.projects.map((b) => (
                <li key={b.id}>
                  <ProjectCard book={b} lib={lib} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}


      {archived.length > 0 && (
        <p className="mt-6 text-sm text-muted">
          Archived:{' '}
          {archived.map((b, i) => (
            <span key={b.id}>
              {i > 0 && ', '}
              <Link to={`/projects/${b.id}`} className="underline">
                {b.title}
              </Link>
            </span>
          ))}
        </p>
      )}

      <details className="group mt-14 rounded-2xl border border-line" aria-labelledby="tpl-h">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 hover:bg-paper-2 [&::-webkit-details-marker]:hidden">
          <div>
            <h2 id="tpl-h" className="font-serif text-2xl">
              Book templates <span className="align-middle text-sm text-muted">({templates.length})</span>
            </h2>
            <p className="text-sm text-ink-2">Starting shapes for new books. All of them can be edited.</p>
          </div>
          <ChevronDown size={20} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-4 pb-4">
          <div className="flex justify-end">
            <button type="button" className="btn" onClick={() => setEditing({ name: '', bookType: 'custom', sections: [] })}>
              <Plus size={15} /> New template
            </button>
          </div>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {templates.map((t) => (
              <li key={t.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-lg">
                    {t.name} <span className="text-xs text-muted">· {BOOK_TYPE_LABEL[t.bookType]}</span>
                  </p>
                  <p className="truncate text-sm text-ink-2">{t.sections.join(' · ') || 'Empty structure'}</p>
                  {(t.copyrightPage !== false || t.dedicationPage || t.acknowledgementsPage) && (
                    <p className="text-xs text-muted">
                      +{' '}
                      {[t.copyrightPage !== false && 'copyright page with ISBN placeholder', t.dedicationPage && 'dedication page', t.acknowledgementsPage && 'acknowledgements page']
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
                <button type="button" className="btn-ghost" onClick={() => setEditing(t)} aria-label={`Edit template ${t.name}`}>
                  <Pencil size={15} />
                </button>
                {!t.builtIn && (
                  <button
                    type="button"
                    className="btn-ghost"
                    aria-label={`Delete template ${t.name}`}
                    onClick={async () => {
                      if (await confirm({ title: 'Delete template?', message: `“${t.name}” will be removed. Books made from it are not affected.`, confirmLabel: 'Delete', danger: true }))
                        await deleteTemplate(t.id);
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </details>

      <Modal open={creating} onClose={() => setCreating(false)} title="New project">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const id = await createBook(
              isBook
                ? { kind, shelf, title, subtitle, templateId, author: authorValue, copyrightPage: withCopyright, dedicationPage: withDedication, acknowledgementsPage: withAcks }
                : { kind, shelf, title, templateId: null },
            );
            setCreating(false);
            setTitle('');
            setSubtitle('');
            setCopyrightPage(null);
            setDedicationPage(null);
            setAcksPage(null);
            nav(`/projects/${id}`);
          }}
        >
          <ProjectKindPicker value={kind} onChange={setKind} />
          <div>
            <label className="label" htmlFor="nb-title">
              Title
            </label>
            <input id="nb-title" className="input font-serif text-lg" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={TITLE_HINT[kind]} data-autofocus />
          </div>
          <div>
            <label className="label" htmlFor="nb-shelf">
              Shelf (optional)
            </label>
            <input id="nb-shelf" className="input" list="nb-shelves" value={shelf} onChange={(e) => setShelf(e.target.value)} placeholder="Music, Books, App ideas…" />
            <datalist id="nb-shelves">
              {shelves.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          {!isBook && (
            <p className="text-xs text-muted">
              {PROJECT_KIND_META[kind].sections.length ? `Starts with “${PROJECT_KIND_META[kind].sections.join(', ')}”. ` : ''}Add and name your own sections inside.
            </p>
          )}
          {isBook && (
            <>
              <div>
                <label className="label" htmlFor="nb-sub">
                  Subtitle (optional)
                </label>
                <input id="nb-sub" className="input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="nb-author">
                  Author name (optional)
                </label>
                <input id="nb-author" className="input" value={authorValue} onChange={(e) => setAuthor(e.target.value)} placeholder="As it should appear in print" />
              </div>
              <fieldset>
                <legend className="label">Template</legend>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {templates.map((t) => (
                    <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-paper-2">
                      <input
                        type="radio"
                        name="tpl"
                        className="mt-1"
                        checked={templateId === t.id}
                        onChange={() => {
                          setTemplateId(t.id);
                          setCopyrightPage(null);
                          setDedicationPage(null);
                          setAcksPage(null);
                        }}
                      />
                      <span>
                        <span className="font-medium">{t.name}</span>
                        <span className="block text-xs text-muted">{t.sections.join(' · ') || 'Start empty'}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" className="mt-1" checked={withCopyright} onChange={(e) => setCopyrightPage(e.target.checked)} />
                <span>
                  Include a copyright page
                  <span className="block text-xs text-muted">© year and name, rights notice and an “[insert ISBN]” placeholder — edit it any time in Design &amp; print.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" className="mt-1" checked={withDedication} onChange={(e) => setDedicationPage(e.target.checked)} />
                <span>
                  Include a dedication page
                  <span className="block text-xs text-muted">A starting line to rewrite in your own words — or pick another in Design &amp; print.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" className="mt-1" checked={withAcks} onChange={(e) => setAcksPage(e.target.checked)} />
                <span>
                  Include an acknowledgements page
                  <span className="block text-xs text-muted">A thank-you page at the end of the book, with [brackets] for the people you want to thank.</span>
                </span>
              </label>
            </>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!title.trim()}>
              Create
            </button>
          </div>
        </form>
      </Modal>

      {editing && <TemplateEditor template={editing} onClose={() => setEditing(null)} />}
      {renaming !== null && (
        <RenameShelf
          name={renaming}
          onClose={() => setRenaming(null)}
          onRemove={async () => {
            const ok = await confirm({ title: `Remove shelf “${renaming}”?`, message: 'Its projects stay, under Other.', confirmLabel: 'Remove shelf' });
            if (!ok) return;
            await renameShelf(renaming, '');
            setRenaming(null);
          }}
        />
      )}
    </div>
  );
}

function ProjectCard({ book: b, lib }: { book: Book; lib: LibraryData }) {
  const kind = projectKind(b);
  const progress = computeBookProgress(
    lib.sections.filter((s) => s.bookId === b.id),
    lib.entries.filter((e) => e.bookId === b.id),
    lib.contentById,
  );
  const { counts } = progress;
  return (
    <Link to={`/projects/${b.id}`} className="panel group block overflow-hidden transition-shadow hover:shadow-md">
      <div className="h-2" style={{ background: coverColour(b.cover) }} />
      <div className="p-5">
        <p className="eyebrow">{kind === 'book' ? BOOK_TYPE_LABEL[b.type] : PROJECT_KIND_META[kind].label}</p>
        <h3 className="mt-1 font-serif text-2xl leading-tight group-hover:underline">{b.title}</h3>
        {b.subtitle && <p className="mt-1 font-serif text-ink-2 italic">{b.subtitle}</p>}
        <div className="mt-4">
          <ProgressBar value={progress.overall} label="Overall" />
        </div>
        <p className="mt-3 text-xs text-muted">
          {countLabel(counts.total, PROJECT_KIND_META[kind].noun)} · {counts.polished} polished · {counts.developing} developing · {counts.seed} seeds
        </p>
      </div>
    </Link>
  );
}

function RenameShelf({ name, onClose, onRemove }: { name: string; onClose: () => void; onRemove: () => void }) {
  const [value, setValue] = useState(name);
  return (
    <Modal open onClose={onClose} title="Rename shelf">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (value.trim()) await renameShelf(name, value);
          onClose();
        }}
      >
        <input className="input" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Shelf name" data-autofocus />
        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" className="btn text-seed" onClick={onRemove}>
            Remove shelf
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={!value.trim()}>
              Save
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function TemplateEditor({ template, onClose }: { template: Partial<Template>; onClose: () => void }) {
  const [name, setName] = useState(template.name ?? '');
  const [bookType, setBookType] = useState<BookType>(template.bookType ?? 'custom');
  const [sections, setSections] = useState((template.sections ?? []).join('\n'));
  const [copyrightPage, setCopyrightPage] = useState(template.copyrightPage ?? true);
  const [dedicationPage, setDedicationPage] = useState(template.dedicationPage ?? false);
  const [acksPage, setAcksPage] = useState(template.acknowledgementsPage ?? false);
  return (
    <Modal open onClose={onClose} title={template.id ? 'Edit template' : 'New template'}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await saveTemplate({
            id: template.id,
            name: name.trim() || 'Untitled template',
            bookType,
            sections: sections.split('\n').map((s) => s.trim()).filter(Boolean),
            copyrightPage,
            dedicationPage,
            acknowledgementsPage: acksPage,
          });
          onClose();
        }}
      >
        <div>
          <label className="label" htmlFor="tpl-name">
            Name
          </label>
          <input id="tpl-name" className="input" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
        </div>
        <div>
          <label className="label" htmlFor="tpl-type">
            Book type
          </label>
          <select id="tpl-type" className="input" value={bookType} onChange={(e) => setBookType(e.target.value as BookType)}>
            {Object.entries(BOOK_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tpl-sections">
            Sections — one per line, in order
          </label>
          <textarea id="tpl-sections" className="input min-h-56 font-serif text-base" value={sections} onChange={(e) => setSections(e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" className="mt-1" checked={copyrightPage} onChange={(e) => setCopyrightPage(e.target.checked)} />
          <span>
            Start books with a copyright page
            <span className="block text-xs text-muted">Includes an “[insert ISBN]” placeholder to fill in before publishing.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" className="mt-1" checked={dedicationPage} onChange={(e) => setDedicationPage(e.target.checked)} />
          <span>
            Start books with a dedication page
            <span className="block text-xs text-muted">A starting line to rewrite in your own words.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" className="mt-1" checked={acksPage} onChange={(e) => setAcksPage(e.target.checked)} />
          <span>
            Start books with an acknowledgements page
            <span className="block text-xs text-muted">A thank-you page to rewrite in your own words.</span>
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Save template
          </button>
        </div>
      </form>
    </Modal>
  );
}

