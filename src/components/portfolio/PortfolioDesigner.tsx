import { useMemo, useState } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertCircle, ArrowLeft, Check, Eye, EyeOff, GripVertical, LayoutGrid, Loader2, Monitor, Plus, Smartphone, Trash2, Type } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BuiltPortfolio } from '../../portfolio/usePortfolioSnapshot';
import { LIMITS, headingItem, resolveItem, type Portfolio, type PortfolioItem, type PortfolioSources, type SnapshotItem } from '../../portfolio/model';
import { PortfolioView } from '../../portfolio/PortfolioView';
import { updateProject } from '../../db/projectRecords';
import { removeAssetIfUnused } from '../../db/assets';
import type { SaveState } from '../../hooks/useAutosave';
import { CoverPicker } from '../CoverPicker';
import { AddItemsDialog } from './AddItemsDialog';
import './portfolio-designer.css';

type Props = {
  portfolio: Portfolio;
  built: BuiltPortfolio;
  saveState: SaveState;
  onChange: (patch: Partial<Portfolio>) => void;
  onChangeItem: (id: string, patch: Partial<PortfolioItem>) => void;
  onRetrySave: () => void;
  onExit: () => void;
};

type Device = 'desktop' | 'phone';
type Mode = 'arrange' | 'preview';

/** Moves one item to where another one is. Ids that aren't in the list leave it unchanged. */
export function reorderById(items: PortfolioItem[], activeId: string, overId: string): PortfolioItem[] {
  const from = items.findIndex((i) => i.id === activeId);
  const to = items.findIndex((i) => i.id === overId);
  if (from === -1 || to === -1 || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Puts a new item just after the selected one, or at the end. */
export function insertAfter(items: PortfolioItem[], afterId: string | null, item: PortfolioItem): PortfolioItem[] {
  const at = afterId ? items.findIndex((i) => i.id === afterId) : -1;
  if (at === -1) return [...items, item];
  return [...items.slice(0, at + 1), item, ...items.slice(at + 1)];
}

/** The picture the source itself has, whether or not this portfolio shows it. */
function sourcePicture(item: PortfolioItem, sources: PortfolioSources): { has: boolean; projectId?: string; cover?: string } {
  const r = resolveItem(item, sources);
  if (r.project) return { has: !!r.project.coverAssetId, projectId: r.project.id, cover: r.project.coverAssetId };
  if (r.work) return { has: !!r.work.coverAssetId };
  if (r.piece) return { has: r.piece.type === 'image' && !!r.piece.assetId };
  return { has: false };
}

const KIND_LABEL: Record<PortfolioItem['kind'], string> = { heading: 'Text section', project: 'Project', work: 'Work', piece: 'Piece' };

function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === 'error') {
    return (
      <span className="pfd-save pfd-save--error" role="alert">
        <AlertCircle size={14} aria-hidden="true" /> Not saved
        <button type="button" onClick={onRetry}>Try again</button>
      </span>
    );
  }
  return (
    <span className="pfd-save" role="status" aria-live="polite">
      {state === 'saved' ? <Check size={14} aria-hidden="true" /> : <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
      {state === 'saved' ? 'Saved' : 'Saving…'}
    </span>
  );
}

function SortableBlock({ item, snapshot, image, hiddenPicture, selected, onSelect }: {
  item: PortfolioItem;
  snapshot?: SnapshotItem;
  image?: string;
  hiddenPicture: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 3 : undefined };
  const isText = item.kind === 'heading';
  const title = isText ? item.heading.trim() || 'Untitled section' : item.heading.trim() || snapshot?.title || 'Missing';
  const wide = isText || item.layoutSpan === 2;
  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`pfd-block${wide ? ' pfd-block--wide' : ''}${isText ? ' pfd-block--text' : ''}${selected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}${!isText && !snapshot ? ' is-missing' : ''}`}
    >
      <button type="button" className="pfd-drag" aria-label={`Move ${title}`} {...attributes} {...listeners}>
        <GripVertical size={16} aria-hidden="true" />
      </button>
      <button type="button" className="pfd-block-content" onClick={onSelect} aria-pressed={selected}>
        {isText ? (
          <span className="pfd-text">
            <strong>{title}</strong>
            {item.description.trim() && <span className="pfd-text-copy">{item.description}</span>}
          </span>
        ) : (
          <>
            {image && <span className={`pfd-figure pfd-figure--${item.imageShape ?? 'natural'}`}><img src={image} alt="" /></span>}
            {hiddenPicture && <span className="pfd-hidden-picture"><EyeOff size={14} aria-hidden="true" /> Picture hidden</span>}
            <span className="pfd-copy">
              <span className="pfd-kind">{snapshot?.label ?? KIND_LABEL[item.kind]}</span>
              <strong>{title}</strong>
              {snapshot ? snapshot.description && <span className="pfd-desc">{snapshot.description}</span> : <span className="pfd-desc">This was removed from your library, so it isn’t shown.</span>}
            </span>
          </>
        )}
      </button>
    </article>
  );
}

