import { beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { db, ensureBuiltIns } from './db';
import { createPortfolio, importStarterPortfolio, updatePortfolio } from './portfolios';
import { createProject } from './projectRecords';
import { createBook } from './books';
import { createMany } from './content';
import { parseStarterPack, STARTER_FORMAT, type StarterPack } from '../portfolio/starter';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
});

const venture = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  category: 'Venture',
  status: 'building',
  description: `${title}: the Project's description.`,
  portfolioDescription: `${title}, told for the portfolio.`,
  ...extra,
});

/** A made-up starter file with the same shape as a real one. */
const file = () => ({
  format: STARTER_FORMAT,
  key: 'test-starter',
  title: 'Selected ventures',
  purpose: 'business',
  theme: 'journal',
  ownerName: 'Ana',
  ownerLine: 'Founder',
  intro: 'Hello.',
  sections: [
    { heading: 'Digital', projects: [venture('Alpha', { colour: 'jade' }), venture('Beta')] },
    { heading: 'Worlds', projects: [venture('Gamma'), venture('Delta'), venture('Epsilon')] },
    { heading: 'Wellbeing', projects: [venture('Zeta', { status: 'idea' }), venture('Eta')] },
  ],
});
const pack = (): StarterPack => parseStarterPack(JSON.stringify(file()));

async function everything() {
  const [projects, books, content, portfolios, assets] = await Promise.all([
    db.projects.toArray(), db.books.toArray(), db.content.toArray(), db.portfolios.toArray(), db.assets.count(),
  ]);
  return { projects, books, content, portfolios, assets };
}

