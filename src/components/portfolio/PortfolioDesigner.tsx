import { useMemo, useState } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, Eye, GripVertical, ImagePlus, LayoutGrid, Monitor, Smartphone, Type } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BuiltPortfolio } from '../../portfolio/usePortfolioSnapshot';
import { moveItem, type Portfolio, type PortfolioItem, type SnapshotItem } from '../../portfolio/model';
import { PortfolioView } from '../../portfolio/PortfolioView';
import './portfolio-designer.css';

type Props = {
  portfolio: Portfolio;
  built: BuiltPortfolio;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  onChange: (patch: Partial<Portfolio>) => void;
  onChangeItem: (id: string, patch: Partial<PortfolioItem>) => void;
  onExit: () => void;
};

function SortableBlock({
  item, snapshot, image, selected, onSelect,
}: {
  item: PortfolioItem;
  snapshot?: SnapshotItem;
  image?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridColumn: item.layoutSpan === 2 ? 'span 2' : 'span 1',
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 2 : 0,
  };
  const title = item.kind === 'heading' ? item.heading || 'Section heading' : item.heading || snapshot?.title || 'Portfolio item';
  return (
    <article ref={setNodeRef} style={style} className={`pfd-block ${item.layoutSpan === 2 ? 'pfd-block--wide' : ''} ${selected ? 'is-selected' : ''}`}>
      <button type="button" className="pfd-drag" aria-label={`Drag ${title}`} {...attributes} {...listeners}>
        <GripVertical size={17} />
      </button>
      <button type="button" className="pfd-block-content" onClick={onSelect} aria-pressed={selected}>
        {item.kind === 'heading' ? (
          <div className="pfd-heading-preview"><span>SECTION</span><strong>{title}</strong></div>
        ) : (
          <>
            {image && <img className={`pfd-image pfd-image--${item.imageShape ?? 'natural'}`} src={image} alt={snapshot?.image?.alt ?? ''} />}
            <div className="pfd-block-copy">
              <span className="pfd-kind">{snapshot?.label ?? item.kind}</span>
              <strong>{title}</strong>
              {snapshot?.description && <p>{snapshot.description}</p>}
              {snapshot?.subtitle && <small>{snapshot.subtitle}</small>}
            </div>
          </>
        )}
      </button>
      <span className="pfd-block-index">{item.kind === 'heading' ? 'Section' : item.kind === 'project' ? 'Project' : item.kind === 'work' ? 'Work' : 'Piece'}</span>
    </article>
  );
}

