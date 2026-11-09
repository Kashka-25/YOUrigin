// Creation Atlas — pure logic for its plates (see docs/CREATION_ATLAS.md).
// Plate I, Lineage: where a piece came from, what came from it, and where it lives in Works.
// Read-only: the Atlas only describes what already exists.

import type { Book, BookEntry, ContentItem, ProjectKind, Relationship, Section } from './types';

/** How a piece descends from another. */
export type LineageVia = 'variant' | 'continues' | 'idea' | 'ai';

export interface LineageNode {
  id: string;
  /** Negative: what it came from (−1 parent, −2 grandparent…). Positive: what came from it. 0: the piece itself. */
  depth: number;
  /** The neighbour one step closer to the piece itself (null for the piece). */
  towardId: string | null;
  via: LineageVia | null;
}

export interface LineagePlace {
  contentId: string;
  workId: string;
  workTitle: string;
  kind: ProjectKind;
  section: string;
  /** 1-based position within its section. */
  position: number;
}

export interface Lineage {
  rootId: string;
  /** Ancestors (most distant first), the piece, then descendants (breadth first). */
  nodes: LineageNode[];
  /** Pieces it echoes or is related to: kin, not family. */
  kin: { id: string; kind: 'echoes' | 'related' }[];
  /** Where the piece and its descendants sit in Works. */
  places: LineagePlace[];
}

export interface LineageInput {
  items: Map<string, ContentItem>;
  relationships: Relationship[];
  books: Book[];
  sections: Section[];
  entries: BookEntry[];
  /** How far to walk in each direction. */
  maxDepth?: number;
}

/**
 * Parent → child edges, normalised from the different ways YOUrigin records descent:
 *  - variant:   from = the variant, to = the original
 *  - continues: from = the continuation, to = what it continues
 *  - idea:      from = the artwork, to = the note that is the idea behind it
 *  - an AI variant's source.derivedFromId
 */
export function descentEdges(items: Map<string, ContentItem>, relationships: Relationship[]): { parent: string; child: string; via: LineageVia }[] {
  const out = new Map<string, { parent: string; child: string; via: LineageVia }>();
  const live = (id: string) => {
    const i = items.get(id);
    return !!i && !i.deletedAt;
  };
  for (const r of relationships) {
    if (r.kind !== 'variant' && r.kind !== 'continues' && r.kind !== 'idea') continue;
    if (!live(r.fromId) || !live(r.toId) || r.fromId === r.toId) continue;
    out.set(`${r.toId}>${r.fromId}`, { parent: r.toId, child: r.fromId, via: r.kind });
  }
  for (const item of items.values()) {
    const from = item.source?.derivedFromId;
    if (!from || item.deletedAt || !live(from) || from === item.id) continue;
    const key = `${from}>${item.id}`;
    // The variant relationship says the same thing; prefer naming it as AI-drafted.
    out.set(key, { parent: from, child: item.id, via: 'ai' });
  }
  return [...out.values()];
}

