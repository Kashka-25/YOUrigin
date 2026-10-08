import '@fontsource-variable/eb-garamond/index.css';
import '@fontsource-variable/eb-garamond/wght-italic.css';
import '@fontsource-variable/cormorant-garamond/index.css';
import '@fontsource-variable/cormorant-garamond/wght-italic.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, BookImage, BookOpenText, ClipboardCheck, Loader2, Printer, SlidersHorizontal, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { db } from '../db/db';
import { updateBook } from '../db/books';
import { bookCss, bookHtml } from '../print/render';
import { resolveDesign } from '../print/design';
import { DesignPanel } from '../components/print/DesignPanel';
import { registerFillSpace } from '../print/fillSpace';
import { dataChecks, layoutChecks, measureLayout, type LayoutFindings } from '../print/preflight';
import { PreflightPanel } from '../components/print/PreflightPanel';
import { EmptyState, Spinner } from '../components/ui';
import type { BookDesign } from '../domain/types';

/** Renders the book into real pages with Paged.js and offers print / save as PDF. */
export function PrintLayout() {
  const { id } = useParams();
  const lib = useLibrary();
  const assets = useLiveQuery(() => db.assets.toArray(), []);
  const stage = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.6);
  const [params] = useSearchParams();
  const [panel, setPanel] = useState<'design' | 'check' | null>(() => (params.get('check') ? 'check' : window.innerWidth >= 1024 ? 'design' : null));
  const [findings, setFindings] = useState<LayoutFindings | null>(null);

  const book = lib?.books.find((b) => b.id === id);
  const design = useMemo(() => (book ? resolveDesign(book) : null), [book]);

  const input = useMemo(() => {
    if (!lib || !book || !design || !assets) return null;
    return {
      book,
      design,
      sections: lib.sections.filter((s) => s.bookId === book.id),
      entries: lib.entries.filter((e) => e.bookId === book.id),
      contentById: lib.contentById,
      assets: new Map(assets.map((a) => [a.id, a])),
    };
  }, [lib, book, design, assets]);
  const source = useMemo(() => (input ? { html: `<div class="yb-root">${bookHtml(input)}</div>`, css: bookCss(input.design) } : null), [input]);

  // Render only when the generated book actually changes, one layout at a time.
  const html = source?.html ?? '';
  const css = source?.css ?? '';
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
  }, []);

  useEffect(() => {
    if (!html) return;
    const timer = setTimeout(() => {
      wanted.current = { html, css };
      void renderPages();
    }, 450);
    return () => clearTimeout(timer);
  }, [html, css, renderPages]);

  // Remember the interior page count — the cover designer uses it for the spine width.
  useEffect(() => {
    if (!book || pages === null || rendering || book.design?.pageCount === pages) return;
    void updateBook(book.id, { design: { ...(book.design ?? {}), pageCount: pages } });
  }, [book, pages, rendering]);

  // KDP check: book data now, plus measurements of the finished layout.
  useEffect(() => {
    if (panel !== 'check' || rendering || !stage.current || !assets) return;
    const names = new Map(assets.map((a) => [a.dataUrl, a.name]));
    setFindings(measureLayout(stage.current, (src) => names.get(src) ?? 'image'));
  }, [panel, rendering, pages, assets]);
  const checks = useMemo(() => {
    if (!input || panel !== 'check') return [];
    const data = dataChecks({ ...input, pages: rendering ? (pages ?? input.design.pageCount ?? null) : pages });
    return findings && pages !== null && !rendering ? [...data, ...layoutChecks(findings, pages)] : data;
  }, [input, panel, pages, rendering, findings]);

  // Leaving the page removes the print styles Paged.js added to the document.
  useEffect(() => () => document.querySelectorAll('style[data-yourigin-print]').forEach((el) => el.remove()), []);

  if (!lib || !assets) return <Spinner />;
  if (!book || !design) return <EmptyState title="Book not found" action={<Link to="/books" className="btn">All books</Link>} />;

  const save = (patch: Partial<BookDesign>) => void updateBook(book.id, { design: { ...(book.design ?? {}), ...patch } });

  return (
    <div className="print-layout min-h-dvh bg-paper-2">
      <div className="no-print sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-line bg-card/95 px-3 py-2 backdrop-blur">
        <Link to={`/books/${book.id}`} className="btn-ghost">
          <ArrowLeft size={16} /> Builder
        </Link>
        <Link to={`/books/${book.id}/read`} className="btn-ghost hidden sm:inline-flex">
          <BookOpenText size={16} /> Read
        </Link>
        <p className="min-w-0 flex-1 truncate font-serif text-lg">{book.title}</p>
        <span className="hidden text-xs text-muted sm:inline">
          {rendering ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 size={13} className="animate-spin" /> Laying out pages… {progress ? progress : ''}
            </span>
          ) : pages !== null ? (
            `${pages} pages`
          ) : null}
        </span>
        <button type="button" className="btn-ghost p-2" onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))} aria-label="Zoom out">
          <ZoomOut size={16} />
        </button>
        <button type="button" className="btn-ghost p-2" onClick={() => setZoom((z) => Math.min(1.2, +(z + 0.1).toFixed(2)))} aria-label="Zoom in">
          <ZoomIn size={16} />
        </button>
        <button type="button" className={`btn ${panel === 'design' ? 'border-accent text-accent' : ''}`} onClick={() => setPanel((p) => (p === 'design' ? null : 'design'))} aria-expanded={panel === 'design'}>
          <SlidersHorizontal size={15} /> Design
        </button>
        <button type="button" className={`btn ${panel === 'check' ? 'border-accent text-accent' : ''}`} onClick={() => setPanel((p) => (p === 'check' ? null : 'check'))} aria-expanded={panel === 'check'}>
          <ClipboardCheck size={15} /> Check for KDP
        </button>
        <Link to={`/books/${book.id}/cover`} className="btn">
          <BookImage size={15} /> Cover
        </Link>
        <button type="button" className="btn-primary" onClick={() => window.print()} disabled={rendering}>
          <Printer size={15} /> Print / PDF
        </button>
      </div>

      <div className="flex">
        {panel && (
          <aside className="no-print fixed inset-x-0 bottom-0 z-20 max-h-[60dvh] overflow-y-auto border-t border-line bg-card p-4 shadow-xl lg:sticky lg:top-[53px] lg:z-auto lg:h-[calc(100dvh-53px)] lg:max-h-none lg:w-80 lg:shrink-0 lg:border-t-0 lg:border-r lg:shadow-none">
            <div className="mb-3 flex items-center justify-between lg:hidden">
              <p className="font-serif text-lg">{panel === 'check' ? 'KDP check' : 'Design'}</p>
              <button type="button" className="btn-ghost p-1" onClick={() => setPanel(null)} aria-label="Close panel">
                <X size={18} />
              </button>
            </div>
            {panel === 'check' ? (
              <PreflightPanel checks={checks} measuring={rendering} bookId={book.id} onOpenDesign={() => setPanel('design')} />
            ) : (
              <DesignPanel book={book} design={design} sections={lib.sections.filter((s) => s.bookId === book.id)} onChange={save} />
            )}
          </aside>
        )}
        <main className="min-w-0 flex-1 overflow-x-auto px-4 py-6">
          {error && <p className="no-print mb-4 rounded-xl bg-seed-bg px-4 py-2 text-sm text-seed">Couldn’t lay out the pages: {error}</p>}
          <div className="print-stage relative mx-auto w-max" style={{ zoom }} ref={stage} />
          <p className="no-print mt-6 text-center text-xs text-muted">
            Tip: in the print window choose <strong>Save as PDF</strong>, set margins to <strong>None</strong> and turn on <strong>Background graphics</strong>.
          </p>
        </main>
      </div>
    </div>
  );
}
