/** A project's outline: each section's placed entries in order, the tray (sectionId null) last. */
export type OutlineGroup = { sectionId: string | null; entryIds: string[] };

/**
 * Where an entry lands when nudged one step up or down. Inside a section it swaps with
 * its neighbour; past a section's edge it crosses into the next section (at its start)
 * or the previous one (at its end). Returns the target for db.moveEntry, or null at
 * the very top or bottom. `index` counts the target section without the moving entry.
 */
export function nudgeTarget(groups: OutlineGroup[], entryId: string, dir: -1 | 1): { sectionId: string | null; index: number } | null {
  const g = groups.findIndex((x) => x.entryIds.includes(entryId));
  if (g < 0) return null;
  const pos = groups[g].entryIds.indexOf(entryId);
  const last = groups[g].entryIds.length - 1;
  if (dir === -1 && pos > 0) return { sectionId: groups[g].sectionId, index: pos - 1 };
  if (dir === 1 && pos < last) return { sectionId: groups[g].sectionId, index: pos + 1 };
  const to = groups[g + dir];
  if (!to) return null;
  return { sectionId: to.sectionId, index: dir === 1 ? 0 : to.entryIds.length };
}
