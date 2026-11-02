import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, LayoutTemplate, Loader2, PanelRightClose, PanelRightOpen, ZoomIn, ZoomOut } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { useAutosave } from '../hooks/useAutosave';
import { db } from '../db/db';
import { moveEntry } from '../db/books';
import { snapshotRevision, updateContent } from '../db/content';
import { projectKind } from '../domain/constants';
import { nudgeTarget, type OutlineGroup } from '../domain/outline';
import { displayTitle, wordCount } from '../domain/text';
import type { Asset, Book, BookEntry, ContentItem, Section, Status } from '../domain/types';
import { bookCss, bookHtml } from '../print/render';
import { resolveDesign } from '../print/design';
import { usePagedPreview } from '../print/usePagedPreview';
import { AutoTextarea } from '../components/AutoTextarea';
import { AssetImage } from '../components/AssetImage';
import { EmptyState, SaveIndicator, Spinner, StatusPicker } from '../components/ui';

const DOT: Record<Status, string> = { seed: 'bg-seed', developing: 'bg-developing', polished: 'bg-polished' };
const TRAY_ID = 'tray';

type Group = { section: Section | null; entries: { entry: BookEntry; item: ContentItem }[] };

/**
 * The desktop writing workspace: the project's outline, the chosen piece open for
 * editing, and (for books) the real printed pages of its chapter, side by side.
 */
