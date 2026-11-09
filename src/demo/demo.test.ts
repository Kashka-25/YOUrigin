import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns } from '../db/db';
import { BETA_MAILTO, DEMO, demoAccessAllowed, demoBackUrl } from './mode';
import { EXAMPLE_CREATOR, demoJourney, seedExampleCreator } from './seed';
import { ensureWorksHaveProjects } from '../db/projectRecords';
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

  it('invites visitors to the beta by email, with a subject', () => {
    expect(BETA_MAILTO).toBe('mailto:YourOwnUniverse.life@gmail.com?subject=YOUrigin%20beta');
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
  it('fills a library with months of invented, interlinked work', async () => {
    const now = Date.UTC(2026, 10, 9);
    await seedExampleCreator(now);
    const projects = await db.projects.toArray();
    expect(projects.map((p) => p.title).sort()).toEqual([
      'Friday at the Harbour Hall', 'Garden Almanac', 'Lantern Walk Zine', 'Paper Kite Studio', 'Saltglass Poems', 'The Lamplighters', 'Thursday Writing Circle',
    ]);
    // Projects at every stage.
    expect(new Set(projects.map((p) => p.status))).toEqual(new Set(['idea', 'building', 'resting', 'complete']));
    const books = await db.books.toArray();
    expect(books.map((b) => b.kind ?? 'book').sort()).toEqual(['album', 'book', 'book', 'book', 'setlist']);
    // Every Work is a Project's workspace (same id), so the app makes no extra, empty Project homes.
    const projectIds = new Set(projects.map((p) => p.id));
    expect(books.every((b) => projectIds.has(b.id))).toBe(true);
    expect(await ensureWorksHaveProjects()).toEqual([]);
    const items = await db.content.toArray();
    expect(items.length).toBeGreaterThanOrEqual(40);
    expect(items.filter((i) => i.type === 'song').length).toBeGreaterThanOrEqual(6);
    expect(await db.relationships.count()).toBeGreaterThanOrEqual(12);
    expect(await db.revisions.count()).toBeGreaterThanOrEqual(3);
    expect(await db.collections.count()).toBe(2);
    expect((await db.suggestions.toArray()).every((s) => s.state === 'pending')).toBe(true);
    expect(await db.portfolios.count()).toBe(1);
    // Change notes on the Projects with news, newest first, and a few linked to Creative Universe realms.
    const withNotes = projects.filter((p) => p.changeNotes?.length);
    expect(withNotes.length).toBe(4);
    for (const p of withNotes) expect(p.changeNotes!.map((n) => n.at)).toEqual([...p.changeNotes!.map((n) => n.at)].sort((a, b) => b - a));
    expect(projects.filter((p) => p.universe).length).toBe(3);
    // Spread over months, never in the future.
    const ages = items.map((i) => i.createdAt);
    expect(Math.max(...ages) - Math.min(...ages)).toBeGreaterThan(250 * 86_400_000);
    expect(Math.max(...ages, ...items.map((i) => i.updatedAt))).toBeLessThanOrEqual(now);
    expect((await db.settings.get('onboarded'))?.value).toBe(true);
  });

  it('has no broken pictures, empty Projects, empty parts of a Work or placeholder text', async () => {
    await seedExampleCreator();
    const assets = new Set((await db.assets.toArray()).map((a) => a.id));
    const items = await db.content.toArray();
    for (const i of items.filter((i) => i.type === 'image')) expect(assets.has(i.assetId!)).toBe(true);
    for (const p of await db.projects.toArray()) {
      expect(assets.has(p.coverAssetId!)).toBe(true);
      expect(items.filter((i) => i.projectIds?.includes(p.id)).length).toBeGreaterThanOrEqual(4);
    }
    const entries = await db.entries.toArray();
    for (const s of await db.sections.toArray()) expect(entries.some((e) => e.sectionId === s.id)).toBe(true);
    const text = JSON.stringify(items);
    expect(text).not.toMatch(/lorem|ipsum|placeholder|\[insert|untitled|todo/i);
  });

  it('gives the guide a real place for every stop', async () => {
    await seedExampleCreator();
    const j = (await demoJourney())!;
    expect(await db.projects.get(j.project)).toBeDefined();
    expect((await db.books.get(j.book))?.title).toBe('Saltglass');
    expect((await db.content.get(j.song))?.type).toBe('song');
    expect((await db.books.get(j.setlist))?.kind).toBe('setlist');
    expect(await db.portfolios.get(j.portfolio)).toBeDefined();
    expect((await db.content.get(j.poem))?.title).toBe('Saltglass');
    expect((await db.relationships.where('toId').equals(j.poem).count()) + (await db.relationships.where('fromId').equals(j.poem).count())).toBeGreaterThanOrEqual(3);
  });

  it('is plainly fictional and never names Cassidy or anyone real', async () => {
    await seedExampleCreator();
    const text = JSON.stringify([await db.content.toArray(), await db.projects.toArray(), await db.books.toArray(), await db.collections.toArray(), await db.portfolios.toArray()]);
    expect(text).not.toMatch(/cassidy|dugan|rae\b|kashka|tal\b/i);
    expect(EXAMPLE_CREATOR).toBe('Juno Tidewell');
  });
});