export function PortfolioDesigner({ portfolio, built, saveState, onChange, onChangeItem, onExit }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(portfolio.items.find((i) => i.kind !== 'heading')?.id ?? portfolio.items[0]?.id ?? null);
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const snapshots = useMemo(
    () => new Map(built.snapshot.sections.flatMap((section) => section.items.map((item) => [item.key, item] as const))),
    [built.snapshot],
  );
  const selected = portfolio.items.find((item) => item.id === selectedId) ?? null;
  const selectedSnapshot = selected ? snapshots.get(selected.id) : undefined;
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = portfolio.items.findIndex((item) => item.id === active.id);
    const to = portfolio.items.findIndex((item) => item.id === over.id);
    onChange({ items: moveItem(portfolio.items, from, to) });
  };

  return (
    <div className="pfd-shell">
      <header className="pfd-toolbar">
        <button type="button" className="btn-ghost" onClick={onExit}><ArrowLeft size={16} /> Back to portfolio settings</button>
        <div className="pfd-toolbar-center">
          <span className="pfd-live-dot" />
          <span>{saveState === 'saving' ? 'Saving changes…' : saveState === 'error' ? 'Could not save' : 'Design mode'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="pfd-device-switch" role="group" aria-label="Canvas preview size">
            <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Monitor size={16} /> <span>Desktop</span></button>
            <button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')}><Smartphone size={16} /> <span>Phone</span></button>
          </div>
          <Link to={`/portfolios/${portfolio.id}/preview`} className="btn-primary"><Eye size={16} /> Preview</Link>
        </div>
      </header>

      <div className="pfd-workspace">
        <aside className="pfd-toolbox">
          <p className="pfd-panel-eyebrow">YOUR PAGE</p>
          <h1>Design your portfolio</h1>
          <p className="pfd-help">Your page has been assembled from your YOUrigin content. Drag the pieces to arrange them, then select anything to edit it.</p>

          <div className="pfd-panel-section">
            <label className="pfd-label" htmlFor="pfd-page-title">Portfolio title</label>
            <input id="pfd-page-title" className="input" value={portfolio.title} onChange={(e) => onChange({ title: e.target.value })} />
            <label className="pfd-label" htmlFor="pfd-owner">Your name</label>
            <input id="pfd-owner" className="input" value={portfolio.ownerName} onChange={(e) => onChange({ ownerName: e.target.value })} placeholder="Your name" />
            <label className="pfd-label" htmlFor="pfd-line">A line about you</label>
            <input id="pfd-line" className="input" value={portfolio.ownerLine} onChange={(e) => onChange({ ownerLine: e.target.value })} placeholder="Designer, maker, founder…" />
            <label className="pfd-label" htmlFor="pfd-intro">Introduction text</label>
            <textarea id="pfd-intro" className="input min-h-28 resize-y" value={portfolio.intro} onChange={(e) => onChange({ intro: e.target.value })} placeholder="A few words to introduce yourself…" />
          </div>

          <div className="pfd-panel-section">
            <div className="flex items-center justify-between gap-2">
              <p className="pfd-panel-eyebrow">SELECTED ELEMENT</p>
              <span className="text-xs text-muted">{selected ? selected.kind : 'None'}</span>
            </div>
            {!selected ? <p className="pfd-help">Select an item on the page to edit it.</p> : selected.kind === 'heading' ? (
              <>
                <label className="pfd-label" htmlFor="pfd-heading">Section heading</label>
                <input id="pfd-heading" className="input" value={selected.heading} onChange={(e) => onChangeItem(selected.id, { heading: e.target.value })} />
              </>
            ) : (
              <>
                <label className="pfd-label" htmlFor="pfd-item-title">Text box · Title</label>
                <input id="pfd-item-title" className="input" value={selected.heading} placeholder={selectedSnapshot?.title ?? 'Title'} onChange={(e) => onChangeItem(selected.id, { heading: e.target.value })} />
                <label className="pfd-label" htmlFor="pfd-item-description">Text box · Description</label>
                <textarea id="pfd-item-description" className="input min-h-24 resize-y" value={selected.description} onChange={(e) => onChangeItem(selected.id, { description: e.target.value })} placeholder="Add a description…" />
                <label className="pfd-label" htmlFor="pfd-span">Element width</label>
                <select id="pfd-span" className="input" value={selected.layoutSpan ?? 1} onChange={(e) => onChangeItem(selected.id, { layoutSpan: Number(e.target.value) as 1 | 2 })}>
                  <option value={1}>Standard · one column</option>
                  <option value={2}>Wide · two columns</option>
                </select>
                {selectedSnapshot?.image && (
                  <>
                    <label className="pfd-label" htmlFor="pfd-image-shape">Image shape</label>
                    <select id="pfd-image-shape" className="input" value={selected.imageShape ?? 'natural'} onChange={(e) => onChangeItem(selected.id, { imageShape: e.target.value as PortfolioItem['imageShape'] })}>
                      <option value="natural">Original proportions</option>
                      <option value="square">Square</option>
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </>
                )}
              </>
            )}
          </div>

          <div className="pfd-panel-section">
            <p className="pfd-panel-eyebrow">QUICK TOOLS</p>
            <div className="pfd-tool-row"><LayoutGrid size={17} /><span>Drag to rearrange sections and content</span></div>
            <div className="pfd-tool-row"><ImagePlus size={17} /><span>Choose image crops and card widths</span></div>
            <div className="pfd-tool-row"><Type size={17} /><span>Edit text directly in the selected element</span></div>
          </div>
        </aside>

        <main className="pfd-stage-wrap">
          <div className={`pfd-stage pfd-stage--${device}`}>
            <div className="pfd-stage-topline"><span>LIVE PAGE CANVAS</span><span>{device === 'desktop' ? 'Desktop layout' : 'Phone layout'}</span></div>
            <div className="pfd-page">
              <div className="pfd-hero">
                <p className="pfd-kicker">{portfolio.title}</p>
                <h2>{portfolio.ownerName || 'Your name'}</h2>
                {portfolio.ownerLine && <p className="pfd-owner-line">{portfolio.ownerLine}</p>}
                {portfolio.intro && <p className="pfd-intro">{portfolio.intro}</p>}
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={portfolio.items.map((item) => item.id)} strategy={rectSortingStrategy}>
                  <div className="pfd-grid">
                    {portfolio.items.map((item) => (
                      <SortableBlock
                        key={item.id}
                        item={item}
                        snapshot={snapshots.get(item.id)}
                        image={snapshots.get(item.id)?.image ? built.resolveImage(snapshots.get(item.id)!.image!.ref) : undefined}
                        selected={selectedId === item.id}
                        onSelect={() => setSelectedId(item.id)}
                      />
                    ))}
                    {portfolio.items.length === 0 && <p className="pfd-empty">Add Projects, Works or pieces from your portfolio settings.</p>}
                  </div>
                </SortableContext>
              </DndContext>
              <footer className="pfd-footer"><span>{portfolio.ownerName}</span><span>Made with YOUrigin</span></footer>
            </div>
          </div>
          <p className="pfd-stage-note">Changes save automatically. Your original Projects and Works are never altered.</p>
        </main>
      </div>
    </div>
  );
}
