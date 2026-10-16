import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ImagePlus, Lightbulb, Plus, Unlink, X } from 'lucide-react';
import { db } from '../../db/db';
import { createContent, updateContent } from '../../db/content';
import { linkContent, unlink } from '../../db/collections';
import { IMAGE_ACCEPT, removeAssetIfUnused, saveImage } from '../../db/assets';
import { useLibrary } from '../../hooks/useLibrary';
import { displayTitle } from '../../domain/text';
import type { ArtDetails, ContentItem } from '../../domain/types';
import { AssetImage } from '../AssetImage';
import { useToast } from '../Toast';
import { ArtViewer, type ViewerSlide } from './ArtViewer';

/** Side panel for an artwork: details, inspiration, the ideas behind it, and its process. */
export function ArtPanel({ item }: { item: ContentItem }) {
  return (
    <>
      <Details item={item} />
      <Ideas item={item} />
      <Process item={item} />
    </>
  );
}

function Details({ item }: { item: ContentItem }) {
  const save = (patch: Partial<ArtDetails>) => void updateContent(item.id, { art: { ...item.art, ...patch } });
  const field = (key: keyof ArtDetails, label: string, placeholder: string) => (
    <div>
      <label className="text-xs text-muted" htmlFor={`art-${key}`}>
        {label}
      </label>
      <input
        id={`art-${key}`}
        key={item.art?.[key] ?? ''}
        defaultValue={item.art?.[key] ?? ''}
        placeholder={placeholder}
        className="input py-1.5 text-sm"
        onBlur={(e) => e.target.value.trim() !== (item.art?.[key] ?? '') && save({ [key]: e.target.value.trim() })}
      />
    </div>
  );
  return (
    <section>
      <h2 className="label">Artwork</h2>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">{field('medium', 'Medium', 'Watercolour on paper')}</div>
        {field('size', 'Size', '30 × 40 cm')}
        {field('madeOn', 'Made', '2026')}
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4"
          checked={!!item.inspiration}
          onChange={(e) => void updateContent(item.id, { inspiration: e.target.checked })}
        />
        <span>
          Inspiration
          <span className="block text-xs text-muted">Someone else’s work you keep for reference. Shown apart from your own art.</span>
        </span>
      </label>
    </section>
  );
}

function Ideas({ item }: { item: ContentItem }) {
  const lib = useLibrary();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const links = useLiveQuery(() => db.relationships.where('fromId').equals(item.id).filter((r) => r.kind === 'idea').toArray(), [item.id]);
  if (!lib) return null;
  const linked = (links ?? []).map((l) => ({ link: l, note: lib.contentById.get(l.toId) })).filter((x) => x.note && !x.note.deletedAt);
  const linkedIds = new Set(linked.map((x) => x.note!.id));
  const query = q.trim().toLowerCase();
  const matches = query
    ? lib.items
        .filter((i) => !i.deletedAt && i.type !== 'image' && !linkedIds.has(i.id) && (displayTitle(i).toLowerCase().includes(query) || i.body.toLowerCase().includes(query)))
        .slice(0, 5)
    : [];

  const writeIdea = async () => {
    const id = await createContent({ title: `Behind “${displayTitle(item)}”`, body: '', type: 'idea', status: 'seed', source: { kind: 'capture' } });
    await linkContent(item.id, id, 'idea');
    nav(`/item/${id}`);
  };

  return (
    <section>
      <h2 className="label">Ideas behind it</h2>
      {linked.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {linked.map(({ link, note }) => (
            <li key={link.id} className="flex items-start gap-2 text-sm">
              <Lightbulb size={14} className="mt-1 shrink-0 text-accent" aria-hidden />
              <Link to={`/item/${note!.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate font-serif text-base">{displayTitle(note!)}</span>
                {note!.body && <span className="line-clamp-2 text-xs text-muted">{note!.body}</span>}
              </Link>
              <button type="button" className="btn-ghost p-1" aria-label="Unlink this idea" onClick={() => void unlink(link.id)}>
                <Unlink size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn text-xs" onClick={() => void writeIdea()}>
        <Plus size={14} /> Write the idea
      </button>
      <div className="relative mt-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Link a note or poem…" className="input py-1.5 text-sm" aria-label="Find a note to link" />
        {matches.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-line bg-card shadow-lg">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-paper-2"
                  onClick={() => {
                    void linkContent(item.id, m.id, 'idea');
                    setQ('');
                  }}
                >
                  {displayTitle(m)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Process({ item }: { item: ContentItem }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const stages = item.processAssetIds ?? [];
  const slides: ViewerSlide[] = [
    ...stages.map((assetId, i) => ({ assetId, title: displayTitle(item), caption: `Stage ${i + 1}` })),
    ...(item.assetId ? [{ assetId: item.assetId, title: displayTitle(item), caption: 'Finished' }] : []),
  ];

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const ids: string[] = [];
      for (const f of files) ids.push((await saveImage(f)).asset.id);
      await updateContent(item.id, { processAssetIds: [...stages, ...ids] });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not add that image');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (assetId: string) => {
    await updateContent(item.id, { processAssetIds: stages.filter((a) => a !== assetId) });
    await removeAssetIfUnused(assetId);
  };

  return (
    <section>
      <h2 className="label">Process</h2>
      {slides.length > 1 && (
        <ol className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {slides.map((s, i) => (
            <li key={s.assetId + i} className="relative shrink-0">
              <button type="button" onClick={() => setOpen(i)} className="block" aria-label={`View ${s.caption}`}>
                <AssetImage id={s.assetId} className="h-16 w-16 rounded-lg border border-line object-cover" />
                <span className="mt-0.5 block text-center text-[11px] text-muted">{s.caption}</span>
              </button>
              {i < stages.length && (
                <button
                  type="button"
                  onClick={() => void remove(s.assetId)}
                  className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-card text-muted hover:text-ink"
                  aria-label={`Remove ${s.caption}`}
                >
                  <X size={11} />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="btn text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
        <ImagePlus size={14} /> {busy ? 'Adding…' : 'Add a progress shot'}
      </button>
      <p className="mt-1 text-xs text-muted">Sketches and stages, oldest first. The main picture stays the finished work.</p>
      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = '';
        }}
      />
      {open !== null && <ArtViewer slides={slides} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </section>
  );
}
