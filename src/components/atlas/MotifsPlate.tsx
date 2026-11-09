import { forwardRef, type KeyboardEvent } from 'react';
import { LOOSE, type MotifLayout, type MotifRow, type MotifTable } from '../../domain/atlas';
import type { PlatePalette } from './LineagePlate';

const SERIF = "'Newsreader Variable', 'Iowan Old Style', Georgia, serif";
const SANS = "'Inter Variable', system-ui, sans-serif";

export interface MotifCell {
  row: string;
  column: string;
}

interface Props {
  table: MotifTable;
  layout: MotifLayout;
  palette: PlatePalette;
  selected: MotifCell | null;
  onSelect: (cell: MotifCell) => void;
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

/** Plate III — motifs down the side, Works across the top, a dot where they meet. One SVG, so it prints and saves as seen. */
export const MotifsPlate = forwardRef<SVGSVGElement, Props>(function MotifsPlate({ table, layout, palette, selected, onSelect }, ref) {
  const { labelWidth: L, colWidth: C, headerHeight: H, rowHeight: R, numbered } = layout;
  const max = Math.max(1, ...table.rows.flatMap((r) => [...r.cells.values()].map((ids) => ids.length)));
  const radius = (n: number) => 3 + 9 * Math.sqrt(n / max);
  const cx = (ci: number) => L + ci * C + C / 2;
  const cy = (ri: number) => H + ri * R + R / 2;

  const key = (cell: MotifCell) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(cell);
    }
  };
  const describe = (row: MotifRow, title: string, n: number) => `${row.label} in ${title}: ${n} ${n === 1 ? 'piece' : 'pieces'}${row.source === 'word' ? ' (suggested motif)' : ''}`;

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      height={layout.height}
      role="img"
      aria-label="Motifs plate"
      className="block h-auto max-w-full"
    >
      <rect x={0} y={0} width={layout.width} height={layout.height} fill={palette.paper} />

      {/* Column heads: names on a slant when there is room, numbers with a key beneath when there isn't. */}
      {table.columns.map((c, ci) => {
        const loose = c.id === LOOSE;
        return (
          <g key={c.id}>
            <line x1={cx(ci)} y1={H - 4} x2={cx(ci)} y2={H + table.rows.length * R} stroke={palette.line} strokeOpacity={0.5} />
            {numbered ? (
              <text x={cx(ci)} y={H - 10} textAnchor="middle" fill={loose ? palette.muted : palette.gold} fontFamily={SANS} fontSize={11}>
                {ci + 1}
              </text>
            ) : (
              <text
                transform={`translate(${cx(ci) + 4},${H - 10}) rotate(-38)`}
                fill={loose ? palette.muted : palette.ink}
                fontFamily={SERIF}
                fontStyle={loose ? 'italic' : undefined}
                fontSize={13}
              >
                {clip(c.title, 22)}
              </text>
            )}
          </g>
        );
      })}

      {table.rows.map((row, ri) => {
        const word = row.source === 'word';
        const y = cy(ri);
        return (
          <g key={row.key}>
            <line x1={6} y1={y + R / 2} x2={L + table.columns.length * C} y2={y + R / 2} stroke={palette.line} strokeOpacity={0.45} />
            <text x={L - 12} y={y + 4} textAnchor="end" fill={word ? palette.ai : palette.ink} fontFamily={word ? SERIF : SANS} fontStyle={word ? 'italic' : undefined} fontSize={word ? 14 : 12.5}>
              {clip(row.label, numbered ? 13 : 20)}
            </text>
            {word && <line x1={L - 12 - Math.min(row.label.length, numbered ? 13 : 20) * 6.3} y1={y + 8} x2={L - 12} y2={y + 8} stroke={palette.ai} strokeDasharray="2 2" strokeOpacity={0.7} />}
            {table.columns.map((c, ci) => {
              const ids = row.cells.get(c.id);
              if (!ids) return null;
              const isSel = selected?.row === row.key && selected.column === c.id;
              const r = radius(ids.length);
              return (
                <g key={c.id} role="button" tabIndex={0} aria-label={describe(row, c.title, ids.length)} aria-pressed={isSel} onClick={() => onSelect({ row: row.key, column: c.id })} onKeyDown={key({ row: row.key, column: c.id })} style={{ cursor: 'pointer' }}>
                  {/* A larger invisible target so small dots are easy to tap. */}
                  <rect x={cx(ci) - C / 2} y={y - R / 2} width={C} height={R} fill="transparent" />
                  {isSel && <circle cx={cx(ci)} cy={y} r={r + 4} fill="none" stroke={palette.ink} strokeWidth={1.2} />}
                  {word ? (
                    <circle cx={cx(ci)} cy={y} r={r} fill="none" stroke={palette.ai} strokeWidth={1.4} strokeDasharray="3 2" />
                  ) : (
                    <circle cx={cx(ci)} cy={y} r={r} fill={palette.gold} fillOpacity={c.id === LOOSE ? 0.45 : 0.9} />
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {numbered &&
        table.columns.map((c, ci) => (
          <text key={c.id} x={8} y={layout.keyTop + ci * 20 + 12} fill={c.id === LOOSE ? palette.muted : palette.ink2} fontFamily={SANS} fontSize={11.5} fontStyle={c.id === LOOSE ? 'italic' : undefined}>
            <tspan fill={palette.gold}>{ci + 1}</tspan>
            {`  ${clip(c.title, 44)}`}
          </text>
        ))}
    </svg>
  );
});
