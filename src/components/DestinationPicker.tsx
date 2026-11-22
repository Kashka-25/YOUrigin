import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderKanban, FolderOpen, FolderPlus, Plus, X } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { destinationKey, type Destination } from '../db/destinations';
import { projectColourStyle } from './ProjectColourPicker';
import { pathLabel } from '../domain/creations';
import { freeArea, placeMenu, type MenuPlacement } from './placeMenu';

const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

/**
 * "Add to…" for a note being captured: any Creation (shown with its full path, e.g.
 * Lyrics & Music › Songs › Ideas) or collection, or a new one named right here. Chosen places show as chips; new ones are made when the note is captured.
 */
export function DestinationPicker({ value, onChange }: { value: Destination[]; onChange: (next: Destination[]) => void }) {
  const lib = useLibrary();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [place, setPlace] = useState<MenuPlacement | null>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus({ preventScroll: true });
    // The menu lives in a portal, so a tap in it is outside `box` in the DOM.
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // The capture card hides its overflow, so the menu is drawn over the page and kept
  // in the free part of the screen: above the bottom nav and the phone keyboard.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => trigger.current && setPlace(placeMenu(trigger.current.getBoundingClientRect(), freeArea()));
    update();
    const vv = window.visualViewport;
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    };
  }, [open, value.length]);

  const chosen = useMemo(() => new Set(value.map(destinationKey)), [value]);
  const needle = norm(q);
  const projects = useMemo(
    () =>
      (lib?.projects ?? [])
        .filter((p) => !chosen.has(`project:${p.id}`) && (!needle || norm(pathLabel(lib?.projects ?? [], p.id)).includes(needle)))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8),
    [lib, chosen, needle],
  );
  const collections = useMemo(
    () =>
      (lib?.collections ?? [])
        .filter((c) => !chosen.has(`collection:${c.id}`) && (!needle || norm(c.name).includes(needle)))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 6),
    [lib, chosen, needle],
  );
  const exactProject = (lib?.projects ?? []).some((p) => norm(p.title) === needle) || value.some((d) => d.kind === 'project' && norm(d.name) === needle);
  const exactCollection = (lib?.collections ?? []).some((c) => norm(c.name) === needle) || value.some((d) => d.kind === 'collection' && norm(d.name) === needle);
  const name = q.trim().replace(/\s+/g, ' ');

  const add = (d: Destination) => {
    onChange([...value, d]);
    setQ('');
    setOpen(false);
  };
  const project = (id: string) => lib?.projects.find((p) => p.id === id);

  return (
    <div ref={box} className="relative mt-2 flex flex-wrap items-center gap-1.5">
      {value.map((d) => {
        const p = d.kind === 'project' && d.id ? project(d.id) : undefined;
        return (
          <span key={destinationKey(d)} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-1 text-xs text-ink-2">
            {d.kind === 'project' ? (
              p ? <span className="project-colour-dot h-2 w-2 shrink-0" style={projectColourStyle(p.colour)} aria-hidden /> : <FolderKanban size={12} aria-hidden />
            ) : (
              <FolderOpen size={12} aria-hidden />
            )}
            <span className="truncate">
              {p ? pathLabel(lib?.projects ?? [], p.id) : d.name}
              {!d.id && <span className="text-muted"> · new {d.kind === 'project' ? 'creation' : 'collection'}</span>}
            </span>
            <button type="button" aria-label={`Don’t add to ${d.name}`} onClick={() => onChange(value.filter((x) => destinationKey(x) !== destinationKey(d)))} className="rounded-full hover:text-ink">
              <X size={12} />
            </button>
          </span>
        );
      })}
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-ink-2 hover:border-gold/50 hover:text-ink"
      >
        <FolderPlus size={12} aria-hidden /> Add to…
      </button>

      {open &&
        createPortal(
          <div
            ref={panel}
            className="fixed z-40 flex flex-col rounded-2xl border border-line bg-card p-2 text-ink shadow-xl"
            style={
              place
                ? { top: place.top, left: place.left, width: place.width, maxHeight: place.maxHeight, transform: place.up ? 'translateY(-100%)' : undefined }
                : { visibility: 'hidden', top: 0, left: 0 }
            }
            data-placement={place?.up ? 'above' : 'below'}
            role="dialog"
            aria-label="Add this note to a creation or collection"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setOpen(false);
              }
            }}
          >
            <input
              ref={input}
              className="input w-full shrink-0 text-sm"
              placeholder="Find, or name a new one…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const first = projects[0] ?? null;
                if (first) add({ kind: 'project', id: first.id, name: first.title });
                else if (collections[0]) add({ kind: 'collection', id: collections[0].id, name: collections[0].name });
                else if (name) add({ kind: 'project', name });
              }}
              aria-label="Find or name a creation or collection"
            />
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {projects.length > 0 && (
                <>
                  <p className="px-2 pt-1 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Creations</p>
                  {projects.map((p) => (
                    <button key={p.id} type="button" onClick={() => add({ kind: 'project', id: p.id, name: p.title })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-paper-2">
                      <span className="project-colour-dot h-2.5 w-2.5 shrink-0" style={projectColourStyle(p.colour)} aria-hidden />
                      <span className="truncate">{pathLabel(lib?.projects ?? [], p.id)}</span>
                    </button>
                  ))}
                </>
              )}
              {collections.length > 0 && (
                <>
                  <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Collections</p>
                  {collections.map((c) => (
                    <button key={c.id} type="button" onClick={() => add({ kind: 'collection', id: c.id, name: c.name })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-paper-2">
                      <FolderOpen size={14} className="shrink-0 text-muted" aria-hidden />
                      <span className="truncate">{c.name}</span>
                    </button>
                  ))}
                </>
              )}
              {!projects.length && !collections.length && !name && <p className="px-2 py-3 text-sm text-muted">Type a name to start a new creation or collection.</p>}
              {name && (!exactProject || !exactCollection) && (
                <div className="mt-1 border-t border-line pt-1">
                  {!exactProject && (
                    <button type="button" onClick={() => add({ kind: 'project', name })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-paper-2">
                      <Plus size={14} className="shrink-0 text-gold" aria-hidden /> <span className="truncate">New creation “{name}”</span>
                    </button>
                  )}
                  {!exactCollection && (
                    <button type="button" onClick={() => add({ kind: 'collection', name })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-paper-2">
                      <Plus size={14} className="shrink-0 text-gold" aria-hidden /> <span className="truncate">New collection “{name}”</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