export function buildLineage(rootId: string, input: LineageInput): Lineage {
  const maxDepth = input.maxDepth ?? 3;
  const edges = descentEdges(input.items, input.relationships);
  const parents = new Map<string, { id: string; via: LineageVia }[]>();
  const children = new Map<string, { id: string; via: LineageVia }[]>();
  for (const e of edges) {
    parents.set(e.child, [...(parents.get(e.child) ?? []), { id: e.parent, via: e.via }]);
    children.set(e.parent, [...(children.get(e.parent) ?? []), { id: e.child, via: e.via }]);
  }
  const byAge = (a: { id: string }, b: { id: string }) => (input.items.get(a.id)?.createdAt ?? 0) - (input.items.get(b.id)?.createdAt ?? 0);

  const seen = new Set([rootId]);
  const walk = (next: Map<string, { id: string; via: LineageVia }[]>, sign: 1 | -1): LineageNode[] => {
    const found: LineageNode[] = [];
    let frontier = [rootId];
    for (let d = 1; d <= maxDepth && frontier.length; d++) {
      const layer: string[] = [];
      for (const from of frontier)
        for (const n of [...(next.get(from) ?? [])].sort(byAge)) {
          if (seen.has(n.id)) continue; // a piece appears once, even in a loop
          seen.add(n.id);
          layer.push(n.id);
          found.push({ id: n.id, depth: sign * d, towardId: from, via: n.via });
        }
      frontier = layer;
    }
    return found;
  };
  const ancestors = walk(parents, -1);
  const descendants = walk(children, 1);
  const nodes: LineageNode[] = [
    ...ancestors.sort((a, b) => a.depth - b.depth),
    { id: rootId, depth: 0, towardId: null, via: null },
    ...descendants,
  ];

  const family = new Set(nodes.map((n) => n.id));
  const kin: Lineage['kin'] = [];
  for (const r of input.relationships) {
    if (r.kind !== 'echoes' && r.kind !== 'related') continue;
    const other = r.fromId === rootId ? r.toId : r.toId === rootId ? r.fromId : null;
    if (!other || family.has(other) || kin.some((k) => k.id === other)) continue;
    const item = input.items.get(other);
    if (item && !item.deletedAt) kin.push({ id: other, kind: r.kind });
  }

  const placed = new Set(nodes.filter((n) => n.depth >= 0).map((n) => n.id));
  const bookById = new Map(input.books.map((b) => [b.id, b]));
  const sectionById = new Map(input.sections.map((s) => [s.id, s]));
  const places: LineagePlace[] = [];
  for (const e of input.entries) {
    if (!placed.has(e.contentId)) continue;
    const book = bookById.get(e.bookId);
    if (!book || book.archived) continue;
    const section = e.sectionId ? sectionById.get(e.sectionId) : undefined;
    const position =
      input.entries.filter((x) => x.bookId === e.bookId && x.sectionId === e.sectionId && x.order < e.order).length + 1;
    places.push({
      contentId: e.contentId,
      workId: book.id,
      workTitle: book.title,
      kind: book.kind ?? 'book',
      section: section?.title ?? 'Tray',
      position,
    });
  }
  return { rootId, nodes, kin, places };
}

// ---- layout -----------------------------------------------------------------

export interface PlateBox {
  key: string;
  /** 'piece' boxes carry a content id; 'work' boxes a Work id. */
  kind: 'piece' | 'work' | 'kin';
  refId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  root?: boolean;
}

export interface PlateLine {
  from: string;
  to: string;
  /** Dashed lines are kinship or placement, solid ones descent. */
  dashed: boolean;
  label?: string;
}

export interface PlateLayout {
  width: number;
  height: number;
  boxes: PlateBox[];
  lines: PlateLine[];
  /** Column (wide) or band (narrow) headings. */
  headings: { text: string; x: number; y: number }[];
}

const VIA_LABEL: Record<LineageVia, string> = { variant: 'variant', continues: 'continues', idea: 'idea behind', ai: 'AI draft' };

/**
 * Wide (laptop): columns left → right — what it came from, the piece, what came from it, Works —
 * with kin beneath the piece. Narrow (phone): the same, read top → bottom as one column.
 */
