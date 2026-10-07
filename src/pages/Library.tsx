import { useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Download, SlidersHorizontal, Upload, X } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { EMPTY_FILTERS, filterItems, type LibraryFilters, type SortKey } from '../domain/query';
import type { ContentType, Status } from '../domain/types';
import { CONTENT_TYPES, STATUSES, STATUS_META, TYPE_LABEL } from '../domain/constants';
import { ItemCard } from '../components/ItemCard';
import { BulkBar } from '../components/BulkBar';
import { EmptyState, Spinner, TagChip } from '../components/ui';
import { ImportDialog } from '../components/ImportDialog';
import { download, libraryToMarkdown, today } from '../io/export';

const PAGE = 100;

// Static class names so Tailwind can see them.
const STATUS_ON: Record<Status, string> = {
  seed: 'border-seed bg-seed-bg text-seed',
  developing: 'border-developing bg-developing-bg text-developing',
  polished: 'border-polished bg-polished-bg text-polished',
};

function readFilters(p: URLSearchParams): LibraryFilters {
  const list = (k: string) => (p.get(k) ? p.get(k)!.split(',').filter(Boolean) : []);
  return {
    query: p.get('q') ?? '',
    statuses: list('status') as Status[],
    types: list('type') as ContentType[],
    tagIds: list('tags'),
    bookId: p.get('book'),
    collectionId: p.get('collection'),
    orphansOnly: p.get('orphans') === '1',
    showArchived: p.get('archived') === '1',
    sort: (p.get('sort') as SortKey) ?? 'updated',
  };
}

