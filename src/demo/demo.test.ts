import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns } from '../db/db';
import { BETA_MAILTO, DEMO, demoAccessAllowed, demoBackUrl } from './mode';
import { DEMO_CREATOR, demoJourney, seedExampleCreator } from './seed';
import { universeWorkUrl } from '../domain/universe';
import { SET_LIST, YOULOGY } from './writing';
import { CU_PICTURES, loadPicture } from './pictures';
import { demoPicture } from './art';
import { readFileSync, statSync } from 'node:fs';
import { afterEach, vi } from 'vitest';
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

describe('the demo library', () => {
  it('shows Cassidy’s chosen projects, as Creative Universe presents them, with months of interlinked work', async () => {
    const now = Date.UTC(2026, 10, 22);
    await seedExampleCreator(now);
    const projects = await db.projects.toArray();
    const top = projects.filter((p) => !p.parentId);
    expect(top.map((p) => p.title).sort()).toEqual(['Empatherapy', 'IntoTheLighthouse', 'My Living YOUlogy', 'The Art of Free Flow', 'YOU', 'YOUrigin']);
    expect(top.length).toBe(projects.length);
    expect(new Set(projects.map((p) => p.status))).toEqual(new Set(['idea', 'building', 'complete']));
    // Each one points at its page in Creative Universe, with change notes newest first.
    for (const p of top) {
      expect(p.universe?.slug).toBeTruthy();
      expect(p.changeNotes?.length).toBeGreaterThan(0);
      expect(p.changeNotes!.map((n) => n.at)).toEqual([...p.changeNotes!.map((n) => n.at)].sort((a, b) => b - a));
    }
    const books = await db.books.toArray();
    expect(books.map((b) => b.kind ?? 'book').sort()).toEqual(['book', 'ideas', 'series', 'setlist']);
    // Every Work is a Project's workspace (same id), so the app makes no extra, empty Project homes.
    const projectIds = new Set(projects.map((p) => p.id));
    expect(books.every((b) => projectIds.has(b.id))).toBe(true);
    expect(await ensureWorksHaveProjects()).toEqual([]);
    const items = await db.content.toArray();
    expect(items.length).toBeGreaterThanOrEqual(50);
    expect(items.filter((i) => i.type === 'song').length).toBeGreaterThanOrEqual(1);
    expect(items.filter((i) => i.type === 'teaching').length).toBe(7);
    expect(await db.relationships.count()).toBeGreaterThanOrEqual(20);
    expect(await db.revisions.count()).toBeGreaterThanOrEqual(3);
    expect(await db.collections.count()).toBe(2);
    expect((await db.suggestions.toArray()).every((s) => s.state === 'pending')).toBe(true);
    // Posts at every stage, each with its picture and a link to the live project.
    const posts = await db.posts.toArray();
    expect(new Set(posts.map((p) => p.status))).toEqual(new Set(['idea', 'draft', 'approved', 'posted']));
    const assets = new Set((await db.assets.toArray()).map((a) => a.id));
    for (const p of posts) {
      expect(p.media.every((m) => m.kind === 'asset' && assets.has(m.assetId))).toBe(true);
      expect(p.link).toMatch(/^https:\/\//);
    }
    // The portfolio's project cards lead to the live projects or their Creative Universe pages.
    const [portfolio] = await db.portfolios.toArray();
    const cards = portfolio.items.filter((i) => i.kind === 'project');
    expect(cards.length).toBe(6);
    for (const c of cards) expect(c.destinationUrl).toMatch(/^https:\/\//);
    // Spread over months, never in the future.
    const ages = items.map((i) => i.createdAt);
    expect(Math.max(...ages) - Math.min(...ages)).toBeGreaterThan(250 * 86_400_000);
    expect(Math.max(...ages, ...items.map((i) => i.updatedAt), ...projects.map((p) => p.updatedAt), ...books.map((b) => b.updatedAt))).toBeLessThanOrEqual(now);
    expect((await db.settings.get('onboarded'))?.value).toBe(true);
  });

  it('links only to Cassidy’s own public places', async () => {
    await seedExampleCreator();
    const text = JSON.stringify([await db.content.toArray(), await db.projects.toArray(), await db.portfolios.toArray(), await db.posts.toArray()]);
    const hosts = new Set([...text.matchAll(/https:\/\/([^/"\s]+)/g)].map((m) => m[1]));
    expect([...hosts].sort()).toEqual(['kashka-25.github.io', 'yourownuniverse.life']);
    expect(universeWorkUrl('The Art of Free Flow')).toBe('https://kashka-25.github.io/creative-universe/#/work/the-art-of-free-flow');
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
    for (const b of await db.books.toArray()) expect(entries.some((e) => e.bookId === b.id)).toBe(true);
    const text = JSON.stringify(items);
    expect(text).not.toMatch(/lorem|ipsum|placeholder|\[insert|untitled|todo/i);
  });

  it('gives the guide a real place for every stop', async () => {
    await seedExampleCreator();
    const j = (await demoJourney())!;
    expect((await db.projects.get(j.project))?.title).toBe('The Art of Free Flow');
    expect((await db.books.get(j.book))?.title).toBe('The Art of Free Flow');
    expect((await db.books.get(j.setlist))?.title).toBe('My Living YOUlogy');
    expect((await db.content.get(j.song))?.type).toBe('song');
    expect((await db.books.get(j.setlist))?.kind).toBe('setlist');
    expect(await db.portfolios.get(j.portfolio)).toBeDefined();
    expect((await db.content.get(j.poem))?.type).toBe('poem');
    expect(await db.revisions.where('contentId').equals(j.poem).count()).toBeGreaterThanOrEqual(2);
    expect((await db.relationships.where('toId').equals(j.poem).count()) + (await db.relationships.where('fromId').equals(j.poem).count())).toBeGreaterThanOrEqual(3);
  });

  it('uses only Cassidy’s approved YOUlogy excerpts as poems and songs, word for word', async () => {
    await seedExampleCreator();
    const items = await db.content.toArray();
    const writing = items.filter((i) => i.type === 'poem' || i.type === 'song');
    expect(writing.map((i) => i.title).sort()).toEqual(['Carnivorous Butterflies', 'Forest of Dreams', 'Inner Wardrobe', 'Ships']);
    for (const w of YOULOGY) {
      const item = items.find((i) => i.body === w.body);
      expect(item, w.key).toBeDefined();
      expect(item!.notes).toMatch(/My Living YOUlogy/);
    }
    // Kept away from the introduction's most personal passages.
    expect(JSON.stringify(items)).not.toMatch(/razor|deport|drug|heart ?broken|hourglass|teen/i);
    // The set list follows the introduction's own parts.
    const sections = await db.sections.toArray();
    for (const [name] of SET_LIST) expect(sections.some((s) => s.title === name)).toBe(true);
  });

  it('uses the current names and keeps private and other people’s work out', async () => {
    await seedExampleCreator();
    const text = JSON.stringify([await db.content.toArray(), await db.projects.toArray(), await db.books.toArray(), await db.collections.toArray(), await db.portfolios.toArray(), await db.posts.toArray()]);
    expect(DEMO_CREATOR).toBe('Cassidy Rae');
    // HOPEIUM only appears as the old name of IntoTheLighthouse.
    expect(text.match(/HOPEIUM/g)?.length).toBe(text.match(/HOPEIUM is now IntoTheLighthouse/g)?.length);
    // Only the five projects Cassidy chose; no client work, collaborators or projects left out.
    expect(text).not.toMatch(/Kronk|Wachuneed|\bTal\b|Chantilly|ReFocus|Julie|Sweet Vital|Wandering|CommYOUnity|Atlantean|Juno|Tidewell|@|gmail/i);
  });
});

describe('the pictures from Creative Universe', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('ship with the app, small enough for the offline cache', () => {
    let total = 0;
    for (const [name, [w, h]] of Object.entries(CU_PICTURES)) {
      const file = `public/demo/${name}.webp`;
      const bytes = readFileSync(file);
      expect(bytes.subarray(8, 12).toString('ascii'), file).toBe('WEBP');
      expect(w * h).toBeGreaterThan(0);
      total += statSync(file).size;
    }
    expect(total).toBeLessThan(300_000);
  });

  it('are copied into the demo library, with a drawn picture if one cannot be loaded', async () => {
    const fallback = demoPicture('sun', '#000', '#111', '#222');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new TextEncoder().encode('RIFF....WEBP'), { headers: { 'content-type': 'image/webp' } })));
    const loaded = await loadPicture({ real: 'you', fallback });
    expect(loaded.mime).toBe('image/webp');
    expect(loaded.dataUrl).toMatch(/^data:image\/webp;base64,/);
    expect([loaded.width, loaded.height]).toEqual([...CU_PICTURES.you]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    expect((await loadPicture({ real: 'you', fallback })).mime).toBe('image/svg+xml');
  });
});
