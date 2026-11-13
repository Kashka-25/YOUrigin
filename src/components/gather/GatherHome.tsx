import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, FolderOpen, Library } from 'lucide-react';
import type { ContentItem } from '../../domain/types';
import { TYPE_LABEL } from '../../domain/constants';
import { bodyAfterTitle, displayTitle, excerpt } from '../../domain/text';
import { useLibrary } from '../../hooks/useLibrary';
import { projectColourStyle } from '../ProjectColourPicker';
import { AssetImage } from '../AssetImage';
import { PendingSuggestions } from '../Suggestions';

/** Projects and collections, tucked into one dropdown that starts closed. */
export function FoldersMenu() {
  const lib = useLibrary();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of lib?.items ?? []) if (!i.deletedAt && !i.archived) for (const p of i.projectIds ?? []) m.set(p, (m.get(p) ?? 0) + 1);
    return m;
  }, [lib]);
  if (!lib) return null;
  const projects = [...lib.projects].sort((a, b) => b.updatedAt - a.updatedAt);
  const collections = [...lib.collections].sort((a, b) => a.name.localeCompare(b.name));
  if (!projects.length && !collections.length) return null;
  const row = 'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-ink-2 hover:bg-paper-2 hover:text-ink';
  return (
    <details className="group mt-6 rounded-2xl border border-line/70 bg-card/60">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-ink hover:bg-paper-2 [&::-webkit-details-marker]:hidden">
        <FolderOpen size={16} className="text-gold" aria-hidden /> Folders
        <span className="font-normal text-muted">
          · {projects.length} {projects.length === 1 ? 'Project' : 'Projects'}, {collections.length} {collections.length === 1 ? 'collection' : 'collections'}
        </span>
        <ChevronDown size={16} className="ml-auto text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="grid gap-x-4 px-2 pb-3 sm:grid-cols-2">
        <div>
          <p className="eyebrow px-3 pt-1 pb-1">Projects</p>
          {projects.map((p) => (
            <Link key={p.id} to={`/initiative/${p.id}`} className={row}>
              <span className="project-colour-dot h-2.5 w-2.5 shrink-0" style={projectColourStyle(p.colour)} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{p.title}</span>
              <span className="text-xs text-muted tabular-nums">{counts.get(p.id) ?? 0}</span>
            </Link>
          ))}
        </div>
        <div>
          <p className="eyebrow px-3 pt-3 pb-1 sm:pt-1">Collections</p>
          {collections.map((c) => (
            <Link key={c.id} to={`/collections/${c.id}`} className={row}>
              <FolderOpen size={14} className="shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="text-xs text-muted tabular-nums">{c.contentIds.length}</span>
            </Link>
          ))}
          <Link to="/library" className={row}>
            <Library size={14} className="shrink-0 text-muted" aria-hidden />
            <span className="flex-1">All notes</span>
          </Link>
        </div>
      </div>
    </details>
  );
}

/** One recent note as a box: name, a few lines, and when. */
function NoteBox({ item, selected, onToggle }: { item: ContentItem; selected: boolean; onToggle: () => void }) {
  const title = displayTitle(item);
  // An untitled note is just its words, like a notes app: no heading repeating the first line.
  const named = !!item.title.trim();
  const text = item.type === 'image' ? item.body : excerpt(named ? bodyAfterTitle(item) : item.body, named ? 180 : 240);
  return (
    <article className={`relative flex min-w-0 flex-col rounded-2xl border bg-card p-3.5 transition-colors ${selected ? 'border-gold/70 bg-paper-2' : 'border-line hover:border-gold/40'}`}>
      <Link to={`/item/${item.id}`} className="flex min-w-0 flex-1 flex-col after:absolute after:inset-0 after:rounded-2xl after:content-['']">
        {item.type === 'image' && item.assetId && <AssetImage id={item.assetId} alt="" className="mb-2 aspect-[4/3] w-full rounded-xl object-cover" />}
        {named || item.type === 'image' ? (
          <>
            <h3 className="line-clamp-2 pr-6 font-serif text-[1.05rem] leading-snug text-ink">{title}</h3>
            {text && <p className="mt-1.5 line-clamp-4 text-[13px] leading-snug whitespace-pre-line text-ink-2">{text}</p>}
          </>
        ) : (
          <p className="line-clamp-6 pr-6 font-serif text-[0.98rem] leading-snug whitespace-pre-line text-ink">{text}</p>
        )}
        <p className="mt-auto pt-2.5 text-[11px] text-muted">
          {TYPE_LABEL[item.type]} · {new Date(item.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </p>
      </Link>
      <input
        type="checkbox"
        className="absolute top-3 right-3 z-10 h-5 w-5 accent-[var(--accent)] md:h-4 md:w-4"
        checked={selected}
        onChange={onToggle}
        aria-label={`Select “${title}”`}
      />
      <div className="relative z-10">
        <PendingSuggestions contentId={item.id} label={false} />
      </div>
    </article>
  );
}

/** Most recent notes, two side by side, like a notes app. */
export function RecentNoteBoxes({ items, selected, onToggle }: { items: ContentItem[]; selected: Set<string>; onToggle: (id: string) => void }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3">
      {items.map((item) => (
        <NoteBox key={item.id} item={item} selected={selected.has(item.id)} onToggle={() => onToggle(item.id)} />
      ))}
    </div>
  );
}
