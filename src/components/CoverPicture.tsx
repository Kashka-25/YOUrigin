import { useId } from 'react';
import type { ProjectColour } from '../domain/types';
import { AssetImage } from './AssetImage';
import { projectColourStyle } from './ProjectColourPicker';

/** The Project's colour for the current theme (set by .project-cover in index.css). */
const C = 'var(--project-colour)';

/** A small, stable number from a string, so each Project keeps its own picture. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * A card's picture: the real cover when there is one, otherwise a soft generated one
 * in the Project's own colour, so cards aren't just text. Decorative only.
 */
export function CoverPicture({
  assetId,
  colour,
  seed,
  className = '',
}: {
  assetId?: string;
  colour?: ProjectColour;
  seed: string;
  className?: string;
}) {
  const gid = useId().replace(/:/g, '');
  if (assetId) return <AssetImage id={assetId} alt="" className={`object-cover ${className}`} />;
  const n = hash(seed);
  const motif = n % 4;
  const x = 20 + (n % 60);
  const y = 20 + ((n >> 8) % 40);
  return (
    <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" className={`project-cover block ${className}`} style={projectColourStyle(colour)} aria-hidden role="presentation">
      <defs>
        <linearGradient id={`g${gid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: C, stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: C, stopOpacity: 0.12 }} />
        </linearGradient>
      </defs>
      <rect width="160" height="90" fill={`url(#g${gid})`} />
      {motif === 0 && (
        <>
          <circle cx={x + 50} cy={y} r="22" style={{ fill: C, fillOpacity: 0.55 }} />
          <circle cx={x + 50} cy={y} r="34" fill="none" style={{ stroke: C, strokeOpacity: 0.35 }} />
        </>
      )}
      {motif === 1 &&
        [0, 1, 2].map((i) => (
          <path key={i} d={`M0 ${52 + i * 12} C 40 ${44 + i * 12}, 80 ${62 + i * 12}, 160 ${50 + i * 12}`} fill="none" strokeWidth="2" style={{ stroke: C, strokeOpacity: 0.6 - i * 0.15 }} />
        ))}
      {motif === 2 &&
        [0, 1, 2, 3].map((i) => <rect key={i} x={20 + i * 30} y={30 + ((n >> (i * 3)) % 25)} width="18" height="18" rx="9" style={{ fill: C, fillOpacity: 0.25 + i * 0.12 }} />)}
      {motif === 3 && <path d={`M${x} 90 L${x + 40} ${y} L${x + 80} 90 Z`} style={{ fill: C, fillOpacity: 0.45 }} />}
    </svg>
  );
}
