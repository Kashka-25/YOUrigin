import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { newId } from '../domain/text';
import { newPortfolio, headingItem, itemFromProject, type Portfolio, type PortfolioItem, type PortfolioPurpose } from '../portfolio/model';
import type { Project } from '../domain/types';
import { sameTitle, type StarterPack, type StarterProject } from '../portfolio/starter';

// Portfolios are private drafts on this device until published (phase 2).
// These are the only functions that write them.

export async function createPortfolio(purpose: PortfolioPurpose, ownerName = ''): Promise<string> {
  const p = newPortfolio(purpose, ownerName);
  await db.portfolios.add(p);
  return p.id;
}

export type PortfolioPatch = Partial<Omit<Portfolio, 'id' | 'createdAt' | 'updatedAt' | 'publication'>>;

/** Edits the draft. What's published only changes when it's published again. */
export async function updatePortfolio(id: string, patch: PortfolioPatch): Promise<void> {
  await db.portfolios.update(id, { ...patch, updatedAt: Date.now() });
}

export async function addPortfolioItems(id: string, items: PortfolioItem[]): Promise<void> {
  await db.transaction('rw', db.portfolios, async () => {
    const p = await db.portfolios.get(id);
    if (!p) throw new Error('This portfolio no longer exists.');
    await db.portfolios.update(id, { items: [...p.items, ...items], updatedAt: Date.now() });
  });
}

/**
 * Builds, or extends, a private draft from a starter file.
 * - Projects are matched by name. An existing Project is reused as it is and
 *   never changed; only missing ones are created, from the file.
 * - Each Project appears once. Cards already in the portfolio, and everything
 *   else in it, are left exactly as they are; missing cards go under their
 *   heading, which is added if it isn't there.
 * - Works, pieces and the rest of the library are never touched.
 * - It never publishes. Running it again changes nothing that's already there.
 */
export async function importStarterPortfolio(pack: StarterPack): Promise<{ portfolioId: string; createdProjects: number; addedItems: number; created: boolean }> {
  return db.transaction('rw', db.projects, db.portfolios, async () => {
    const [projects, portfolios] = await Promise.all([db.projects.toArray(), db.portfolios.toArray()]);
    const now = Date.now();
    let createdProjects = 0;

    const projectFor = async (seed: StarterProject): Promise<Project> => {
      const found = projects.find((p) => sameTitle(p.title, seed.title));
      if (found) return found;
      const project: Project = {
        id: newId(),
        title: seed.title,
        description: seed.description,
        category: seed.category,
        ...(seed.colour ? { colour: seed.colour } : {}),
        status: seed.status,
        createdAt: now,
        updatedAt: now,
      };
      await db.projects.add(project);
      projects.push(project);
      createdProjects += 1;
      return project;
    };

    let portfolio =
      portfolios.find((p) => p.starterKey === pack.key) ??
      portfolios.find((p) => !p.starterKey && !p.publication && sameTitle(p.title, pack.title));
    const created = !portfolio;
    if (!portfolio) {
      portfolio = { ...newPortfolio(pack.purpose, pack.ownerName, now), title: pack.title, theme: pack.theme, ownerLine: pack.ownerLine, intro: pack.intro, items: [] };
    }

    const items = [...portfolio.items];
    const shown = new Set(items.filter((i) => i.kind === 'project').map((i) => i.sourceId));
    let addedItems = 0;
    for (const section of pack.sections) {
      for (const seed of section.projects) {
        const project = await projectFor(seed);
        if (shown.has(project.id)) continue;
        const card = { ...itemFromProject(project), description: seed.portfolioDescription || project.description.slice(0, 2000), imageShape: 'landscape' as const };
        let at = section.heading ? items.findIndex((i) => i.kind === 'heading' && sameTitle(i.heading, section.heading)) : -1;
        if (at === -1 && section.heading) {
          items.push(headingItem(section.heading));
          at = items.length - 1;
        }
        // The end of this heading's group: just before the next heading.
        let end = at + 1;
        while (at !== -1 && end < items.length && items[end].kind !== 'heading') end++;
        items.splice(at === -1 ? items.length : end, 0, card);
        shown.add(project.id);
        addedItems += 1;
      }
    }

    if (created) {
      await db.portfolios.add({ ...portfolio, items, starterKey: pack.key });
    } else if (addedItems > 0 || portfolio.starterKey !== pack.key) {
      // Only the new cards (and the starter's tag). Title, intro and everything else stay yours.
      await db.portfolios.update(portfolio.id, { items, starterKey: pack.key, updatedAt: now });
    }
    return { portfolioId: portfolio.id, createdProjects, addedItems, created };
  });
}

/** A copy is always a new private draft, even when the original is published. */
export async function duplicatePortfolio(id: string): Promise<string> {
  const p = await db.portfolios.get(id);
  if (!p) throw new Error('This portfolio no longer exists.');
  const now = Date.now();
  const copy: Portfolio = {
    ...p,
    id: newId(),
    title: `${p.title} (copy)`.slice(0, 120),
    items: p.items.map((i) => ({ ...i, id: newId() })),
    publication: null,
    starterKey: undefined,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  await db.portfolios.add(copy);
  return copy.id;
}

/** Deletes a draft. A published portfolio has to be unpublished first, so no live link is left behind. */
export async function deletePortfolio(id: string): Promise<void> {
  const p = await db.portfolios.get(id);
  if (p?.publication) throw new Error('Unpublish this portfolio before deleting it, so its link stops working.');
  await db.portfolios.delete(id);
}

export function usePortfolios(): Portfolio[] | undefined {
  return useLiveQuery(() => db.portfolios.orderBy('updatedAt').reverse().toArray(), []);
}

/** undefined while loading, null when it doesn't exist. */
export function usePortfolio(id: string | undefined): Portfolio | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.portfolios.get(id)) ?? null) : null), [id]);
}
