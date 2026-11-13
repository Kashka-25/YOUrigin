import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArrowLeft, BookA, BookPlus, ChevronDown, ChevronLeft, ChevronRight, FolderKanban, FolderPlus, List, Maximize2, Minimize2, Trash2, X } from 'lucide-react';
import { ContentsList, useBookOrder } from '../components/book/ContentsList';
import { SpaceControl } from '../components/book/SpaceControl';
import { displayTitle } from '../domain/text';
import { db } from '../db/db';
import { useLibrary } from '../hooks/useLibrary';
import { useAutosave } from '../hooks/useAutosave';
import { useFocusMode } from '../hooks/useFocusMode';
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
import { removeItemFromProject } from '../db/projectRecords';
import { SaveIndicator, Spinner, StatusPicker, TypeSelect, EmptyState } from '../components/ui';
import { TagInput } from '../components/TagInput';
import { AssignDialog } from '../components/AssignDialog';
import { ProjectAssignDialog } from '../components/ProjectAssignDialog';
import { useToast } from '../components/Toast';
import { PendingSuggestions } from '../components/Suggestions';
import { LyricLens } from '../components/lyrics/LyricLens';
import { AssistantPanel } from '../components/AssistantPanel';
import { RelationsPanel } from '../components/RelationsPanel';
import { HistoryPanel } from '../components/HistoryPanel';
import { wordCount } from '../domain/text';
import { AssetImage } from '../components/AssetImage';
import { AutoTextarea } from '../components/AutoTextarea';
import { ArtPanel } from '../components/art/ArtPanel';
import { ArtViewer } from '../components/art/ArtViewer';
import { artCaption } from '../components/art/art';
import { EditNotePanel } from '../components/EditNotePanel';
import { useSettings } from '../db/settings';
import { isEditNote, resolveEditCategory } from '../sync/buildNotes';
import type { ImageLayout } from '../domain/types';
import type { ContentItem } from '../domain/types';
import { WordPanel } from '../components/WordPanel';
import { ShareToYouButton } from '../components/ShareToYou';
import { fitWord, isWordPack, wordsDb } from '../words/store';
import { wordAt, type Ending, type Range } from '../words/morph';
import { DEMO } from '../demo/mode';
import { selectAndReveal } from '../words/caret';

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

