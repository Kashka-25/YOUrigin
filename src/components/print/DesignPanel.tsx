import { useRef, useState, type ReactNode } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import type { Book, BookDesign, Section, SpaceSize, TrimSize } from '../../domain/types';
import { BODY_FONTS, LINE_SPACING, MARGINS, ORNAMENTS, SPACE_LABEL, TRIMS } from '../../print/design';
import { IMAGE_ACCEPT, saveImage, useAsset, removeAssetIfUnused } from '../../db/assets';
import { updateBook } from '../../db/books';
import { db } from '../../db/db';
import { formatBytes } from '../../io/images';
import { useToast } from '../Toast';

function Group({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
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

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function SpaceSelect({ id, value, onChange }: { id?: string; value: SpaceSize; onChange: (v: SpaceSize) => void }) {
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as SpaceSize)}>
      {(Object.keys(SPACE_LABEL) as SpaceSize[]).map((k) => (
        <option key={k} value={k}>
          {SPACE_LABEL[k]}
        </option>
      ))}
    </select>
  );
}

/** Upload or remove one piece of artwork (cover or section opener). Images are shrunk automatically. */
function ArtworkPicker({ assetId, onPick, onClear, label }: { assetId?: string; onPick: (id: string) => Promise<void>; onClear: () => Promise<void>; label: string }) {
  const asset = useAsset(assetId);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-line bg-paper-2 text-muted hover:border-accent"
        onClick={() => input.current?.click()}
        aria-label={`${asset ? 'Replace' : 'Add'} ${label}`}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : asset ? <img src={asset.dataUrl} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={16} />}
      </button>
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate">{label}</p>
        {asset ? (
          <p className="text-xs text-muted">
            {asset.width}×{asset.height} · {formatBytes(asset.bytes)}
          </p>
        ) : (
          <p className="text-xs text-muted">Tap to add artwork</p>
        )}
      </div>
      {asset && (
        <button type="button" className="btn-ghost p-1" onClick={() => void onClear()} aria-label={`Remove ${label}`}>
          <X size={14} />
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(true);
          try {
            const { asset: a, shrunk } = await saveImage(f);
            await onPick(a.id);
            if (shrunk.originalBytes > shrunk.bytes) toast(`Image shrunk ${formatBytes(shrunk.originalBytes)} → ${formatBytes(shrunk.bytes)}`);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

export function DesignPanel({ book, design: d, sections, onChange }: { book: Book; design: BookDesign; sections: Section[]; onChange: (p: Partial<BookDesign>) => void }) {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  return (
    <div className="text-ink">
      <p className="mb-2 text-xs text-muted">Changes save automatically and the pages update as you go.</p>

      <Group title="Page size & margins" open>
        <Field label="Trim size" htmlFor="d-trim">
          <select id="d-trim" className="input" value={d.trim} onChange={(e) => onChange({ trim: e.target.value as TrimSize })}>
            {Object.entries(TRIMS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Margins" htmlFor="d-margins">
          <select id="d-margins" className="input" value={d.margins} onChange={(e) => onChange({ margins: e.target.value as BookDesign['margins'] })}>
            {Object.entries(MARGINS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Toggle
          label="Add bleed for print services"
          hint="Adds 0.125in around each page and crop marks — needed by KDP, IngramSpark etc. when artwork runs to the edge."
          checked={d.bleed}
          onChange={(v) => onChange({ bleed: v })}
        />
      </Group>

      <Group title="Typography" open>
        <Field label="Body typeface" htmlFor="d-font">
          <select id="d-font" className="input" value={d.bodyFont} onChange={(e) => onChange({ bodyFont: e.target.value as BookDesign['bodyFont'] })}>
            {Object.entries(BODY_FONTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Headings" htmlFor="d-head">
          <select id="d-head" className="input" value={d.headingFont} onChange={(e) => onChange({ headingFont: e.target.value as BookDesign['headingFont'] })}>
            <option value="cinzel">Cinzel — carved capitals</option>
            <option value="body">Same as body</option>
          </select>
        </Field>
        <Field label={`Text size — ${d.fontSize}pt`} htmlFor="d-size">
          <input id="d-size" type="range" min={9} max={15} step={0.5} value={d.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) })} className="w-full" />
        </Field>
        <Field label={`Line spacing — ${d.lineHeight.toFixed(2)}`} htmlFor="d-lh">
          <input id="d-lh" type="range" min={1.2} max={2} step={0.05} value={d.lineHeight} onChange={(e) => onChange({ lineHeight: Number(e.target.value) })} className="w-full" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Poems" htmlFor="d-palign">
            <select id="d-palign" className="input" value={d.poemAlign} onChange={(e) => onChange({ poemAlign: e.target.value as 'left' | 'center' })}>
              <option value="left">Left</option>
              <option value="center">Centred</option>
            </select>
          </Field>
          <Field label="Titles" htmlFor="d-talign">
            <select id="d-talign" className="input" value={d.titleAlign} onChange={(e) => onChange({ titleAlign: e.target.value as 'left' | 'center' })}>
              <option value="left">Left</option>
              <option value="center">Centred</option>
            </select>
          </Field>
        </div>
      </Group>

      <Group title="Chapters & flow">
        <Field label="Chapter opening style" htmlFor="d-sstyle">
          <select id="d-sstyle" className="input" value={d.sectionStyle} onChange={(e) => onChange({ sectionStyle: e.target.value as BookDesign['sectionStyle'] })}>
            <option value="ornamental">Ornamental — spaced capitals, ornament & rule</option>
            <option value="classic">Classic — large title</option>
            <option value="minimal">Minimal — small title at the top</option>
          </select>
        </Field>
        <Field label="Ornament" htmlFor="d-orn">
          <div className="flex flex-wrap gap-1" id="d-orn" role="radiogroup" aria-label="Ornament">
            {ORNAMENTS.map((o) => (
              <button
                key={o || 'none'}
                type="button"
                role="radio"
                aria-checked={d.ornament === o}
                onClick={() => onChange({ ornament: o })}
                className={`h-9 min-w-9 rounded-lg border px-2 font-serif text-lg ${d.ornament === o ? 'border-accent bg-paper-2' : 'border-line'}`}
              >
                {o || <span className="text-xs">none</span>}
              </button>
            ))}
          </div>
        </Field>
        <Toggle label="Each piece starts on a new page" checked={d.pieceOnNewPage} onChange={(v) => onChange({ pieceOnNewPage: v })} />
        <Toggle label="Chapters start on a right-hand page" checked={d.sectionOnRightPage} onChange={(v) => onChange({ sectionOnRightPage: v })} />
      </Group>

      <Group title="Writing & drawing space" open={d.promptSpace !== 'none' || d.drawingSpace !== 'none'}>
        <p className="text-xs text-muted">
          Room for the reader’s own hand. Lines grow to fill the empty space under each piece. Any piece can be changed on its own page (open it from
          the book’s Contents).
        </p>
        <Field label="After prompts — ruled lines" htmlFor="d-pspace">
          <SpaceSelect id="d-pspace" value={d.promptSpace} onChange={(v) => onChange({ promptSpace: v })} />
        </Field>
        <Field label="After activities that ask you to write — ruled lines" htmlFor="d-aspace">
          <SpaceSelect id="d-aspace" value={d.activitySpace} onChange={(v) => onChange({ activitySpace: v })} />
        </Field>
        <Field label="After activities that ask you to draw — open space" htmlFor="d-dspace">
          <SpaceSelect id="d-dspace" value={d.drawingSpace} onChange={(v) => onChange({ drawingSpace: v })} />
        </Field>
        <Toggle
          label="Recognise drawing activities automatically"
          hint="Pieces that mention drawing, sketching, doodling, mapping, colouring… get open space instead of lines."
          checked={d.detectDrawing}
          onChange={(v) => onChange({ detectDrawing: v })}
        />
        <Field label="Line spacing" htmlFor="d-ls">
          <select id="d-ls" className="input" value={d.lineSpacing} onChange={(e) => onChange({ lineSpacing: e.target.value as BookDesign['lineSpacing'] })}>
            {Object.entries(LINE_SPACING).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Toggle label="Frame drawing spaces" hint="A thin border around open drawing areas." checked={d.drawingFrame} onChange={(v) => onChange({ drawingFrame: v })} />
      </Group>

      <Group title="Headers & page numbers">
        <Field label="Page numbers" htmlFor="d-pn">
          <select id="d-pn" className="input" value={d.pageNumbers} onChange={(e) => onChange({ pageNumbers: e.target.value as BookDesign['pageNumbers'] })}>
            <option value="bottom-outside">Bottom, outer corners</option>
            <option value="bottom-center">Bottom, centred</option>
            <option value="none">None</option>
          </select>
        </Field>
        <Toggle label="Running headers" hint="Book title on left pages, chapter title on right pages." checked={d.runningHeads} onChange={(v) => onChange({ runningHeads: v })} />
      </Group>

      <Group title="Front pages">
        <Toggle label="Title page" checked={d.titlePage} onChange={(v) => onChange({ titlePage: v })} />
        <Field label="Author name" htmlFor="d-author">
          <input id="d-author" className="input" value={d.author} onChange={(e) => onChange({ author: e.target.value })} placeholder="As it should appear in print" />
        </Field>
        <Field label="Copyright page" htmlFor="d-copy">
          <textarea
            id="d-copy"
            className="input min-h-20"
            value={d.copyright}
            onChange={(e) => onChange({ copyright: e.target.value })}
            placeholder={`© ${new Date().getFullYear()} Your Name. All rights reserved.\nISBN …`}
          />
        </Field>
        <Field label="Dedication" htmlFor="d-ded">
          <textarea id="d-ded" className="input min-h-16" value={d.dedication} onChange={(e) => onChange({ dedication: e.target.value })} placeholder="For…" />
        </Field>
        <Toggle label="Contents page (with page numbers)" checked={d.toc} onChange={(v) => onChange({ toc: v })} />
      </Group>

      <Group title="Artwork">
        <ArtworkPicker
          label="Cover image (full page, first)"
          assetId={book.coverAssetId}
          onPick={async (id) => updateBook(book.id, { coverAssetId: id })}
          onClear={async () => {
            const old = book.coverAssetId;
            await updateBook(book.id, { coverAssetId: undefined });
            await removeAssetIfUnused(old);
          }}
        />
        <p className="pt-1 text-xs text-muted">Chapter opening artwork</p>
        {ordered.map((s) => (
          <ArtworkPicker
            key={s.id}
            label={s.title}
            assetId={s.imageAssetId}
            onPick={async (id) => void (await db.sections.update(s.id, { imageAssetId: id, updatedAt: Date.now() }))}
            onClear={async () => {
              const old = s.imageAssetId;
              await db.sections.update(s.id, { imageAssetId: undefined, updatedAt: Date.now() });
              await removeAssetIfUnused(old);
            }}
          />
        ))}
        <p className="text-xs text-muted">
          To place pictures between pieces, add them on the material shelf in the Builder (“Add images”) and drag them where they belong.
        </p>
      </Group>
    </div>
  );
}
