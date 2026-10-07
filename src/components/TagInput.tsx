import { useId, useMemo, useState } from 'react';
import { normaliseTagName } from '../domain/text';
import { TagChip } from './ui';
import { useLibrary } from '../hooks/useLibrary';

/**
 * Tag editor: type a name and press Enter/comma/space. Suggests existing tags
 * (most used first) so the vocabulary stays consistent.
 */
export function TagInput({
  value,
  onAdd,
  onRemove,
  placeholder = 'Add a tag…',
}: {
  value: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  placeholder?: string;
}) {
  const lib = useLibrary();
  const [draft, setDraft] = useState('');
  const [active, setActive] = useState(-1);
  const listId = useId();
  const q = normaliseTagName(draft);

  const options = useMemo(() => {
    if (!lib || !q) return [];
    return lib.tags
      .filter((t) => t.name.includes(q) && !value.includes(t.name))
      .sort((a, b) => (lib.tagCounts.get(b.id) ?? 0) - (lib.tagCounts.get(a.id) ?? 0))
      .slice(0, 6);
  }, [lib, q, value]);

  const commit = (name: string) => {
    const n = normaliseTagName(name);
    if (n && !value.includes(n)) onAdd(n);
    setDraft('');
    setActive(-1);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((name) => (
        <TagChip key={name} name={name} onRemove={() => onRemove(name)} />
      ))}
      <div className="relative min-w-[8rem] flex-1">
        <input
          className="w-full bg-transparent px-1 py-1 text-sm text-ink placeholder:text-muted focus:outline-none"
          value={draft}
          placeholder={placeholder}
          aria-label="Add tag"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(e) => {
            setDraft(e.target.value);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || (e.key === ' ' && draft.trim())) {
              e.preventDefault();
              commit(e.key === 'Enter' && options[active] ? options[active].name : draft);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, options.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onRemove(value[value.length - 1]);
            }
          }}
          onBlur={() => draft.trim() && commit(draft)}
        />
        {options.length > 0 && (
          <ul id={listId} role="listbox" className="absolute top-full left-0 z-20 mt-1 w-56 rounded-xl border border-line bg-card p-1 shadow-lg">
            {options.map((t, i) => (
              <li key={t.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={`flex w-full justify-between rounded-lg px-2 py-1.5 text-left text-sm ${i === active ? 'bg-paper-2' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(t.name);
                  }}
                >
                  <span>#{t.name}</span>
                  <span className="text-muted">{lib?.tagCounts.get(t.id) ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
