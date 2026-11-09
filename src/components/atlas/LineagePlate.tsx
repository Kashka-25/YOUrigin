import { forwardRef, type KeyboardEvent } from 'react';
import type { Lineage, LineageVia, PlateBox, PlateLayout } from '../../domain/atlas';
import type { Book, ContentItem } from '../../domain/types';
import { PROJECT_KIND_META, STATUS_META, TYPE_LABEL } from '../../domain/constants';
import { displayTitle } from '../../domain/text';

/** Literal colours (not CSS variables) so a saved image looks the same outside the app. */
export interface PlatePalette {
  paper: string;
  card: string;
  ink: string;
  ink2: string;
  muted: string;
  line: string;
  gold: string;
  ai: string;
}

export function readPalette(el: Element = document.documentElement): PlatePalette {
  const css = getComputedStyle(el);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    paper: v('--paper', '#120d1a'),
    card: v('--card', '#1b1426'),
    ink: v('--ink', '#f0e8df'),
    ink2: v('--ink-2', '#c5b8c9'),
    muted: v('--muted', '#8f8499'),
    line: v('--line', '#3a2f47'),
    gold: v('--gold', '#d6ad6d'),
    ai: v('--ai', '#c0a6e8'),
  };
}

/** Ink on white for printing, so a plate doesn't print as a dark block. */
export const PRINT_PALETTE: PlatePalette = {
  paper: '#ffffff',
  card: '#ffffff',
  ink: '#1d1724',
  ink2: '#3d3446',
  muted: '#6b6175',
  line: '#c9c0cf',
  gold: '#9a6b22',
  ai: '#6f4fa0',
};

const SERIF ="'Newsreader Variable', 'Iowan Old Style', Georgia, serif";
const SANS = "'Inter Variable', system-ui, sans-serif";
const DISPLAY = "'Cinzel Variable', Georgia, serif";
const VIA_TEXT: Record<LineageVia, string> = { variant: 'Variant of', continues: 'Continues', idea: 'Grew from the idea', ai: 'AI draft of' };
/** The same relation read from the older piece's side. */
const VIA_BACK: Record<LineageVia, string> = { variant: 'is a variant of it', continues: 'continues it', idea: 'grew from this idea', ai: 'is an AI draft of it' };

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

interface Props {
  lineage: Lineage;
  layout: PlateLayout;
  items: Map<string, ContentItem>;
  works: Map<string, Book>;
  palette: PlatePalette;
  narrow: boolean;
  onOpen: (box: PlateBox) => void;
}

