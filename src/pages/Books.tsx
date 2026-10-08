import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { computeBookProgress } from '../domain/progress';
import { BOOK_TYPE_LABEL } from '../domain/constants';
import type { BookType, Template } from '../domain/types';
import { createBook, deleteTemplate, saveTemplate } from '../db/books';
import { Modal, useConfirm } from '../components/Modal';
import { EmptyState, ProgressBar, Spinner } from '../components/ui';
import { coverColour } from '../components/BookCover';

export function Books() {
  const lib = useLibrary();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [templateId, setTemplateId] = useState('tpl-poetry');
  const [editing, setEditing] = useState<Partial<Template> | null>(null);

  if (!lib) return <Spinner />;
  const books = [...lib.books].filter((b) => !b.archived).sort((a, b) => b.updatedAt - a.updatedAt);
  const archived = lib.books.filter((b) => b.archived);
  const templates = [...lib.templates].sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 md:px-8 md:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Structures built from what you’ve gathered</p>
          <h1 className="page-title">Books</h1>
        </div>
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> New book
        </button>
      </div>

      {books.length === 0 ? (
        <EmptyState title="No books yet" action={<button className="btn-primary" onClick={() => setCreating(true)}>Start a book</button>}>
          A book is a shape for your material. Choose a template, then bring pieces in from your library.
        </EmptyState>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((b) => {
            const progress = computeBookProgress(
              lib.sections.filter((s) => s.bookId === b.id),
              lib.entries.filter((e) => e.bookId === b.id),
              lib.contentById,
            );
            return (
              <li key={b.id}>
                <Link to={`/books/${b.id}`} className="panel group block overflow-hidden transition-shadow hover:shadow-md">
                  <div className="h-2" style={{ background: coverColour(b.cover) }} />
                  <div className="p-5">
                    <p className="eyebrow">{BOOK_TYPE_LABEL[b.type]}</p>
                    <h2 className="mt-1 font-serif text-2xl leading-tight group-hover:underline">{b.title}</h2>
                    {b.subtitle && <p className="mt-1 font-serif text-ink-2 italic">{b.subtitle}</p>}
                    <div className="mt-4">
                      <ProgressBar value={progress.overall} label="Overall" />
                    </div>
                    <p className="mt-3 text-xs text-muted">
                      {progress.counts.total} pieces · {progress.counts.polished} polished · {progress.counts.developing} developing · {progress.counts.seed} seeds
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {archived.length > 0 && (
        <p className="mt-6 text-sm text-muted">
          Archived:{' '}
          {archived.map((b, i) => (
            <span key={b.id}>
              {i > 0 && ', '}
              <Link to={`/books/${b.id}`} className="underline">
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
              Templates <span className="align-middle text-sm text-muted">({templates.length})</span>
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

      <Modal open={creating} onClose={() => setCreating(false)} title="New book">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const id = await createBook({ title, subtitle, templateId });
            setCreating(false);
            setTitle('');
            setSubtitle('');
            nav(`/books/${id}`);
          }}
        >
          <div>
            <label className="label" htmlFor="nb-title">
              Title
            </label>
            <input id="nb-title" className="input font-serif text-lg" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="YOU — Water" data-autofocus />
          </div>
          <div>
            <label className="label" htmlFor="nb-sub">
              Subtitle (optional)
            </label>
            <input id="nb-sub" className="input" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </div>
          <fieldset>
            <legend className="label">Template</legend>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {templates.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-paper-2">
                  <input type="radio" name="tpl" className="mt-1" checked={templateId === t.id} onChange={() => setTemplateId(t.id)} />
                  <span>
                    <span className="font-medium">{t.name}</span>
                    <span className="block text-xs text-muted">{t.sections.join(' · ') || 'Start empty'}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
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
    </div>
  );
}

function TemplateEditor({ template, onClose }: { template: Partial<Template>; onClose: () => void }) {
  const [name, setName] = useState(template.name ?? '');
  const [bookType, setBookType] = useState<BookType>(template.bookType ?? 'custom');
  const [sections, setSections] = useState((template.sections ?? []).join('\n'));
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

