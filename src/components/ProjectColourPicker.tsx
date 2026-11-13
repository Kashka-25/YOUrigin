import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import type { ProjectColour } from '../domain/types';
import { PROJECT_COLOURS, projectColourOption } from '../domain/constants';

/**
 * Both theme shades plus their readable text colours, as CSS variables. index.css picks the
 * light or dark pair (--project-colour, --project-on) for whichever theme is showing.
 */
export function projectColourStyle(colour?: ProjectColour): CSSProperties {
  const c = projectColourOption(colour);
  return { '--pc-light': c.hex, '--pc-dark': c.dark, '--pc-on-light': c.onLight, '--pc-on-dark': c.onDark } as CSSProperties;
}

export function ProjectColourPicker({
  value,
  onChange,
}: {
  value: ProjectColour;
  onChange: (colour: ProjectColour) => void;
}) {
  const selected = PROJECT_COLOURS.find((option) => option.value === value);

  return (
    <fieldset>
      <legend className="label">Project colour</legend>
      <div className="flex flex-wrap gap-2.5" role="group" aria-label="Project colour">
        {PROJECT_COLOURS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="project-colour-swatch"
            style={projectColourStyle(option.value)}
            aria-label={option.label}
            aria-pressed={value === option.value}
            title={option.label}
            onClick={() => onChange(option.value)}
          >
            {value === option.value && <Check size={15} strokeWidth={2.75} aria-hidden />}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Selected: {selected?.label ?? 'Ochre'}</p>
    </fieldset>
  );
}
