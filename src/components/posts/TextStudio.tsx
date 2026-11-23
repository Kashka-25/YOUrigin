import { useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, CaseUpper, Copy, Download, Italic, Plus, Square, SunDim, Trash2 } from 'lucide-react';
import { Modal } from '../Modal';
import { useToast } from '../Toast';
import { AssetImage } from '../AssetImage';
import { useAsset } from '../../db/assets';
import { downloadBlob } from '../../io/export';
import { TextOnPicture, fontFamily, renderSlide } from './TextOnPicture';
import { BRAND_COLOURS, FONT_ORDER, TEXT_FONTS, TEXT_LOOKS, lookFor, lookOf, newTextLayer, readableOn, type TextLayer } from '../../posts/textLayers';
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

function Toggle({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} title={label} onClick={onClick} className={`btn min-h-10 px-3 ${on ? 'border-accent bg-accent/15 text-ink' : ''}`}>
      {children}
    </button>
  );
}

/**
 * Words on a picture, in brand fonts and colours: add a text box, drag it into place,
 * pick a look, then save the finished slide for Instagram.
 */
export function TextStudio({
  open,
  onClose,
  assetId,
  layers,
  tall,
  world,
  slideName,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  assetId: string;
  layers: TextLayer[];
  tall: boolean;
  world: PostWorld;
  slideName: string;
  onChange: (layers: TextLayer[]) => void;
}) {
  const toast = useToast();
  const asset = useAsset(assetId);
  const [selected, setSelected] = useState<string | null>(layers[0]?.id ?? null);
  const [saving, setSaving] = useState(false);
  const current = layers.find((l) => l.id === selected) ?? null;

  const update = (id: string, patch: Partial<TextLayer>) => {
    const next = layers.map((l) => (l.id === id ? { ...l, ...patch } : l));
    onChange(next);
    const changed = next.find((l) => l.id === id);
    if (changed && !('x' in patch) && !('text' in patch)) rememberLook(changed);
  };
  const set = (patch: Partial<TextLayer>) => current && update(current.id, patch);
  const add = () => {
    const l = newTextLayer(rememberedLook(), { y: layers.length ? Math.min(0.85, 0.3 + layers.length * 0.18) : 0.5 });
    onChange([...layers, l]);
    setSelected(l.id);
  };
  const remove = () => {
    if (!current) return;
    onChange(layers.filter((l) => l.id !== current.id));
    setSelected(null);
  };
  const duplicate = () => {
    if (!current) return;
    const copy = { ...newTextLayer(lookOf(current), { x: current.x, y: Math.min(0.95, current.y + 0.1) }), text: current.text };
    onChange([...layers, copy]);
    setSelected(copy.id);
  };
  const save = async () => {
    if (!asset) return;
    setSaving(true);
    try {
      const blob = await renderSlide(asset.dataUrl, layers, tall);
      const how = await savePicture(blob, `${slideName}.jpg`);
      if (how !== 'cancelled') toast(how === 'shared' ? 'Picture ready.' : 'Picture saved with its words.');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Text on the picture" wide>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* On the phone the picture stays in view while the words are styled below it. */}
        <div className="sticky top-0 z-10 bg-card pb-2 md:static md:pb-0">
          <div
            className={`relative mx-auto w-full overflow-hidden rounded-xl bg-paper-2 ${tall ? 'aspect-[9/16] max-w-[min(100%,calc(40vh*0.5625))] md:max-w-[min(100%,calc(60vh*0.5625))]' : 'aspect-[4/5] max-w-[min(100%,calc(40vh*0.8))] md:max-w-[min(100%,calc(60vh*0.8))]'}`}
          >
            <AssetImage id={assetId} className="absolute inset-0 h-full w-full object-cover" />
            <TextOnPicture layers={layers} selected={selected} onSelect={setSelected} onMove={(id, x, y) => update(id, { x, y })} />
          </div>
          <p className="mt-2 text-center text-xs text-muted">Drag the words to place them. Tap the picture to unselect.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button type="button" className="btn" onClick={add}>
              <Plus size={16} /> Add text
            </button>
            <button type="button" className="btn-primary" disabled={!layers.length || saving || !asset} onClick={() => void save()}>
              <Download size={16} /> {saving ? 'Saving…' : 'Save picture'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {!current ? (
            <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
              {layers.length ? 'Tap some words on the picture to style them.' : 'Add text to start.'}
            </p>
          ) : (
            <>
              <textarea
                className="input font-serif text-lg"
                rows={2}
                aria-label="Words"
                value={current.text}
                onChange={(e) => set({ text: e.target.value })}
              />

              <fieldset>
                <legend className="label">Brand looks</legend>
                <div className="flex flex-wrap gap-1.5">
                  {TEXT_LOOKS.map((look) => (
                    <button key={look.id} type="button" className="btn min-h-9 px-3 text-sm" onClick={() => set(lookFor(look.id, world))}>
                      {look.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="label">Font</legend>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {FONT_ORDER.map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={current.font === f}
                      title={TEXT_FONTS[f].note}
                      className={`rounded-lg border px-2 py-2 text-left text-[17px] leading-tight ${current.font === f ? 'border-accent bg-accent/15' : 'border-line'}`}
                      style={{ fontFamily: fontFamily(f) }}
                      onClick={() => {
                        const [lo, hi] = TEXT_FONTS[f].weights;
                        set({ font: f, weight: Math.min(hi, Math.max(lo, current.weight)) });
                      }}
                    >
                      {TEXT_FONTS[f].label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="label">Colour</legend>
                <div className="space-y-2">
                  {BRAND_COLOURS.map((g) => (
                    <div key={g.group} className="flex flex-wrap items-center gap-1.5">
                      <span className="w-full text-[11px] text-muted sm:w-28">{g.group}</span>
                      {g.colours.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          aria-label={c.name}
                          title={c.name}
                          aria-pressed={current.colour.toLowerCase() === c.hex}
                          className={`h-8 w-8 rounded-full border-2 ${current.colour.toLowerCase() === c.hex ? 'border-accent ring-2 ring-accent/40' : 'border-line'}`}
                          style={{ background: c.hex }}
                          onClick={() => set({ colour: c.hex })}
                        />
                      ))}
                    </div>
                  ))}
                  <label className="flex items-center gap-2 text-sm text-ink-2">
                    <input type="color" value={current.colour} onChange={(e) => set({ colour: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" />
                    Any other colour
                  </label>
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="label">Size</span>
                  <input type="range" min={0.025} max={0.18} step={0.002} value={current.size} onChange={(e) => set({ size: Number(e.target.value) })} className="w-full" />
                </label>
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
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Toggle on={current.align === 'left'} label="Align left" onClick={() => set({ align: 'left' })}>
                  <AlignLeft size={16} />
                </Toggle>
                <Toggle on={current.align === 'center'} label="Centre" onClick={() => set({ align: 'center' })}>
                  <AlignCenter size={16} />
                </Toggle>
                <Toggle on={current.align === 'right'} label="Align right" onClick={() => set({ align: 'right' })}>
                  <AlignRight size={16} />
                </Toggle>
                <Toggle on={current.weight >= 650} label="Bold" onClick={() => set({ weight: current.weight >= 650 ? 500 : Math.min(800, TEXT_FONTS[current.font].weights[1]) })}>
                  <Bold size={16} />
                </Toggle>
                <Toggle on={current.italic} label="Italic" onClick={() => set({ italic: !current.italic })}>
                  <Italic size={16} />
                </Toggle>
                <Toggle on={current.caps} label="Capitals" onClick={() => set({ caps: !current.caps })}>
                  <CaseUpper size={16} />
                </Toggle>
                <Toggle on={current.shadow} label="Soft shadow" onClick={() => set({ shadow: !current.shadow })}>
                  <SunDim size={16} />
                </Toggle>
                <Toggle
                  on={!!current.backing}
                  label="Box behind the words"
                  onClick={() => set(current.backing ? { backing: null } : { backing: readableOn(current.colour) === '#1a1410' ? '#1a1410' : '#f6efe2', shadow: false })}
                >
                  <Square size={16} />
                </Toggle>
              </div>
              {current.backing && (
                <label className="flex items-center gap-2 text-sm text-ink-2">
                  <input type="color" value={current.backing} onChange={(e) => set({ backing: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" />
                  Box colour
                </label>
              )}

              <div className="flex gap-2 border-t border-line pt-3">
                <button type="button" className="btn" onClick={duplicate}>
                  <Copy size={15} /> Duplicate
                </button>
                <button type="button" className="btn-ghost ml-auto text-seed" onClick={remove}>
                  <Trash2 size={15} /> Remove
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
