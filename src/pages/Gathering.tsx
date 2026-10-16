import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FolderPlus, Upload, X } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { setSetting, useSettings } from '../db/settings';
import { parseCapture, splitPieces, type SplitMode } from '../domain/text';
import type { ContentType, Status } from '../domain/types';
import { StatusPicker, TypeSelect, TagChip } from '../components/ui';
import { createMany, purgeContent } from '../db/content';
import { addToCollection } from '../db/collections';
import { TagInput } from '../components/TagInput';
import { ItemCard } from '../components/ItemCard';
import { BulkBar } from '../components/BulkBar';
import { useAutoGrow } from '../hooks/useAutoGrow';
import { db, requestPersistentStorage } from '../db/db';
import { useToast } from '../components/Toast';
import { PendingSuggestions, suggestFor } from '../components/Suggestions';
import { ImportDialog } from '../components/ImportDialog';

export function Gathering() {
  const lib = useLibrary();
  const settings = useSettings();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [area, setArea] = useState<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [heading, setHeading] = useState('');
  const [extraTags, setExtraTags] = useState<string[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  useAutoGrow(area, value, 220);

  const pieces = useMemo(() => splitPieces(value, split).map(parseCapture), [value, split]);
  const detectedTags = useMemo(() => [...new Set(pieces.flatMap((p) => p.tags))].filter((t) => !extraTags.includes(t)), [pieces, extraTags]);
  const canCapture = pieces.some((p) => p.body.trim());
  // A heading belongs to one piece; when splitting, each piece keeps its first line as its title.
  const useHeading = split === 'none';

  const capture = async () => {
    if (!canCapture) return;
    const draft = value;
    const ids = await createMany(
      pieces
        .filter((p) => p.body.trim())
        .map((p) => ({
          body: p.body,
          title: useHeading ? heading.trim() : undefined,
          type: effType,
          status: effStatus,
          tagNames: [...new Set([...p.tags, ...extraTags])],
          source: { kind: 'capture' as const },
        })),
    );
    for (const c of collectionIds) await addToCollection(c, ids);
    setText('');
    setHeading('');
    setExtraTags([]);
    setCollectionIds([]);
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

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          void capture();
        }}
      >
        <div className="panel px-5 py-4 transition-colors focus-within:border-accent/60 md:px-7 md:py-6">
          {useHeading && (
            <>
              <label htmlFor="capture-heading" className="sr-only">
                Heading
              </label>
              <input
                id="capture-heading"
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    ref.current?.focus();
                  }
                }}
                placeholder="Heading (optional)"
                className="mb-3 block w-full border-b border-line bg-transparent pb-2 font-serif text-2xl text-ink placeholder:text-muted/60 focus:outline-none focus-visible:outline-none"
              />
            </>
          )}
          <label htmlFor="capture" className="sr-only">
            Capture
          </label>
          <textarea
            id="capture"
            ref={(el) => {
              ref.current = el;
              setArea(el);
            }}
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
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
            {detectedTags.map((t) => (
              <TagChip key={t} name={t} />
            ))}
            <div className="min-w-[10rem] flex-1">
              <TagInput
                value={extraTags}
                onAdd={(n) => setExtraTags((x) => [...x, n])}
                onRemove={(n) => setExtraTags((x) => x.filter((t) => t !== n))}
                placeholder="Add tags…"
              />
            </div>
          </div>
          {lib && lib.collections.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {collectionIds.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2">
                  <FolderPlus size={12} aria-hidden /> {lib.ctx.collectionName.get(id)}
                  <button type="button" aria-label="Remove collection" onClick={() => setCollectionIds((x) => x.filter((c) => c !== id))}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              <select
                aria-label="Add to a collection"
                className="rounded-full border border-line bg-card px-2.5 py-1 text-xs text-ink-2"
                value=""
                onChange={(e) => e.target.value && setCollectionIds((x) => [...new Set([...x, e.target.value])])}
              >
                <option value="">+ Collection</option>
                {lib.collections
                  .filter((c) => !collectionIds.includes(c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
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
          <div className="mt-1">
            {recent.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                onToggle={() =>
                  setSelected((x) => {
                    const next = new Set(x);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  })
                }
                extra={<PendingSuggestions contentId={item.id} />}
              />
            ))}
          </div>
          <BulkBar ids={[...selected].filter((id) => recent.some((r) => r.id === id))} onClear={() => setSelected(new Set())} />
        </section>
      )}

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
