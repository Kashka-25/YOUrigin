import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArrowLeft, BookPlus, FolderPlus, Trash2, X } from 'lucide-react';
import { db } from '../db/db';
import { useLibrary } from '../hooks/useLibrary';
import { useAutosave } from '../hooks/useAutosave';
import {
  addTagsToItems,
  moveToTrash,
  removeTagFromItems,
  setArchived,
  snapshotRevision,
  updateContent,
} from '../db/content';
import { removeEntries } from '../db/books';
import { removeFromCollection } from '../db/collections';
import { SaveIndicator, Spinner, StatusPicker, TypeSelect, EmptyState } from '../components/ui';
import { TagInput } from '../components/TagInput';
import { AssignDialog } from '../components/AssignDialog';
import { useToast } from '../components/Toast';
import { PendingSuggestions } from '../components/Suggestions';
import { AssistantPanel } from '../components/AssistantPanel';
import { RelationsPanel } from '../components/RelationsPanel';
import { HistoryPanel } from '../components/HistoryPanel';
import { wordCount } from '../domain/text';
import { AssetImage } from '../components/AssetImage';
import type { ImageLayout } from '../domain/types';
import type { ContentItem } from '../domain/types';

export function ItemPage() {
  const { id } = useParams();
  const item = useLiveQuery(() => (id ? db.content.get(id) : undefined), [id]);
  if (item === undefined) return <Spinner />;
  if (!item)
    return (
      <EmptyState title="This piece could not be found" action={<Link to="/library" className="btn">Back to Library</Link>}>
        It may have been permanently removed from the Trash.
      </EmptyState>
    );
  return <Editor key={item.id} item={item} />;
}

