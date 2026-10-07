import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { useLibrary } from '../hooks/useLibrary';
import { addToBook, createBook } from '../db/books';
import { addToCollection, createCollection } from '../db/collections';
import { db } from '../db/db';
import { useToast } from './Toast';

/**
 * Adds a set of pieces to a book (optionally a specific section) or a
 * collection — existing or new. Only references are created; content is never copied.
 */
export function AssignDialog({
  open,
  onClose,
  mode,
  contentIds,
  defaultNewName = '',
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  mode: 'book' | 'collection';
  contentIds: string[];
  defaultNewName?: string;
  onDone?: () => void;
}) {
  const lib = useLibrary();
  const toast = useToast();
  const [targetId, setTargetId] = useState<string>(() =>
    (mode === 'book' ? lib?.books.find((b) => !b.archived)?.id : lib?.collections[0]?.id) ?? 'new',
  );
  const [sectionId, setSectionId] = useState<string>('');
  const [name, setName] = useState(defaultNewName);
  const [templateId, setTemplateId] = useState('tpl-poetry');
  const [busy, setBusy] = useState(false);

  const targets = useMemo(() => {
    if (!lib) return [];
    return mode === 'book'
      ? lib.books.filter((b) => !b.archived).map((b) => ({ id: b.id, label: b.title }))
      : lib.collections.map((c) => ({ id: c.id, label: c.name }));
  }, [lib, mode]);

  const sections = useMemo(
    () => (lib && mode === 'book' && targetId !== 'new' ? lib.sections.filter((s) => s.bookId === targetId).sort((a, b) => a.order - b.order) : []),
    [lib, mode, targetId],
  );

  const n = contentIds.length;
  const noun = mode === 'book' ? 'book' : 'collection';

  async function submit() {
    setBusy(true);
    try {
      if (mode === 'book') {
        const bookId = targetId === 'new' ? await createBook({ title: name, templateId }) : targetId;
        const created = await addToBook(bookId, contentIds, sectionId || null);
        const title = (await db.books.get(bookId))?.title ?? 'book';
        const skipped = n - created.length;
        toast(`Added ${created.length} to “${title}”${skipped ? ` (${skipped} already there)` : ''}`, {
          undo: async () => {
            await db.entries.bulkDelete(created);
          },
        });
      } else {
        if (targetId === 'new') {
          const id = await createCollection(name, contentIds);
          toast(`Created collection “${name || 'Untitled collection'}”`, {
            undo: async () => {
              await db.collections.delete(id);
            },
          });
        } else {
          const undo = await addToCollection(targetId, contentIds);
          toast(`Added ${n} to “${targets.find((t) => t.id === targetId)?.label}”`, { undo });
        }
      }
      onDone?.();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Add ${n} piece${n === 1 ? '' : 's'} to a ${noun}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        <fieldset className="space-y-1.5">
          <legend className="label">Choose {noun}</legend>
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {targets.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-paper-2">
                <input type="radio" name="target" checked={targetId === t.id} onChange={() => setTargetId(t.id)} />
                <span className="font-serif text-lg">{t.label}</span>
              </label>
            ))}
            <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-paper-2">
              <input type="radio" name="target" checked={targetId === 'new'} onChange={() => setTargetId('new')} />
              <span>New {noun}…</span>
            </label>
          </div>
        </fieldset>

        {targetId === 'new' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={mode === 'book' ? '' : 'sm:col-span-2'}>
              <label className="label" htmlFor="assign-name">
                {mode === 'book' ? 'Title' : 'Name'}
              </label>
              <input id="assign-name" className="input" value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
            </div>
            {mode === 'book' && lib && (
              <div>
                <label className="label" htmlFor="assign-tpl">
                  Template
                </label>
                <select id="assign-tpl" className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  {lib.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {sections.length > 0 && (
          <div>
            <label className="label" htmlFor="assign-section">
              Section
            </label>
            <select id="assign-section" className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">Tray (place it later)</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy || (targetId === 'new' && !name.trim())}>
            Add
          </button>
        </div>
      </form>
    </Modal>
  );
}