function writeFilters(f: LibraryFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.query) p.set('q', f.query);
  if (f.statuses.length) p.set('status', f.statuses.join(','));
  if (f.types.length) p.set('type', f.types.join(','));
  if (f.tagIds.length) p.set('tags', f.tagIds.join(','));
  if (f.bookId) p.set('book', f.bookId);
  if (f.collectionId) p.set('collection', f.collectionId);
  if (f.orphansOnly) p.set('orphans', '1');
  if (f.showArchived) p.set('archived', '1');
  if (f.sort !== 'updated') p.set('sort', f.sort);
  return p;
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function Library() {
  const lib = useLibrary();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  const set = (patch: Partial<LibraryFilters>) => setParams(writeFilters({ ...filters, ...patch }), { replace: true });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastClicked = useRef<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [showFilters, setShowFilters] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tagPick, setTagPick] = useState('');

  const results = useMemo(() => (lib ? filterItems(lib.items, filters, lib.ctx) : []), [lib, filters]);
  if (!lib) return <Spinner />;

  const activeCount =
    filters.statuses.length + filters.types.length + filters.tagIds.length + (filters.bookId ? 1 : 0) + (filters.collectionId ? 1 : 0) + (filters.orphansOnly ? 1 : 0) + (filters.showArchived ? 1 : 0);
  const totalLive = lib.items.filter((i) => !i.deletedAt && !i.archived).length;

  const onToggle = (id: string, shift: boolean) => {
    const next = new Set(selected);
    if (shift && lastClicked.current) {
      const ids = results.map((r) => r.id);
      const a = ids.indexOf(lastClicked.current);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        for (const x of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(x);
        setSelected(next);
        return;
      }
    }
    if (next.has(id)) next.delete(id);
    else next.add(id);
    lastClicked.current = id;
    setSelected(next);
  };

  const allSelected = results.length > 0 && results.every((r) => selected.has(r.id));
  const tagsByUse = [...lib.tags].sort((a, b) => (lib.tagCounts.get(b.id) ?? 0) - (lib.tagCounts.get(a.id) ?? 0));

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 md:px-8 md:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Everything you’ve gathered</p>
          <h1 className="page-title">Library</h1>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={() => setImportOpen(true)}>
            <Upload size={15} /> Import
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => download(`yourigin-library-${today()}.md`, libraryToMarkdown(results, lib.ctx.tagName), 'text/markdown')}
            disabled={!results.length}
            title="Export the pieces currently shown as Markdown"
          >
            <Download size={15} /> Export
          </button>
        </div>
      </div>

      <div className="sticky top-[52px] z-20 -mx-4 mt-6 bg-paper/95 px-4 py-3 backdrop-blur md:top-0 md:-mx-8 md:px-8">
        <div className="flex gap-2">
          <input
            type="search"
            className="input py-2.5 text-base"
            placeholder="Search words or #tags…"
            value={filters.query}
            onChange={(e) => set({ query: e.target.value })}
            aria-label="Search library"
          />
          <button
            type="button"
            className={`btn shrink-0 ${activeCount ? 'border-accent text-accent' : ''}`}
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal size={15} /> Filters{activeCount ? ` · ${activeCount}` : ''}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filters.statuses.includes(s)}
              onClick={() => set({ statuses: toggle(filters.statuses, s) })}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                filters.statuses.includes(s) ? STATUS_ON[s] : 'border-line text-ink-2'
              }`}
            >
              {STATUS_META[s].symbol} {STATUS_META[s].label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={filters.orphansOnly}
            onClick={() => set({ orphansOnly: !filters.orphansOnly })}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${filters.orphansOnly ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink-2'}`}
          >
            Unclaimed only
          </button>
          {filters.tagIds.map((t) => (
            <TagChip key={t} name={lib.ctx.tagName.get(t) ?? '?'} active onRemove={() => set({ tagIds: filters.tagIds.filter((x) => x !== t) })} />
          ))}
        </div>

        {showFilters && (
          <div className="panel mt-3 grid gap-4 p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className="label">Types</span>
              <div className="flex flex-wrap gap-1.5">
                {CONTENT_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={filters.types.includes(t)}
                    onClick={() => set({ types: toggle(filters.types, t) })}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${filters.types.includes(t) ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink-2'}`}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label" htmlFor="f-tag">
                Must have tag (combine several)
              </label>
              <select
                id="f-tag"
                className="input"
                value={tagPick}
                onChange={(e) => {
                  if (e.target.value) set({ tagIds: [...new Set([...filters.tagIds, e.target.value])] });
                  setTagPick('');
                }}
              >
                <option value="">Add a tag…</option>
                {tagsByUse
                  .filter((t) => !filters.tagIds.includes(t.id))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.name} ({lib.tagCounts.get(t.id) ?? 0})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-sort">
                Sort
              </label>
              <select id="f-sort" className="input" value={filters.sort} onChange={(e) => set({ sort: e.target.value as SortKey })}>
                <option value="updated">Recently touched</option>
                <option value="created">Recently gathered</option>
                <option value="title">Title</option>
                <option value="status">Status (seeds first)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-book">
                In book
              </label>
              <select id="f-book" className="input" value={filters.bookId ?? ''} onChange={(e) => set({ bookId: e.target.value || null })}>
                <option value="">Any</option>
                {lib.books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="f-col">
                In collection
              </label>
              <select id="f-col" className="input" value={filters.collectionId ?? ''} onChange={(e) => set({ collectionId: e.target.value || null })}>
                <option value="">Any</option>
                {lib.collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={filters.showArchived} onChange={(e) => set({ showArchived: e.target.checked })} />
              Show archived pieces instead
            </label>
            <div className="flex justify-end sm:col-span-1">
              <button type="button" className="btn-ghost" onClick={() => setParams(writeFilters(EMPTY_FILTERS), { replace: true })}>
                <X size={14} /> Clear all filters
              </button>
            </div>
          </div>
        )}
      </div>

      {totalLive === 0 && !filters.showArchived ? (
        <EmptyState
          title="Your library is waiting"
          action={
            <Link to="/" className="btn-primary">
              Capture your first piece
            </Link>
          }
        >
          Everything you capture or import appears here — no folders needed.
        </EmptyState>
      ) : (
        <>
          <div className="mt-2 flex items-center justify-between text-sm text-ink-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(results.map((r) => r.id)))}
                aria-label="Select all shown"
              />
              {results.length} piece{results.length === 1 ? '' : 's'}
            </label>
            {selected.size > 0 && <span className="text-xs text-muted">Shift-click to select a range</span>}
          </div>
          {results.length === 0 ? (
            <EmptyState title="Nothing matches">Try fewer filters, or search for a different word.</EmptyState>
          ) : (
            <div>
              {results.slice(0, limit).map((item) => (
                <ItemCard key={item.id} item={item} selected={selected.has(item.id)} onToggle={(shift) => onToggle(item.id, shift)} />
              ))}
              {results.length > limit && (
                <div className="py-6 text-center">
                  <button type="button" className="btn" onClick={() => setLimit(limit + PAGE)}>
                    Show more ({results.length - limit} remaining)
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <BulkBar ids={[...selected]} onClear={() => setSelected(new Set())} archivedView={filters.showArchived} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
