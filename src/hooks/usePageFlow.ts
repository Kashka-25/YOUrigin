import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * How a book is read and written on this device: one piece per page, turned
 * sideways like a book ('pages', the default), or one long scroll ('scroll').
 * Kept on the device only, like a reading lamp, not synced.
 */
export type PageFlow = 'pages' | 'scroll';

export const PAGE_FLOW_KEY = 'yourigin.book.flow';
const CHANGED = 'yourigin:pageflow';

export function readPageFlow(): PageFlow {
  try {
    return localStorage.getItem(PAGE_FLOW_KEY) === 'scroll' ? 'scroll' : 'pages';
  } catch {
    return 'pages';
  }
}

export function usePageFlow(): [PageFlow, (f: PageFlow) => void] {
  const [flow, setFlowState] = useState<PageFlow>(readPageFlow);
  useEffect(() => {
    const sync = () => setFlowState(readPageFlow());
    window.addEventListener(CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const setFlow = useCallback((f: PageFlow) => {
    try {
      localStorage.setItem(PAGE_FLOW_KEY, f);
    } catch {
      /* private mode: still changes for now */
    }
    setFlowState(f);
    window.dispatchEvent(new Event(CHANGED));
  }, []);
  return [flow, setFlow];
}

/** True when keys pressed here are someone typing, so they must never turn a page. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(el.type);
  return false;
}

/**
 * A finger stroke that means "turn the page": mostly sideways, long enough and quick.
 * Returns 'next' for a swipe to the left, 'prev' for a swipe to the right.
 */
export function swipeTurn(dx: number, dy: number, ms: number): 'next' | 'prev' | null {
  if (ms > 700) return null;
  if (Math.abs(dx) < 60) return null;
  if (Math.abs(dx) < Math.abs(dy) * 2) return null;
  return dx < 0 ? 'next' : 'prev';
}

/** Arrow keys that turn the page, ignoring anything typed into a field. */
export function keyTurn(e: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'target'>): 'next' | 'prev' | null {
  if (e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const dir = e.key === 'ArrowRight' ? 'next' : e.key === 'ArrowLeft' ? 'prev' : null;
  if (!dir) return null;
  // Alt + arrow always turns; a plain arrow only when no field has the cursor.
  if (!e.altKey && isTypingTarget(e.target)) return null;
  return dir;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Touch handlers that turn the page on a sideways swipe. A swipe that starts in a
 * field someone is typing in, or that selects text, is left alone.
 */
export function useSwipe(onTurn: (dir: 'next' | 'prev') => void, enabled = true) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (!enabled || e.touches.length !== 1) return (start.current = null);
    const t = e.target as HTMLElement;
    if (isTypingTarget(t) && document.activeElement === t) return (start.current = null);
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || !enabled) return;
    if (window.getSelection()?.toString()) return;
    const p = e.changedTouches[0];
    const dir = swipeTurn(p.clientX - s.x, p.clientY - s.y, Date.now() - s.t);
    if (dir) onTurn(dir);
  };
  return enabled ? { onTouchStart, onTouchEnd } : {};
}