/** Plate I — drawn as one SVG so it prints and saves as an image exactly as seen. */
export const LineagePlate = forwardRef<SVGSVGElement, Props>(function LineagePlate({ lineage, layout, items, works, palette, narrow, onOpen }, ref) {
  const byKey = new Map(layout.boxes.map((b) => [b.key, b]));
  const node = new Map(lineage.nodes.map((n) => [n.id, n]));
  const placeOf = new Map(lineage.places.map((p) => [p.workId, p]));
  const chars = (w: number) => Math.floor((w - 24) / 7.4);

  const label = (box: PlateBox): { title: string; meta: string } => {
    if (box.kind === 'work') {
      const w = works.get(box.refId);
      const p = placeOf.get(box.refId);
      const kind = PROJECT_KIND_META[w?.kind ?? 'book'].label;
      return { title: w?.title || 'Untitled Work', meta: p ? `${kind} · ${p.section} · #${p.position}` : kind };
    }
    const item = items.get(box.refId);
    if (!item) return { title: 'Missing piece', meta: '' };
    const n = node.get(box.refId);
    let meta = `${TYPE_LABEL[item.type]} · ${STATUS_META[item.status].label}`;
    if (box.kind === 'kin') meta = `${lineage.kin.find((k) => k.id === box.refId)?.kind === 'echoes' ? 'Echoes it' : 'Related'} · ${TYPE_LABEL[item.type]}`;
    // On the phone there are no lines, so each piece says how it is related.
    else if (narrow && n?.via && n.towardId) {
      const other = items.get(n.towardId);
      const otherTitle = other ? clip(displayTitle(other), 24) : '';
      meta = n.depth < 0 ? `“${otherTitle}” ${VIA_BACK[n.via]}` : `${VIA_TEXT[n.via]} “${otherTitle}”`;
    }
    return { title: displayTitle(item), meta };
  };

  const path = (a: PlateBox, b: PlateBox) => {
    const x1 = a.x + a.w;
    const y1 = a.y + a.h / 2;
    const x2 = b.x;
    const y2 = b.y + b.h / 2;
    if (x2 > x1) {
      const mid = (x1 + x2) / 2;
      return { d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`, lx: mid, ly: (y1 + y2) / 2 };
    }
    // Same column (kin beneath the piece): a gentle hook down the left side.
    const x = Math.min(a.x, b.x) - 14;
    return { d: `M${a.x},${a.y + a.h / 2} C${x},${a.y + a.h / 2} ${x},${y2} ${b.x},${y2}`, lx: x - 2, ly: (a.y + a.h / 2 + y2) / 2 };
  };

  const key = (box: PlateBox) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(box);
    }
  };

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      height={layout.height}
      role="img"
      aria-label="Lineage plate"
      className="block h-auto max-w-full"
    >
      <rect x={0} y={0} width={layout.width} height={layout.height} fill={palette.paper} />
      {layout.headings.map((h) => (
        <text key={`${h.text}-${h.x}-${h.y}`} x={h.x} y={h.y} fill={palette.gold} fontFamily={DISPLAY} fontSize={10} letterSpacing={2.2}>
          {h.text.toUpperCase()}
        </text>
      ))}
      {!narrow &&
        layout.lines.map((l) => {
          const a = byKey.get(l.from);
          const b = byKey.get(l.to);
          if (!a || !b) return null;
          const p = path(a, b);
          return (
            <g key={`${l.from}>${l.to}`}>
              <path d={p.d} fill="none" stroke={l.dashed ? palette.muted : palette.gold} strokeOpacity={l.dashed ? 0.7 : 0.85} strokeWidth={1.2} strokeDasharray={l.dashed ? '4 4' : undefined} />
              {l.label && (
                <text x={p.lx} y={p.ly - 5} textAnchor="middle" fill={palette.muted} fontFamily={SANS} fontSize={10} stroke={palette.paper} strokeWidth={3} paintOrder="stroke">
                  {l.label}
                </text>
              )}
            </g>
          );
        })}
      {narrow && (
        // A quiet rail down the left edge ties the column together.
        <line x1={1} y1={0} x2={1} y2={layout.height} stroke={palette.line} strokeWidth={1} />
      )}
      {layout.boxes.map((box) => {
        const { title, meta } = label(box);
        const work = box.kind === 'work';
        return (
          <g
            key={box.key}
            role="link"
            tabIndex={0}
            aria-label={`${work ? 'Open Work' : box.root ? 'This piece' : 'Show lineage of'} ${title}`}
            onClick={() => onOpen(box)}
            onKeyDown={key(box)}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              rx={10}
              fill={palette.card}
              stroke={box.root ? palette.gold : work ? palette.ai : palette.line}
              strokeWidth={box.root ? 1.8 : 1}
              strokeDasharray={box.kind === 'kin' ? '4 3' : undefined}
            />
            {work && <rect x={box.x} y={box.y + 10} width={3} height={box.h - 20} rx={1.5} fill={palette.ai} />}
            <text x={box.x + 12} y={box.y + 24} fill={palette.ink} fontFamily={SERIF} fontSize={15}>
              {clip(title, chars(box.w))}
            </text>
            <text x={box.x + 12} y={box.y + 43} fill={box.root ? palette.gold : palette.muted} fontFamily={SANS} fontSize={10.5}>
              {clip(meta, Math.floor((box.w - 24) / 5.6))}
            </text>
          </g>
        );
      })}
    </svg>
  );
});

/** Save the plate as a PNG, drawn at twice its size so it stays crisp in a portfolio. */
export async function savePlateImage(svg: SVGSVGElement, fileName: string): Promise<void> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const w = Number(svg.getAttribute('width'));
  const h = Number(svg.getAttribute('height'));
  clone.removeAttribute('class');
  const data = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not draw the plate'));
      img.src = url;
    });
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not draw the plate');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not save the plate');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } finally {
    URL.revokeObjectURL(url);
  }
}
