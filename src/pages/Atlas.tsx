import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ArrowUpRight, ImageDown, Printer } from 'lucide-react';
import { db } from '../db/db';
import { useLibrary } from '../hooks/useLibrary';
import { useToast } from '../components/Toast';
import { EmptyState, Spinner } from '../components/ui';
import { buildLineage, descentEdges, layoutLineage, type PlateBox } from '../domain/atlas';
import { TYPE_LABEL } from '../domain/constants';
import { displayTitle } from '../domain/text';
import { LineagePlate, PRINT_PALETTE, readPalette, savePlateImage } from '../components/atlas/LineagePlate';

const PLATES = [
  { n: 'I', name: 'Lineage', text: 'Where a piece came from, what came from it, and where it lives in your Works.', ready: true },
  { n: 'II', name: 'The Loom', text: 'Your Projects as threads through time, with pieces dropping into Works.', ready: false },
  { n: 'III', name: 'Motifs', text: 'What keeps coming back, across your Works.', ready: false },
];

/** The Creation Atlas: a set of numbered plates that map how things get made. Read-only. */
export function Atlas() {
  const lib = useLibrary();
  const relationships = useLiveQuery(() => db.relationships.toArray(), []);
  const [q, setQ] = useState('');

  // Pieces with the most family come first: they make the richest plates.
  const families = useMemo(() => {
    if (!lib || !relationships) return null;
    const count = new Map<string, number>();
    for (const e of descentEdges(lib.contentById, relationships)) {
      count.set(e.parent, (count.get(e.parent) ?? 0) + 1);
      count.set(e.child, (count.get(e.child) ?? 0) + 1);
    }
    return count;
  }, [lib, relationships]);

  if (!lib || !families) return <Spinner />;
  const live = lib.items.filter((i) => !i.deletedAt && !i.archived);
  const needle = q.trim().toLowerCase();
  const list = needle
    ? live.filter((i) => `${i.title}\n${i.body}`.toLowerCase().includes(needle)).slice(0, 12)
    : live
        .filter((i) => families.has(i.id))
        .sort((a, b) => (families.get(b.id) ?? 0) - (families.get(a.id) ?? 0) || b.updatedAt - a.updatedAt)
        .slice(0, 12);

  return (
    <div className="page-frame">
      <header className="mb-8">
        <p className="eyebrow">Studio</p>
        <h1 className="page-title mt-1">Creation Atlas</h1>
        <p className="mt-3 max-w-2xl font-serif text-lg leading-relaxed text-ink-2">
          Plates that map how your work gets made. They only show what is already here: nothing is moved, copied or changed.
        </p>
      </header>

      <ol className="grid gap-3 md:grid-cols-3" aria-label="Plates">
        {PLATES.map((p) => (
          <li key={p.n} className={`archive-card p-5 ${p.ready ? '' : 'opacity-60'}`}>
            <p className="font-display text-[10px] tracking-[.24em] text-gold uppercase">Plate {p.n}</p>
            <h2 className="mt-1 font-serif text-2xl text-ink">{p.name}</h2>
            <p className="mt-2 text-sm text-ink-2">{p.text}</p>
            {!p.ready && <p className="mt-3 text-xs text-muted">Coming next</p>}
          </li>
        ))}
      </ol>

      <section className="mt-10">
        <p className="eyebrow">Plate I</p>
        <h2 className="section-heading mt-1">Choose a piece to see its lineage</h2>
        <input type="search" className="input mt-4 max-w-md" placeholder="Find a piece…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a piece" />
        {!needle && list.length > 0 && <p className="mt-3 text-xs text-muted">Pieces with the most family first.</p>}
        {list.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {list.map((i) => (
              <li key={i.id}>
                <Link to={`/atlas/lineage/${i.id}`} className="archive-card flex items-center gap-3 p-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-lg text-ink">{displayTitle(i)}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {TYPE_LABEL[i.type]}
                      {families.get(i.id) ? ` · ${families.get(i.id)} family ${families.get(i.id) === 1 ? 'link' : 'links'}` : ''}
                    </span>
                  </span>
                  <ArrowUpRight size={15} className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="panel mt-4 p-5 text-sm text-ink-2">
            {needle
              ? 'No piece matches that.'
              : 'No piece has a family yet. Variants, continuations and the ideas behind artworks all grow a lineage. You can also open any piece and choose “See its lineage”.'}
          </div>
        )}
      </section>
    </div>
  );
}

/** Plate I, Lineage, for one piece. */
export function LineagePage() {
  const { id = '' } = useParams();
  const lib = useLibrary();
  const relationships = useLiveQuery(() => db.relationships.toArray(), []);
  const navigate = useNavigate();
  const toast = useToast();
  const svg = useRef<SVGSVGElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);

  // Printing swaps to ink on white.
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const on = () => setPrinting(true);
    const off = () => setPrinting(false);
    window.addEventListener('beforeprint', on);
    window.addEventListener('afterprint', off);
    return () => {
      window.removeEventListener('beforeprint', on);
      window.removeEventListener('afterprint', off);
    };
  }, []);

  // Following a lineage opens a new plate: start it at the top.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [id]);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [lib, relationships]);

  const lineage = useMemo(() => {
    if (!lib || !relationships || !lib.contentById.get(id)) return null;
    return buildLineage(id, { items: lib.contentById, relationships, books: lib.books, sections: lib.sections, entries: lib.entries });
  }, [lib, relationships, id]);

  if (!lib || !relationships) return <Spinner />;
  const item = lib.contentById.get(id);
  if (!item || !lineage) return <EmptyState title="Piece not found" />;

  // The wide plate scales down to fit; past a third smaller its words get too small, so read it top to bottom instead.
  const wide = layoutLineage(lineage, 'wide');
  const narrow = width < 640 || wide.width * 0.66 > width;
  const layout = narrow ? layoutLineage(lineage, 'narrow', Math.max(280, Math.min(width, 560))) : wide;
  const works = new Map(lib.books.map((b) => [b.id, b]));
  const title = displayTitle(item);
  const alone = lineage.nodes.length === 1 && !lineage.kin.length && !lineage.places.length;

  const open = (box: PlateBox) => {
    if (box.kind === 'work') navigate(`/projects/${box.refId}`);
    else if (box.root) navigate(`/item/${box.refId}`);
    else navigate(`/atlas/lineage/${box.refId}`);
  };
  const save = async () => {
    if (!svg.current) return;
    try {
      await savePlateImage(svg.current, `Lineage - ${title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 60)}.png`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the plate');
    }
  };

  return (
    <div className="page-frame">
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Link to="/atlas" className="btn-ghost">
          <ArrowLeft size={16} /> Creation Atlas
        </Link>
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn" onClick={() => window.print()}>
            <Printer size={16} /> Print
          </button>
          <button type="button" className="btn" onClick={() => void save()}>
            <ImageDown size={16} /> Save image
          </button>
        </div>
      </div>
      <header className="mb-6">
        <p className="font-display text-[10px] tracking-[.24em] text-gold uppercase">Plate I · Lineage</p>
        <h1 className="mt-1 font-serif text-3xl leading-tight text-ink md:text-4xl">{title}</h1>
        <p className="no-print mt-2 text-sm text-ink-2">
          Tap a piece to follow its lineage, or a Work to open it.{' '}
          <Link to={`/item/${item.id}`} className="underline underline-offset-2">
            Open this piece
          </Link>
        </p>
      </header>
      <div ref={frame} className="overflow-x-auto rounded-2xl border border-line">
        <LineagePlate ref={svg} lineage={lineage} layout={layout} items={lib.contentById} works={works} palette={printing ? PRINT_PALETTE : readPalette()} narrow={narrow} onOpen={open} />
      </div>
      {alone && (
        <p className="mt-4 text-sm text-ink-2">
          This piece has no family yet. Its lineage grows when you draft a variant, link the idea behind an artwork, or place it in a Work.
        </p>
      )}
    </div>
  );
}
