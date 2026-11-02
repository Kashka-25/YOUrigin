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
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
  id: string;
  onBlur?: () => void;
  inputRef?: (el: HTMLTextAreaElement | null) => void;
}) {
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  useAutoGrow(el, value, 300);
  const ref = useCallback(
    (x: HTMLTextAreaElement | null) => {
      setEl(x);
      inputRef?.(x);
    },
    [inputRef],
  );
  return <textarea id={id} ref={ref} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} className={className} spellCheck />;
}
