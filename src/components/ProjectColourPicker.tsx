import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import type { ProjectColour } from '../domain/types';
import { DEFAULT_PROJECT_COLOUR, PROJECT_COLOURS } from '../domain/constants';

export function projectColourStyle(colour?: ProjectColour): CSSProperties {
  const hex = PROJECT_COLOURS.find((option) => option.value === colour)?.hex
    ?? PROJECT_COLOURS.find((option) => option.value === DEFAULT_PROJECT_COLOUR)!.hex;
  return { '--project-colour': hex } as CSSProperties;
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
            style={{ backgroundColor: option.hex }}
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
