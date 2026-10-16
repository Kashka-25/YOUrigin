import { useEffect } from 'react';

/**
 * Grows a textarea to fit its text. Measuring means briefly setting the
 * height to 'auto', which shrinks the page for a moment; on long pieces the
 * browser then clamps the scroll position and the page jumps away from where
 * you're typing. Putting the scroll position back keeps the writing still.
 */
export function useAutoGrow(el: HTMLTextAreaElement | null, value: string, min: number) {
  useEffect(() => {
    if (!el) return;
    const y = window.scrollY;
    el.style.height = 'auto';
    el.style.height = Math.max(el.scrollHeight, min) + 'px';
    if (window.scrollY !== y) window.scrollTo({ top: y, behavior: 'instant' });
  }, [el, value, min]);
}