function Editor({ item }: { item: ContentItem }) {
  const lib = useLibrary();
  const nav = useNavigate();
  const toast = useToast();
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [notes, setNotes] = useState(item.notes);
  const [assign, setAssign] = useState<'book' | 'collection' | null>(null);

  const save = useCallback(
    async (v: { title: string; body: string; notes: string }) => {
      await snapshotRevision(item.id);
      await updateContent(item.id, v);
    },
    [item.id],
  );
  const { state, schedule, flush } = useAutosave(save);
  const edit = (patch: Partial<{ title: string; body: string; notes: string }>) => {
    const next = { title, body, notes, ...patch };
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.body !== undefined) setBody(patch.body);
    if (patch.notes !== undefined) setNotes(patch.notes);
    schedule(next);
  };

  // If a restore or AI replacement changes the stored text, follow it.
  useEffect(() => {
    if (state === 'saved') {
      setTitle(item.title);
      setBody(item.body);
      setNotes(item.notes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.title, item.body, item.notes]);

  if (!lib) return <Spinner />;
  const tagNames = item.tagIds.map((t) => lib.ctx.tagName.get(t)).filter((x): x is string => !!x);
  const memberships = lib.entries.filter((e) => e.contentId === item.id);
  const collections = lib.collections.filter((c) => c.contentIds.includes(item.id));

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 md:px-8 md:pt-10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button type="button" onClick={() => nav(-1)} className="btn-ghost -ml-3">
          <ArrowLeft size={16} /> Back
        </button>
        <SaveIndicator state={state} />
      </div>

      {item.deletedAt && (
        <p className="mb-4 rounded-xl bg-seed-bg px-4 py-2 text-sm text-seed">
          This piece is in the Trash. <Link to="/trash" className="underline">Open Trash</Link> to restore it.
        </p>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <label htmlFor="item-title" className="sr-only">
            Title
          </label>
          <input
            id="item-title"
            value={title}
            onChange={(e) => edit({ title: e.target.value })}
            placeholder="Title (optional)"
            className="w-full bg-transparent font-serif text-3xl leading-tight text-ink placeholder:text-muted/60 focus:outline-none focus-visible:outline-none md:text-4xl"
          />
          {item.type === 'image' && item.assetId && (
            <AssetImage id={item.assetId} alt={title} className="mt-5 max-h-[70dvh] w-auto max-w-full rounded-xl border border-line" />
          )}
          <label htmlFor="item-body" className={item.type === 'image' ? 'label mt-5' : 'sr-only'}>
            {item.type === 'image' ? 'Caption (optional)' : 'Writing'}
          </label>
          <AutoTextarea
            id="item-body"
            value={body}
            onChange={(v) => edit({ body: v })}
            onBlur={() => void flush()}
            className="writing mt-5 w-full resize-none bg-transparent text-[1.15rem] leading-[1.8] text-ink focus:outline-none focus-visible:outline-none"
          />
          <p className="mt-4 text-xs text-muted">
            {wordCount(body)} words · gathered {new Date(item.createdAt).toLocaleDateString()}
            {item.source.kind === 'import' && item.source.fileName ? ` · imported from ${item.source.fileName}` : ''}
            {item.source.kind === 'ai-variant' ? ' · AI-assisted variant' : ''}
          </p>
        </div>

        <aside className="space-y-6 lg:border-l lg:border-line lg:pl-6">
          <section>
            <h2 className="label">Status</h2>
            <StatusPicker value={item.status} onChange={(s) => void updateContent(item.id, { status: s })} size="sm" />
          </section>
          <section>
            <label className="label" htmlFor="item-type">
              Type
            </label>
            <TypeSelect id="item-type" value={item.type} onChange={(t) => void updateContent(item.id, { type: t })} />
          </section>
          {item.type === 'image' && (
            <section>
              <label className="label" htmlFor="item-layout">
                In print
              </label>
              <select
                id="item-layout"
                className="input"
                value={item.imageLayout ?? 'full-page'}
                onChange={(e) => void updateContent(item.id, { imageLayout: e.target.value as ImageLayout })}
              >
                <option value="full-page">Its own page (within margins)</option>
                <option value="full-bleed">Full page to the edges (bleed)</option>
                <option value="inline">Between pieces, on the same page</option>
              </select>
            </section>
          )}
          <section>
            <h2 className="label">Tags</h2>
            <div className="rounded-xl border border-line bg-card px-2 py-1.5">
              <TagInput
                value={tagNames}
                onAdd={(n) => void addTagsToItems([item.id], [n])}
                onRemove={(n) => {
                  const tid = lib.ctx.tagIdByName.get(n);
                  if (tid) void removeTagFromItems([item.id], tid);
                }}
              />
            </div>
            <PendingSuggestions contentId={item.id} />
          </section>

          <section>
            <div className="flex items-center justify-between">
              <h2 className="label">Books</h2>
              <button type="button" className="btn-ghost -mr-2 text-xs" onClick={() => setAssign('book')}>
                <BookPlus size={14} /> Add
              </button>
            </div>
            {memberships.length === 0 ? (
              <p className="text-sm text-muted">Not in a book yet.</p>
            ) : (
              <ul className="space-y-1">
                {memberships.map((e) => {
                  const section = lib.sections.find((s) => s.id === e.sectionId);
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link to={`/books/${e.bookId}`} className="min-w-0 truncate hover:underline">
                        <span className="font-serif text-base">{lib.ctx.bookTitle.get(e.bookId)}</span>
                        <span className="text-muted"> · {section?.title ?? 'Tray'}</span>
                      </Link>
                      <button type="button" className="btn-ghost p-1" aria-label="Remove from book" onClick={() => void removeEntries([e.id])}>
                        <X size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between">
              <h2 className="label">Collections</h2>
              <button type="button" className="btn-ghost -mr-2 text-xs" onClick={() => setAssign('collection')}>
                <FolderPlus size={14} /> Add
              </button>
            </div>
            {collections.length === 0 ? (
              <p className="text-sm text-muted">Not in a collection.</p>
            ) : (
              <ul className="space-y-1">
                {collections.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link to={`/collections/${c.id}`} className="truncate hover:underline">
                      {c.name}
                    </Link>
                    <button type="button" className="btn-ghost p-1" aria-label="Remove from collection" onClick={() => void removeFromCollection(c.id, [item.id])}>
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <label className="label" htmlFor="item-notes">
              Notes to self
            </label>
            <textarea
              id="item-notes"
              value={notes}
              onChange={(e) => edit({ notes: e.target.value })}
              rows={3}
              className="input resize-y"
              placeholder="Context, intentions, where it came from…"
            />
          </section>

          <RelationsPanel item={item} />
          <AssistantPanel item={{ ...item, title, body }} />
          <HistoryPanel item={item} />

          <section className="flex flex-wrap gap-2 border-t border-line pt-4">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const undo = await setArchived([item.id], !item.archived);
                toast(item.archived ? 'Restored from archive' : 'Archived', { undo });
              }}
            >
              <Archive size={15} /> {item.archived ? 'Unarchive' : 'Archive'}
            </button>
            {!item.deletedAt && (
              <button
                type="button"
                className="btn text-seed"
                onClick={async () => {
                  await flush();
                  const undo = await moveToTrash([item.id]);
                  toast('Moved to Trash', { undo });
                  nav('/library');
                }}
              >
                <Trash2 size={15} /> Move to Trash
              </button>
            )}
          </section>
        </aside>
      </div>

      {assign && <AssignDialog open mode={assign} contentIds={[item.id]} onClose={() => setAssign(null)} />}
    </div>
  );
}

function AutoTextarea({
  value,
  onChange,
  className,
  id,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
  id: string;
  onBlur?: () => void;
}) {
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 300) + 'px';
  }, [el, value]);
  return <textarea id={id} ref={setEl} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} className={className} spellCheck />;
}
