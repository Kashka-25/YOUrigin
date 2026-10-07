import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Plus, Trash2, X, Check } from 'lucide-react';
import type { BookEntry, ContentItem, Section } from '../../domain/types';
import type { SectionProgress } from '../../domain/progress';
import { displayTitle } from '../../domain/text';
import { TYPE_LABEL } from '../../domain/constants';
import { addSection, deleteSection, insertIntoSection, moveEntry, removeEntries, renameSection, reorderSections } from '../../db/books';
import { StatusBadge } from '../ui';
import { useConfirm } from '../Modal';
import { collision, TRAY, type DragData } from './dnd';

interface Props {
  bookId: string;
  sections: Section[];
  entries: BookEntry[];
  contentById: Map<string, ContentItem>;
  sectionProgress: SectionProgress[];
  shelf: ReactNode;
  traySlot?: ReactNode;
}

/** Pure helper mirroring db.moveEntry, used for instant (optimistic) feedback. */
function applyMove(entries: BookEntry[], entryId: string, sectionId: string | null, index: number): BookEntry[] {
  const moving = entries.find((e) => e.id === entryId);
  if (!moving) return entries;
  const target = entries.filter((e) => e.sectionId === sectionId && e.id !== entryId).sort((a, b) => a.order - b.order);
  target.splice(Math.max(0, Math.min(index, target.length)), 0, { ...moving, sectionId });
  const reordered = new Map(target.map((e, order) => [e.id, { ...e, order }]));
  return entries.map((e) => reordered.get(e.id) ?? e);
}

export function StructureBoard({ bookId, sections, entries, contentById, sectionProgress, shelf, traySlot }: Props) {
  const confirm = useConfirm();
  // Local mirrors give instant feedback; the live query brings them back in sync.
  const [localSections, setLocalSections] = useState(sections);
  const [localEntries, setLocalEntries] = useState(entries);
  useEffect(() => setLocalSections([...sections].sort((a, b) => a.order - b.order)), [sections]);
  useEffect(() => setLocalEntries(entries), [entries]);
  const [active, setActive] = useState<DragData | null>(null);
  const [newSection, setNewSection] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // On touch, a short press starts a drag so normal scrolling still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const live = useMemo(() => localEntries.filter((e) => contentById.get(e.contentId) && !contentById.get(e.contentId)!.deletedAt), [localEntries, contentById]);
  const entriesOf = (sectionId: string | null) => live.filter((e) => e.sectionId === sectionId).sort((a, b) => a.order - b.order);

  const onDragStart = (e: DragStartEvent) => setActive(e.active.data.current as DragData);

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setActive(null);
    if (!over) return;
    const a = active.data.current as DragData;
    const o = over.data.current as DragData;
    if (a.type === 'section' && o?.type === 'section' && a.sectionId !== o.sectionId) {
      const ids = localSections.map((s) => s.id);
      const next = arrayMove(ids, ids.indexOf(a.sectionId), ids.indexOf(o.sectionId));
      setLocalSections(next.map((id, order) => ({ ...localSections.find((s) => s.id === id)!, order })));
      await reorderSections(bookId, next);
      return;
    }
    if (a.type !== 'entry' && a.type !== 'lib') return;
    let sectionId: string | null;
    let index: number;
    if (o?.type === 'entry') {
      sectionId = o.sectionId;
      index = entriesOf(sectionId).findIndex((e) => e.id === o.entryId);
    } else if (o?.type === 'zone') {
      sectionId = o.sectionId;
      index = entriesOf(sectionId).filter((e) => a.type !== 'entry' || e.id !== a.entryId).length;
    } else return;
    if (a.type === 'entry') {
      if (a.entryId === (o.type === 'entry' ? o.entryId : '')) return;
      setLocalEntries((prev) => applyMove(prev, a.entryId, sectionId, index));
      await moveEntry(a.entryId, sectionId, index);
    } else {
      await insertIntoSection(bookId, a.contentId, sectionId, index);
    }
  };

  const activeLabel = (() => {
    if (!active) return null;
    if (active.type === 'section') return localSections.find((s) => s.id === active.sectionId)?.title;
    if (active.type === 'entry') {
      const e = live.find((x) => x.id === active.entryId);
      const c = e && contentById.get(e.contentId);
      return c ? displayTitle(c) : null;
    }
    if (active.type === 'lib') {
      const c = contentById.get(active.contentId);
      return c ? displayTitle(c) : null;
    }
    return null;
  })();

  const moveTargets = [{ id: TRAY, title: 'Tray' }, ...localSections.map((s) => ({ id: s.id, title: s.title }))];

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Zone sectionId={null} title="Tray" hint="Claimed for this book, not yet placed. Drag pieces into sections.">
            {traySlot}
            <EntryList
              entries={entriesOf(null)}
              contentById={contentById}
              moveTargets={moveTargets}
              onMove={(id, target) => void moveEntry(id, target === TRAY ? null : target, 9999)}
            />
          </Zone>

          <SortableContext items={localSections.map((s) => 'section:' + s.id)} strategy={verticalListSortingStrategy}>
            {localSections.map((s) => (
              <SortableSection
                key={s.id}
                section={s}
                progress={sectionProgress.find((p) => p.id === s.id)}
                onRename={(t) => void renameSection(s.id, t)}
                onDelete={async () => {
                  const n = entriesOf(s.id).length;
                  const ok = await confirm({
                    title: `Remove section “${s.title}”?`,
                    message: n
                      ? `Its ${n} piece${n === 1 ? '' : 's'} will move to the tray. No writing is deleted.`
                      : 'This section is empty.',
                    confirmLabel: 'Remove section',
                  });
                  if (ok) await deleteSection(s.id);
                }}
              >
                <EntryList
                  entries={entriesOf(s.id)}
                  contentById={contentById}
                  moveTargets={moveTargets}
                  onMove={(id, target) => void moveEntry(id, target === TRAY ? null : target, 9999)}
                />
              </SortableSection>
            ))}
          </SortableContext>

          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              await addSection(bookId, newSection);
              setNewSection('');
            }}
          >
            <input className="input" placeholder="New section title" value={newSection} onChange={(e) => setNewSection(e.target.value)} aria-label="New section title" />
            <button type="submit" className="btn shrink-0" disabled={!newSection.trim()}>
              <Plus size={15} /> Add section
            </button>
          </form>
        </div>

        <div className="min-w-0">{shelf}</div>
      </div>

      <DragOverlay>
        {activeLabel ? (
          <div className="max-w-xs rounded-xl border border-accent bg-card px-3 py-2 font-serif text-base shadow-xl">{activeLabel}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Zone({ sectionId, title, hint, children }: { sectionId: string | null; title: string; hint: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'zone:' + (sectionId ?? TRAY), data: { type: 'zone', sectionId } satisfies DragData });
  return (
    <section ref={setNodeRef} className={`rounded-2xl border border-dashed p-4 transition-colors ${isOver ? 'border-accent bg-paper-2' : 'border-line'}`}>
      <h2 className="eyebrow">{title}</h2>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function SortableSection({
  section,
  progress,
  onRename,
  onDelete,
  children,
}: {
  section: Section;
  progress?: SectionProgress;
  onRename: (t: string) => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const sortable = useSortable({ id: 'section:' + section.id, data: { type: 'section', sectionId: section.id } satisfies DragData });
  const zone = useDroppable({ id: 'zone:' + section.id, data: { type: 'zone', sectionId: section.id } satisfies DragData });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(section.title);

  return (
    <section
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
      className={`panel ${sortable.isDragging ? 'opacity-50' : ''}`}
      aria-label={`Section ${section.title}`}
    >
      <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-muted hover:text-ink"
          aria-label={`Reorder section ${section.title}`}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical size={16} />
        </button>
        {editing ? (
          <form
            className="flex flex-1 gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              onRename(title);
              setEditing(false);
            }}
          >
            <input className="input py-1" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus aria-label="Section title" />
            <button type="submit" className="btn-ghost p-1" aria-label="Save title">
              <Check size={16} />
            </button>
          </form>
        ) : (
          <h3 className="flex-1 font-serif text-xl">{section.title}</h3>
        )}
        {progress && progress.count > 0 && (
          <span className="text-xs text-muted tabular-nums" title="Section progress">
            {progress.count} · {Math.round(progress.progress * 100)}%
          </span>
        )}
        {!editing && (
          <button type="button" className="btn-ghost p-1" onClick={() => setEditing(true)} aria-label={`Rename section ${section.title}`}>
            <Pencil size={14} />
          </button>
        )}
        <button type="button" className="btn-ghost p-1" onClick={onDelete} aria-label={`Remove section ${section.title}`}>
          <Trash2 size={14} />
        </button>
      </header>
      <div ref={zone.setNodeRef} className={`min-h-14 rounded-b-2xl p-2 transition-colors ${zone.isOver ? 'bg-paper-2' : ''}`}>
        {children}
      </div>
    </section>
  );
}

function EntryList({
  entries,
  contentById,
  moveTargets,
  onMove,
}: {
  entries: BookEntry[];
  contentById: Map<string, ContentItem>;
  moveTargets: { id: string; title: string }[];
  onMove: (entryId: string, target: string) => void;
}) {
  if (!entries.length) return <p className="px-2 py-3 text-sm text-muted">Drop pieces here.</p>;
  return (
    <SortableContext items={entries.map((e) => 'entry:' + e.id)} strategy={verticalListSortingStrategy}>
      <ul className="space-y-1">
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} item={contentById.get(e.contentId)!} moveTargets={moveTargets} onMove={onMove} />
        ))}
      </ul>
    </SortableContext>
  );
}

