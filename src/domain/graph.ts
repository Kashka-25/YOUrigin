export type NodeKind = 'tag' | 'book' | 'collection';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  weight: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  a: string;
  b: string;
  weight: number;
}

export interface GraphInput {
  items: { id: string; tagIds: string[] }[];
  tagName: Map<string, string>;
  books: { id: string; title: string; contentIds: string[] }[];
  collections: { id: string; name: string; contentIds: string[] }[];
  maxTags?: number;
}

/** Builds the relationship graph: tags ↔ tags by co-occurrence, tags ↔ books/collections by shared material. */
export function buildGraph(input: GraphInput): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const count = new Map<string, number>();
  for (const i of input.items) for (const t of i.tagIds) count.set(t, (count.get(t) ?? 0) + 1);
  const topTags = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, input.maxTags ?? 28).map(([t]) => t);
  const keep = new Set(topTags);
  const byId = new Map(input.items.map((i) => [i.id, i]));

  const nodes: GraphNode[] = topTags.map((t) => ({ id: 't:' + t, kind: 'tag', label: '#' + (input.tagName.get(t) ?? t), weight: count.get(t)!, x: 0, y: 0 }));
  const edges = new Map<string, GraphEdge>();
  const addEdge = (a: string, b: string, w = 1) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const e = edges.get(key);
    if (e) e.weight += w;
    else edges.set(key, { a, b, weight: w });
  };

  for (const i of input.items) {
    const ts = i.tagIds.filter((t) => keep.has(t));
    for (let x = 0; x < ts.length; x++) for (let y = x + 1; y < ts.length; y++) addEdge('t:' + ts[x], 't:' + ts[y]);
  }

  const containers = [
    ...input.books.map((b) => ({ id: 'b:' + b.id, kind: 'book' as const, label: b.title, contentIds: b.contentIds })),
    ...input.collections.map((c) => ({ id: 'c:' + c.id, kind: 'collection' as const, label: c.name, contentIds: c.contentIds })),
  ];
  for (const c of containers) {
    if (!c.contentIds.length) continue;
    nodes.push({ id: c.id, kind: c.kind, label: c.label, weight: c.contentIds.length, x: 0, y: 0 });
    const tagUse = new Map<string, number>();
    for (const cid of c.contentIds) for (const t of byId.get(cid)?.tagIds ?? []) if (keep.has(t)) tagUse.set(t, (tagUse.get(t) ?? 0) + 1);
    for (const [t, w] of tagUse) addEdge(c.id, 't:' + t, w);
  }

  // Keep the picture calm: only the strongest tag-tag links.
  const all = [...edges.values()];
  const tagTag = all.filter((e) => e.a.startsWith('t:') && e.b.startsWith('t:')).sort((a, b) => b.weight - a.weight).slice(0, 50);
  const other = all.filter((e) => !(e.a.startsWith('t:') && e.b.startsWith('t:')));
  return { nodes, edges: [...tagTag, ...other] };
}

/** Small deterministic force layout (no randomness → stable between renders). */
export function layout(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number, iterations = 300): GraphNode[] {
  const n = nodes.length;
  if (!n) return [];
  const pos = nodes.map((node, i) => {
    const angle = (i / n) * Math.PI * 2;
    const r = Math.min(width, height) * (node.kind === 'tag' ? 0.32 : 0.42);
    return { ...node, x: width / 2 + r * Math.cos(angle), y: height / 2 + r * Math.sin(angle), vx: 0, vy: 0 };
  });
  const index = new Map(pos.map((p, i) => [p.id, i]));
  const maxW = Math.max(1, ...edges.map((e) => e.weight));
  const k = Math.sqrt((width * height) / n) * 0.75;

  for (let it = 0; it < iterations; it++) {
    const cool = 1 - it / iterations;
    for (const p of pos) {
      p.vx = 0;
      p.vy = 0;
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos[i];
        const b = pos[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = 0.1 * (i - j);
          dy = 0.1;
          d2 = dx * dx + dy * dy;
        }
        const f = (k * k) / d2;
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }
    }
    for (const e of edges) {
      const a = pos[index.get(e.a)!];
      const b = pos[index.get(e.b)!];
      if (!a || !b) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = ((d * d) / k) * (0.3 + (0.7 * e.weight) / maxW) / d;
      a.vx -= dx * f;
      a.vy -= dy * f;
      b.vx += dx * f;
      b.vy += dy * f;
    }
    for (const p of pos) {
      p.vx += (width / 2 - p.x) * 0.02;
      p.vy += (height / 2 - p.y) * 0.02;
      const v = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
      const step = Math.min(v, 12 * cool + 0.5);
      p.x = Math.max(60, Math.min(width - 60, p.x + (p.vx / v) * step));
      p.y = Math.max(30, Math.min(height - 30, p.y + (p.vy / v) * step));
    }
  }
  return pos.map((p) => ({ id: p.id, kind: p.kind, label: p.label, weight: p.weight, x: p.x, y: p.y }));
}