describe('starter portfolio', () => {
  it('builds one private draft, grouped under its headings, with the portfolio’s own descriptions', async () => {
    const r = await importStarterPortfolio(pack());
    expect(r).toMatchObject({ created: true, createdProjects: 7, addedItems: 7 });
    const p = (await db.portfolios.get(r.portfolioId))!;
    expect(p).toMatchObject({ title: 'Selected ventures', theme: 'journal', ownerName: 'Ana', publication: null, visibility: 'unlisted', starterKey: 'test-starter' });
    const projects = new Map((await db.projects.toArray()).map((x) => [x.id, x.title]));
    expect(p.items.map((i) => (i.kind === 'heading' ? `# ${i.heading}` : projects.get(i.sourceId)))).toEqual([
      '# Digital', 'Alpha', 'Beta', '# Worlds', 'Gamma', 'Delta', 'Epsilon', '# Wellbeing', 'Zeta', 'Eta',
    ]);
    const alpha = p.items.find((i) => projects.get(i.sourceId) === 'Alpha')!;
    expect(alpha).toMatchObject({ kind: 'project', description: 'Alpha, told for the portfolio.', image: 'default' });
    // The Project keeps its own description; the card's is only for the portfolio.
    expect((await db.projects.toArray()).find((x) => x.title === 'Alpha')).toMatchObject({ description: "Alpha: the Project's description.", colour: 'jade' });
    // No pictures are made up.
    expect(await db.assets.count()).toBe(0);
    expect((await db.projects.toArray()).every((x) => !x.coverAssetId)).toBe(true);
  });

  it('running it again changes nothing', async () => {
    const first = await importStarterPortfolio(pack());
    const before = await everything();
    const again = await importStarterPortfolio(pack());
    expect(again).toMatchObject({ portfolioId: first.portfolioId, created: false, createdProjects: 0, addedItems: 0 });
    expect(await everything()).toEqual(before);
  });

  it('reuses existing Projects by name and never changes them', async () => {
    const id = await createProject({ title: '  alpha ', description: 'My own words.', category: 'Mine' });
    await db.projects.update(id, { coverAssetId: 'cover-1' });
    const original = await db.projects.get(id);
    const r = await importStarterPortfolio(pack());
    expect(r.createdProjects).toBe(6);
    expect(await db.projects.where('id').equals(id).count()).toBe(1);
    expect((await db.projects.toArray()).filter((x) => x.title.trim().toLowerCase() === 'alpha')).toHaveLength(1);
    expect(await db.projects.get(id)).toEqual(original);
    const p = (await db.portfolios.get(r.portfolioId))!;
    expect(p.items.filter((i) => i.sourceId === id)).toHaveLength(1);
  });

  it('keeps Works, the Library and other portfolios exactly as they are', async () => {
    await createBook({ title: 'A novel', templateId: null });
    await createMany([{ title: 'A note', body: 'Words', type: 'note', status: 'seed' }]);
    const other = await createPortfolio('creative', 'Ana');
    await updatePortfolio(other, { title: 'For galleries', intro: 'Mine' });
    const before = await everything();
    await importStarterPortfolio(pack());
    const after = await everything();
    expect(after.books).toEqual(before.books);
    expect(after.content).toEqual(before.content);
    expect(after.portfolios.find((p) => p.id === other)).toEqual(before.portfolios.find((p) => p.id === other));
    expect(after.portfolios).toHaveLength(2);
  });

  it('extends the draft you’ve changed without undoing your changes', async () => {
    const { portfolioId } = await importStarterPortfolio(pack());
    const p = (await db.portfolios.get(portfolioId))!;
    const projects = new Map((await db.projects.toArray()).map((x) => [x.title, x.id]));
    // Rename it, rewrite one card, remove another and add your own section.
    const items = p.items
      .filter((i) => i.sourceId !== projects.get('Delta'))
      .map((i) => (i.sourceId === projects.get('Alpha') ? { ...i, description: 'Rewritten by me.' } : i));
    await updatePortfolio(portfolioId, { title: 'My ventures', intro: 'My intro.', items: [...items, { ...items[0], id: 'mine', heading: 'Contact', description: 'Say hello.' }] });

    const r = await importStarterPortfolio(pack());
    expect(r).toMatchObject({ portfolioId, created: false, createdProjects: 0, addedItems: 1 });
    const after = (await db.portfolios.get(portfolioId))!;
    expect(after).toMatchObject({ title: 'My ventures', intro: 'My intro.', publication: null });
    expect(after.items.find((i) => i.sourceId === projects.get('Alpha'))?.description).toBe('Rewritten by me.');
    const order = after.items.map((i) => (i.kind === 'heading' ? `# ${i.heading}` : [...projects].find(([, v]) => v === i.sourceId)?.[0]));
    // Delta comes back under its own heading, not at the end; your section stays.
    expect(order).toEqual(['# Digital', 'Alpha', 'Beta', '# Worlds', 'Gamma', 'Epsilon', 'Delta', '# Wellbeing', 'Zeta', 'Eta', '# Contact']);
  });

  it('never publishes, and leaves a published portfolio’s live version alone', async () => {
    const { portfolioId } = await importStarterPortfolio(pack());
    const publication = { remoteId: 'r', shareToken: 't', status: 'live' as const, visibility: 'unlisted' as const, publishedAt: 1, publishedHash: 'h', expiresAt: null, passwordSet: false };
    await db.portfolios.update(portfolioId, { publication });
    await importStarterPortfolio(pack());
    expect((await db.portfolios.get(portfolioId))!.publication).toEqual(publication);
    expect(await db.portfolios.count()).toBe(1);
  });

  it('turns away files that aren’t starter portfolios', () => {
    expect(() => parseStarterPack('not json')).toThrow(/isn’t a YOUrigin starter/);
    expect(() => parseStarterPack({ format: 'other' })).toThrow(/isn’t a YOUrigin starter/);
    expect(() => parseStarterPack({ format: STARTER_FORMAT, sections: [] })).toThrow(/no key/);
    expect(() => parseStarterPack({ format: STARTER_FORMAT, key: 'k', sections: [{ heading: 'x', projects: [] }] })).toThrow(/no Projects/);
    const odd = parseStarterPack({ ...file(), theme: 'neon', purpose: 'x', sections: [{ heading: 'A', projects: [{ title: 'T', colour: 'nope', status: 'weird' }] }] });
    expect(odd).toMatchObject({ theme: 'venture', purpose: 'business' });
    expect(odd.sections[0].projects[0]).toMatchObject({ title: 'T', colour: undefined, status: 'building' });
  });
});

describe('privacy', () => {
  it('no one’s ventures are built into the portfolio code', () => {
    const names = ['Atlantean Gardens', 'Sweet Vital Nectar', 'Rhythm Relics', 'Empatherapy', 'Hopeium'];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const path = join(dir, f);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|css|html|json)$/.test(f) && !f.includes('.test.')) files.push(path);
      }
    };
    // The portfolio code and the data layer. (Other screens may use these names as examples.)
    for (const dir of ['portfolio', 'components/portfolio', 'db', 'viewer']) walk(resolve(__dirname, '..', dir));
    for (const f of ['Portfolios.tsx', 'PortfolioEditor.tsx', 'PortfolioPreview.tsx']) files.push(resolve(__dirname, '../pages', f));
    const found = files.filter((f) => names.some((n) => readFileSync(f, 'utf8').includes(n)));
    expect(found).toEqual([]);
  });
});
