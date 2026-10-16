import { useEffect, useState } from 'react';

/**
 * Focus mode for editing: the app's top and bottom bars (and the sidebar)
 * disappear so only the writing is left. Anything marked with the `chrome`
 * class is hidden while it's on (see index.css). Escape turns it off, and it
 * always switches off when the editor closes.
 */
export function useFocusMode() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (on) root.dataset.focus = '1';
    else delete root.dataset.focus;
    if (!on) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOn(false);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      delete root.dataset.focus;
    };
  }, [on]);

  return [on, setOn] as const;
}
