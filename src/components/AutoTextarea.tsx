import { useCallback, useState } from 'react';
import { useAutoGrow } from '../hooks/useAutoGrow';

/** A writing area that grows with its text. */
export function AutoTextarea({
  value,
  onChange,
  className,
  id,
  onBlur,
  inputRef,
  minHeight = 300,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
  id: string;
  onBlur?: () => void;
  inputRef?: (el: HTMLTextAreaElement | null) => void;
  /** Smallest height in pixels; short fields pass less. */
  minHeight?: number;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  useAutoGrow(el, value, minHeight);
  const ref = useCallback(
    (x: HTMLTextAreaElement | null) => {
      setEl(x);
      inputRef?.(x);
    },
    [inputRef],
  );
  return <textarea id={id} ref={ref} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} className={className} placeholder={placeholder} aria-label={ariaLabel} spellCheck />;
}
