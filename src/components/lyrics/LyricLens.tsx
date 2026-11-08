import { useMemo } from 'react';
import { ChevronDown, Music2 } from 'lucide-react';
import { analyseLyric, schemeOf } from '../../domain/lyrics';

// Rhyme colours: soft, readable on both themes, never the only signal (the letter is shown too).
const RHYME_TONES = ['text-gold', 'text-ai', 'text-polished', 'text-developing', 'text-seed', 'text-accent'];

/**
 * A song seen as a songwriter reads it: sections, the rhyme scheme of each,
 * and the syllables in every line. It only describes the lyric — it never edits it.
 */
export function LyricLens({ body, defaultOpen = false }: { body: string; defaultOpen?: boolean }) {
  const stanzas = useMemo(() => analyseLyric(body), [body]);
  if (!stanzas.some((s) => s.lines.length)) return null;
  return (
    <details className="group mt-6 rounded-2xl border border-line bg-card/60" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold hover:bg-paper-2 [&::-webkit-details-marker]:hidden">
        <Music2 size={15} className="text-gold" aria-hidden /> Lyric view
        <span className="font-normal text-muted">· sections, rhymes and syllables</span>
        <ChevronDown size={16} className="ml-auto text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-5 px-4 pb-4">
        {stanzas.map((stanza, si) => {
          const tones = new Map<string, string>();
          for (const l of stanza.lines) if (l.rhymes && !tones.has(l.rhyme)) tones.set(l.rhyme, RHYME_TONES[tones.size % RHYME_TONES.length]);
          return (
            <section key={si} aria-label={stanza.label || `Stanza ${si + 1}`}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <h3 className="eyebrow">{stanza.label || `Stanza ${si + 1}`}</h3>
                {stanza.lines.length > 1 && <span className="font-mono text-[11px] text-muted" title="Rhyme scheme">{schemeOf(stanza)}</span>}
              </div>
              <ol className="space-y-0.5">
                {stanza.lines.map((line, li) => (
                  <li key={li} className="grid grid-cols-[1.5rem_minmax(0,1fr)_2rem] items-baseline gap-2">
                    <span className={`text-center font-mono text-xs ${line.rhymes ? tones.get(line.rhyme) : 'text-muted/60'}`} aria-label={`Rhyme ${line.rhyme}`}>
                      {line.rhyme}
                    </span>
                    <span className="font-serif text-[1.02rem] leading-snug text-ink">{line.text}</span>
                    <span className="text-right font-mono text-xs text-muted" title="Syllables (estimate)">{line.syllables}</span>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
        <p className="text-xs text-muted">Rhymes and syllables are estimates from the spelling. Mark sections with a line like [Chorus] or Verse 2:.</p>
      </div>
    </details>
  );
}
