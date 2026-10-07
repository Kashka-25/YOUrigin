import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLibrary } from '../hooks/useLibrary';
import { useSettings } from '../db/settings';
import { providerFor, type Placement, type RefineIntent } from '../ai';
import type { ContentItem } from '../domain/types';
import { suggestFor } from './Suggestions';
import { addToBook } from '../db/books';
import { saveVariant, snapshotRevision, updateContent } from '../db/content';
import { useToast } from './Toast';
import { useConfirm } from './Modal';

type Mode = 'develop' | 'placement' | 'refine' | null;

/**
 * The creative assistant. Everything it produces is shown as a suggestion,
 * clearly marked, and applied only when the writer chooses to.
 */
export function AssistantPanel({ item }: { item: ContentItem }) {
  const lib = useLibrary();
  const settings = useSettings();
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();
  const provider = providerFor(settings);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [intent, setIntent] = useState<RefineIntent>('tighten');
  const [draft, setDraft] = useState<{ text: string; notes: string[] } | null>(null);

  if (!lib) return null;

  const run = async (m: Mode, fn: () => Promise<void>) => {
    setMode(m);
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl bg-ai-bg/60 p-4">
      <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ai uppercase">
        <Sparkles size={13} aria-hidden /> Assistant
        <span className="ml-auto font-normal normal-case tracking-normal">{provider.label}</span>
      </h2>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" className="btn px-3 py-1 text-xs" onClick={() => run(null, async () => {
          await suggestFor(item, lib.ai, settings);
          toast('Suggestions added — accept the ones you like');
        })}>
          Suggest tags & type
        </button>
        <button type="button" className="btn px-3 py-1 text-xs" onClick={() => run('placement', async () => setPlacements(await provider.suggestBookPlacement(item, lib.ai)))}>
          Where might this belong?
        </button>
        <button type="button" className="btn px-3 py-1 text-xs" onClick={() => run('develop', async () => setQuestions(await provider.suggestDevelopment(item)))}>
          Develop
        </button>
        <button type="button" className="btn px-3 py-1 text-xs" onClick={() => setMode('refine')}>
          Refine
        </button>
      </div>

      {busy && (
        <p className="mt-3 flex items-center gap-2 text-sm text-ai">
          <Loader2 size={14} className="animate-spin" /> Thinking…
        </p>
      )}

      {!busy && mode === 'develop' && (
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          {questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      )}

      {!busy && mode === 'placement' && (
        <div className="mt-3 text-sm">
          {placements.length === 0 ? (
            <p className="text-ink-2">No strong match among your books yet. That’s fine — it can stay unclaimed.</p>
          ) : (
            <ul className="space-y-2">
              {placements.map((p) => {
                const section = lib.sections.find((s) => s.id === p.sectionId);
                return (
                  <li key={p.bookId} className="rounded-xl bg-card px-3 py-2">
                    <p className="font-serif text-base">
                      {lib.ctx.bookTitle.get(p.bookId)}
                      {section ? <span className="text-ink-2"> → {section.title}</span> : null}
                    </p>
                    <p className="text-xs text-muted">{p.reason}</p>
                    <button
                      type="button"
                      className="btn-ghost mt-1 px-2 py-0.5 text-xs"
                      onClick={async () => {
                        const created = await addToBook(p.bookId, [item.id], p.sectionId);
                        toast(created.length ? 'Added to book' : 'Already in that book');
                      }}
                    >
                      Add here
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {mode === 'refine' && (
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex gap-2">
            <select className="input py-1.5" value={intent} onChange={(e) => setIntent(e.target.value as RefineIntent)} aria-label="Refinement">
              <option value="tighten">Tighten</option>
              <option value="imagery">Strengthen imagery</option>
              <option value="ending">Try another ending</option>
              <option value="clarity">Clarify</option>
            </select>
            <button
              type="button"
              className="btn shrink-0 px-3 py-1 text-xs"
              disabled={busy}
              onClick={() => run('refine', async () => setDraft(await provider.refine(item, intent)))}
            >
              Go
            </button>
          </div>
          {!busy && draft && (
            <div className="space-y-2">
              {draft.text && (
                <div className="rounded-xl border border-dashed border-ai bg-card p-3">
                  <p className="mb-2 text-xs font-semibold text-ai">AI-drafted alternative — your original is unchanged</p>
                  <p className="writing text-[15px] leading-relaxed">{draft.text}</p>
                </div>
              )}
              <ul className="list-disc space-y-1 pl-5 text-ink-2">
                {draft.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
              {draft.text && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn px-3 py-1 text-xs"
                    onClick={async () => {
                      const id = await saveVariant(item.id, draft.text, provider.label);
                      toast('Saved as a separate variant, linked to the original');
                      nav(`/item/${id}`);
                    }}
                  >
                    Save as variant
                  </button>
                  <button
                    type="button"
                    className="btn-ghost px-3 py-1 text-xs"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Replace your text?',
                        message: 'Your current wording will be kept in this piece’s History, so you can restore it at any time.',
                        confirmLabel: 'Replace',
                      });
                      if (!ok) return;
                      await snapshotRevision(item.id, true);
                      await updateContent(item.id, { body: draft.text });
                      setDraft(null);
                      toast('Replaced — the original is in History');
                    }}
                  >
                    Replace mine…
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