/**
 * The visual designer: the page on a canvas you arrange by dragging, with a
 * panel for whatever is selected. Everything written here belongs to this
 * portfolio only; Projects and Works keep their own titles and descriptions.
 * The one exception is a Project's cover picture, which is the Project's own.
 */
export function PortfolioDesigner({ portfolio, built, saveState, onChange, onChangeItem, onRetrySave, onExit }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(portfolio.items.find((i) => i.kind !== 'heading')?.id ?? portfolio.items[0]?.id ?? null);
  const [device, setDevice] = useState<Device>(() => (window.innerWidth < 700 ? 'phone' : 'desktop'));
  const [mode, setMode] = useState<Mode>('arrange');
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const snapshots = useMemo(
    () => new Map(built.snapshot.sections.flatMap((section) => section.items.map((item) => [item.key, item] as const))),
    [built.snapshot],
  );
  const already = useMemo(() => new Set(portfolio.items.map((i) => `${i.kind}:${i.sourceId}`)), [portfolio.items]);
  const selected = portfolio.items.find((item) => item.id === selectedId) ?? null;
  const selectedSnapshot = selected ? snapshots.get(selected.id) : undefined;
  const picture = selected && selected.kind !== 'heading' ? sourcePicture(selected, built.sources) : null;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over) onChange({ items: reorderById(portfolio.items, String(active.id), String(over.id)) });
  };
  const addText = () => {
    const next = headingItem('');
    onChange({ items: insertAfter(portfolio.items, selectedId, next) });
    setSelectedId(next.id);
    setMode('arrange');
  };
  const remove = (id: string) => {
    const at = portfolio.items.findIndex((i) => i.id === id);
    const items = portfolio.items.filter((i) => i.id !== id);
    onChange({ items });
    setSelectedId(items[Math.min(at, items.length - 1)]?.id ?? null);
  };
  const setCover = async (projectId: string, previous: string | undefined, next: string | undefined) => {
    await updateProject(projectId, { coverAssetId: next });
    if (previous && previous !== next) await removeAssetIfUnused(previous);
  };

  return (
    <div className="pfd-shell">
      <header className="pfd-toolbar">
        <button type="button" className="btn-ghost" onClick={onExit}><ArrowLeft size={16} /> Settings</button>
        <SaveStatus state={saveState} onRetry={onRetrySave} />
        <div className="pfd-switch" role="group" aria-label="Canvas">
          <button type="button" aria-pressed={mode === 'arrange'} onClick={() => setMode('arrange')}><LayoutGrid size={15} aria-hidden="true" /> <span>Arrange</span></button>
          <button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}><Eye size={15} aria-hidden="true" /> <span>Preview</span></button>
        </div>
        <div className="pfd-switch" role="group" aria-label="Screen size">
          <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Monitor size={15} aria-hidden="true" /> <span>Desktop</span></button>
          <button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')}><Smartphone size={15} aria-hidden="true" /> <span>Phone</span></button>
        </div>
        <Link to={`/portfolios/${portfolio.id}/preview`} state={{ back: `/portfolios/${portfolio.id}?design=1` }} className="btn-primary pfd-visitor"><Eye size={16} /> <span>As a visitor</span></Link>
      </header>

      <div className="pfd-workspace">
        <aside className="pfd-panel" aria-label="Edit">
          {selected ? (
            <section className="pfd-group" aria-labelledby="pfd-selected">
              <div className="pfd-group-head">
                <h2 id="pfd-selected">{KIND_LABEL[selected.kind]}</h2>
                <button type="button" className="pfd-icon" onClick={() => setSelectedId(null)} aria-label="Back to the page details">Page</button>
              </div>
              {selected.kind === 'heading' ? (
                <>
                  <label className="label" htmlFor="pfd-heading">Heading</label>
                  <input id="pfd-heading" className="input" value={selected.heading} maxLength={LIMITS.heading} placeholder="Untitled section" onChange={(e) => onChangeItem(selected.id, { heading: e.target.value })} />
                  <label className="label" htmlFor="pfd-section-copy">Text</label>
                  <textarea id="pfd-section-copy" className="input min-h-32 resize-y" value={selected.description} maxLength={LIMITS.description} onChange={(e) => onChangeItem(selected.id, { description: e.target.value })} />
                </>
              ) : (
                <>
                  <label className="label" htmlFor="pfd-item-title">Title</label>
                  <input id="pfd-item-title" className="input" value={selected.heading} maxLength={LIMITS.heading} placeholder={selectedSnapshot?.title ?? ''} onChange={(e) => onChangeItem(selected.id, { heading: e.target.value })} />
                  <label className="label" htmlFor="pfd-item-description">Description</label>
                  <textarea id="pfd-item-description" className="input min-h-32 resize-y" value={selected.description} maxLength={LIMITS.description} onChange={(e) => onChangeItem(selected.id, { description: e.target.value })} />
                  <p className="pfd-note">Only for this portfolio. The {selected.kind === 'project' ? 'Project' : selected.kind === 'work' ? 'Work' : 'piece'} itself stays as it is.</p>

                  {selected.kind === 'project' && picture?.projectId && (
                    <CoverPicker
                      label="Project cover"
                      value={picture.cover}
                      alt={selected.alt}
                      onChange={(next) => setCover(picture.projectId!, picture.cover, next)}
                    />
                  )}
                  {picture?.has && (
                    <>
                      <label className="pfd-check">
                        <input type="checkbox" checked={selected.image !== 'none'} onChange={(e) => onChangeItem(selected.id, { image: e.target.checked ? 'default' : 'none' })} />
                        Show the picture here
                      </label>
                      {selected.image !== 'none' && (
                        <>
                          <label className="label" htmlFor="pfd-image-shape">Picture shape</label>
                          <select id="pfd-image-shape" className="input" value={selected.imageShape ?? 'natural'} onChange={(e) => onChangeItem(selected.id, { imageShape: e.target.value as PortfolioItem['imageShape'] })}>
                            <option value="natural">As it is</option>
                            <option value="landscape">Wide</option>
                            <option value="square">Square</option>
                            <option value="portrait">Tall</option>
                          </select>
                          <label className="label" htmlFor="pfd-alt">Describe the picture <span className="font-normal text-muted">(for screen readers)</span></label>
                          <input id="pfd-alt" className="input" value={selected.alt} maxLength={LIMITS.alt} onChange={(e) => onChangeItem(selected.id, { alt: e.target.value })} />
                        </>
                      )}
                    </>
                  )}

                  <fieldset>
                    <legend className="label">Card</legend>
                    <div className="pfd-switch pfd-switch--full">
                      <button type="button" aria-pressed={(selected.layoutSpan ?? 1) === 1} onClick={() => onChangeItem(selected.id, { layoutSpan: 1 })}>Standard</button>
                      <button type="button" aria-pressed={selected.layoutSpan === 2} onClick={() => onChangeItem(selected.id, { layoutSpan: 2 })}>Wide</button>
                    </div>
                  </fieldset>

                  {selected.kind === 'project' && (
                    <>
                      <label className="label" htmlFor="pfd-url">Link to the live project</label>
                      <input id="pfd-url" className="input" type="url" inputMode="url" placeholder="https://" value={selected.destinationUrl ?? ''} onChange={(e) => onChangeItem(selected.id, { destinationUrl: e.target.value })} />
                    </>
                  )}
                </>
              )}
              <button type="button" className="btn-ghost pfd-remove" onClick={() => remove(selected.id)}>
                <Trash2 size={15} aria-hidden="true" /> {selected.kind === 'heading' ? 'Remove this section' : 'Take off this page'}
              </button>
            </section>
          ) : (
            <section className="pfd-group" aria-labelledby="pfd-page">
              <div className="pfd-group-head"><h2 id="pfd-page">Page</h2></div>
              <label className="label" htmlFor="pfd-page-title">Portfolio title</label>
              <input id="pfd-page-title" className="input" value={portfolio.title} maxLength={LIMITS.title} onChange={(e) => onChange({ title: e.target.value })} />
              <label className="label" htmlFor="pfd-owner">Your name</label>
              <input id="pfd-owner" className="input" value={portfolio.ownerName} maxLength={LIMITS.ownerName} autoComplete="name" onChange={(e) => onChange({ ownerName: e.target.value })} />
              <label className="label" htmlFor="pfd-line">A line under your name</label>
              <input id="pfd-line" className="input" value={portfolio.ownerLine} maxLength={LIMITS.ownerLine} onChange={(e) => onChange({ ownerLine: e.target.value })} />
              <label className="label" htmlFor="pfd-intro">Introduction</label>
              <textarea id="pfd-intro" className="input min-h-40 resize-y font-serif" value={portfolio.intro} maxLength={LIMITS.intro} onChange={(e) => onChange({ intro: e.target.value })} />
            </section>
          )}

          <section className="pfd-group pfd-add" aria-label="Add">
            <button type="button" className="btn" onClick={addText}><Type size={15} aria-hidden="true" /> Text section</button>
            <button type="button" className="btn" onClick={() => setAdding(true)}><Plus size={15} aria-hidden="true" /> Projects, Works, pieces</button>
          </section>
        </aside>

        <main className="pfd-stage-wrap">
          <div className={`pfd-stage pfd-stage--${device}`}>
            {mode === 'preview' ? (
              <div className="pfd-frame">
                <PortfolioView snapshot={built.snapshot} resolveImage={built.resolveImage} />
              </div>
            ) : (
              <div className={`pf pf--${portfolio.theme} pfd-frame pfd-canvas`}>
                <button type="button" className={`pfd-hero${selectedId === null ? ' is-selected' : ''}`} onClick={() => setSelectedId(null)} aria-pressed={selectedId === null}>
                  {portfolio.title && <span className="pf-kicker">{portfolio.title}</span>}
                  <span className="pfd-name">{portfolio.ownerName || 'Your name'}</span>
                  {portfolio.ownerLine && <span className="pfd-line">{portfolio.ownerLine}</span>}
                  {portfolio.intro ? <span className="pfd-intro">{portfolio.intro}</span> : <span className="pfd-intro pfd-placeholder">An introduction, in your own words.</span>}
                </button>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={portfolio.items.map((item) => item.id)} strategy={rectSortingStrategy}>
                    <div className="pfd-grid">
                      {portfolio.items.map((item) => {
                        const snap = snapshots.get(item.id);
                        const pic = item.kind !== 'heading' && item.image === 'none' && sourcePicture(item, built.sources).has;
                        return (
                          <SortableBlock
                            key={item.id}
                            item={item}
                            snapshot={snap}
                            image={snap?.image ? built.resolveImage(snap.image.ref) : undefined}
                            hiddenPicture={pic}
                            selected={selectedId === item.id}
                            onSelect={() => setSelectedId(item.id)}
                          />
                        );
                      })}
                      {portfolio.items.length === 0 && <p className="pfd-empty">Nothing on this page yet.</p>}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>
        </main>
      </div>

      <AddItemsDialog
        open={adding}
        onClose={() => setAdding(false)}
        already={already}
        onAdd={(items) => {
          onChange({ items: [...portfolio.items, ...items] });
          if (items[0]) setSelectedId(items[0].id);
        }}
      />
    </div>
  );
}
