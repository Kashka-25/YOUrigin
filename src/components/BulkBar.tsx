import { useState } from 'react';
import { Archive, ArchiveRestore, BookPlus, FolderPlus, Tag as TagIcon, Trash2, X } from 'lucide-react';
import type { ContentType, Status } from '../domain/types';
import { CONTENT_TYPES, STATUSES, STATUS_META, TYPE_LABEL } from '../domain/constants';
import { addTagsToItems, moveToTrash, removeTagFromItems, setArchived, setStatus, setType } from '../db/content';
import { normaliseTagName } from '../domain/text';
import { useToast } from './Toast';
import { useLibrary } from '../hooks/useLibrary';
import { AssignDialog } from './AssignDialog';
import { Modal } from './Modal';

export function BulkBar({
  ids,
  onClear,
  archivedView = false,
}: {
  ids: string[];
  onClear: () => void;
  archivedView?: boolean;
}) {
  const lib = useLibrary();
  const toast = useToast();
  const [assign, setAssign] = useState<'book' | 'collection' | null>(null);
  const [tagMode, setTagMode] = useState<'add' | 'remove' | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const n = ids.length;
  if (!n) return null;

  const run = async (label: string, op: () => Promise<() => Promise<void>>) => {
    const undo = await op();
    toast(label, { undo });
  };

  const tagsOnSelection = lib
    ? [...new Set(ids.flatMap((id) => lib.contentById.get(id)?.tagIds ?? []))].map((t) => ({ id: t, name: lib.ctx.tagName.get(t) ?? '' }))
    : [];

  return (
    <>
      <div
        className="no-print sticky bottom-16 z-30 mx-auto mt-4 flex max-w-4xl flex-wrap items-center gap-2 rounded-2xl border border-line bg-card px-3 py-2 shadow-lg md:bottom-4"
        role="toolbar"
        aria-label="Bulk actions"
      >
        <span className="px-1 text-sm font-semibold">{n} selected</span>
        <select
          className="rounded-full border border-line bg-card px-2 py-1 text-sm"
          aria-label="Set status"
          value=""
          onChange={(e) => {
            const s = e.target.value as Status;
            if (s) void run(`Marked ${n} as ${STATUS_META[s].label}`, () => setStatus(ids, s));
          }}
        >
          <option value="">Status…</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].symbol} {STATUS_META[s].label}
            </option>
          ))}
        </select>
        <select
          className="rounded-full border border-line bg-card px-2 py-1 text-sm"
          aria-label="Set type"
          value=""
          onChange={(e) => {
            const t = e.target.value as ContentType;
            if (t) void run(`Changed ${n} to ${TYPE_LABEL[t]}`, () => setType(ids, t));
          }}
        >
          <option value="">Type…</option>
          {CONTENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <button type="button" className="btn-ghost" onClick={() => setTagMode('add')}>
          <TagIcon size={15} /> Tag
        </button>
        <button type="button" className="btn-ghost" onClick={() => setTagMode('remove')} disabled={!tagsOnSelection.length}>
          Untag
        </button>
        <button type="button" className="btn-ghost" onClick={() => setAssign('book')}>
          <BookPlus size={15} /> Book
        </button>
        <button type="button" className="btn-ghost" onClick={() => setAssign('collection')}>
          <FolderPlus size={15} /> Collection
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            void run(archivedView ? `Restored ${n} from archive` : `Archived ${n}`, async () => {
              const u = await setArchived(ids, !archivedView);
              onClear();
              return u;
            })
          }
        >
          {archivedView ? <ArchiveRestore size={15} /> : <Archive size={15} />} {archivedView ? 'Unarchive' : 'Archive'}
        </button>
        <button
          type="button"
          className="btn-ghost text-seed"
          onClick={() =>
            void run(`Moved ${n} to Trash`, async () => {
              const u = await moveToTrash(ids);
              onClear();
              return u;
            })
          }
        >
          <Trash2 size={15} /> Trash
        </button>
        <button type="button" className="btn-ghost ml-auto" onClick={onClear} aria-label="Clear selection">
          <X size={16} />
        </button>
      </div>

      {assign && <AssignDialog open mode={assign} contentIds={ids} onClose={() => setAssign(null)} onDone={onClear} />}

      <Modal open={tagMode === 'add'} onClose={() => setTagMode(null)} title={`Tag ${n} piece${n === 1 ? '' : 's'}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const names = tagDraft.split(/[\s,]+/).map(normaliseTagName).filter(Boolean);
            if (!names.length) return;
            void run(`Tagged ${n} with ${names.map((x) => '#' + x).join(' ')}`, () => addTagsToItems(ids, names));
            setTagDraft('');
            setTagMode(null);
          }}
        >
          <label className="label" htmlFor="bulk-tags">
            Tags (separate with spaces)
          </label>
          <input
            id="bulk-tags"
            className="input"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            placeholder="#water #grief"
            list="bulk-tag-options"
            data-autofocus
          />
          <datalist id="bulk-tag-options">
            {lib?.tags.map((t) => <option key={t.id} value={t.name} />)}
          </datalist>
          <div className="mt-5 flex justify-end">
            <button className="btn-primary" type="submit">
              Apply
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={tagMode === 'remove'} onClose={() => setTagMode(null)} title="Remove a tag from the selection">
        <div className="flex flex-wrap gap-2">
          {tagsOnSelection.map((t) => (
            <button
              key={t.id}
              type="button"
              className="btn"
              onClick={() => {
                void run(`Removed #${t.name} from ${n}`, () => removeTagFromItems(ids, t.id));
                setTagMode(null);
              }}
            >
              #{t.name}
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
