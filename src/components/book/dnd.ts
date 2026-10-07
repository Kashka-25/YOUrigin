import { closestCenter, pointerWithin, type CollisionDetection } from '@dnd-kit/core';

export type DragData =
  | { type: 'section'; sectionId: string }
  | { type: 'entry'; entryId: string; sectionId: string | null }
  | { type: 'zone'; sectionId: string | null }
  | { type: 'lib'; contentId: string };

export const TRAY = 'tray';

/**
 * Sections only collide with sections; pieces collide with pieces and section
 * drop-zones. When the pointer is over a piece inside a zone, the piece wins so
 * drops land at a precise position.
 */
export const collision: CollisionDetection = (args) => {
  const activeType = (args.active.data.current as DragData | undefined)?.type;
  const droppableContainers = args.droppableContainers.filter((c) => {
    const t = (c.data.current as DragData | undefined)?.type;
    return activeType === 'section' ? t === 'section' : t === 'entry' || t === 'zone';
  });
  const filtered = { ...args, droppableContainers };
  const within = pointerWithin(filtered);
  if (within.length) {
    const entry = within.find((c) => (droppableContainers.find((d) => d.id === c.id)?.data.current as DragData | undefined)?.type === 'entry');
    return entry ? [entry] : within;
  }
  return closestCenter(filtered);
};
