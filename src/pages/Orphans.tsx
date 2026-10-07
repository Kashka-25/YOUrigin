import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookPlus, Compass, FolderPlus, Sparkles } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { isOrphan } from '../domain/query';
import { localProvider } from '../ai/local';
import type { Placement, Related, Theme } from '../ai';
import { ItemCard } from '../components/ItemCard';
import { EmptyState, Spinner } from '../components/ui';
import { AssignDialog } from '../components/AssignDialog';
import { BulkBar } from '../components/BulkBar';
import { setKeepUnassigned } from '../db/content';
import { addToBook, removeEntries } from '../db/books';
import { addToCollection, createCollection, deleteCollection } from '../db/collections';
import { useToast } from '../components/Toast';
import { displayTitle } from '../domain/text';
import type { ContentItem } from '../domain/types';

export function Orphans() {
  const lib = useLibrary();
  const toast = useToast();
  const [tab, setTab] = useState<'unclaimed' | 'kept'>('unclaimed');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assign, setAssign] = useState<{ mode: 'book' | 'collection'; ids: string[]; name?: string } | null>(null);
  const [clusters, setClusters] = useState<Theme[]>([]);
  const [repeats, setRepeats] = useState<{ phrase: string; itemIds: string[] }[]>([]);

  const { unclaimed, kept } = useMemo(() => {
    if (!lib) return { unclaimed: [], kept: [] };
    const all = lib.items.filter((i) => !i.deletedAt && !i.archived && isOrphan(i, lib.ctx)).sort((a, b) => b.updatedAt - a.updatedAt);
    return { unclaimed: all.filter((i) => !i.keepUnassigned), kept: all.filter((i) => i.keepUnassigned) };
  }, [lib]);

  useEffect(() => {
    if (!lib) return;
    void localProvider.detectThemes(unclaimed, lib.ai).then((t) => setClusters(t.filter((x) => x.itemIds.length >= 2).slice(0, 6)));
    void localProvider.detectRepetition(lib.ai.items).then((r) => setRepeats(r.slice(0, 5)));
  }, [lib, unclaimed]);

  if (!lib) return <Spinner />;
  const list = tab === 'unclaimed' ? unclaimed : kept;

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 md:px-8 md:pt-12">
      <p className="eyebrow">Unclaimed material</p>
      <h1 className="page-title">Orphans</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-ink-2">
        Pieces that don’t belong to a book or collection yet. Not unfinished, not failures — just waiting to be found. Nothing here moves unless you move it.
      </p>

      {clusters.length > 0 && tab === 'unclaimed' && (
        <section className="mt-8" aria-labelledby="clusters-h">
          <h2 id="clusters-h" className="flex items-center gap-1.5 text-sm font-semibold text-ai">
            <Sparkles size={14} aria-hidden /> Patterns in your unclaimed material
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {clusters.map((c) => (
              <li key={c.theme} className="rounded-2xl border border-dashed border-ai/60 bg-ai-bg/40 p-4">
                <p className="font-serif text-lg">
                  You have {c.itemIds.length} pieces circling <span className="italic">{c.theme}</span>.
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted">
                  {c.itemIds.map((id) => displayTitle(lib.contentById.get(id)!)).join(' · ')}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn px-3 py-1 text-xs"
                    onClick={async () => {
                      const name = c.theme.replace(/^#/, '');
                      const id = await createCollection(name.charAt(0).toUpperCase() + name.slice(1), c.itemIds);
                      toast(`Created collection “${name}”`, { undo: () => deleteCollection(id) });
                    }}
                  >
                    <FolderPlus size={13} /> Make a collection
                  </button>
                  <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setAssign({ mode: 'book', ids: c.itemIds })}>
                    <BookPlus size={13} /> Add to a book
                  </button>
                  <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setSelected(new Set(c.itemIds))}>
                    Select these
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {repeats.length > 0 && tab === 'unclaimed' && (
        <details className="mt-6 text-sm">
          <summary className="cursor-pointer text-ink-2">Phrases you return to across pieces ({repeats.length})</summary>
          <ul className="mt-2 space-y-1 pl-4">
            {repeats.map((r) => (
              <li key={r.phrase}>
                <span className="font-serif italic">“{r.phrase}”</span> <span className="text-muted">in {r.itemIds.length} pieces</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-8 flex gap-1 border-b border-line" role="tablist">
        {(
          [
            ['unclaimed', `Unclaimed (${unclaimed.length})`],
            ['kept', `Kept unassigned (${kept.length})`],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              setSelected(new Set());
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? 'border-accent font-semibold text-ink' : 'border-transparent text-ink-2'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState title={tab === 'unclaimed' ? 'Everything has a home' : 'Nothing kept aside'}>
          {tab === 'unclaimed' ? (
            <>
              Every piece belongs to a book or collection. New captures will appear here. <Link to="/" className="underline">Gather something</Link>.
            </>
          ) : (
            'Pieces you choose to keep unassigned rest here, away from the unclaimed list.'
          )}
        </EmptyState>
      ) : (
        <div>
          {list.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onToggle={() => {
                const next = new Set(selected);
                if (next.has(item.id)) next.delete(item.id);
                else next.add(item.id);
                setSelected(next);
              }}
              extra={
                <OrphanHints
                  item={item}
                  kept={tab === 'kept'}
                  onAssign={(mode) => setAssign({ mode, ids: [item.id] })}
                  onKeep={async (keep) => {
                    const undo = await setKeepUnassigned([item.id], keep);
                    toast(keep ? 'Kept unassigned' : 'Back with the unclaimed', { undo });
                  }}
                />
              }
            />
          ))}
        </div>
      )}

      <BulkBar ids={[...selected]} onClear={() => setSelected(new Set())} />
      {assign && <AssignDialog open mode={assign.mode} contentIds={assign.ids} onClose={() => setAssign(null)} onDone={() => setSelected(new Set())} />}
    </div>
  );
}

function OrphanHints({
  item,
  kept,
  onAssign,
  onKeep,
}: {
  item: ContentItem;
  kept: boolean;
  onAssign: (mode: 'book' | 'collection') => void;
  onKeep: (keep: boolean) => void;
}) {
  const lib = useLibrary();
  const toast = useToast();
  const [related, setRelated] = useState<Related[]>([]);
  const [places, setPlaces] = useState<Placement[]>([]);

  useEffect(() => {
    if (!lib) return;
    let alive = true;
    void Promise.all([localProvider.findRelatedContent(item, lib.ai), localProvider.suggestBookPlacement(item, lib.ai)]).then(([r, p]) => {
      if (!alive) return;
      setRelated(r.slice(0, 3));
      setPlaces(p.slice(0, 2));
    });
    return () => {
      alive = false;
    };
  }, [item, lib]);

  if (!lib) return null;
  const possibleCollections = lib.collections
    .map((c) => ({ c, shared: related.filter((r) => c.contentIds.includes(r.id)).length }))
    .filter((x) => x.shared > 0)
    .slice(0, 2);

  return (
    <div className="mt-3 space-y-2 text-sm">
      {related.length > 0 && (
        <p className="text-ink-2">
          <span className="text-xs font-semibold text-ai">Relates to </span>
          {related.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ' · '}
              <Link to={`/item/${r.id}`} className="font-serif italic hover:underline" title={r.reason}>
                {displayTitle(lib.contentById.get(r.id)!)}
              </Link>
            </span>
          ))}
        </p>
      )}
      {(places.length > 0 || possibleCollections.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-ai">Might belong in</span>
          {places.map((p) => (
            <button
              key={p.bookId}
              type="button"
              className="rounded-full border border-dashed border-ai px-2.5 py-0.5 text-xs text-ai hover:bg-ai-bg"
              title={p.reason}
              onClick={async () => {
                const created = await addToBook(p.bookId, [item.id], p.sectionId);
                toast(`Added to “${lib.ctx.bookTitle.get(p.bookId)}”`, {
                  undo: () => removeEntries(created),
                });
              }}
            >
              + {lib.ctx.bookTitle.get(p.bookId)}
            </button>
          ))}
          {possibleCollections.map(({ c }) => (
            <button
              key={c.id}
              type="button"
              className="rounded-full border border-dashed border-ai px-2.5 py-0.5 text-xs text-ai hover:bg-ai-bg"
              onClick={async () => {
                const undo = await addToCollection(c.id, [item.id]);
                toast(`Added to “${c.name}”`, { undo });
              }}
            >
              + {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onAssign('book')}>
          <BookPlus size={13} /> Add to book
        </button>
        <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onAssign('collection')}>
          <FolderPlus size={13} /> Add to collection
        </button>
        <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onKeep(!kept)}>
          {kept ? 'Return to unclaimed' : 'Keep unassigned'}
        </button>
        <Link to={`/item/${item.id}`} className="btn-ghost px-2 py-0.5 text-xs">
          <Compass size={13} /> Explore connections
        </Link>
      </div>
    </div>
  );
}
