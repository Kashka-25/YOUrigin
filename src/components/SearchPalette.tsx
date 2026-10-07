import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, FileText, FolderOpen, Hash, Search } from 'lucide-react';
import { Modal } from './Modal';
import { useLibrary } from '../hooks/useLibrary';
import { EMPTY_FILTERS, filterItems } from '../domain/query';
import { bodyAfterTitle, displayTitle, excerpt, normaliseTagName } from '../domain/text';
import { StatusBadge } from './ui';

interface Result {
  key: string;
  kind: 'piece' | 'tag' | 'book' | 'collection' | 'all';
  label: string;
  detail?: string;
  to: string;
  node?: React.ReactNode;
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lib = useLibrary();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    if (!lib || !q.trim()) return [];
    const out: Result[] = [];
    const lower = q.trim().toLowerCase();
    const tagQ = normaliseTagName(lower);
    for (const t of lib.tags.filter((t) => t.name.includes(tagQ)).slice(0, 4)) {
      out.push({ key: 't' + t.id, kind: 'tag', label: '#' + t.name, detail: `${lib.tagCounts.get(t.id) ?? 0} pieces`, to: `/library?tags=${t.id}` });
    }
    for (const b of lib.books.filter((b) => `${b.title} ${b.subtitle}`.toLowerCase().includes(lower)).slice(0, 3)) {
      out.push({ key: 'b' + b.id, kind: 'book', label: b.title, detail: b.subtitle, to: `/books/${b.id}` });
    }
    for (const c of lib.collections.filter((c) => c.name.toLowerCase().includes(lower)).slice(0, 3)) {
      out.push({ key: 'c' + c.id, kind: 'collection', label: c.name, detail: `${c.contentIds.length} pieces`, to: `/collections/${c.id}` });
    }
    const pieces = filterItems(lib.items, { ...EMPTY_FILTERS, query: q }, lib.ctx);
    for (const p of pieces.slice(0, 8)) {
      out.push({
        key: 'p' + p.id,
        kind: 'piece',
        label: displayTitle(p),
        detail: excerpt(bodyAfterTitle(p), 90),
        to: `/item/${p.id}`,
        node: <StatusBadge status={p.status} compact />,
      });
    }
    out.push({ key: 'all', kind: 'all', label: `See all ${pieces.length} matching pieces in the Library`, to: `/library?q=${encodeURIComponent(q)}` });
    return out;
  }, [lib, q]);

  const go = (r: Result) => {
    onClose();
    nav(r.to);
  };

  const icon = (k: Result['kind']) =>
    ({
      piece: <FileText size={16} />,
      tag: <Hash size={16} />,
      book: <BookOpen size={16} />,
      collection: <FolderOpen size={16} />,
      all: <Search size={16} />,
    })[k];

  return (
    <Modal open={open} onClose={onClose} title="Search" wide>
      <input
        ref={inputRef}
        data-autofocus
        className="input py-3 text-base"
        placeholder="Words, #tags, books, collections, types…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault();
            go(results[active]);
          }
        }}
        aria-label="Search everything"
        aria-controls="search-results"
      />
      <ul id="search-results" role="listbox" className="mt-3 space-y-0.5">
        {results.map((r, i) => (
          <li key={r.key} role="option" aria-selected={i === active}>
            <button
              type="button"
              onClick={() => go(r)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left ${i === active ? 'bg-paper-2' : ''}`}
            >
              <span className="mt-0.5 text-muted">{icon(r.kind)}</span>
              <span className="min-w-0 flex-1">
                <span className={`flex items-center gap-2 ${r.kind === 'piece' ? 'font-serif text-base' : 'text-sm font-medium'}`}>
                  {r.node}
                  <span className="truncate">{r.label}</span>
                </span>
                {r.detail && <span className="block truncate text-xs text-muted">{r.detail}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!q && <p className="mt-4 text-sm text-muted">Tip: combine words and tags, e.g. <code>#water shore</code>.</p>}
    </Modal>
  );
}
