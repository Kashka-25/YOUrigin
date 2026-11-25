import { useEffect, useRef, useState } from 'react';
import { STATUS_META } from '../../domain/constants';
import type { Status } from '../../domain/types';

/** The plain coloured dot for a traffic light; an empty ring when there is none. */
export const DOT_CLASS: Record<Status, string> = {
  none: 'border border-dashed border-muted bg-transparent',
  seed: 'bg-seed',
  developing: 'bg-developing',
  polished: 'bg-polished',
};

/** Offered in this order: finished first, then the way back to no colour. */
const CHOICES: Status[] = ['polished', 'developing', 'seed', 'none'];

/**
 * A coloured dot that is also the way to change it: tap it, pick green, orange,
 * red or no colour. Used next to page and chapter titles in the glossary and
 * the writing view, so the colour is always changed the same way.
 */
export function StatusDot({
  value,
  onChange,
  what,
  size = 'md',
}: {
  value: Status;
  onChange: (s: Status) => void;
  /** Read out with the colour, e.g. the page title. */
  what: string;
  size?: 'md' | 'lg';
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const dot = size === 'lg' ? 'h-4 w-4' : 'h-3 w-3';
  return (
    <span ref={box} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${what}: ${STATUS_META[value].label}. Change colour`}
        title={STATUS_META[value].meaning}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-paper-2"
      >
        <span aria-hidden className={`${dot} rounded-full ${DOT_CLASS[value]}`} />
      </button>
      {open && (
        <span role="menu" aria-label={`Colour for ${what}`} className="absolute top-full left-0 z-30 mt-1 grid min-w-44 gap-0.5 rounded-xl border border-line bg-card p-1.5 font-sans shadow-lg">
          {CHOICES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={s === value}
              onClick={() => {
                setOpen(false);
                if (s !== value) onChange(s);
              }}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm ${s === value ? 'bg-paper-2 font-semibold' : 'hover:bg-paper-2'}`}
            >
              <span aria-hidden className={`h-3 w-3 shrink-0 rounded-full ${DOT_CLASS[s]}`} />
              <span className="text-ink">{STATUS_META[s].label}</span>
              {s !== 'none' && <span className="ml-auto pl-3 text-xs whitespace-nowrap text-muted">{STATUS_META[s].short}</span>}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