export function layoutLineage(lineage: Lineage, orientation: 'wide' | 'narrow', narrowWidth = 340): PlateLayout {
  const boxes: PlateBox[] = [];
  const lines: PlateLine[] = [];
  const headings: PlateLayout['headings'] = [];
  const works = [...new Map(lineage.places.map((p) => [p.workId, p])).values()];

  for (const n of lineage.nodes) {
    if (n.towardId) {
      // Lines always run parent → child.
      const [from, to] = n.depth < 0 ? [`p:${n.id}`, `p:${n.towardId}`] : [`p:${n.towardId}`, `p:${n.id}`];
      lines.push({ from, to, dashed: false, label: n.via ? VIA_LABEL[n.via] : undefined });
    }
  }
  for (const p of lineage.places) lines.push({ from: `p:${p.contentId}`, to: `w:${p.workId}`, dashed: true });
  for (const k of lineage.kin) lines.push({ from: `p:${lineage.rootId}`, to: `k:${k.id}`, dashed: true, label: k.kind });

  if (orientation === 'wide') {
    const W = 210;
    const H = 58;
    const GX = 74;
    const GY = 18;
    const TOP = 40;
    const depths = [...new Set(lineage.nodes.map((n) => n.depth))].sort((a, b) => a - b);
    const columns = [...depths.map((d) => ({ d })), ...(works.length ? [{ d: 'works' as const }] : [])];
    let tallest = 0;
    columns.forEach((c, ci) => {
      const x = 20 + ci * (W + GX);
      const members = c.d === 'works' ? works.map((w) => ({ key: `w:${w.workId}`, kind: 'work' as const, refId: w.workId })) : lineage.nodes.filter((n) => n.depth === c.d).map((n) => ({ key: `p:${n.id}`, kind: 'piece' as const, refId: n.id }));
      members.forEach((m, i) => {
        boxes.push({ ...m, x, y: TOP + i * (H + GY), w: W, h: H, root: m.key === `p:${lineage.rootId}` });
      });
      tallest = Math.max(tallest, members.length);
      const text = c.d === 'works' ? 'In Works' : c.d === 0 ? 'This piece' : c.d < 0 ? (c.d === -1 ? 'Came from' : 'Earlier') : c.d === 1 ? 'Led to' : 'Later';
      headings.push({ text, x, y: 22 });
    });
    // Kin sit beneath the piece's own column, below the tallest column.
    const rootBox = boxes.find((b) => b.root)!;
    const kinTop = TOP + tallest * (H + GY) + 30;
    if (lineage.kin.length) headings.push({ text: 'Kin', x: rootBox.x, y: kinTop - 10 });
    lineage.kin.forEach((k, i) => {
      boxes.push({ key: `k:${k.id}`, kind: 'kin', refId: k.id, x: rootBox.x, y: kinTop + i * (H + GY), w: W, h: H });
    });
    const width = 20 + columns.length * (W + GX) - GX + 20;
    const height = Math.max(...boxes.map((b) => b.y + b.h)) + 20;
    return { width, height, boxes, lines, headings };
  }

  // Narrow: one column; ancestors above, the piece, descendants indented beneath, then Works, then kin.
  const H = 56;
  const GY = 14;
  const INDENT = 18;
  const BAND = 30;
  let y = 6;
  const band = (text: string) => {
    headings.push({ text, x: 4, y: y + 14 });
    y += BAND;
  };
  const place = (key: string, kind: PlateBox['kind'], refId: string, indent: number, root = false) => {
    const x = 4 + indent * INDENT;
    boxes.push({ key, kind, refId, x, y, w: narrowWidth - 8 - indent * INDENT, h: H, root });
    y += H + GY;
  };
  const anc = lineage.nodes.filter((n) => n.depth < 0);
  if (anc.length) {
    band('Came from');
    for (const n of anc) place(`p:${n.id}`, 'piece', n.id, 0);
  }
  band('This piece');
  place(`p:${lineage.rootId}`, 'piece', lineage.rootId, 0, true);
  const desc = lineage.nodes.filter((n) => n.depth > 0);
  if (desc.length) {
    band('Led to');
    for (const n of desc) place(`p:${n.id}`, 'piece', n.id, Math.min(n.depth - 1, 3));
  }
  if (works.length) {
    band('In Works');
    for (const w of works) place(`w:${w.workId}`, 'work', w.workId, 0);
  }
  if (lineage.kin.length) {
    band('Kin');
    for (const k of lineage.kin) place(`k:${k.id}`, 'kin', k.id, 0);
  }
  return { width: narrowWidth, height: y, boxes, lines, headings };
}