/** "2 Works · 1 Project", leaving out what doesn't apply. */
function livesIn(works: number, projects: number, collections: number): string {
  const parts = [
    works ? `${works} ${works === 1 ? 'Work' : 'Works'}` : '',
    projects ? `${projects} ${projects === 1 ? 'Project' : 'Projects'}` : '',
    collections ? `${collections} ${collections === 1 ? 'collection' : 'collections'}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'not placed yet';
}

function Editor({ item }: { item: ContentItem }) {
  const lib = useLibrary();
  const settings = useSettings();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const bookParam = params.get('book');
  const order = useBookOrder(bookParam);
  const at = order ? order.flat.findIndex((c) => c.id === item.id) : -1;
  const prev = at > 0 ? order!.flat[at - 1] : null;
  const next = order && at >= 0 && at < order.flat.length - 1 ? order.flat[at + 1] : null;
  const toast = useToast();
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [notes, setNotes] = useState(item.notes);
  const [assign, setAssign] = useState<'book' | 'collection' | null>(null);
  const [assignProject, setAssignProject] = useState(false);
  const [focus, setFocus] = useFocusMode();
  const [viewing, setViewing] = useState(false);
  const [bodyEl, setBodyEl] = useState<HTMLTextAreaElement | null>(null);
  const [lookup, setLookup] = useState<Range | null>(null);
  const hasWords = useLiveQuery(async () => (await wordsDb.packs.toArray()).some((p) => isWordPack(p.id)), []);
  const latest = useRef({ title, body, notes });
  useEffect(() => {
    latest.current = { title, body, notes };
  });

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

  // Arriving from Spelling: select the word that was found.
  const sel = params.get('sel');
  useEffect(() => {
    const [a, b] = (sel ?? '').split('-').map(Number);
    if (bodyEl && sel && b >= a) selectAndReveal(bodyEl, a, b);
  }, [bodyEl, sel]);

  const openLookup = useCallback(() => {
    if (!bodyEl) return;
    const at = bodyEl.selectionStart;
    setLookup(wordAt(bodyEl.value, at, bodyEl.selectionEnd) ?? { start: at, end: at, text: '' });
  }, [bodyEl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyL') {
        e.preventDefault();
        openLookup();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openLookup]);

  /** Puts a synonym in place of the looked-up word, with the same ending and capitals. */
  const swap = async (word: string, ending: Ending) => {
    if (!lookup) return;
    const r = lookup;
    const text = r.text ? await fitWord(word, ending, r.text) : word;
    const put = (from: string, to: string) => {
      const cur = latest.current;
      if (cur.body.slice(r.start, r.start + from.length) !== from) return;
      const nextBody = cur.body.slice(0, r.start) + to + cur.body.slice(r.start + from.length);
      setBody(nextBody);
      schedule({ ...cur, body: nextBody });
      requestAnimationFrame(() => {
        bodyEl?.focus({ preventScroll: true });
        bodyEl?.setSelectionRange(r.start, r.start + to.length);
      });
    };
    put(r.text, text);
    setLookup(null);
    if (r.text) toast(`${r.text} → ${text}`, { undo: () => put(text, r.text) });
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
  const projects = lib.projects.filter((project) => (item.projectIds ?? []).includes(project.id));
  const editCategory = settings ? resolveEditCategory(settings.editNotesCategory, lib.tags, lib.collections) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 md:px-8 md:pt-10">
      <div className="chrome mb-4 flex items-center justify-between gap-3">
        {order ? (
          <Link to={`/projects/${order.book.id}`} className="btn-ghost -ml-3 min-w-0">
            <ArrowLeft size={16} /> <span className="truncate">{order.book.title}</span>
          </Link>
        ) : (
          <button type="button" onClick={() => nav(-1)} className="btn-ghost -ml-3">
            <ArrowLeft size={16} /> Back
          </button>
        )}
        <div className="flex items-center gap-2">
          <SaveIndicator state={state} />
          <button type="button" className="btn-ghost text-xs" onClick={() => setFocus(true)} title="Hide the bars while you write">
            <Maximize2 size={15} /> Focus
          </button>
        </div>
      </div>
      {order && at >= 0 && (
        <nav className="chrome mb-5 flex items-center gap-2 rounded-xl border border-line bg-card px-2 py-1.5 text-sm" aria-label="Move through the Work">
          {prev ? (
            <Link to={`/item/${prev.id}?book=${order.book.id}`} className="btn-ghost min-w-0 px-2" onClick={() => void flush()} title={displayTitle(prev)}>
              <ChevronLeft size={16} /> <span className="hidden truncate sm:inline">{displayTitle(prev)}</span>
              <span className="sm:hidden">Previous</span>
            </Link>
          ) : (
            <span className="px-2 text-muted">Start of Work</span>
          )}
          <Link to={`/projects/${order.book.id}/contents`} className="mx-auto shrink-0 text-xs text-muted hover:text-ink">
            {at + 1} of {order.flat.length}
          </Link>
          {next ? (
            <Link to={`/item/${next.id}?book=${order.book.id}`} className="btn-ghost min-w-0 px-2" onClick={() => void flush()} title={displayTitle(next)}>
              <span className="hidden truncate sm:inline">{displayTitle(next)}</span>
              <span className="sm:hidden">Next</span> <ChevronRight size={16} />
            </Link>
          ) : (
            <span className="px-2 text-muted">End of Work</span>
          )}
        </nav>
      )}

      {item.deletedAt && (
        <p className="mb-4 rounded-xl bg-seed-bg px-4 py-2 text-sm text-seed">
          This piece is in the Trash. <Link to="/trash" className="underline">Open Trash</Link> to restore it.
        </p>
      )}

      <div className={`grid grid-cols-1 gap-8 ${focus ? 'mx-auto max-w-3xl pt-4' : 'lg:grid-cols-[minmax(0,1fr)_320px]'}`}>
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
            <button type="button" onClick={() => setViewing(true)} className="mt-5 block max-w-full" aria-label="View full screen">
              <AssetImage id={item.assetId} alt={title} className="max-h-[70dvh] w-auto max-w-full rounded-xl border border-line" />
            </button>
          )}
          {viewing && item.assetId && (
            <ArtViewer slides={[{ assetId: item.assetId, title: title || 'Untitled', caption: artCaption(item) }]} index={0} onIndex={() => {}} onClose={() => setViewing(false)} />
          )}
          <label htmlFor="item-body" className={item.type === 'image' ? 'label mt-5' : 'sr-only'}>
            {item.type === 'image' ? 'Caption (optional)' : 'Writing'}
          </label>
          <AutoTextarea
            id="item-body"
            value={body}
            onChange={(v) => edit({ body: v })}
            onBlur={() => void flush()}
            inputRef={setBodyEl}
            className="writing mt-5 w-full resize-none bg-transparent text-[1.15rem] leading-[1.8] text-ink focus:outline-none focus-visible:outline-none"
          />
          <p className="mt-4 text-xs text-muted">
            {wordCount(body)} words · gathered {new Date(item.createdAt).toLocaleDateString()}
            {item.source.kind === 'import' && item.source.fileName ? ` · imported from ${item.source.fileName}` : ''}
            {item.source.kind === 'ai-variant' ? ' · AI-assisted variant' : ''} ·{' '}
            <Link to={`/spelling?in=piece:${item.id}`} className="underline-offset-2 hover:text-ink hover:underline" onClick={() => void flush()}>
              Check spelling
            </Link>{' '}
            ·{' '}
            <Link to={`/atlas/lineage/${item.id}`} className="underline-offset-2 hover:text-ink hover:underline" onClick={() => void flush()}>
              See its lineage
            </Link>
          </p>
          {item.type === 'song' && <LyricLens body={body} />}
        </div>

        <aside className="chrome space-y-6 lg:border-l lg:border-line lg:pl-6">
          {order && (
            <details className="group rounded-xl border border-line">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-paper-2 [&::-webkit-details-marker]:hidden">
                <List size={15} aria-hidden /> Contents
                <ChevronDown size={16} className="ml-auto text-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="max-h-[60dvh] overflow-y-auto px-3 pb-3">
                <ContentsList bookId={order.book.id} currentId={item.id} compact />
              </div>
            </details>
          )}
          {editCategory && isEditNote(item, editCategory, lib.collections) && (
            <EditNotePanel item={item} categoryName={editCategory.name} saved={state === 'saved'} />
          )}
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
          {order && (() => {
            const entry = lib.entries.find((e) => e.bookId === order.book.id && e.contentId === item.id);
            return entry && item.type !== 'image' ? <SpaceControl entry={entry} item={item} /> : null;
          })()}
          {item.type === 'image' && <ArtPanel item={item} />}
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

          {/* Where the piece lives, folded into one quiet row (with counts) until opened. */}
          <details className="group rounded-xl border border-line">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-paper-2 [&::-webkit-details-marker]:hidden">
              <span className="shrink-0">Where it lives</span>
              <span className="min-w-0 truncate font-normal text-muted">{livesIn(lib.ctx.booksOf.get(item.id)?.size ?? 0, projects.length, lib.ctx.collectionsOf.get(item.id)?.size ?? 0)}</span>
              <ChevronDown size={16} className="ml-auto shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-6 px-3 pt-2 pb-4">
          <section>
            <div className="flex items-center justify-between">
              <h2 className="label">Works</h2>
              <button type="button" className="btn-ghost -mr-2 text-xs" onClick={() => setAssign('book')}>
                <BookPlus size={14} /> Add
              </button>
            </div>
            {memberships.length === 0 ? (
              <p className="text-sm text-muted">Not in a Work yet.</p>
            ) : (
              <ul className="space-y-1">
                {memberships.map((e) => {
                  const section = lib.sections.find((s) => s.id === e.sectionId);
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link to={`/projects/${e.bookId}`} className="min-w-0 truncate hover:underline">
                        <span className="font-serif text-base">{lib.ctx.bookTitle.get(e.bookId)}</span>
                        <span className="text-muted"> · {section?.title ?? 'Tray'}</span>
                      </Link>
                      <button type="button" className="btn-ghost p-1" aria-label="Remove from Work" onClick={() => void removeEntries([e.id])}>
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
              <h2 className="label">Projects</h2>
              <button type="button" className="btn-ghost -mr-2 text-xs" onClick={() => setAssignProject(true)}>
                <FolderKanban size={14} /> Add
              </button>
            </div>
            {projects.length === 0 ? (
              <p className="text-sm text-muted">Not linked to a Project yet.</p>
            ) : (
              <ul className="space-y-1">
                {projects.map((project) => (
                  <li key={project.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link to={'/initiative/' + project.id} className="min-w-0 truncate font-serif text-base hover:underline">{project.title}</Link>
                    <button type="button" className="btn-ghost p-1" aria-label="Remove from Project" onClick={() => void removeItemFromProject(project.id, item.id)}>
                      <X size={14} />
                    </button>
                  </li>
                ))}
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

            </div>
          </details>

          {/* Notes to self, links, the assistant and history: there when wanted, out of the way when writing. */}
          <details className="group rounded-xl border border-line">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-paper-2 [&::-webkit-details-marker]:hidden">
              Notes, links & helpers
              <ChevronDown size={16} className="ml-auto shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-6 px-3 pt-2 pb-4">
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

          {!DEMO && <ShareToYouButton item={{ ...item, title, body }} />}
          <RelationsPanel item={item} />
          <AssistantPanel item={{ ...item, title, body }} />
          <HistoryPanel item={item} />
            </div>
          </details>

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

      {focus && (
        <button
          type="button"
          onClick={() => setFocus(false)}
          className="no-print fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card/80 text-muted shadow-md backdrop-blur hover:text-ink"
          aria-label="Leave focus mode and show the bars"
          title="Show the bars"
        >
          <Minimize2 size={16} />
        </button>
      )}

      {item.type !== 'image' && !lookup && !!hasWords && (
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={openLookup}
          className={`no-print fixed right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card/80 text-muted shadow-md backdrop-blur hover:text-ink ${
            focus ? 'bottom-[calc(1rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4'
          }`}
          aria-label="Look up the selected word"
          title="Look up word (Alt L)"
        >
          <BookA size={17} />
        </button>
      )}
      {lookup && <WordPanel key={`${lookup.start}:${lookup.text}`} query={lookup.text} onSwap={(w, e) => void swap(w, e)} onClose={() => setLookup(null)} />}

      {assign && <AssignDialog open mode={assign} contentIds={[item.id]} onClose={() => setAssign(null)} />}
      <ProjectAssignDialog open={assignProject} contentIds={[item.id]} onClose={() => setAssignProject(false)} />
    </div>
  );
}
