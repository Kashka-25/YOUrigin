import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Modal } from '../Modal';
import { useLibrary } from '../../hooks/useLibrary';
import { PROJECT_KIND_META, TYPE_LABEL, projectKind } from '../../domain/constants';
import { displayTitle } from '../../domain/text';
import { canAddPiece, itemFromPiece, itemFromProject, itemFromWork, type PortfolioItem } from '../../portfolio/model';

type Tab = 'project' | 'work' | 'piece';

interface Row {
  id: string;
  title: string;
  hint: string;
  make: () => PortfolioItem;
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'project', label: 'Projects' },
  { key: 'work', label: 'Works' },
  { key: 'piece', label: 'Pieces & artwork' },
];

/** Choose Projects, Works and pieces to show. Choosing never shares anything; it only adds to this draft. */
export function AddItemsDialog({
  open,
  onClose,
  onAdd,
  already,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (items: PortfolioItem[]) => void;
  /** "kind:sourceId" of what's already in the portfolio. */
  already: Set<string>;
}) {
  const lib = useLibrary();
  const [tab, setTab] = useState<Tab>('project');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Map<string, () => PortfolioItem>>(new Map());

  const rows = useMemo<Row[]>(() => {
    if (!lib) return [];
    if (tab === 'project') {
      return lib.projects.map((p) => ({ id: p.id, title: p.title, hint: p.description, make: () => itemFromProject(p) }));
    }
    if (tab === 'work') {
      return lib.books
        .filter((b) => !b.archived)
        .map((b) => ({ id: b.id, title: b.title || 'Untitled', hint: [PROJECT_KIND_META[projectKind(b)].label, b.subtitle].filter(Boolean).join(' · '), make: () => itemFromWork(b) }));
    }
    return lib.items
      .filter((c) => !c.archived && canAddPiece(c))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => ({ id: c.id, title: displayTitle(c), hint: c.type === 'image' ? 'Artwork' : TYPE_LABEL[c.type], make: () => itemFromPiece(c) }));
  }, [lib, tab]);

  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => `${r.title} ${r.hint}`.toLowerCase().includes(needle)) : rows;
  const key = (id: string) => `${tab}:${id}`;

  const toggle = (r: Row) => {
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(key(r.id))) next.delete(key(r.id));
      else next.set(key(r.id), r.make);
      return next;
    });
  };

  const close = () => {
    setPicked(new Map());
    setQ('');
    onClose();
  };

  const add = () => {
    onAdd([...picked.values()].map((make) => make()));
    close();
  };

  return (
    <Modal open={open} onClose={close} title="Add to portfolio" wide>
      <div role="tablist" aria-label="What to add" className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? 'btn-primary' : 'btn'}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <label className="relative mb-3 block">
        <span className="sr-only">Search</span>
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title" data-autofocus />
      </label>
      <ul className="max-h-[45dvh] space-y-1 overflow-y-auto" aria-label={TABS.find((t) => t.key === tab)?.label}>
        {shown.length === 0 && <li className="p-3 text-sm text-muted">Nothing to show here.</li>}
        {shown.map((r) => {
          const inPortfolio = already.has(key(r.id));
          const on = picked.has(key(r.id));
          return (
            <li key={r.id}>
              <button
                type="button"
                disabled={inPortfolio}
                aria-pressed={on}
                onClick={() => toggle(r)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-55 ${on ? 'border-accent bg-accent/10' : 'border-line hover:bg-paper-2'}`}
              >
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? 'border-accent bg-accent text-accent-ink' : 'border-line'}`} aria-hidden="true">
                  {(on || inPortfolio) && <Check size={14} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{r.title}</span>
                  {(r.hint || inPortfolio) && <span className="block truncate text-xs text-muted">{inPortfolio ? 'Already in this portfolio' : r.hint}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">Adding something here only adds it to this private draft. It isn’t shared anywhere, and nothing changes on YOU’s Showcase.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn" onClick={close}>Cancel</button>
        <button type="button" className="btn-primary" disabled={!picked.size} onClick={add}>
          {picked.size ? `Add ${picked.size}` : 'Add'}
        </button>
      </div>
    </Modal>
  );
}
