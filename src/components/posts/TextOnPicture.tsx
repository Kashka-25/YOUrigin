import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import '@fontsource-variable/cormorant-garamond/wght.css';
import '@fontsource-variable/cormorant-garamond/wght-italic.css';
import '@fontsource-variable/playfair-display/wght.css';
import '@fontsource-variable/playfair-display/wght-italic.css';
import '@fontsource-variable/josefin-sans/wght.css';
import '@fontsource-variable/caveat/wght.css';
import { clamp, cssFont, HIGHLIGHT, layoutLayer, TEXT_FONTS, UNDERLINE, withOpacity, type TextLayer } from '../../posts/textLayers';

let measureCtx: CanvasRenderingContext2D | null = null;
function ctx(): CanvasRenderingContext2D | null {
  if (!measureCtx && typeof document !== 'undefined') measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

/** Measures text the same way the saved picture does. */
function measurer(l: TextLayer, c: CanvasRenderingContext2D | null) {
  return (s: string, px: number) => {
    if (!c) return s.length * px * 0.5;
    c.font = cssFont(l, px);
    return c.measureText(s).width;
  };
}

/** Where the baseline sits inside a line, matching how the browser centres text in a line box. */
function baselineIn(l: TextLayer, px: number, lh: number, c: CanvasRenderingContext2D | null): number {
  if (!c) return lh / 2 + px * 0.35;
  c.font = cssFont(l, px);
  const m = c.measureText('Hg');
  const asc = m.fontBoundingBoxAscent ?? px * 0.8;
  const desc = m.fontBoundingBoxDescent ?? px * 0.2;
  return (lh - (asc + desc)) / 2 + asc;
}

/** Loads the fonts these layers use; re-renders once they are ready, so widths are right. */
export async function loadLayerFonts(layers: TextLayer[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(layers.map((l) => document.fonts.load(cssFont(l, 40), l.text || 'A').catch(() => [])));
}

function useFontsReady(layers: TextLayer[]): number {
  const [tick, setTick] = useState(0);
  const key = layers.map((l) => `${l.font}${l.weight}${l.italic}`).join('|');
  useEffect(() => {
    let live = true;
    void loadLayerFonts(layers).then(() => live && setTick((t) => t + 1));
    return () => {
      live = false;
    };
    // the fonts in use are what matter, not the text
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return tick;
}

/**
 * The words on a picture, laid over it. Sized from the slide's own width, so a thumbnail
 * and the full slide match. With `onMove`, boxes can be tapped to select and dragged; with
 * `onEditText`, double-clicking or holding the words types straight onto the picture.
 */
export function TextOnPicture({
  layers,
  selected,
  onSelect,
  onMove,
  onEditText,
  editing: editingProp,
  onEditingChange,
}: {
  layers: TextLayer[] | undefined;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onEditText?: (id: string, text: string) => void;
  /** Which words are open for typing, when the parent controls it. */
  editing?: string | null;
  onEditingChange?: (id: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const drag = useRef<{ id: string; dx: number; dy: number; x: number; y: number } | null>(null);
  const hold = useRef<number | null>(null);
  const [ownEditing, setOwnEditing] = useState<string | null>(null);
  const editing = editingProp !== undefined ? editingProp : ownEditing;
  const setEditing = (id: string | null) => (onEditingChange ? onEditingChange(id) : setOwnEditing(id));
  const stopHold = () => {
    if (hold.current !== null) window.clearTimeout(hold.current);
    hold.current = null;
  };
  const startEditing = (id: string) => {
    if (!onEditText) return;
    stopHold();
    drag.current = null;
    onSelect?.(id);
    setEditing(id);
  };
  useFontsReady(layers ?? []);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const c = ctx();
  const editable = !!onMove;

  const down = (e: PointerEvent, l: TextLayer) => {
    if (!editable) return;
    e.stopPropagation();
    onSelect?.(l.id);
    const r = box.current!.getBoundingClientRect();
    drag.current = { id: l.id, dx: l.x - (e.clientX - r.left) / r.width, dy: l.y - (e.clientY - r.top) / r.height, x: e.clientX, y: e.clientY };
    // holding still on the words opens them for typing
    stopHold();
    if (onEditText) hold.current = window.setTimeout(() => startEditing(l.id), 450);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* the pointer has already gone */
    }
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || !box.current) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) stopHold();
    else if (hold.current !== null) return;
    const r = box.current.getBoundingClientRect();
    onMove?.(d.id, clamp((e.clientX - r.left) / r.width + d.dx, 0, 1), clamp((e.clientY - r.top) / r.height + d.dy, 0, 1));
  };

  return (
    <div
      ref={box}
      className={`absolute inset-0 select-none overflow-hidden ${editable ? 'touch-none' : 'pointer-events-none'}`}
      onPointerDown={editable ? () => (setEditing(null), onSelect?.(null)) : undefined}
    >
      {size.w > 0 &&
        (layers ?? []).map((l) => {
          const lay = layoutLayer(l, size.w, size.h, measurer(l, c));
          const base = baselineIn(l, lay.px, lay.lh, c);
          const m = metricsOf(l, lay.px, c);
          const track = l.tracking * lay.px;
          const typing = editing === l.id;
          return (
            <div
              key={l.id}
              role={editable ? 'button' : undefined}
              aria-label={editable ? `Text: ${l.text}` : undefined}
              onPointerDown={(e) => (typing ? e.stopPropagation() : down(e, l))}
              onPointerMove={move}
              onPointerUp={() => {
                drag.current = null;
                stopHold();
              }}
              onPointerCancel={stopHold}
              onDoubleClick={() => startEditing(l.id)}
              onContextMenu={editable ? (e) => e.preventDefault() : undefined}
              className={editable ? `${typing ? '' : 'cursor-move'} ${selected === l.id ? 'outline-dashed outline-2 outline-offset-2 outline-white/90' : ''}` : ''}
              style={{
                position: 'absolute',
                left: lay.box.left,
                top: lay.box.top,
                width: lay.box.width,
                height: lay.box.height,
                background: l.backing ?? undefined,
                borderRadius: l.backing ? lay.px * 0.3 : undefined,
              }}
            >
              {typing && (
                <textarea
                  ref={(el) => {
                    if (el && document.activeElement !== el) {
                      el.focus();
                      el.setSelectionRange(el.value.length, el.value.length);
                    }
                  }}
                  aria-label="Words on the picture"
                  value={l.text}
                  onChange={(e) => onEditText?.(l.id, e.target.value)}
                  onBlur={() => setEditing(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      e.preventDefault();
                      setEditing(null);
                    }
                  }}
                  className="absolute inset-0 resize-none overflow-hidden border-0 bg-black/25 outline-none"
                  style={{
                    padding: lay.pad,
                    font: cssFont(l, lay.px),
                    lineHeight: `${lay.lh}px`,
                    letterSpacing: track ? `${track}px` : undefined,
                    textAlign: l.align,
                    textTransform: l.caps ? 'uppercase' : undefined,
                    color: l.colour,
                    caretColor: l.colour,
                    borderRadius: l.backing ? lay.px * 0.3 : undefined,
                  }}
                />
              )}
              {!typing && lay.lines.map((line, i) => {
                const x = l.align === 'left' ? lay.pad : l.align === 'right' ? lay.box.width - lay.pad - lay.widths[i] : (lay.box.width - lay.widths[i]) / 2;
                const baseline = lay.pad + i * lay.lh + base;
                return (
                  <span key={i}>
                  {l.highlight && line.trim() && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: x - HIGHLIGHT.spill * lay.px,
                        top: baseline - HIGHLIGHT.above * lay.px,
                        width: lay.widths[i] + 2 * HIGHLIGHT.spill * lay.px,
                        height: HIGHLIGHT.height * lay.px,
                        background: withOpacity(l.highlight, HIGHLIGHT.opacity),
                        borderRadius: lay.px * 0.12,
                      }}
                    />
                  )}
                  <span
                    aria-hidden={editable || undefined}
                    style={{
                      position: 'absolute',
                      left: x,
                      // a line box exactly ascent + descent tall puts the baseline at top + ascent, as on the canvas
                      top: lay.pad + i * lay.lh + base - m.asc,
                      height: m.asc + m.desc,
                      lineHeight: `${m.asc + m.desc}px`,
                      whiteSpace: 'pre',
                      font: cssFont(l, lay.px),
                      letterSpacing: track ? `${track}px` : undefined,
                      color: l.colour,
                      textShadow: l.shadow ? `0 ${lay.px * 0.04}px ${lay.px * 0.18}px rgba(0,0,0,.55)` : undefined,
                    }}
                  >
                    {line}
                  </span>
                  {l.underline && line.trim() && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        left: x,
                        top: baseline + UNDERLINE.below * lay.px,
                        width: lay.widths[i],
                        height: Math.max(1, UNDERLINE.thickness * lay.px),
                        background: l.colour,
                        boxShadow: l.shadow ? `0 ${lay.px * 0.04}px ${lay.px * 0.18}px rgba(0,0,0,.55)` : undefined,
                      }}
                    />
                  )}
                  </span>
                );
              })}
            </div>
          );
        })}
    </div>
  );
}

