import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import '@fontsource-variable/cormorant-garamond/wght.css';
import '@fontsource-variable/cormorant-garamond/wght-italic.css';
import '@fontsource-variable/playfair-display/wght.css';
import '@fontsource-variable/playfair-display/wght-italic.css';
import '@fontsource-variable/josefin-sans/wght.css';
import '@fontsource-variable/caveat/wght.css';
import { clamp, cssFont, layoutLayer, TEXT_FONTS, type TextLayer } from '../../posts/textLayers';

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
 * and the full slide match. With `onChange`, boxes can be tapped to select and dragged.
 */
export function TextOnPicture({
  layers,
  selected,
  onSelect,
  onMove,
}: {
  layers: TextLayer[] | undefined;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, x: number, y: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
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
    drag.current = { id: l.id, dx: l.x - (e.clientX - r.left) / r.width, dy: l.y - (e.clientY - r.top) / r.height };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || !box.current) return;
    const r = box.current.getBoundingClientRect();
    onMove?.(d.id, clamp((e.clientX - r.left) / r.width + d.dx, 0, 1), clamp((e.clientY - r.top) / r.height + d.dy, 0, 1));
  };

  return (
    <div
      ref={box}
      className={`absolute inset-0 select-none overflow-hidden ${editable ? 'touch-none' : 'pointer-events-none'}`}
      onPointerDown={editable ? () => onSelect?.(null) : undefined}
    >
      {size.w > 0 &&
        (layers ?? []).map((l) => {
          const lay = layoutLayer(l, size.w, size.h, measurer(l, c));
          const base = baselineIn(l, lay.px, lay.lh, c);
          const m = metricsOf(l, lay.px, c);
          const track = l.tracking * lay.px;
          return (
            <div
              key={l.id}
              role={editable ? 'button' : undefined}
              aria-label={editable ? `Text: ${l.text}` : undefined}
              onPointerDown={(e) => down(e, l)}
              onPointerMove={move}
              onPointerUp={() => (drag.current = null)}
              className={editable ? `cursor-move ${selected === l.id ? 'outline-dashed outline-2 outline-offset-2 outline-white/90' : ''}` : ''}
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
              {lay.lines.map((line, i) => {
                const x = l.align === 'left' ? lay.pad : l.align === 'right' ? lay.box.width - lay.pad - lay.widths[i] : (lay.box.width - lay.widths[i]) / 2;
                return (
                  <span
                    key={i}
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
      const x = l.align === 'left' ? lay.pad : l.align === 'right' ? lay.box.width - lay.pad - lay.widths[i] : (lay.box.width - lay.widths[i]) / 2;
      g.fillText(line, lay.box.left + x, lay.box.top + lay.pad + i * lay.lh + base);
    });
    g.restore();
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture couldn’t be saved.'))), 'image/jpeg', 0.92));
}

/** Font names for a font chip, so each one shows in its own lettering. */
export const fontFamily = (f: TextLayer['font']) => `"${TEXT_FONTS[f].family}"`;
