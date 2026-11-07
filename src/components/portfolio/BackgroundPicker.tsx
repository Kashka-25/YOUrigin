import { useId } from 'react';
import { Check } from 'lucide-react';
import { BACKGROUNDS, cleanBackground } from '../../portfolio/model';

/** The page background: the look's own, one of a few warm colours, or any colour. */
export function BackgroundPicker({ value, onChange }: { value?: string | null; onChange: (v: string | null) => void }) {
  const id = useId();
  const current = cleanBackground(value);
  const custom = current && !BACKGROUNDS.some((b) => b.value === current) ? current : null;
  const swatch = (selected: boolean) =>
    `relative grid h-9 w-9 place-items-center rounded-full border transition-shadow ${selected ? 'border-accent shadow-[0_0_0_2px_var(--accent)]' : 'border-line hover:shadow-[0_0_0_2px_var(--line)]'}`;
  return (
    <fieldset>
      <legend className="label">Background</legend>
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Background">
        <button type="button" role="radio" aria-checked={!current} title="The look’s own" aria-label="The look’s own" className={`${swatch(!current)} bg-[linear-gradient(135deg,#fbfaf8_50%,#e4e2dd_50%)]`} onClick={() => onChange(null)}>
          {!current && <Check size={15} className="text-ink" aria-hidden="true" />}
        </button>
        {BACKGROUNDS.map((b) => {
          const on = current === b.value;
          const dark = b.label === 'Forest' || b.label === 'Night';
          return (
            <button key={b.value} type="button" role="radio" aria-checked={on} title={b.label} aria-label={b.label} className={swatch(on)} style={{ background: b.value }} onClick={() => onChange(b.value)}>
              {on && <Check size={15} className={dark ? 'text-white' : 'text-ink'} aria-hidden="true" />}
            </button>
          );
        })}
        <label htmlFor={id} title="Any colour" className={`${swatch(!!custom)} cursor-pointer overflow-hidden`} style={{ background: custom ?? 'conic-gradient(#e9b8a8, #e8d9a0, #b9d4b5, #a9c6dc, #c9b5dc, #e9b8a8)' }}>
          <span className="sr-only">Any colour</span>
          <input id={id} type="color" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={current ?? '#f4ede1'} onChange={(e) => onChange(e.target.value)} />
        </label>
      </div>
    </fieldset>
  );
}