function metricsOf(l: TextLayer, px: number, c: CanvasRenderingContext2D | null): { asc: number; desc: number } {
  if (!c) return { asc: px * 0.8, desc: px * 0.2 };
  c.font = cssFont(l, px);
  const m = c.measureText('Hg');
  return { asc: m.fontBoundingBoxAscent ?? px * 0.8, desc: m.fontBoundingBoxDescent ?? px * 0.2 };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That picture couldn’t be read.'));
    img.src = src;
  });
}

/**
 * The finished slide as a picture for Instagram: the photo filling a 1080-wide 4:5
 * (or 9:16) frame, as it shows in YOUrigin, with the words drawn on top.
 */
export async function renderSlide(pictureUrl: string, layers: TextLayer[], tall: boolean): Promise<Blob> {
  const W = 1080;
  const H = tall ? 1920 : 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('This browser can’t draw pictures.');
  const img = await loadImage(pictureUrl);
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  await loadLayerFonts(layers);
  for (const l of layers) {
    const lay = layoutLayer(l, W, H, measurer(l, g));
    if (l.backing) {
      g.save();
      g.fillStyle = l.backing;
      g.beginPath();
      g.roundRect(lay.box.left, lay.box.top, lay.box.width, lay.box.height, lay.px * 0.3);
      g.fill();
      g.restore();
    }
    const base = baselineIn(l, lay.px, lay.lh, g);
    g.save();
    g.font = cssFont(l, lay.px);
    g.fillStyle = l.colour;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${l.tracking * lay.px}px`;
    if (l.shadow) {
      g.shadowColor = 'rgba(0,0,0,.55)';
      g.shadowBlur = lay.px * 0.18;
      g.shadowOffsetY = lay.px * 0.04;
    }
    lay.lines.forEach((line, i) => {
      const x = lay.box.left + (l.align === 'left' ? lay.pad : l.align === 'right' ? lay.box.width - lay.pad - lay.widths[i] : (lay.box.width - lay.widths[i]) / 2);
      const y = lay.box.top + lay.pad + i * lay.lh + base;
      if (l.highlight && line.trim()) {
        g.save();
        g.shadowColor = 'transparent';
        g.fillStyle = withOpacity(l.highlight, HIGHLIGHT.opacity);
        g.beginPath();
        g.roundRect(x - HIGHLIGHT.spill * lay.px, y - HIGHLIGHT.above * lay.px, lay.widths[i] + 2 * HIGHLIGHT.spill * lay.px, HIGHLIGHT.height * lay.px, lay.px * 0.12);
        g.fill();
        g.restore();
      }
      g.fillText(line, x, y);
      if (l.underline && line.trim()) g.fillRect(x, y + UNDERLINE.below * lay.px, lay.widths[i], Math.max(1, UNDERLINE.thickness * lay.px));
    });
    g.restore();
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture couldn’t be saved.'))), 'image/jpeg', 0.92));
}

/** Font names for a font chip, so each one shows in its own lettering. */
export const fontFamily = (f: TextLayer['font']) => `"${TEXT_FONTS[f].family}"`;