function EntryRow({
  entry,
  item,
  moveTargets,
  onMove,
}: {
  entry: BookEntry;
  item: ContentItem;
  moveTargets: { id: string; title: string }[];
  onMove: (entryId: string, target: string) => void;
}) {
  const s = useSortable({ id: 'entry:' + entry.id, data: { type: 'entry', entryId: entry.id, sectionId: entry.sectionId } satisfies DragData });
  const current = entry.sectionId ?? TRAY;
  return (
    <li
      ref={s.setNodeRef}
      style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition }}
      className={`flex items-center gap-2 rounded-xl bg-paper px-2 py-2 ${s.isDragging ? 'opacity-40' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-muted hover:text-ink"
        aria-label={`Move “${displayTitle(item)}”`}
        {...s.attributes}
        {...s.listeners}
      >
        <GripVertical size={15} />
      </button>
      <StatusBadge status={item.status} compact />
      <div className="min-w-0 flex-1">
        <Link to={`/item/${item.id}`} className="block truncate font-serif text-base hover:underline">
          {displayTitle(item)}
        </Link>
        <span className="text-xs text-muted">{TYPE_LABEL[item.type]}</span>
      </div>
      <select
        className="max-w-[7.5rem] rounded-full border border-line bg-card px-2 py-1 text-xs text-ink-2"
        value={current}
        onChange={(e) => onMove(entry.id, e.target.value)}
        aria-label={`Move “${displayTitle(item)}” to section`}
      >
        {moveTargets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>
      <button type="button" className="btn-ghost p-1" onClick={() => void removeEntries([entry.id])} aria-label={`Remove “${displayTitle(item)}” from this book`}>
        <X size={14} />
      </button>
    </li>
  );
}