export function Workspace() {
  const { id } = useParams();
  const lib = useLibrary();
  const [params, setParams] = useSearchParams();
  const [preview, setPreview] = useState(true);

  const book = lib?.books.find((b) => b.id === id);
  const groups = useMemo<Group[]>(() => {
    if (!lib || !book) return [];
    const live = (e: BookEntry) => {
      const item = lib.contentById.get(e.contentId);
      return item && !item.deletedAt ? { entry: e, item } : null;
    };
    const of = (sectionId: string | null) =>
      lib.entries
        .filter((e) => e.bookId === book.id && e.sectionId === sectionId)
        .sort((a, b) => a.order - b.order)
        .map(live)
        .filter((x): x is Group['entries'][number] => !!x);
    const sections = lib.sections.filter((s) => s.bookId === book.id).sort((a, b) => a.order - b.order);
    return [...sections.map((s) => ({ section: s, entries: of(s.id) })), { section: null, entries: of(null) }];
  }, [lib, book]);

  const flat = useMemo(() => groups.flatMap((g) => g.entries), [groups]);
  const pieceId = params.get('piece') ?? flat[0]?.item.id ?? null;
  const current = flat.find((x) => x.item.id === pieceId) ?? null;
  const currentGroup = groups.find((g) => g.entries.some((x) => x.item.id === pieceId)) ?? null;

  const select = useCallback(
    (contentId: string) => {
      params.set('piece', contentId);
      setParams(params, { replace: true });
    },
    [params, setParams],
  );

  const nudge = useCallback(
    (entryId: string, dir: -1 | 1) => {
      const outline: OutlineGroup[] = groups.map((g) => ({ sectionId: g.section?.id ?? null, entryIds: g.entries.map((x) => x.entry.id) }));
      const to = nudgeTarget(outline, entryId, dir);
      if (to) void moveEntry(entryId, to.sectionId, to.index);
    },
    [groups],
  );

  // Alt+↑/↓ steps through the pieces; Alt+Shift+↑/↓ moves the open piece. Works while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !current) return;
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      if (e.shiftKey) return nudge(current.entry.id, dir);
      const next = flat[flat.indexOf(current) + dir];
      if (next) select(next.item.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, flat, nudge, select]);

  // Keep the open piece visible in the outline as it moves or as you step through.
  useEffect(() => {
    if (pieceId) document.querySelector(`[data-outline="${pieceId}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [pieceId, groups]);

  if (!lib) return <Spinner />;
  if (!book) return <EmptyState title="Project not found" action={<Link to="/projects" className="btn">All projects</Link>} />;
  const isBook = projectKind(book) === 'book';
  const totalWords = flat.reduce((n, x) => n + wordCount(x.item.body), 0);

  return (
    <div className="flex h-dvh flex-col bg-paper">
      <header className="flex items-center gap-2 border-b border-line bg-card px-3 py-2">
        <Link to={`/projects/${book.id}`} className="btn-ghost">
          <ArrowLeft size={16} /> Project
        </Link>
        <p className="min-w-0 flex-1 truncate font-serif text-lg">{book.title}</p>
        <span className="hidden text-xs text-muted md:inline tabular-nums">
          {flat.length} pieces · {totalWords.toLocaleString()} words
        </span>
        {isBook && (
          <>
            <button type="button" className="btn-ghost hidden lg:inline-flex" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
              {preview ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />} Pages
            </button>
            <Link to={`/projects/${book.id}/print`} className="btn">
              <LayoutTemplate size={15} /> Design & print
            </Link>
          </>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <Outline groups={groups} currentId={pieceId} onSelect={select} onNudge={nudge} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          {current ? (
            <PieceEditor key={current.item.id} item={current.item} bookId={book.id} />
          ) : (
            <EmptyState title="Nothing placed yet" action={<Link to={`/projects/${book.id}`} className="btn">Add pieces to the project</Link>} />
          )}
        </main>
        {isBook && preview && current && currentGroup && <PagePreview book={book} group={currentGroup} pieceId={current.item.id} />}
      </div>
    </div>
  );
}

function Outline({
  groups,
  currentId,
  onSelect,
  onNudge,
}: {
  groups: Group[];
  currentId: string | null;
  onSelect: (contentId: string) => void;
  onNudge: (entryId: string, dir: -1 | 1) => void;
}) {
  let n = 0;
  return (
    <nav aria-label="Outline" className="chrome hidden w-72 shrink-0 flex-col border-r border-line md:flex">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {groups.map((g) => {
          if (!g.section && !g.entries.length) return null;
          const words = g.entries.reduce((w, x) => w + wordCount(x.item.body), 0);
          return (
            <section key={g.section?.id ?? TRAY_ID} className="mb-4">
              <h2 className="flex items-baseline gap-2 px-2 pb-1">
                <span className={`min-w-0 flex-1 truncate ${g.section ? 'font-serif text-[15px] text-ink' : 'eyebrow'}`}>{g.section?.title ?? 'Not placed yet'}</span>
                <span className="shrink-0 text-[11px] text-muted tabular-nums">{words.toLocaleString()} w</span>
              </h2>
              <ol>
                {g.entries.map(({ entry, item }) => {
                  const on = item.id === currentId;
                  const num = g.section ? ++n : undefined;
                  return (
                    <li key={entry.id} data-outline={item.id} className={`group flex items-center rounded-lg ${on ? 'bg-paper-2' : 'hover:bg-paper-2'}`}>
                      <button
                        type="button"
                        onClick={() => onSelect(item.id)}
                        aria-current={on ? 'true' : undefined}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
                      >
                        {num !== undefined && <span className="w-5 shrink-0 text-right text-[11px] text-muted tabular-nums">{num}</span>}
                        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[item.status]}`} aria-hidden />
                        <span className={`min-w-0 flex-1 truncate font-serif text-[15px] ${on ? 'font-semibold text-ink' : 'text-ink-2'}`}>{displayTitle(item)}</span>
                      </button>
                      <span className={`flex shrink-0 pr-1 ${on ? '' : 'invisible group-hover:visible group-focus-within:visible'}`}>
                        <button type="button" className="btn-ghost p-1" onClick={() => onNudge(entry.id, -1)} aria-label={`Move ${displayTitle(item)} up`} title="Move up (Alt+Shift+↑)">
                          <ArrowUp size={13} />
                        </button>
                        <button type="button" className="btn-ghost p-1" onClick={() => onNudge(entry.id, 1)} aria-label={`Move ${displayTitle(item)} down`} title="Move down (Alt+Shift+↓)">
                          <ArrowDown size={13} />
                        </button>
                      </span>
                    </li>
                  );
                })}
                {g.section && !g.entries.length && <li className="px-2 py-1 text-xs text-muted italic">Empty</li>}
              </ol>
            </section>
          );
        })}
      </div>
      <p className="border-t border-line px-4 py-2 text-[11px] leading-relaxed text-muted">
        <kbd>Alt</kbd>+<kbd>↑↓</kbd> next piece · <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>↑↓</kbd> move it
      </p>
    </nav>
  );
}

