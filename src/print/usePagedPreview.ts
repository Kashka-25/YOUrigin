import '@fontsource-variable/eb-garamond/index.css';
import '@fontsource-variable/eb-garamond/wght-italic.css';
import '@fontsource-variable/cormorant-garamond/index.css';
import '@fontsource-variable/cormorant-garamond/wght-italic.css';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { registerFillSpace } from './fillSpace';

/**
 * Lays out book HTML into real pages with Paged.js inside `stage`, again whenever
 * the HTML or CSS changes (debounced). Used by Design & print and the writing workspace.
 */
export function usePagedPreview(stage: RefObject<HTMLDivElement | null>, html: string, css: string, delay = 450) {
  const [pages, setPages] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Render only when the generated book actually changes, one layout at a time.
  const wanted = useRef({ html: '', css: '' });
  const rendered = useRef({ html: '', css: '' });
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const renderPages = useCallback(async () => {
    if (running.current) return; // the running layout re-checks for newer work when it finishes
    const job = wanted.current;
    if (!job.html || (job.html === rendered.current.html && job.css === rendered.current.css) || !stage.current) return;
    running.current = true;
    setRendering(true);
    setError(null);
    setProgress(0);
    const added: Element[] = [];
    try {
      const paged = await import('pagedjs');
      registerFillSpace(paged);
      const { Previewer } = paged;
      await document.fonts.ready;
      await Promise.all(
        ["'EB Garamond Variable'", "'Cormorant Garamond Variable'", "'Newsreader Variable'", "'Cinzel Variable'"].map((f) =>
          document.fonts.load(`12px ${f}`).catch(() => undefined),
        ),
      );
      if (!alive.current || !stage.current) return;
      const before = new Set(Array.from(document.head.children));
      // Paged.js measures as it lays out, so the target must be in the document:
      // build the new pages invisibly beside the old ones, then swap.
      const target = document.createElement('div');
      // First layout: show pages as they appear. Later layouts build out of sight, then swap.
      if (stage.current.querySelector('.pagedjs_page')) target.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;';
      stage.current.appendChild(target);
      const previewer = new Previewer();
      let count = 0;
      previewer.on('page', () => setProgress(++count));
      let flow: { total?: number };
      try {
        flow = await previewer.preview(job.html, [{ 'yourigin-book.css': job.css }], target);
      } finally {
        Array.from(document.head.children).forEach((el) => !before.has(el) && added.push(el));
      }
      if (!alive.current || !stage.current) {
        target.remove();
        added.forEach((el) => el.remove());
        return;
      }
      // Swap in the finished pages and drop the previous layout's styles.
      target.style.cssText = '';
      stage.current.replaceChildren(target);
      document.querySelectorAll('style[data-yourigin-print]').forEach((el) => {
        if (!added.includes(el)) el.remove();
      });
      added.forEach((el) => el.setAttribute('data-yourigin-print', ''));
      rendered.current = job;
      setPages(flow.total ?? target.querySelectorAll('.pagedjs_page').length);
    } catch (e) {
      console.error(e);
      added.forEach((el) => el.remove());
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
      rendered.current = job; // don't retry the same failing layout in a loop
    } finally {
      running.current = false;
      if (alive.current) {
        setRendering(false);
        // Newer changes arrived while laying out: do them now.
        if (wanted.current !== job) void renderPages();
      }
    }
  }, [stage]);

  useEffect(() => {
    if (!html) return;
    const timer = setTimeout(() => {
      wanted.current = { html, css };
      void renderPages();
    }, delay);
    return () => clearTimeout(timer);
  }, [html, css, delay, renderPages]);

  // Leaving removes the print styles Paged.js added to the document.
  useEffect(() => () => document.querySelectorAll('style[data-yourigin-print]').forEach((el) => el.remove()), []);

  return { pages, progress, rendering, error };
}
