import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns } from '../db/db';
import { DEMO, demoAccessAllowed, demoBackUrl } from './mode';
import { EXAMPLE_CREATOR, seedExampleCreator } from './seed';
import { resetDemo, startDemo } from './state';
import { getClient } from '../sync/supabase';
import { isSyncEnabled } from '../sync/runtime';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
});

describe('demo mode', () => {
  it('is off for the real app (no ?demo in the address), and the real library keeps its own database', () => {
    expect(DEMO).toBe(false);
    expect(db.name).toBe('yourigin');
  });

  it('refuses to start or reset outside the demo, so the real library can never be wiped', async () => {
    await db.content.add({ id: 'real', title: 'Real', body: 'real writing', type: 'poem', status: 'seed', tagIds: [], notes: '', source: { kind: 'capture' }, keepUnassigned: false, archived: false, deletedAt: null, createdAt: 0, updatedAt: 0 });
    await expect(resetDemo()).rejects.toThrow(/only run in the demo/);
    await expect(startDemo('example')).rejects.toThrow(/only run in the demo/);
    expect(await db.content.get('real')).toBeDefined();
  });

  it('leaves the network alone when not a demo', () => {
    // Outside the demo the client loads as usual and sync follows its own setting.
    expect(getClient()).toBeInstanceOf(Promise);
    expect(typeof isSyncEnabled()).toBe('boolean');
  });

  it('is open to every visitor for now (an entry key could gate it later)', () => {
    expect(demoAccessAllowed()).toBe(true);
  });

  it('goes back only to known places', () => {
    expect(demoBackUrl('?demo&back=https://kashka-25.github.io/creative-universe/#yourigin')).toBe('https://kashka-25.github.io/creative-universe/#yourigin');
    expect(demoBackUrl('?demo&back=http://localhost:5173/')).toBe('http://localhost:5173/');
    const fallback = demoBackUrl('?demo');
    expect(demoBackUrl('?demo&back=https://evil.example/')).toBe(fallback);
    expect(demoBackUrl('?demo&back=javascript:alert(1)')).toBe(fallback);
    expect(demoBackUrl('?demo&back=http://kashka-25.github.io/')).toBe(fallback); // https only, except on this computer
  });
});

describe('the example creator', () => {
  it('fills a library with invented projects, writing and Works', async () => {
    await seedExampleCreator(Date.UTC(2026, 10, 9));
    const projects = await db.projects.toArray();
    expect(projects.map((p) => p.title).sort()).toEqual(['Garden Almanac', 'Paper Kite Studio', 'Saltglass Poems', 'The Lamplighters']);
    const books = await db.books.toArray();
    expect(books.map((b) => b.kind ?? 'book').sort()).toEqual(['album', 'book', 'setlist']);
    expect(await db.relationships.count()).toBeGreaterThanOrEqual(5);
    const items = await db.content.toArray();
    expect(items.filter((i) => i.type === 'song').length).toBeGreaterThanOrEqual(3);
    // Spread over months, for the timeline.
    const ages = items.filter((i) => i.source.kind === 'sample').map((i) => i.createdAt);
    expect(Math.max(...ages) - Math.min(...ages)).toBeGreaterThan(200 * 86_400_000);
    expect((await db.settings.get('onboarded'))?.value).toBe(true);
  });

  it('is plainly fictional and never names Cassidy or anyone real', async () => {
    await seedExampleCreator();
    const text = JSON.stringify([await db.content.toArray(), await db.projects.toArray(), await db.books.toArray(), await db.collections.toArray()]);
    expect(text).not.toMatch(/cassidy|dugan|rae\b|kashka|tal\b/i);
    expect(EXAMPLE_CREATOR).toBe('Juno Tidewell');
  });
});