function PieceEditor({ item, bookId }: { item: ContentItem; bookId: string }) {
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const save = useCallback(
    async (v: { title: string; body: string }) => {
      await snapshotRevision(item.id);
      await updateContent(item.id, v);
    },
    [item.id],
  );
  const { state, schedule, flush } = useAutosave(save);
  const edit = (patch: Partial<{ title: string; body: string }>) => {
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.body !== undefined) setBody(patch.body);
    schedule({ title, body, ...patch });
  };

  // If a restore or another device changes the stored text, follow it.
  useEffect(() => {
    if (state === 'saved') {
      setTitle(item.title);
      setBody(item.body);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.title, item.body]);

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <div className="chrome mb-4 flex flex-wrap items-center gap-3">
        <StatusPicker size="sm" value={item.status} onChange={(status) => void updateContent(item.id, { status })} />
        <span className="ml-auto flex items-center gap-3">
          <SaveIndicator state={state} />
          <Link to={`/item/${item.id}?book=${bookId}`} className="btn-ghost text-xs" onClick={() => void flush()} title="Tags, notes, history, assistant">
            <ExternalLink size={14} /> All details
          </Link>
        </span>
      </div>
      <label htmlFor="ws-title" className="sr-only">
        Title
      </label>
      <input
        id="ws-title"
        value={title}
        onChange={(e) => edit({ title: e.target.value })}
        placeholder="Title (optional)"
        className="w-full bg-transparent font-serif text-3xl leading-tight text-ink placeholder:text-muted/60 focus:outline-none focus-visible:outline-none"
      />
      {item.type === 'image' && item.assetId && <AssetImage id={item.assetId} alt={title} className="mt-5 max-h-[50dvh] w-auto max-w-full rounded-xl border border-line" />}
      <label htmlFor="ws-body" className={item.type === 'image' ? 'label mt-5' : 'sr-only'}>
        {item.type === 'image' ? 'Caption (optional)' : 'Writing'}
      </label>
      <AutoTextarea
        id="ws-body"
        value={body}
        onChange={(v) => edit({ body: v })}
        onBlur={() => void flush()}
        className="writing mt-5 w-full resize-none bg-transparent text-[1.15rem] leading-[1.8] text-ink focus:outline-none focus-visible:outline-none"
      />
      <p className="chrome mt-4 text-xs text-muted">{wordCount(body)} words</p>
    </div>
  );
}

/** The open piece's chapter laid out as real book pages, scrolled to the piece. */
function PagePreview({ book, group, pieceId }: { book: Book; group: Group; pieceId: string }) {
  const lib = useLibrary();
  const assets = useLiveQuery(() => db.assets.toArray(), []);
  const stage = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.55);

  const source = useMemo(() => {
    if (!lib || !assets) return null;
    // Only this chapter, without the book's front and back pages.
    const design = { ...resolveDesign(book), titlePage: false, toc: false, copyright: '', dedication: '', acknowledgements: '', bleed: false };
    const section: Section = group.section ?? { id: TRAY_ID, bookId: book.id, title: 'Not placed yet', order: 0, notes: '', createdAt: 0, updatedAt: 0 };
    const used = new Set([section.imageAssetId, ...group.entries.map((x) => x.item.assetId)].filter(Boolean));
    const html = bookHtml({
      book: { ...book, coverAssetId: undefined },
      design,
      sections: [section],
      entries: group.entries.map((x) => ({ ...x.entry, sectionId: section.id })),
      contentById: lib.contentById,
      assets: new Map(assets.filter((a) => used.has(a.id)).map((a): [string, Asset] => [a.id, a])),
    });
    // The one chapter starts on the first page.
    return { html: `<div class="yb-root">${html}</div>`, css: `${bookCss(design)}\n.yb-section { break-before: auto; }` };
  }, [lib, assets, book, group]);

  const { pages, rendering, error } = usePagedPreview(stage, source?.html ?? '', source?.css ?? '', 600);

  useEffect(() => {
    if (!rendering) stage.current?.querySelector(`[data-piece="${pieceId}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [pieceId, rendering, pages]);

  return (
    <aside aria-label="Printed pages" className="hidden w-[min(42vw,30rem)] shrink-0 flex-col border-l border-line bg-paper-2 lg:flex">
      <div className="chrome flex items-center gap-1 border-b border-line px-3 py-1.5 text-xs text-muted">
        <span className="min-w-0 flex-1 truncate">
          {rendering ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Laying out…
            </span>
          ) : (
            `${group.section?.title ?? 'Not placed yet'} · ${pages ?? 0} page${pages === 1 ? '' : 's'}`
          )}
        </span>
        <button type="button" className="btn-ghost p-1" onClick={() => setZoom((z) => Math.max(0.35, +(z - 0.05).toFixed(2)))} aria-label="Zoom out">
          <ZoomOut size={14} />
        </button>
        <button type="button" className="btn-ghost p-1" onClick={() => setZoom((z) => Math.min(1, +(z + 0.05).toFixed(2)))} aria-label="Zoom in">
          <ZoomIn size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 py-4">
        {error && <p className="mb-3 rounded-xl bg-seed-bg px-3 py-2 text-xs text-seed">Couldn’t lay out the pages: {error}</p>}
        <div className="page-strip relative mx-auto w-max" style={{ zoom }} ref={stage} />
      </div>
    </aside>
  );
}
