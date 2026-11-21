import type { Project } from './types';

/**
 * Creations nest: a Creation (a Project) may sit inside another, as deep as Cassidy likes,
 * e.g. Lyrics & Music › Songs › Writing. `parentId` is the only link; notes still belong to
 * any level through their own `projectIds`, so a note exists once wherever it is placed.
 *
 * A parent that no longer exists (deleted on another device, say) counts as top level, and a
 * loop (which sync could in theory produce) is cut where it closes, so nothing ever vanishes.
 */

type Node = Pick<Project, 'id' | 'title' | 'parentId'>;

/** Walk up from a Creation. `loop` is true when the chain comes back round on itself. */
function chainUp<P extends Node>(projects: P[], id: string): { chain: P[]; loop: boolean } {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const chain: P[] = [];
  const seen = new Set<string>([id]);
  let cur = byId.get(id)?.parentId;
  while (cur) {
    if (seen.has(cur)) return { chain, loop: true };
    const p = byId.get(cur);
    if (!p) break;
    chain.unshift(p);
    seen.add(cur);
    cur = p.parentId;
  }
  return { chain, loop: false };
}

/** The Creation this one sits inside, or null when it is top level (or its parent is gone). */
export function parentOf<P extends Node>(projects: P[], id: string): P | null {
  const { chain, loop } = chainUp(projects, id);
  return loop ? null : (chain[chain.length - 1] ?? null);
}

/** From the outermost Creation down to its direct parent (empty at top level). */
export function ancestorsOf<P extends Node>(projects: P[], id: string): P[] {
  const { chain, loop } = chainUp(projects, id);
  return loop ? [] : chain;
}

/** Top-level Creations (no parent, a missing parent, or caught in a loop). */
export function topLevel<P extends Node>(projects: P[]): P[] {
  return projects.filter((p) => parentOf(projects, p.id) === null);
}

/** The Creations sitting directly inside this one. */
export function childrenOf<P extends Node>(projects: P[], id: string): P[] {
  return projects.filter((p) => p.id !== id && p.parentId === id && parentOf(projects, p.id)?.id === id);
}

/** Every Creation inside this one, at any depth. */
export function descendantsOf<P extends Node>(projects: P[], id: string): P[] {
  const out: P[] = [];
  const seen = new Set<string>([id]);
  const walk = (pid: string) => {
    for (const c of childrenOf(projects, pid)) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
      walk(c.id);
    }
  };
  walk(id);
  return out;
}

/** "Lyrics & Music › Songs › Writing". */
export function pathLabel(projects: Node[], id: string, sep = ' › '): string {
  const me = projects.find((p) => p.id === id);
  if (!me) return '';
  return [...ancestorsOf(projects, id).map((p) => p.title), me.title].join(sep);
}

/** Can this Creation move inside `parentId`? Never into itself or anything inside it. */
export function canMoveInto(projects: Node[], id: string, parentId: string | null): boolean {
  if (parentId === null) return true;
  if (parentId === id) return false;
  if (!projects.some((p) => p.id === parentId)) return false;
  return !descendantsOf(projects, id).some((d) => d.id === parentId);
}

/** All Creations in reading order (each followed by its branches), with their depth. */
export function treeOrder<P extends Node>(projects: P[], sort: (a: P, b: P) => number = (a, b) => a.title.localeCompare(b.title)): { project: P; depth: number }[] {
  const out: { project: P; depth: number }[] = [];
  const visit = (p: P, depth: number) => {
    out.push({ project: p, depth });
    for (const c of [...childrenOf(projects, p.id)].sort(sort)) visit(c, depth + 1);
  };
  for (const p of [...topLevel(projects)].sort(sort)) visit(p, 0);
  return out;
}
