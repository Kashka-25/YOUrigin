import { beforeEach, describe, expect, it } from 'vitest';
import { db, ensureBuiltIns } from '../db/db';
import { addChangeNote, createProject, removeChangeNote, setUniverseLink } from '../db/projectRecords';
import { exportBackup, replaceWithBackup } from '../db/backup';
import { headingItem, itemFromPiece, itemFromProject, newPortfolio } from './model';
import { parseStarterPack } from './starter';
import { buildUniversePack, universeFileName } from './universe';
import { slugify } from '../domain/universe';
import type { ContentItem, Project } from '../domain/types';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureBuiltIns();
});

const COVER = 'data:image/webp;base64,AAAA';

describe('Creative Universe link on a Project', () => {
  it('links a Project to a realm, with a tidy address, and unlinks it', async () => {
    const id = await createProject({ title: 'Rhythm Relics' });
    await setUniverseLink(id, { realm: 'music', slug: '  Rhythm & Relics! ' });
    expect((await db.projects.get(id))!.universe).toEqual({ realm: 'music', slug: 'rhythm-and-relics' });
    await setUniverseLink(id, { realm: 'ventures' });
    expect((await db.projects.get(id))!.universe).toEqual({ realm: 'ventures' });
    await setUniverseLink(id, null);
    expect((await db.projects.get(id))!.universe).toBeUndefined();
  });

  it('keeps change notes newest first, ignores empty ones, and removes one', async () => {
    const id = await createProject({ title: 'YOU' });
    const older = await addChangeNote(id, 'Launched the beta', Date.UTC(2026, 9, 1));
    await addChangeNote(id, '  New guided journeys  ', Date.UTC(2026, 10, 1));
    expect(await addChangeNote(id, '   ')).toBe('');
    expect((await db.projects.get(id))!.changeNotes!.map((n) => n.text)).toEqual(['New guided journeys', 'Launched the beta']);
    await removeChangeNote(id, older);
    expect((await db.projects.get(id))!.changeNotes!.map((n) => n.text)).toEqual(['New guided journeys']);
  });

  it('survives a backup and restore', async () => {
    const id = await createProject({ title: 'YOU' });
    await setUniverseLink(id, { realm: 'digital' });
    await addChangeNote(id, 'Launched the beta');
    const backup = await exportBackup();
    await db.projects.clear();
    await replaceWithBackup(backup);
    const p = (await db.projects.get(id))!;
    expect(p.universe).toEqual({ realm: 'digital' });
    expect(p.changeNotes![0].text).toBe('Launched the beta');
  });
});

describe('Creative Universe export', () => {
  function setup() {
    const you: Project = {
      id: 'p-you', title: 'YOU', description: 'A human development ecosystem.', category: 'Human development', colour: 'jade', status: 'building', createdAt: 0, updatedAt: 0,
      coverAssetId: 'a1',
      universe: { realm: 'digital' },
      changeNotes: [
        { id: 'n1', at: Date.UTC(2026, 9, 1), text: 'Launched the beta' },
        { id: 'n2', at: Date.UTC(2026, 10, 2), text: 'Guided journeys' },
      ],
    };
    const relics: Project = { id: 'p-rr', title: 'Rhythm Relics', description: 'Vintage drums.', category: 'Music', status: 'idea', createdAt: 0, updatedAt: 0, universe: { realm: 'music', slug: 'relics' } };
    const plain: Project = { id: 'p-plain', title: 'Empatherapy', description: 'Healing.', category: '', status: 'resting', createdAt: 0, updatedAt: 0, coverAssetId: 'a2' };
    const p = newPortfolio('business', 'Cassidy Rae', 0);
    p.title = 'Selected ventures';
    p.starterKey = 'cassidy-ventures-v1';
    const youCard = { ...itemFromProject(you), description: 'A home for growing, together.', destinationUrl: 'https://example.org/you' };
    const plainCard = { ...itemFromProject(plain), image: 'none' as const, destinationUrl: 'http://insecure.example' };
    const piece = itemFromPiece({ id: 'c1', type: 'poem', title: 'A poem', body: 'words' } as ContentItem);
    p.items = [headingItem('Digital'), youCard, piece, headingItem('Ventures'), { ...itemFromProject(relics), heading: 'Rhythm Relics Co.' }, plainCard, { ...itemFromProject({ ...plain, id: 'gone' }) }, headingItem('Empty')];
    const projects = new Map([you, relics, plain].map((x) => [x.id, x]));
    return { p, projects };
  }

  it('turns the portfolio into the starter pack Creative Universe imports, in order', () => {
    const { p, projects } = setup();
    const { pack, skipped, missing } = buildUniversePack(p, projects, (x) => (x.coverAssetId ? COVER : undefined), Date.UTC(2026, 10, 9));
    expect(skipped).toBe(1); // the poem: Creative Universe's pack holds Projects only
    expect(missing).toBe(1); // a card whose Project was deleted
    expect(pack.format).toBe('yourigin-starter-portfolio');
    expect(pack.key).toBe('cassidy-ventures-v1');
    expect(pack.ownerName).toBe('Cassidy Rae');
    expect(pack.exportedAt).toBe('2026-11-09T00:00:00.000Z');
    expect(pack.sections.map((s) => s.heading)).toEqual(['Digital', 'Ventures']); // empty sections left out
    const [you] = pack.sections[0].projects;
    expect(you).toEqual({
      title: 'YOU',
      category: 'Human development',
      colour: 'jade',
      status: 'building',
      description: 'A human development ecosystem.',
      portfolioDescription: 'A home for growing, together.',
      link: 'https://example.org/you',
      cover: COVER,
      realm: 'digital',
      changes: [
        { date: '2026-11-02', text: 'Guided journeys' },
        { date: '2026-10-01', text: 'Launched the beta' },
      ],
    });
  });

  it('carries the card title, a custom address, no picture when the card has none, and only https links', () => {
    const { p, projects } = setup();
    const { pack } = buildUniversePack(p, projects, () => COVER);
    const [relics, plain] = pack.sections[1].projects;
    expect(relics).toMatchObject({ title: 'Rhythm Relics Co.', realm: 'music', slug: 'relics' });
    expect(plain.cover).toBeUndefined();
    expect(plain.link).toBeUndefined();
    expect(plain.realm).toBeUndefined(); // placed by its section in Creative Universe, as before
    expect(plain.changes).toBeUndefined();
  });

  it('can be read back by YOUrigin’s own starter import', () => {
    const { p, projects } = setup();
    const { pack } = buildUniversePack(p, projects, () => undefined);
    const parsed = parseStarterPack(JSON.parse(JSON.stringify(pack)));
    expect(parsed.sections.flatMap((s) => s.projects.map((x) => x.title))).toEqual(['YOU', 'Rhythm Relics Co.', 'Empatherapy']);
  });

  it('names the file after the starter it replaces', () => {
    const { p, projects } = setup();
    expect(universeFileName(buildUniversePack(p, projects, () => undefined).pack)).toBe('cassidy-ventures.json');
    expect(slugify("Chantilly's Tallow")).toBe('chantillys-tallow');
  });
});
