import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import {
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  BookmarkPlus,
  CaseUpper,
  Check,
  ChevronDown,
  Copy,
  Download,
  Highlighter,
  Italic,
  Pencil,
  Plus,
  SlidersHorizontal,
  Square,
  SunDim,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import { deleteTextStyle, renameTextStyle, saveTextStyle, useTextStyles } from '../../db/textStyles';
import { Modal } from '../Modal';
import { useToast } from '../Toast';
import { AssetImage } from '../AssetImage';
import { useAsset } from '../../db/assets';
import { downloadBlob } from '../../io/export';
import { TextOnPicture, fontFamily, renderPicture, renderSlide } from './TextOnPicture';
import { BRAND_COLOURS, FONT_ORDER, PLACEHOLDER_TEXT, TEXT_FONTS, TEXT_LOOKS, clamp, lookFor, lookOf, newTextLayer, readableOn, type TextLayer, type TextLook, type TextStyle } from '../../posts/textLayers';
import type { PostWorld } from '../../posts/model';

const LAST_LOOK = 'yourigin.posts.textLook';

function rememberedLook(): Partial<TextLayer> {
  try {
    const raw = localStorage.getItem(LAST_LOOK);
    return raw ? (JSON.parse(raw) as Partial<TextLayer>) : {};
  } catch {
    return {};
  }
}
function rememberLook(l: TextLayer) {
  try {
    localStorage.setItem(LAST_LOOK, JSON.stringify(lookOf(l)));
  } catch {
    /* private mode */
  }
}

/** Saves the finished slide: to the phone's share sheet (save to gallery, or straight to Instagram) or as a download. */
async function savePicture(blob: Blob, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], name, { type: 'image/jpeg' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  downloadBlob(name, blob);
  return 'downloaded';
}

/** The highlighter's marker colours: soft brand tones that read under cream or ink words. */
const HIGHLIGHTS = ['#fdd63a', '#d4a85a', '#ef8c5e', '#5fc49c', '#76b6ec', '#b8a0f2', '#6e1a35', '#1a1410'];

type Pop = 'styles' | 'font' | 'colour' | 'highlight' | 'more' | null;

/** One icon button on the toolbar, Word-style: pressed when its effect is on. */
function Tool({ label, on, onClick, children, wide }: { label: string; on?: boolean; onClick: (e: MouseEvent<HTMLButtonElement>) => void; children: ReactNode; wide?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-lg ${wide ? 'px-2.5' : 'w-10'} text-ink transition-colors hover:bg-paper-2 ${on ? 'bg-accent/20 ring-1 ring-accent/60' : ''}`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-0.5 h-6 w-px shrink-0 bg-line" aria-hidden />;

function Swatches({ value, onPick, colours }: { value: string | null | undefined; onPick: (hex: string) => void; colours: { name: string; hex: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colours.map((c) => (
        <button
          key={c.hex}
          type="button"
          aria-label={c.name}
          title={c.name}
          aria-pressed={value?.toLowerCase() === c.hex}
          className={`h-8 w-8 rounded-full border-2 ${value?.toLowerCase() === c.hex ? 'border-accent ring-2 ring-accent/40' : 'border-line'}`}
          style={{ background: c.hex }}
          onClick={() => onPick(c.hex)}
        />
      ))}
    </div>
  );
}

/**
 * Words on a picture, in brand fonts and colours: add a text box, drag it into place,
 * style it from one toolbar (like a word processor), then save the finished slide.
 */
export function TextStudio({
  open,
  onClose,
  assetId,
  layers,
  tall,
  aspect,
  title = 'Text on the picture',
  world,
  slideName,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  assetId: string;
  layers: TextLayer[];
  tall: boolean;
  /** A page shape (width ÷ height) other than a post's, such as a book page. Overrides `tall`. */
  aspect?: number;
  title?: string;
  world: PostWorld;
  slideName: string;
  onChange: (layers: TextLayer[]) => void;
}) {
  const toast = useToast();
  const asset = useAsset(assetId);
  const [selected, setSelected] = useState<string | null>(layers[0]?.id ?? null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pop, setPop] = useState<Pop>(null);
  // where the open pop-out hangs: just under the button that opened it
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number }>({ x: 0, y: 0, width: 0 });
  const [saving, setSaving] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const current = layers.find((l) => l.id === selected) ?? null;

  // Tapping outside the toolbar closes an open pop-out.
  useEffect(() => {
    if (!pop) return;
    const close = (e: PointerEvent) => {
      if (bar.current && !bar.current.contains(e.target as Node)) setPop(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [pop]);

  const update = (id: string, patch: Partial<TextLayer>) => {
    const next = layers.map((l) => (l.id === id ? { ...l, ...patch } : l));
    onChange(next);
    const changed = next.find((l) => l.id === id);
    if (changed && !('x' in patch) && !('text' in patch)) rememberLook(changed);
  };
  const set = (patch: Partial<TextLayer>) => current && update(current.id, patch);
  const toggle = (p: Exclude<Pop, null>, e: MouseEvent<HTMLButtonElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const r = bar.current?.getBoundingClientRect();
    if (r) setAnchor({ x: b.left - r.left + b.width / 2, y: b.bottom - r.top, width: r.width });
    setPop((x) => (x === p ? null : p));
  };
  const add = () => {
    const l = newTextLayer(rememberedLook(), { y: layers.length ? Math.min(0.85, 0.3 + layers.length * 0.18) : 0.5 });
    onChange([...layers, l]);
    setSelected(l.id);
    setEditing(l.id);
  };
  const remove = () => {
    if (!current) return;
    onChange(layers.filter((l) => l.id !== current.id));
    setSelected(null);
  };
  const duplicate = () => {
    if (!current) return;
    // A copy of linked words is the copy's own words (only the original stays linked).
    const copy = { ...newTextLayer(lookOf(current), { x: current.x, y: Math.min(0.95, current.y + 0.1) }), text: current.text };
    onChange([...layers, copy]);
    setSelected(copy.id);
  };
  const save = async () => {
    if (!asset) return;
    setSaving(true);
    setEditing(null);
    try {
      const blob = aspect ? await renderPicture(asset.dataUrl, layers, 1500, Math.round(1500 / aspect)) : await renderSlide(asset.dataUrl, layers, tall);
      const how = await savePicture(blob, `${slideName}.jpg`);
      if (how !== 'cancelled') toast(how === 'shared' ? 'Picture ready.' : 'Picture saved with its words.');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const bold = !!current && current.weight >= 650;
  const sizePct = current ? Math.round(current.size * 1000) / 10 : 0;

  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <div className="mx-auto max-w-xl">
        <div
          className={`relative mx-auto w-full overflow-hidden rounded-xl bg-paper-2 ${aspect ? '' : tall ? 'aspect-[9/16] max-w-[min(100%,calc(52vh*0.5625))]' : 'aspect-[4/5] max-w-[min(100%,calc(52vh*0.8))]'}`}
          style={aspect ? { aspectRatio: String(aspect), maxWidth: `min(100%, calc(52vh * ${aspect}))` } : undefined}
        >
          <AssetImage id={assetId} className="absolute inset-0 h-full w-full object-cover" />
          <TextOnPicture
            layers={layers}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              setPop(null);
            }}
            onMove={(id, x, y) => update(id, { x, y })}
            onEditText={(id, text) => update(id, { text })}
            editing={editing}
            onEditingChange={setEditing}
          />
        </div>

        {/* The toolbar: every option is a button you can see, like a word processor. */}
        <div ref={bar} className="relative mt-3">
          {current ? (
            <div className="flex flex-wrap items-center justify-center gap-0.5 rounded-xl border border-line bg-card p-1" role="toolbar" aria-label="Text formatting">
              <Tool label="Styles" wide on={pop === 'styles'} onClick={(e) => toggle('styles', e)}>
                <BookmarkPlus size={17} /> <span className="text-sm">Styles</span> <ChevronDown size={14} />
              </Tool>
              <Tool label="Font" wide on={pop === 'font'} onClick={(e) => toggle('font', e)}>
                <span className="max-w-24 truncate text-[16px]" style={{ fontFamily: fontFamily(current.font) }}>
                  {TEXT_FONTS[current.font].label}
                </span>
                <ChevronDown size={14} />
              </Tool>
              <Divider />
              <Tool label="Smaller" onClick={() => set({ size: clamp(Math.round((current.size - 0.005) * 1000) / 1000, 0.02, 0.2) })}>
                <AArrowDown size={18} />
              </Tool>
              <span className="w-10 text-center text-xs tabular-nums text-ink-2" aria-label="Font size">
                {sizePct}
              </span>
              <Tool label="Bigger" onClick={() => set({ size: clamp(Math.round((current.size + 0.005) * 1000) / 1000, 0.02, 0.2) })}>
                <AArrowUp size={18} />
              </Tool>
              <Divider />
              <Tool label="Bold" on={bold} onClick={() => set({ weight: bold ? Math.max(400, TEXT_FONTS[current.font].weights[0]) : Math.min(800, TEXT_FONTS[current.font].weights[1]) })}>
                <Bold size={18} />
              </Tool>
              <Tool label="Italic" on={current.italic} onClick={() => set({ italic: !current.italic })}>
                <Italic size={18} />
              </Tool>
              <Tool label="Underline" on={!!current.underline} onClick={() => set({ underline: !current.underline })}>
                <Underline size={18} />
              </Tool>
              <Tool label="Highlight" on={pop === 'highlight' || !!current.highlight} onClick={(e) => toggle('highlight', e)}>
                <span className="relative flex flex-col items-center">
                  <Highlighter size={17} />
                  <span className="mt-0.5 h-1 w-5 rounded-full border border-line" style={{ background: current.highlight ?? 'transparent' }} />
                </span>
              </Tool>
              <Tool label="Text colour" on={pop === 'colour'} onClick={(e) => toggle('colour', e)}>
                <span className="relative flex flex-col items-center">
                  <Baseline size={17} />
                  <span className="mt-0.5 h-1 w-5 rounded-full border border-line" style={{ background: current.colour }} />
                </span>
              </Tool>
              <Divider />
              <Tool label="Align left" on={current.align === 'left'} onClick={() => set({ align: 'left' })}>
                <AlignLeft size={18} />
              </Tool>
              <Tool label="Centre" on={current.align === 'center'} onClick={() => set({ align: 'center' })}>
                <AlignCenter size={18} />
              </Tool>
              <Tool label="Align right" on={current.align === 'right'} onClick={() => set({ align: 'right' })}>
                <AlignRight size={18} />
              </Tool>
              <Divider />
              <Tool label="Capitals" on={current.caps} onClick={() => set({ caps: !current.caps })}>
                <CaseUpper size={18} />
              </Tool>
              <Tool label="Soft shadow" on={current.shadow} onClick={() => set({ shadow: !current.shadow })}>
                <SunDim size={18} />
              </Tool>
              <Tool
                label="Box behind the words"
                on={!!current.backing}
                onClick={() => set(current.backing ? { backing: null } : { backing: readableOn(current.colour) === '#1a1410' ? '#1a1410' : '#f6efe2', shadow: false })}
              >
                <Square size={17} />
              </Tool>
              <Tool label="Width and spacing" on={pop === 'more'} onClick={(e) => toggle('more', e)}>
                <SlidersHorizontal size={17} />
              </Tool>
              <Divider />
              {!current.bind && (
                <Tool label="Type the words" on={editing === current.id} onClick={() => setEditing(editing === current.id ? null : current.id)}>
                  <Pencil size={17} />
                </Tool>
              )}
              <Tool label="Duplicate" onClick={duplicate}>
                <Copy size={17} />
              </Tool>
              <Tool label="Remove these words" onClick={remove}>
                <Trash2 size={17} className="text-seed" />
              </Tool>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-line p-3 text-center text-sm text-muted">
              {layers.length ? 'Tap some words on the picture to style them.' : 'Add text to start.'}
            </p>
          )}

          {current && pop && (
            <div
              className="absolute z-30 max-h-[45vh] overflow-y-auto rounded-xl border border-line bg-card p-3 shadow-xl"
              style={{
                top: anchor.y + 6,
                width: Math.min(340, anchor.width),
                // centred under its button, kept inside the toolbar's width
                left: clamp(anchor.x - Math.min(340, anchor.width) / 2, 0, Math.max(0, anchor.width - Math.min(340, anchor.width))),
              }}
            >
              {pop === 'styles' && (
                <div className="space-y-3">
                  <SignatureStyles current={lookOf(current)} onApply={(look) => set(look)} />
                  <div>
                    <p className="label">Brand looks</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TEXT_LOOKS.map((look) => (
                        <button key={look.id} type="button" className="btn min-h-9 px-3 text-sm" onClick={() => set({ ...lookFor(look.id, world), ...(look.text && current.text === PLACEHOLDER_TEXT ? { text: look.text } : {}) })}
                        >
                          {look.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {pop === 'font' && (
                <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" aria-label="Fonts">
                  {FONT_ORDER.map((f) => (
                    <li key={f}>
                      <button
                        type="button"
                        aria-pressed={current.font === f}
                        title={TEXT_FONTS[f].note}
                        className={`w-full rounded-lg border px-2 py-2 text-left text-[17px] leading-tight ${current.font === f ? 'border-accent bg-accent/15' : 'border-line'}`}
                        style={{ fontFamily: fontFamily(f) }}
                        onClick={() => {
                          const [lo, hi] = TEXT_FONTS[f].weights;
                          set({ font: f, weight: Math.min(hi, Math.max(lo, current.weight)) });
                          setPop(null);
                        }}
                      >
                        {TEXT_FONTS[f].label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {pop === 'colour' && (
                <div className="space-y-2">
                  {BRAND_COLOURS.map((g) => (
                    <div key={g.group}>
                      <p className="mb-1 text-[11px] text-muted">{g.group}</p>
                      <Swatches value={current.colour} colours={g.colours} onPick={(colour) => set({ colour })} />
                    </div>
                  ))}
                  <label className="flex items-center gap-2 pt-1 text-sm text-ink-2">
                    <input type="color" value={current.colour} onChange={(e) => set({ colour: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" />
                    Any other colour
                  </label>
                </div>
              )}
              {pop === 'highlight' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" className={`btn min-h-8 px-3 text-sm ${!current.highlight ? 'border-accent' : ''}`} onClick={() => set({ highlight: null })}>
                      <X size={14} /> None
                    </button>
                    <Swatches value={current.highlight} colours={HIGHLIGHTS.map((hex) => ({ hex, name: hex }))} onPick={(highlight) => set({ highlight })} />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-ink-2">
                    <input type="color" value={current.highlight ?? '#fdd63a'} onChange={(e) => set({ highlight: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" />
                    Any other colour
                  </label>
                </div>
              )}
              {pop === 'more' && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <span className="label">Width</span>
                    <input type="range" min={0.2} max={1} step={0.01} value={current.w} onChange={(e) => set({ w: Number(e.target.value) })} className="w-full" />
                  </label>
                  <label className="text-sm">
                    <span className="label">Weight</span>
                    <input
                      type="range"
                      min={TEXT_FONTS[current.font].weights[0]}
                      max={TEXT_FONTS[current.font].weights[1]}
                      step={50}
                      value={current.weight}
                      onChange={(e) => set({ weight: Number(e.target.value) })}
                      className="w-full"
                    />
                  </label>
                  <label className="text-sm">
                    <span className="label">Letter spacing</span>
                    <input type="range" min={-0.05} max={0.3} step={0.01} value={current.tracking} onChange={(e) => set({ tracking: Number(e.target.value) })} className="w-full" />
                  </label>
                  {current.backing && (
                    <label className="flex items-end gap-2 text-sm text-ink-2">
                      <input type="color" value={current.backing} onChange={(e) => set({ backing: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" />
                      Box colour
                    </label>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-2 text-center text-xs text-muted">
          {current?.bind ? 'These are your piece’s own words: drag to place them, and change the words in the piece itself.' : 'Drag the words to place them. Double-tap or hold them to type on the picture.'}
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn" onClick={add}>
            <Plus size={16} /> Add text
          </button>
          <button type="button" className="btn-primary" disabled={!layers.length || saving || !asset} onClick={() => void save()}>
            <Download size={16} /> {saving ? 'Saving…' : 'Save picture'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** A style's name, shown in its own font and colour on a backdrop it reads against. */
function StyleChip({ style, onClick }: { style: TextStyle; onClick: () => void }) {
  const { look } = style;
  const backdrop = readableOn(look.colour) === '#1a1410' ? '#1a1410' : '#f6efe2';
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Use “${style.name}”`}
      className="max-w-full truncate rounded-lg border border-line px-3 py-1.5 text-[16px] leading-tight"
      style={{
        fontFamily: fontFamily(look.font),
        fontWeight: look.weight,
        fontStyle: look.italic ? 'italic' : undefined,
        textTransform: look.caps ? 'uppercase' : undefined,
        letterSpacing: look.tracking ? `${Math.min(look.tracking, 0.15)}em` : undefined,
        color: look.colour,
        background: look.backing ?? backdrop,
      }}
    >
      {style.name}
    </button>
  );
}

