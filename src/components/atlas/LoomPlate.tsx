import { forwardRef, type KeyboardEvent } from 'react';
import { LOOSE_THREAD, type Loom, type LoomLayout } from '../../domain/loom';
import type { ContentItem } from '../../domain/types';
import { projectColourOption, STATUS_META } from '../../domain/constants';
import { displayTitle } from '../../domain/text';
import type { PlatePalette } from './LineagePlate';

const SERIF = "'Newsreader Variable', 'Iowan Old Style', Georgia, serif";
const SANS = "'Inter Variable', system-ui, sans-serif";
/** Rough brightness (0-255) of a #rrggbb colour. */
function brightness(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}
/** A thread is a thin line, so use whichever of the Project's two shades stands further from the paper. */
function threadShade(light: string, dark: string, paper: string): string {
  const p = brightness(paper);
  return Math.abs(brightness(light) - p) >= Math.abs(brightness(dark) - p) ? light : dark;
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

interface Props {
  loom: Loom;
  layout: LoomLayout;
  items: Map<string, ContentItem>;
  palette: PlatePalette;
  selected: string | null;
  onSelectKnot: (contentId: string) => void;
  onOpenThread: (threadId: string) => void;
}

/**
 * Plate II — The Loom. Threads (Projects) run left to right through time; knots are
 * pieces, filled by how far along they are; fine lines drop into the Works they joined.
 */
export const LoomPlate = forwardRef<SVGSVGElement, Props>(function LoomPlate({ loom, layout, items, palette, selected, onSelectKnot, onOpenThread }, ref) {
  const narrow = layout.labelWidth < 100;
  const right = layout.width - 12;
  const key = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
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
      aria-label="The Loom plate"
      className="block"
    >
      <rect x={0} y={0} width={layout.width} height={layout.height} fill={palette.paper} />

      {/* Time: month (or week) marks. */}
      {/* Leave room for "Today" at the right-hand end. */}
      {layout.ticks.filter((t) => right - t.x > 52).map((t) => (
        <g key={`${t.x}-${t.label}`}>
          <line x1={t.x} y1={layout.axisY + 8} x2={t.x} y2={layout.height - 6} stroke={palette.line} strokeOpacity={0.45} />
          <text x={t.x + 4} y={layout.axisY} fill={palette.muted} fontFamily={SANS} fontSize={10.5}>
            {t.label}
          </text>
        </g>
      ))}
      <text x={right} y={layout.axisY} textAnchor="end" fill={palette.gold} fontFamily={SANS} fontSize={10.5}>
        Today
      </text>

      {loom.threads.map((thread) => {
        const row = layout.rows.find((r) => r.id === thread.id)!;
        const loose = thread.id === LOOSE_THREAD;
        const shade = projectColourOption(thread.colour);
        const colour = loose ? palette.muted : threadShade(shade.hex, shade.dark, palette.paper);
        const start = layout.labelWidth;
        return (
          <g key={thread.id}>
            {/* The thread itself, and its name. */}
            <line x1={start} y1={row.y} x2={right} y2={row.y} stroke={colour} strokeWidth={loose ? 1 : 1.6} strokeDasharray={loose ? '4 4' : undefined} strokeOpacity={0.85} />
            <g
              role="link"
              tabIndex={loose ? -1 : 0}
              aria-label={loose ? thread.title : `Open Project ${thread.title}`}
              onClick={() => !loose && onOpenThread(thread.id)}
              onKeyDown={key(() => !loose && onOpenThread(thread.id))}
              style={{ cursor: loose ? 'default' : 'pointer' }}
            >
              {/* On the phone the plate opens at today, so the name sits at that end, above its thread. */}
              <text
                x={narrow ? right : start - 12}
                y={narrow ? row.y - 12 : row.y + 4}
                textAnchor="end"
                fill={loose ? palette.muted : palette.ink}
                fontFamily={SERIF}
                fontStyle={loose ? 'italic' : undefined}
                fontSize={14}
              >
                {clip(thread.title, narrow ? 40 : 17)}
              </text>
            </g>

            {/* Works this thread's pieces dropped into: a fine band each, with the drops. */}
            {thread.bands.map((band) => {
              const by = row.bands.find((b) => b.workId === band.workId)!.y;
              const first = Math.min(...band.drops.map((d) => layout.x(d.to)));
              return (
                <g key={band.workId}>
                  <line x1={first} y1={by} x2={right} y2={by} stroke={palette.ai} strokeOpacity={0.55} strokeWidth={1} />
                  {/* On the phone the label rides on the band; near today's end it is set flush right so it isn't cut off. */}
                  <text
                    x={narrow ? (right - first < 150 ? right : first) : start - 12}
                    y={narrow ? by - 4 : by + 3.5}
                    textAnchor={narrow && right - first >= 150 ? 'start' : 'end'}
                    fill={palette.ai}
                    fontFamily={SANS}
                    fontSize={10.5}
                  >
                    {narrow ? `↳ ${clip(band.title, 30)}` : `↳ ${clip(band.title, 22)}`}
                  </text>
                  {band.drops.map((d) => {
                    const k = layout.knots.get(`${thread.id}:${d.contentId}`);
                    if (!k) return null;
                    const tx = layout.x(d.to);
                    return (
                      <g key={d.contentId}>
                        <path d={`M${k.x},${k.y} C${k.x},${(k.y + by) / 2} ${tx},${(k.y + by) / 2} ${tx},${by}`} fill="none" stroke={colour} strokeOpacity={0.5} strokeWidth={1} />
                        <rect x={tx - 2.5} y={by - 2.5} width={5} height={5} transform={`rotate(45 ${tx} ${by})`} fill={palette.ai} />
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Knots: hollow = seed, half = developing, full = polished. */}
            {thread.knots.map((knot) => {
              const k = layout.knots.get(`${thread.id}:${knot.id}`)!;
              const item = items.get(knot.id);
              const title = item ? displayTitle(item) : 'A piece';
              const isSel = selected === knot.id;
              return (
                <g
                  key={knot.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${title}, ${STATUS_META[knot.status].label}, gathered ${new Date(knot.at).toLocaleDateString()}`}
                  aria-pressed={isSel}
                  onClick={() => onSelectKnot(knot.id)}
                  onKeyDown={key(() => onSelectKnot(knot.id))}
                  style={{ cursor: 'pointer' }}
                >
                  <circle cx={k.x} cy={k.y} r={11} fill="transparent" />
                  {isSel && <circle cx={k.x} cy={k.y} r={9} fill="none" stroke={palette.ink} strokeWidth={1.2} />}
                  <circle
                    cx={k.x}
                    cy={k.y}
                    r={5}
                    fill={knot.status === 'seed' ? palette.paper : colour}
                    fillOpacity={knot.status === 'developing' ? 0.5 : 1}
                    stroke={colour}
                    strokeWidth={1.6}
                  />
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
});
