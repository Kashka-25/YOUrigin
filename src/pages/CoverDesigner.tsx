import '@fontsource-variable/eb-garamond/index.css';
import '@fontsource-variable/eb-garamond/wght-italic.css';
import '@fontsource-variable/cormorant-garamond/index.css';
import '@fontsource-variable/cormorant-garamond/wght-italic.css';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ClipboardCheck, Eye, EyeOff, LayoutTemplate, Printer, SlidersHorizontal, X } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { useAsset, removeAssetIfUnused } from '../db/assets';
import { updateBook } from '../db/books';
import { resolveDesign } from '../print/design';
import { BARCODE, PAPERS, SAFE_IN, SPINE_SAFE_IN, coverGeometry, fmtIn, resolveCover, spineTextAllowed, type CoverGeometry } from '../print/cover';
import { ArtworkPicker } from '../components/print/DesignPanel';
import { EmptyState, Spinner } from '../components/ui';
import type { Book, BookDesign, CoverDesign } from '../domain/types';

const FONTS: Record<CoverDesign['font'], { label: string; css: string }> = {
  cinzel: { label: 'Cinzel — carved capitals', css: "'Cinzel Variable', 'Trajan Pro', Georgia, serif" },
  garamond: { label: 'EB Garamond — classic', css: "'EB Garamond Variable', Garamond, Georgia, serif" },
  cormorant: { label: 'Cormorant Garamond — elegant', css: "'Cormorant Garamond Variable', Garamond, Georgia, serif" },
};

const SWATCHES = ['#1a1421', '#2b1d2f', '#4b2a5f', '#1f2b3a', '#2f4a3a', '#5a2a2a', '#f1e8d6', '#ffffff', '#d4a54c', '#c8b0ea'];

