import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { setSetting, useSettings } from '../db/settings';
import { parseCapture, splitPieces, displayTitle, type SplitMode } from '../domain/text';
import type { ContentType, Status } from '../domain/types';
import { StatusPicker, TypeSelect, TagChip } from '../components/ui';
import { createMany, purgeContent, updateContent } from '../db/content';
import { db, requestPersistentStorage } from '../db/db';
import { useToast } from '../components/Toast';
import { PendingSuggestions, suggestFor } from '../components/Suggestions';
import { ImportDialog } from '../components/ImportDialog';

export function Gathering() {
  const lib = useLibrary();
  const settings = useSettings();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [type, setType] = useState<ContentType | null>(null);
  const [split, setSplit] = useState<SplitMode>('none');
  const [importOpen, setImportOpen] = useState(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore the unsent draft once settings load (survives refresh / app switch).
  const value = text ?? settings?.captureDraft ?? '';
  const effStatus = status ?? settings?.defaultStatus ?? 'seed';
  const effType = type ?? settings?.defaultType ?? 'fragment';

  const change = (v: string) => {
    setText(v);
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => void setSetting('captureDraft', v), 400);
  };

  useEffect(() => {
    if (params.get('focus')) {
      ref.current?.focus();
      params.delete('focus');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  // Auto-grow the writing area.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, 220) + 'px';
  }, [value]);

  const pieces = useMemo(() => splitPieces(value, split).map(parseCapture), [value, split]);
  const detectedTags = useMemo(() => [...new Set(pieces.flatMap((p) => p.tags))], [pieces]);
  const canCapture = pieces.some((p) => p.body.trim());

  const capture = async () => {
    if (!canCapture) return;
    const draft = value;
    const ids = await createMany(
      pieces
        .filter((p) => p.body.trim())
        .map((p) => ({ body: p.body, type: effType, status: effStatus, tagNames: p.tags, source: { kind: 'capture' as const } })),
    );
    setText('');
    void setSetting('captureDraft', '');
    void requestPersistentStorage();
    ref.current?.focus();
    toast(ids.length > 1 ? `Captured ${ids.length} pieces` : 'Captured', {
      undo: async () => {
        await purgeContent(ids);
        setText(draft);
        void setSetting('captureDraft', draft);
      },
    });
    // Suggestions arrive in the background; they never change anything by themselves.
    if (lib) {
      for (const id of ids) {
        const item = await db.content.get(id);
        if (item) void suggestFor(item, lib.ai, settings);
      }
    }
  };

  const recent = useMemo(
    () =>
      lib
        ? lib.items
            .filter((i) => !i.deletedAt && !i.archived)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 8)
        : [],
    [lib],
  );

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 md:px-8 md:pt-14">
      <h1 className="font-serif text-3xl leading-tight font-normal text-ink md:text-[2.6rem]">What’s moving through your mind?</h1>
      <p className="mt-2 text-sm text-ink-2">
        Write, paste, brain-dump. Add <span className="font-mono text-xs">#tags</span> on their own line if you like. Nothing else is required.
      </p>

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          void capture();
        }}
      >
        <div className="panel px-5 py-4 transition-colors focus-within:border-accent/60 md:px-7 md:py-6">
          <label htmlFor="capture" className="sr-only">
            Capture
          </label>
          <textarea
            id="capture"
            ref={ref}
            value={value}
            onChange={(e) => change(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                void capture();
              }
            }}
            placeholder={'The ocean doesn’t ask the shore for permission to leave.\n\n#water #surrender'}
            className="writing block w-full resize-none bg-transparent text-[1.2rem] leading-[1.75] text-ink placeholder:text-muted/70 focus:outline-none focus-visible:outline-none md:text-[1.3rem]"
            spellCheck
          />
          {detectedTags.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3" aria-label="Detected tags">
              {detectedTags.map((t) => (
                <TagChip key={t} name={t} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <StatusPicker value={effStatus} onChange={setStatus} />
          <TypeSelect value={effType} onChange={setType} />
          <select
            aria-label="Split into several pieces"
            value={split}
            onChange={(e) => setSplit(e.target.value as SplitMode)}
            className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink-2"
          >
            <option value="none">One piece</option>
            <option value="separator">Split on --- / ***</option>
            <option value="blank-lines">Split on blank lines</option>
          </select>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted sm:inline">Ctrl + Enter</span>
            <button type="submit" className="btn-primary px-6 py-2.5 text-base" disabled={!canCapture}>
              Capture{pieces.length > 1 ? ` ${pieces.length}` : ''}
            </button>
          </div>
        </div>
      </form>

      <div className="mt-6 flex justify-end">
        <button type="button" className="btn-ghost" onClick={() => setImportOpen(true)}>
          <Upload size={15} /> Import files
        </button>
      </div>

      {recent.length > 0 && (
        <section className="mt-8" aria-labelledby="recent-h">
          <div className="flex items-baseline justify-between">
            <h2 id="recent-h" className="eyebrow">
              Just gathered
            </h2>
            <Link to="/library" className="text-sm text-ink-2 hover:text-ink">
              Library →
            </Link>
          </div>
          <ul className="mt-2 divide-y divide-line">
            {recent.map((item) => (
              <li key={item.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link to={`/item/${item.id}`} className="min-w-0 flex-1 font-serif text-lg leading-snug hover:underline">
                    {displayTitle(item)}
                  </Link>
                  <StatusPicker
                    value={item.status}
                    size="sm"
                    label={`Status of ${displayTitle(item)}`}
                    onChange={(s) => void updateContent(item.id, { status: s })}
                  />
                </div>
                {item.tagIds.length > 0 && (
                  <p className="mt-1 text-xs text-muted">{item.tagIds.map((t) => '#' + lib?.ctx.tagName.get(t)).join(' ')}</p>
                )}
                <PendingSuggestions contentId={item.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
