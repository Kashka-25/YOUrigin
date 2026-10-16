import type { ProjectKind } from '../domain/types';
import { PROJECT_KINDS, PROJECT_KIND_META } from '../domain/constants';

export function ProjectKindPicker({ value, onChange }: { value: ProjectKind; onChange: (k: ProjectKind) => void }) {
  return (
    <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-1.5">
      {PROJECT_KINDS.map((k) => {
        const active = k === value;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(k)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              active ? 'border-ink bg-ink text-paper' : 'border-line text-ink-2 hover:bg-paper-2'
            }`}
          >
            {PROJECT_KIND_META[k].label}
          </button>
        );
      })}
    </div>
  );
}