/** Wraparound paperback cover: back + spine + front, at true size, printable as one PDF page. */
export function CoverDesigner() {
  const { id } = useParams();
  const lib = useLibrary();
  const book = lib?.books.find((b) => b.id === id);
  const [panel, setPanel] = useState(() => window.innerWidth >= 1024);

  if (!lib) return <Spinner />;
  if (!book) return <EmptyState title="Book not found" action={<Link to="/books" className="btn">All books</Link>} />;

  const design = resolveDesign(book);
  const cover = resolveCover(design);
  const g = coverGeometry(design, cover, design.pageCount);
  const save = (patch: Partial<CoverDesign>) => void updateBook(book.id, { design: { ...(book.design ?? {}), cover: { ...(book.design?.cover ?? {}), ...patch } } });
  const saveDesign = (patch: Partial<BookDesign>) => void updateBook(book.id, { design: { ...(book.design ?? {}), ...patch } });

  return (
    <div className="cover-designer min-h-dvh bg-paper-2">
      <PageSizeForPrint g={g} />
      <div className="no-print sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-line bg-card/95 px-3 py-2 backdrop-blur">
        <Link to={`/books/${book.id}/print`} className="btn-ghost">
          <ArrowLeft size={16} /> Pages
        </Link>
        <p className="min-w-0 flex-1 truncate font-serif text-lg">Cover · {book.title}</p>
        <span className="hidden text-xs text-muted md:inline">
          {fmtIn(g.totalW)} × {fmtIn(g.totalH)} · spine {fmtIn(g.spine)}
        </span>
        <button type="button" className="btn-ghost p-2" onClick={() => save({ showGuides: !cover.showGuides })} aria-pressed={cover.showGuides} title="Guides (not printed)">
          {cover.showGuides ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        <button type="button" className={`btn ${panel ? 'border-accent text-accent' : ''}`} onClick={() => setPanel((p) => !p)} aria-expanded={panel}>
          <SlidersHorizontal size={15} /> Design
        </button>
        <Link to={`/books/${book.id}/print?check=1`} className="btn">
          <ClipboardCheck size={15} /> Check for KDP
        </Link>
        <button type="button" className="btn-primary" onClick={() => window.print()}>
          <Printer size={15} /> Print / PDF
        </button>
      </div>

      <div className="flex">
        {panel && (
          <aside className="no-print fixed inset-x-0 bottom-0 z-20 max-h-[60dvh] overflow-y-auto border-t border-line bg-card p-4 shadow-xl lg:sticky lg:top-[53px] lg:z-auto lg:h-[calc(100dvh-53px)] lg:max-h-none lg:w-80 lg:shrink-0 lg:border-t-0 lg:border-r lg:shadow-none">
            <div className="mb-3 flex items-center justify-between lg:hidden">
              <p className="font-serif text-lg">Cover design</p>
              <button type="button" className="btn-ghost p-1" onClick={() => setPanel(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <CoverPanel book={book} design={design} cover={cover} g={g} save={save} saveDesign={saveDesign} />
          </aside>
        )}
        <main className="min-w-0 flex-1 px-4 py-6">
          {g.warnings.length > 0 && (
            <ul className="no-print mb-4 space-y-1 rounded-xl bg-developing-bg px-4 py-2 text-sm text-developing">
              {g.warnings.map((w) => (
                <li key={w} className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> {w}
                </li>
              ))}
            </ul>
          )}
          <FitToWidth widthIn={g.totalW}>
            <Cover book={book} design={design} cover={cover} g={g} />
          </FitToWidth>
          <p className="no-print mt-5 text-center text-xs text-muted">
            In the print window choose <strong>Save as PDF</strong>, margins <strong>None</strong>, <strong>Background graphics</strong> on. The PDF is the full
            wraparound ({fmtIn(g.totalW)} × {fmtIn(g.totalH)}) including {fmtIn(g.bleed)} bleed — upload it as your cover file. Guides never print.
          </p>
        </main>
      </div>
    </div>
  );
}

/** Scales the true-size cover to fit the screen; printing always uses true size. */
function FitToWidth({ widthIn, children }: { widthIn: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.5);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setZoom(Math.min(1, el.clientWidth / (widthIn * 96)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [widthIn]);
  return (
    <div ref={box} className="w-full">
      <div className="cover-stage mx-auto w-max shadow-2xl" style={{ zoom }}>
        {children}
      </div>
    </div>
  );
}

/** Sets the printed page to exactly the wraparound size while this screen is open. */
function PageSizeForPrint({ g }: { g: CoverGeometry }) {
  useEffect(() => {
    const el = document.createElement('style');
    el.setAttribute('data-yourigin-cover', '');
    el.textContent = `@page { size: ${g.totalW.toFixed(4)}in ${g.totalH.toFixed(4)}in; margin: 0; }`;
    document.head.appendChild(el);
    return () => el.remove();
  }, [g.totalW, g.totalH]);
  return null;
}

function Cover({ book, design, cover, g }: { book: Book; design: BookDesign; cover: CoverDesign; g: CoverGeometry }) {
  const front = useAsset(book.coverAssetId);
  const back = useAsset(cover.backImageAssetId);
  const font = FONTS[cover.font].css;
  const inch = (n: number) => `${n}in`;
  const backW = g.bleed + g.trimW;
  const frontX = backW + g.spine;
  const author = design.author.trim();
  const blurb = (cover.blurb || book.description).trim();
  const spineOk = spineTextAllowed(cover, g);
  const titleSize = Math.min(g.trimW * 0.13, 0.62) * cover.titleSize;
  const imageBehindFront = cover.frontLayout === 'image-full' && front && !cover.wrapImage;

  const panel: CSSProperties = { position: 'absolute', top: 0, height: inch(g.totalH), overflow: 'hidden' };
  const textShadow = cover.frontLayout === 'image-full' || cover.wrapImage ? '0 1px 6px rgb(0 0 0 / 0.55)' : undefined;

  return (
    <div
      className="yc-print relative"
      style={{ width: inch(g.totalW), height: inch(g.totalH), background: cover.background, color: cover.textColour, fontFamily: font, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      {cover.wrapImage && front && <img src={front.dataUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}

      {/* Back */}
      <div style={{ ...panel, left: 0, width: inch(backW) }}>
        {cover.wrapImage && front && <div style={{ position: 'absolute', inset: 0, background: 'rgb(0 0 0 / 0.38)' }} />}
        <div
          style={{
            position: 'absolute',
            left: inch(g.bleed + SAFE_IN),
            right: inch(SAFE_IN),
            top: inch(g.bleed + SAFE_IN + 0.15),
            bottom: inch(g.bleed + SAFE_IN + (cover.barcodeSpace ? BARCODE.h + 0.15 : 0)),
            display: 'flex',
            flexDirection: 'column',
            gap: '0.18in',
            textShadow,
          }}
        >
          {back && <img src={back.dataUrl} alt="" style={{ width: '100%', maxHeight: '2.6in', objectFit: 'cover', borderRadius: '2pt' }} />}
          {blurb && (
            <p style={{ margin: 0, fontFamily: "'EB Garamond Variable', Georgia, serif", fontSize: '11pt', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{blurb}</p>
          )}
          {cover.authorBio.trim() && (
            <>
              <div style={{ width: '1in', borderTop: `0.75pt solid ${cover.accentColour}` }} />
              <p style={{ margin: 0, fontFamily: "'EB Garamond Variable', Georgia, serif", fontSize: '9.5pt', lineHeight: 1.45, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                {cover.authorBio}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Spine */}
      <div style={{ ...panel, left: inch(backW), width: inch(Math.max(g.spine, 0.001)) }}>
        {spineOk && (
          <div
            style={{
              position: 'absolute',
              inset: `${inch(g.bleed + SAFE_IN)} ${inch(SPINE_SAFE_IN)}`,
              writingMode: 'vertical-rl',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: inch(Math.min(g.spine * 0.42, 0.2)),
              letterSpacing: '0.12em',
              textTransform: cover.font === 'cinzel' ? 'none' : 'uppercase',
              whiteSpace: 'nowrap',
              textShadow,
            }}
          >
            <span>{book.title}</span>
            {author && <span style={{ color: cover.accentColour, fontSize: '0.8em' }}>{author}</span>}
          </div>
        )}
      </div>

      {/* Front */}
      <div style={{ ...panel, left: inch(frontX), width: inch(g.trimW + g.bleed) }}>
        {imageBehindFront && <img src={front!.dataUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        {(imageBehindFront || cover.wrapImage) && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgb(0 0 0 / 0.35), transparent 35%, transparent 65%, rgb(0 0 0 / 0.4))' }} />
        )}
        <div
          style={{
            position: 'absolute',
            left: inch(SAFE_IN),
            right: inch(g.bleed + SAFE_IN),
            top: inch(g.bleed + SAFE_IN),
            bottom: inch(g.bleed + SAFE_IN),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            justifyContent: cover.frontLayout === 'type-only' ? 'center' : 'space-between',
            gap: '0.2in',
            textShadow,
          }}
        >
          {cover.frontLayout === 'image-top' && front && (
            <img src={front.dataUrl} alt="" style={{ width: '100%', flex: '1 1 auto', minHeight: 0, objectFit: 'cover', borderRadius: '2pt' }} />
          )}
          <div style={{ paddingTop: cover.frontLayout === 'image-full' ? '0.35in' : 0 }}>
            {cover.frontLayout === 'type-only' && <p style={{ color: cover.accentColour, fontSize: '18pt', margin: '0 0 0.25in' }}>{design.ornament || '✦'}</p>}
            <h1 style={{ margin: 0, fontWeight: 500, fontSize: inch(titleSize), lineHeight: 1.1, letterSpacing: cover.font === 'cinzel' ? '0.04em' : 0 }}>{book.title}</h1>
            {book.subtitle && <p style={{ margin: '0.15in 0 0', fontStyle: 'italic', fontSize: inch(titleSize * 0.38), fontFamily: "'EB Garamond Variable', Georgia, serif" }}>{book.subtitle}</p>}
          </div>
          {author && (
            <p style={{ margin: 0, color: cover.accentColour, letterSpacing: '0.24em', textTransform: 'uppercase', fontSize: inch(Math.max(titleSize * 0.3, 0.14)) }}>
              {author}
            </p>
          )}
        </div>
      </div>

      {cover.showGuides && <Guides g={g} cover={cover} />}
    </div>
  );
}

/** Bleed, trim, safe area, spine and barcode guides — screen only. */
function Guides({ g, cover }: { g: CoverGeometry; cover: CoverDesign }) {
  const inch = (n: number) => `${n}in`;
  const line = (style: CSSProperties, colour: string, dashed = true) => (
    <div className="no-print pointer-events-none absolute" style={{ ...style, border: `1px ${dashed ? 'dashed' : 'solid'} ${colour}` }} />
  );
  const backX = g.bleed;
  const spineX = g.bleed + g.trimW;
  const frontX = spineX + g.spine;
  return (
    <>
      {/* Trim (where the book is cut) */}
      {line({ left: inch(g.bleed), top: inch(g.bleed), width: inch(g.totalW - 2 * g.bleed), height: inch(g.trimH) }, '#ff5a5a')}
      {/* Spine folds */}
      {line({ left: inch(spineX), top: 0, width: inch(Math.max(g.spine, 0.001)), height: inch(g.totalH) }, '#4aa3ff')}
      {/* Safe areas */}
      {line({ left: inch(backX + SAFE_IN), top: inch(g.bleed + SAFE_IN), width: inch(g.trimW - 2 * SAFE_IN), height: inch(g.trimH - 2 * SAFE_IN) }, '#3ecf8e')}
      {line({ left: inch(frontX + SAFE_IN), top: inch(g.bleed + SAFE_IN), width: inch(g.trimW - 2 * SAFE_IN), height: inch(g.trimH - 2 * SAFE_IN) }, '#3ecf8e')}
      {cover.barcodeSpace && (
        <div
          className="no-print pointer-events-none absolute flex items-center justify-center bg-white/80 text-[9pt] text-neutral-700"
          style={{
            left: inch(spineX - BARCODE.inset - BARCODE.w),
            top: inch(g.bleed + g.trimH - BARCODE.inset - BARCODE.h),
            width: inch(BARCODE.w),
            height: inch(BARCODE.h),
            border: '1px dashed #888',
          }}
        >
          Barcode area
        </div>
      )}
      <div className="no-print pointer-events-none absolute right-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 text-[8pt] text-white">
        <span style={{ color: '#ff8a8a' }}>— trim</span> · <span style={{ color: '#7cc2ff' }}>— spine</span> ·{' '}
        <span style={{ color: '#6ee7b7' }}>— keep text inside</span>
      </div>
    </>
  );
}

function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Colour({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-1.5">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" aria-label={label} />
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`h-6 w-6 rounded-full border ${value.toLowerCase() === c ? 'border-accent ring-2 ring-accent' : 'border-line'}`}
            style={{ background: c }}
            aria-label={`${label} ${c}`}
          />
        ))}
      </div>
    </Field>
  );
}

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-line py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between py-1.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <span className="text-muted transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-3 pt-2 pb-2">{children}</div>
    </details>
  );
}

function CoverPanel({
  book,
  design,
  cover,
  g,
  save,
  saveDesign,
}: {
  book: Book;
  design: BookDesign;
  cover: CoverDesign;
  g: CoverGeometry;
  save: (p: Partial<CoverDesign>) => void;
  saveDesign: (p: Partial<BookDesign>) => void;
}) {
  return (
    <div className="text-ink">
      <Section title="Size & spine" open>
        <p className="text-xs text-ink-2">
          Trim {g.trimW.toFixed(3)}″ × {g.trimH.toFixed(3)}″ (change it in{' '}
          <Link to={`/books/${book.id}/print`} className="underline">
            <LayoutTemplate size={11} className="inline" /> Design & print
          </Link>
          ). Full cover {fmtIn(g.totalW)} × {fmtIn(g.totalH)}.
        </p>
        <Field label="Paper" htmlFor="c-paper">
          <select id="c-paper" className="input" value={cover.paper} onChange={(e) => save({ paper: e.target.value as CoverDesign['paper'] })}>
            {Object.entries(PAPERS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Pages — counted: ${design.pageCount ?? 'not yet'}`} htmlFor="c-pages">
          <input
            id="c-pages"
            type="number"
            min={0}
            className="input"
            value={cover.pageCount || ''}
            placeholder={design.pageCount ? `${design.pageCount} (from your pages)` : 'Open Design & print to count'}
            onChange={(e) => save({ pageCount: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
        <p className="text-sm">
          Spine width: <strong>{fmtIn(g.spine)}</strong> <span className="text-xs text-muted">({g.pages} pages)</span>
        </p>
        <Field label="Exact spine width from your printer (optional, inches)" htmlFor="c-spine">
          <input
            id="c-spine"
            type="number"
            step="0.001"
            min={0}
            className="input"
            value={cover.spineOverride || ''}
            placeholder="Leave empty to calculate"
            onChange={(e) => save({ spineOverride: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
        <p className="text-xs text-muted">Figures follow Amazon KDP paperbacks. IngramSpark and others give an exact spine width — enter it above.</p>
      </Section>

      <Section title="Artwork" open>
        <ArtworkPicker
          label="Front cover artwork"
          assetId={book.coverAssetId}
          onPick={async (id) => updateBook(book.id, { coverAssetId: id })}
          onClear={async () => {
            const old = book.coverAssetId;
            await updateBook(book.id, { coverAssetId: undefined });
            await removeAssetIfUnused(old);
          }}
        />
        <Field label="Front layout" htmlFor="c-layout">
          <select id="c-layout" className="input" value={cover.frontLayout} onChange={(e) => save({ frontLayout: e.target.value as CoverDesign['frontLayout'] })}>
            <option value="image-full">Artwork fills the front, title over it</option>
            <option value="image-top">Artwork above the title</option>
            <option value="type-only">Type only — title, ornament, author</option>
          </select>
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={cover.wrapImage} onChange={(e) => save({ wrapImage: e.target.checked })} />
          <span>
            Stretch the front artwork across the whole cover
            <span className="block text-xs text-muted">Back, spine and front share one image (the back is gently darkened for reading).</span>
          </span>
        </label>
        <ArtworkPicker
          label="Back cover image (optional)"
          assetId={cover.backImageAssetId}
          onPick={async (id) => save({ backImageAssetId: id })}
          onClear={async () => {
            const old = cover.backImageAssetId;
            save({ backImageAssetId: undefined });
            await removeAssetIfUnused(old);
          }}
        />
      </Section>

      <Section title="Colours & type">
        <Colour label="Background" value={cover.background} onChange={(v) => save({ background: v })} />
        <Colour label="Text" value={cover.textColour} onChange={(v) => save({ textColour: v })} />
        <Colour label="Accent (author, rules)" value={cover.accentColour} onChange={(v) => save({ accentColour: v })} />
        <Field label="Typeface" htmlFor="c-font">
          <select id="c-font" className="input" value={cover.font} onChange={(e) => save({ font: e.target.value as CoverDesign['font'] })}>
            {Object.entries(FONTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Title size — ${Math.round(cover.titleSize * 100)}%`} htmlFor="c-tsize">
          <input id="c-tsize" type="range" min={0.6} max={1.6} step={0.05} value={cover.titleSize} onChange={(e) => save({ titleSize: Number(e.target.value) })} className="w-full" />
        </Field>
      </Section>

      <Section title="Words">
        <p className="text-xs text-muted">The title and subtitle come from the book itself.</p>
        <Field label="Author name (also used inside the book)" htmlFor="c-author">
          <input id="c-author" className="input" value={design.author} onChange={(e) => saveDesign({ author: e.target.value })} />
        </Field>
        <Field label="Back cover blurb" htmlFor="c-blurb">
          <textarea
            id="c-blurb"
            className="input min-h-28"
            value={cover.blurb}
            placeholder={book.description || 'A few lines that invite the reader in…'}
            onChange={(e) => save({ blurb: e.target.value })}
          />
        </Field>
        <Field label="About the author" htmlFor="c-bio">
          <textarea id="c-bio" className="input min-h-20" value={cover.authorBio} onChange={(e) => save({ authorBio: e.target.value })} />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={cover.spineText} onChange={(e) => save({ spineText: e.target.checked })} />
          <span>
            Title and author on the spine
            <span className="block text-xs text-muted">Shown once the book has 80+ pages (KDP’s rule).</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={cover.barcodeSpace} onChange={(e) => save({ barcodeSpace: e.target.checked })} />
          <span>
            Keep space for the barcode
            <span className="block text-xs text-muted">Print services add the ISBN barcode at the bottom of the back cover.</span>
          </span>
        </label>
      </Section>
    </div>
  );
}
