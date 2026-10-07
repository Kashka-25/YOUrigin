import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../hooks/useLibrary';
import { buildGraph, layout, type GraphNode } from '../domain/graph';
import { EmptyState, Spinner, StatusBadge } from '../components/ui';
import { displayTitle } from '../domain/text';
import { coverColour } from '../components/BookCover';

const W = 900;
const H = 620;

export function BookMap() {
  const lib = useLibrary();
  const [focus, setFocus] = useState<string | null>(null);

  const graph = useMemo(() => {
    if (!lib) return null;
    const items = lib.items.filter((i) => !i.deletedAt && !i.archived);
    const { nodes, edges } = buildGraph({
      items,
      tagName: lib.ctx.tagName,
      books: lib.books.filter((b) => !b.archived).map((b) => ({ id: b.id, title: b.title, contentIds: lib.entries.filter((e) => e.bookId === b.id).map((e) => e.contentId) })),
      collections: lib.collections.map((c) => ({ id: c.id, name: c.name, contentIds: c.contentIds })),
    });
    return { nodes: layout(nodes, edges, W, H), edges };
  }, [lib]);

  if (!lib || !graph) return <Spinner />;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const neighbours = new Set<string>();
  if (focus) {
    neighbours.add(focus);
    for (const e of graph.edges) {
      if (e.a === focus) neighbours.add(e.b);
      if (e.b === focus) neighbours.add(e.a);
    }
  }
  const maxEdge = Math.max(1, ...graph.edges.map((e) => e.weight));
  const maxNode = Math.max(1, ...graph.nodes.map((n) => n.weight));
  const focused = focus ? byId.get(focus) : undefined;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 md:px-8 md:pt-12">
      <p className="eyebrow">How your material connects</p>
      <h1 className="page-title">Book Map</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-ink-2">
        Tags that appear together are drawn together. Books and collections sit near the themes they hold. Select anything to see its neighbourhood.
      </p>

      {graph.nodes.length < 2 ? (
        <EmptyState title="The map is still blank">Tag a few pieces and the connections between them will appear here.</EmptyState>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="panel overflow-hidden">
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="group" aria-label="Relationship map" onClick={() => setFocus(null)}>
              {graph.edges.map((e) => {
                const a = byId.get(e.a);
                const b = byId.get(e.b);
                if (!a || !b) return null;
                const lit = !focus || (neighbours.has(e.a) && neighbours.has(e.b) && (e.a === focus || e.b === focus));
                return (
                  <line
                    key={e.a + e.b}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="var(--ink-2)"
                    strokeOpacity={lit ? 0.12 + 0.4 * (e.weight / maxEdge) : 0.04}
                    strokeWidth={0.8 + 2.5 * (e.weight / maxEdge)}
                  />
                );
              })}
              {graph.nodes.map((n) => (
                <MapNode
                  key={n.id}
                  node={n}
                  scale={n.weight / maxNode}
                  dim={!!focus && !neighbours.has(n.id)}
                  active={focus === n.id}
                  colour={n.kind === 'book' ? coverColour(lib.books.find((b) => 'b:' + b.id === n.id)?.cover ?? 'clay') : undefined}
                  onSelect={() => setFocus(focus === n.id ? null : n.id)}
                />
              ))}
            </svg>
          </div>
          <aside className="space-y-4">
            <div className="flex flex-wrap gap-3 text-xs text-ink-2">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full border border-ink-2 bg-paper-2" /> Tag
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-4 rounded-sm bg-accent" /> Book
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-4 rounded-sm border border-dashed border-ink-2" /> Collection
              </span>
            </div>
            {focused ? <FocusPanel node={focused} neighbours={[...neighbours].filter((x) => x !== focused.id).map((x) => byId.get(x)!).filter(Boolean)} onFocus={setFocus} /> : (
              <p className="text-sm text-muted">Select a tag, book or collection.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function MapNode({
  node,
  scale,
  dim,
  active,
  colour,
  onSelect,
}: {
  node: GraphNode;
  scale: number;
  dim: boolean;
  active: boolean;
  colour?: string;
  onSelect: () => void;
}) {
  const r = 10 + 18 * Math.sqrt(scale);
  const common = {
    tabIndex: 0,
    role: 'button',
    'aria-label': `${node.kind} ${node.label}`,
    'aria-pressed': active,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect();
      }
    },
    style: { cursor: 'pointer', opacity: dim ? 0.25 : 1 },
  };
  if (node.kind === 'tag') {
    return (
      <g {...common}>
        <circle cx={node.x} cy={node.y} r={r} fill="var(--paper-2)" stroke={active ? 'var(--accent)' : 'var(--ink-2)'} strokeWidth={active ? 2.5 : 1} />
        <text x={node.x} y={node.y + r + 14} textAnchor="middle" fontSize={13} fill="var(--ink)" fontFamily="var(--font-sans)">
          {node.label}
        </text>
      </g>
    );
  }
  const w = Math.min(190, 24 + node.label.length * 7.5);
  return (
    <g {...common}>
      <rect
        x={node.x - w / 2}
        y={node.y - 15}
        width={w}
        height={30}
        rx={8}
        fill={node.kind === 'book' ? colour : 'var(--card)'}
        stroke={active ? 'var(--ink)' : node.kind === 'book' ? 'none' : 'var(--ink-2)'}
        strokeDasharray={node.kind === 'collection' ? '4 3' : undefined}
        strokeWidth={active ? 2 : 1}
      />
      <text x={node.x} y={node.y + 5} textAnchor="middle" fontSize={14} fill={node.kind === 'book' ? '#fff' : 'var(--ink)'} fontFamily="var(--font-serif)">
        {node.label.length > 24 ? node.label.slice(0, 23) + '…' : node.label}
      </text>
    </g>
  );
}

function FocusPanel({ node, neighbours, onFocus }: { node: GraphNode; neighbours: GraphNode[]; onFocus: (id: string) => void }) {
  const lib = useLibrary();
  if (!lib) return null;
  const rawId = node.id.slice(2);
  const pieces =
    node.kind === 'tag'
      ? lib.items.filter((i) => !i.deletedAt && i.tagIds.includes(rawId))
      : node.kind === 'book'
        ? lib.entries.filter((e) => e.bookId === rawId).map((e) => lib.contentById.get(e.contentId)!).filter(Boolean)
        : (lib.collections.find((c) => c.id === rawId)?.contentIds ?? []).map((id) => lib.contentById.get(id)!).filter(Boolean);
  const link = node.kind === 'tag' ? `/library?tags=${rawId}` : node.kind === 'book' ? `/books/${rawId}` : `/collections/${rawId}`;
  return (
    <div className="panel p-4">
      <p className="eyebrow">{node.kind}</p>
      <Link to={link} className="font-serif text-2xl hover:underline">
        {node.label}
      </Link>
      <p className="text-sm text-muted">{pieces.length} pieces</p>
      {neighbours.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {neighbours.slice(0, 12).map((n) => (
            <button key={n.id} type="button" className="rounded-full border border-line px-2 py-0.5 text-xs hover:bg-paper-2" onClick={() => onFocus(n.id)}>
              {n.label}
            </button>
          ))}
        </div>
      )}
      <ul className="mt-4 space-y-1.5">
        {pieces.slice(0, 10).map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <StatusBadge status={p.status} compact />
            <Link to={`/item/${p.id}`} className="truncate font-serif hover:underline">
              {displayTitle(p)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
