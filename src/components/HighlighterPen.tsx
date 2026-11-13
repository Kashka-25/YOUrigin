import { Eraser, Highlighter } from 'lucide-react';
import type { HighlightColour } from '../domain/types';
import { HIGHLIGHT_COLOURS } from '../domain/highlights';

/**
 * The highlighter pen: select words, then tap a colour. The eraser clears marks from
 * the selection (or the mark under the cursor). Buttons keep the writing's selection.
 */
export function HighlighterPen({ onMark }: { onMark: (colour: HighlightColour | 'erase') => void }) {
  const keep = (e: React.MouseEvent) => e.preventDefault(); // don't steal the selection
  return (
    <div className="chrome mt-4 flex items-center gap-1.5" role="toolbar" aria-label="Highlighter pen">
      <Highlighter size={15} className="mr-1 text-muted" aria-hidden />
      {HIGHLIGHT_COLOURS.map((c) => (
        <button
          key={c.value}
          type="button"
          onMouseDown={keep}
          onClick={() => onMark(c.value)}
          className="h-6 w-6 rounded-full border border-line transition-transform hover:scale-110 focus-visible:scale-110"
          style={{ background: c.fill.replace(/[\d.]+\)$/, '.85)') }}
          aria-label={`Highlight the selection ${c.label.toLowerCase()}`}
          title={`${c.label} highlighter`}
        />
      ))}
      <button
        type="button"
        onMouseDown={keep}
        onClick={() => onMark('erase')}
        className="ml-1 inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs text-muted hover:bg-paper-2 hover:text-ink"
        aria-label="Erase highlights from the selection"
        title="Eraser"
      >
        <Eraser size={14} aria-hidden /> <span className="hidden sm:inline">Erase</span>
      </button>
    </div>
  );
}
