import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

/**
 * Debounced autosave with an explicit state for the UI. Pending changes are
 * flushed on unmount, when the tab is hidden (phone app-switch) and before
 * the page unloads, so nothing typed is lost.
 */
export function useAutosave<T>(save: (value: T) => Promise<void>, delay = 700) {
  const [state, setState] = useState<SaveState>('saved');
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setState('saving');
    try {
      await saveRef.current(p.value);
      setState(pending.current ? 'unsaved' : 'saved');
    } catch (e) {
      console.error(e);
      pending.current = pending.current ?? p;
      setState('error');
    }
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      setState('unsaved');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        void flush();
        e.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      void flush();
    };
  }, [flush]);

  return { state, schedule, flush };
}
