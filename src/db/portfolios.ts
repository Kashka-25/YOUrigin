import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { newId } from '../domain/text';
import { newPortfolio, type Portfolio, type PortfolioItem, type PortfolioPurpose } from '../portfolio/model';

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