/**
 * Cassidy's own named looks, synced to every device: tap one to use it, save the current
 * look as a new one (or over one of the same name), rename or remove them.
 */
function SignatureStyles({ current, onApply }: { current: TextLook; onApply: (look: TextLook) => void }) {
  const toast = useToast();
  const styles = useTextStyles();
  const [naming, setNaming] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const save = async () => {
    if (naming === null) return;
    const name = naming.trim() || `Style ${(styles?.length ?? 0) + 1}`;
    await saveTextStyle(name, current);
    setNaming(null);
    toast(`Saved “${name}”. It’s on all your devices.`);
  };
  return (
    <div>
      {!!styles?.length && (
        <div className="mb-2 flex justify-end">
          <button type="button" className="text-xs text-ink-2 underline" onClick={() => setManaging(!managing)}>
            {managing ? 'Done' : 'Edit styles'}
          </button>
        </div>
      )}
      {managing ? (
        <ul className="space-y-1.5">
          {styles?.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <Pencil size={14} className="shrink-0 text-muted" aria-hidden />
              <input className="input min-h-9 py-1" defaultValue={s.name} aria-label={`Rename ${s.name}`} onBlur={(e) => void renameTextStyle(s.id, e.target.value)} />
              <button type="button" className="btn-ghost min-h-9 shrink-0 px-2 text-seed" aria-label={`Remove ${s.name}`} onClick={() => void deleteTextStyle(s.id)}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {styles?.map((s) => <StyleChip key={s.id} style={s} onClick={() => onApply(s.look)} />)}
          {naming === null ? (
            <button type="button" className="btn min-h-9 px-3 text-sm" onClick={() => setNaming('')}>
              <BookmarkPlus size={15} /> Save this look
            </button>
          ) : (
            <form
              className="flex w-full gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <input className="input min-h-9 py-1" placeholder="Name it, e.g. YOU gold title" aria-label="Style name" value={naming} onChange={(e) => setNaming(e.target.value)} />
              <button type="submit" className="btn-primary min-h-9 shrink-0 px-3" aria-label="Save style">
                <Check size={15} />
              </button>
              <button type="button" className="btn-ghost min-h-9 shrink-0 px-2" aria-label="Cancel" onClick={() => setNaming(null)}>
                <X size={15} />
              </button>
            </form>
          )}
        </div>
      )}
      {!styles?.length && naming === null && <p className="mt-1 text-xs text-muted">Style some words the way you like, then save the look to reuse it on any device.</p>}
    </div>
  );
}
