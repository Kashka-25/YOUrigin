import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, X } from 'lucide-react';
import { lookUp, wordsDb, type Lookup } from '../words/store';
import type { Ending } from '../words/morph';

const POS: Record<string, string> = { n: 'noun', v: 'verb', a: 'adj', r: 'adv' };
const FEW_SENSES = 6;
const FEW_MORE = 30;

/** Definitions and synonyms for a word; tapping a synonym swaps it in. */
export function WordPanel({ query, onSwap, onClose }: { query: string; onSwap: (word: string, ending: Ending) => void; onClose: () => void }) {
  const [q, setQ] = useState(query);
  const [asked, setAsked] = useState(query);
  const [result, setResult] = useState<{ for: string; packs: number; found: Lookup[] } | null>(null);
  const packs = useLiveQuery(() => wordsDb.packs.count(), []);

  useEffect(() => {
    let live = true;
    if (asked.trim() && packs) void lookUp(asked).then((found) => live && setResult({ for: asked, packs, found }));
    return () => {
      live = false;
    };
  }, [asked, packs]);
  const found = !asked.trim() ? [] : result && result.for === asked && result.packs === packs ? result.found : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label="Dictionary"
      className="no-print fixed inset-x-0 bottom-0 z-50 flex max-h-[55dvh] flex-col rounded-t-2xl border border-line bg-card pb-[env(safe-area-inset-bottom)] shadow-xl md:inset-x-auto md:right-4 md:bottom-4 md:max-h-[70dvh] md:w-[26rem] md:rounded-2xl"
    >
      <form
        className="flex items-center gap-2 border-b border-line p-2"
        onSubmit={(e) => {
          e.preventDefault();
          setAsked(q);
        }}
      >
        <Search size={16} className="ml-2 shrink-0 text-muted" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-w-0 flex-1 bg-transparent py-1.5 font-serif text-lg text-ink focus:outline-none"
          aria-label="Word"
          enterKeyHint="search"
          autoCapitalize="none"
        />
        <button type="button" className="btn-ghost p-2" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </form>
      <div className="overflow-y-auto px-4 py-3">
        {packs === 0 ? (
          <p className="text-sm text-ink-2">
            No dictionary on this device yet.{' '}
            <Link to="/settings" className="text-accent underline underline-offset-2">
              Download one in Settings
            </Link>
            .
          </p>
        ) : found === null || packs === undefined ? (
          <p className="text-sm text-muted">…</p>
        ) : found.length === 0 ? (
          <p className="text-sm text-muted">{asked.trim() ? `No entry for “${asked.trim()}”.` : 'Select or tap a word.'}</p>
        ) : (
          found.map((g) => <Group key={g.word} g={g} heading={found.length > 1 || g.word !== asked.trim().toLowerCase()} onSwap={onSwap} />)
        )}
      </div>
    </div>
  );
}

function Group({ g, heading, onSwap }: { g: Lookup; heading: boolean; onSwap: (word: string, ending: Ending) => void }) {
  const [allSenses, setAllSenses] = useState(false);
  const [allMore, setAllMore] = useState(false);
  const senses = allSenses ? g.senses : g.senses.slice(0, FEW_SENSES);
  const more = allMore ? g.more : g.more.slice(0, FEW_MORE);
  const chip = (w: string) => (
    <button
      key={w}
      type="button"
      className="rounded-full border border-line px-2.5 py-0.5 text-sm text-ink hover:border-accent hover:bg-paper-2"
      onClick={() => onSwap(w, g.ending)}
    >
      {w}
    </button>
  );
  return (
    <section className="mb-4 last:mb-1">
      {heading && <h3 className="mb-2 font-serif text-xl">{g.word}</h3>}
      <ol className="space-y-3">
        {senses.map((s, i) => (
          <li key={i} className="text-sm leading-relaxed">
            <span className="mr-1.5 text-xs text-muted">{POS[s.pos] ?? s.pos}</span>
            <span className="text-ink">{s.def}</span>
            {s.ex && <span className="block text-ink-2 italic">“{s.ex}”</span>}
            {s.syn.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{s.syn.map(chip)}</div>}
          </li>
        ))}
      </ol>
      {g.senses.length > FEW_SENSES && !allSenses && (
        <button type="button" className="btn-ghost -ml-3 mt-1 text-xs" onClick={() => setAllSenses(true)}>
          {g.senses.length - FEW_SENSES} more meanings
        </button>
      )}
      {g.more.length > 0 && (
        <>
          <h4 className="label mt-4">More synonyms</h4>
          <div className="flex flex-wrap gap-1.5">{more.map(chip)}</div>
          {g.more.length > FEW_MORE && !allMore && (
            <button type="button" className="btn-ghost -ml-3 mt-1 text-xs" onClick={() => setAllMore(true)}>
              Show all {g.more.length}
            </button>
          )}
        </>
      )}
    </section>
  );
}
