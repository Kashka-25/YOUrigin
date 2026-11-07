import { describe, expect, it } from 'vitest';
import {
  buildSnapshot,
  canAddPiece,
  contactHref,
  headingItem,
  itemFromPiece,
  itemFromProject,
  itemFromWork,
  LIMITS,
  moveItem,
  newPortfolio,
  portfolioState,
  publishBlockers,
  snapshotHash,
  validatePortfolio,
  type Portfolio,
  type PortfolioSources,
} from './model';
import type { Book, BookEntry, ContentItem, Project, Section } from '../domain/types';

const piece = (over: Partial<ContentItem>): ContentItem => ({
  id: 'c1',
  title: '',
  body: '',
  type: 'poem',
  status: 'seed',
  tagIds: ['t-private'],
  notes: 'PRIVATE NOTE',
  source: { kind: 'capture', fileName: 'private-file.docx' },
  keepUnassigned: false,
  archived: false,
  deletedAt: null,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1',
  title: 'Tidewater',
  description: 'A public-facing line.',
  category: 'Creative',
  status: 'building',
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const work = (over: Partial<Book> = {}): Book => ({
  id: 'w1',
  title: 'Salt Songs',
  subtitle: 'Poems',
  description: 'A collection.',
  type: 'poetry',
  kind: 'book',
  templateId: null,
  cover: 'sea',
  notes: 'PRIVATE WORK NOTE',
  archived: false,
  coverAssetId: 'a-cover',
  ...{ createdAt: 0, updatedAt: 0 },
  ...over,
});

const section = (id: string, order: number, title: string): Section => ({ id, bookId: 'w1', title, order, notes: 'PRIVATE SECTION NOTE', createdAt: 0, updatedAt: 0 });
const entry = (id: string, sectionId: string | null, contentId: string, order: number): BookEntry => ({ id, bookId: 'w1', sectionId, contentId, order, createdAt: 0, updatedAt: 0 });

function sources(over: Partial<PortfolioSources> = {}): PortfolioSources {
  const items = [
    piece({ id: 'poem', title: 'Low Tide', body: 'The sea goes out\nand comes back.' }),
    piece({ id: 'second', title: 'High Water', body: 'Second poem.' }),
    piece({ id: 'trayed', title: 'Unplaced', body: 'In the tray only.' }),
    piece({ id: 'art', type: 'image', title: 'Harbour', body: 'Caption here', assetId: 'a-art', art: { medium: 'Oil on board', madeOn: '2026' } }),
    piece({ id: 'insp', type: 'image', title: 'Someone else', assetId: 'a-insp', inspiration: true }),
    piece({ id: 'gone', title: 'Trashed', body: 'x', deletedAt: 5 }),
  ];
  return {
    projects: new Map([['p1', project()]]),
    works: new Map([['w1', work()]]),
    content: new Map(items.map((i) => [i.id, i])),
    sections: [section('s2', 1, 'Two'), section('s1', 0, 'One')],
    entries: [entry('e2', 's2', 'second', 0), entry('e1', 's1', 'poem', 0), entry('e3', null, 'trayed', 0)],
    ...over,
  };
}

function withItems(p: Portfolio, ...items: Portfolio['items']): Portfolio {
  return { ...p, items: [...p.items, ...items] };
}

describe('new portfolios', () => {
  it('start as private, unpublished drafts that will share unlisted', () => {
    const p = newPortfolio('professional', ' Ana ');
    expect(p.publication).toBeNull();
    expect(p.visibility).toBe('unlisted');
    expect(p.ownerName).toBe('Ana');
    expect(p.theme).toBe('studio');
    expect(portfolioState(p, null)).toBe('draft');
  });

  it('each purpose has its own look and first heading', () => {
    expect(newPortfolio('creative').theme).toBe('gallery');
    expect(newPortfolio('business').items[0]).toMatchObject({ kind: 'heading', heading: 'Ventures' });
  });
});

describe('snapshot', () => {
  it('shows only what the editor shows: never notes, tags, file names or statuses', () => {
    const src = sources();
    const p = withItems(newPortfolio('creative', 'Ana'), itemFromProject(project()), { ...itemFromWork(work()), textMode: 'full' }, itemFromPiece(src.content.get('poem')!), itemFromPiece(src.content.get('art')!));
    const json = JSON.stringify(buildSnapshot(p, src).snapshot);
    for (const secret of ['PRIVATE', 't-private', 'private-file', 'building', 'seed', 'Creative']) expect(json).not.toContain(secret);
  });

  it('uses the description written for the portfolio, not the source’s', () => {
    const p = withItems(newPortfolio('professional', 'Ana'), { ...itemFromProject(project()), description: 'Written for recruiters' });
    const item = buildSnapshot(p, sources()).snapshot.sections[0].items[0];
    expect(item).toMatchObject({ kind: 'project', title: 'Tidewater', description: 'Written for recruiters', image: null });
  });

  it('includes a Project cover image in the portfolio snapshot', () => {
    const p = withItems(newPortfolio('creative', 'Ana'), itemFromProject(project({ coverAssetId: 'project-cover' })));
    const item = buildSnapshot(p, sources()).snapshot.sections[0].items[0];
    expect(item.image).toEqual({ ref: 'project-cover', alt: '' });
  });

  it('publishes a secure destination URL for a Project and rejects unsafe schemes', () => {
    const src = sources();
    const p = withItems(
      newPortfolio('creative', 'Ana'),
      { ...itemFromProject(project()), destinationUrl: 'https://example.com/creation' },
      { ...itemFromProject(project({ id: 'p1', title: 'Unsafe' })), destinationUrl: 'javascript:alert(1)' },
    );
    const items = buildSnapshot(p, src).snapshot.sections[0].items;
    expect(items[0].destinationUrl).toBe('https://example.com/creation');
    expect(items[1].destinationUrl).toBeNull();
  });

  it('a Work’s full text follows its reading order and leaves the tray out', () => {
    const p = withItems(newPortfolio('creative', 'Ana'), { ...itemFromWork(work()), textMode: 'full' });
    const item = buildSnapshot(p, sources()).snapshot.sections[0].items[0];
    expect(item.text.map((b) => b.text)).toEqual(['One', 'Low Tide', 'The sea goes out\nand comes back.', 'Two', 'High Water', 'Second poem.']);
    expect(JSON.stringify(item)).not.toContain('In the tray only');
    expect(item).toMatchObject({ label: 'Book', subtitle: 'Poems', image: { ref: 'a-cover' } });
  });

  it('the text shown is chosen per item', () => {
    const src = sources();
    const p = newPortfolio('creative', 'Ana');
    const none = buildSnapshot(withItems(p, { ...itemFromWork(work()), textMode: 'none' }), src).snapshot.sections[0].items[0];
    const short = buildSnapshot(withItems(p, { ...itemFromWork(work()), textMode: 'excerpt' }), src).snapshot.sections[0].items[0];
    expect(none.text).toEqual([]);
    expect(short.text).toEqual([{ kind: 'body', text: 'The sea goes out and comes back.' }]);
  });

  it('cuts very long full text and says so', () => {
    const long = piece({ id: 'long', title: 'Epic', body: 'word '.repeat(LIMITS.fullText) });
    const p = withItems(newPortfolio('creative', 'Ana'), { ...itemFromPiece(long), textMode: 'full' });
    const item = buildSnapshot(p, sources({ content: new Map([['long', long]]) })).snapshot.sections[0].items[0];
    expect(item.truncated).toBe(true);
    expect(item.text[0].text.length).toBeLessThanOrEqual(LIMITS.fullText + 1);
  });

  it('artwork carries its details and picture, and the picture can be left out', () => {
    const src = sources();
    const art = itemFromPiece(src.content.get('art')!);
    const p = newPortfolio('creative', 'Ana');
    const shown = buildSnapshot(withItems(p, { ...art, alt: 'Boats at dusk' }), src).snapshot.sections[0].items[0];
    expect(shown).toMatchObject({ label: 'Artwork', title: 'Harbour', meta: ['Oil on board', '2026'], image: { ref: 'a-art', alt: 'Boats at dusk' } });
    expect(buildSnapshot(withItems(p, { ...art, image: 'none' }), src).snapshot.sections[0].items[0].image).toBeNull();
  });

  it('leaves out and reports items that can no longer be shown', () => {
    const src = sources();
    const p = withItems(
      newPortfolio('creative', 'Ana'),
      itemFromPiece(src.content.get('gone')!),
      itemFromPiece(src.content.get('insp')!),
      { ...itemFromProject(project()), sourceId: 'deleted' },
      itemFromPiece(src.content.get('poem')!),
    );
    const built = buildSnapshot(p, src);
    expect(built.problems.map((x) => x.message)).toEqual([
      'This piece is in the Trash.',
      'Inspiration images are other people’s work and can’t be shown.',
      'This Project no longer exists.',
    ]);
    expect(built.snapshot.sections[0].items.map((i) => i.title)).toEqual(['Low Tide']);
    expect(publishBlockers(p, built)).toContain('Remove or replace the items that can no longer be shown.');
  });

  it('groups items under headings and hides empty headings', () => {
    const src = sources();
    const p: Portfolio = { ...newPortfolio('creative', 'Ana'), items: [itemFromPiece(src.content.get('poem')!), headingItem('Empty'), headingItem('Art'), itemFromPiece(src.content.get('art')!)] };
    const sections = buildSnapshot(p, src).snapshot.sections;
    expect(sections.map((s) => [s.heading, s.items.length])).toEqual([['', 1], ['Art', 1]]);
  });

  it('keeps standalone text sections and their copy in the visitor snapshot', () => {
    const textSection = { ...headingItem('A little about me'), description: 'I make things with care.' };
    const snapshot = buildSnapshot(withItems(newPortfolio('creative', 'Ana'), textSection), sources()).snapshot;
    expect(snapshot.sections).toMatchObject([{ heading: 'A little about me', description: 'I make things with care.', items: [] }]);
  });

  it('carries canvas width and image crop choices into the visitor snapshot', () => {
    const src = sources();
    const art = itemFromPiece(src.content.get('art')!);
    const snapshot = buildSnapshot(withItems(newPortfolio('creative', 'Ana'), { ...art, layoutSpan: 2, imageShape: 'portrait' }), src).snapshot;
    expect(snapshot.sections[0].items[0]).toMatchObject({ layoutSpan: 2, imageShape: 'portrait' });
  });

  it('only working contact links are shown', () => {
    const p = { ...newPortfolio('professional', 'Ana'), contactLinks: [
      { kind: 'email' as const, label: '', value: 'ana@example.com' },
      { kind: 'website' as const, label: 'Site', value: 'ana.example.com' },
      { kind: 'other' as const, label: 'Bad', value: 'javascript:alert(1)' },
    ] };
    expect(buildSnapshot(p, sources()).snapshot.contact).toEqual([
      { kind: 'email', label: 'Email', href: 'mailto:ana@example.com' },
      { kind: 'website', label: 'Site', href: 'https://ana.example.com/' },
    ]);
    expect(validatePortfolio(p)).toEqual(['Contact 3 must be a web address starting https://.']);
  });
});

describe('rules', () => {
  it('inspiration images and trashed pieces can’t be added', () => {
    const src = sources();
    expect(canAddPiece(src.content.get('art')!)).toBe(true);
    expect(canAddPiece(src.content.get('insp')!)).toBe(false);
    expect(canAddPiece(src.content.get('gone')!)).toBe(false);
  });

  it('insecure links and malformed emails are refused', () => {
    expect(contactHref({ kind: 'website', label: '', value: 'http://insecure.example.com' })).toBeNull();
    expect(contactHref({ kind: 'email', label: '', value: 'not-an-email' })).toBeNull();
  });

  it('publishing needs a title, a name and something to show', () => {
    const p = { ...newPortfolio('professional'), title: '' };
    expect(publishBlockers(p, buildSnapshot(p, sources()))).toEqual([
      'Give the portfolio a title.',
      'Add the name you want to be introduced by.',
      'Add at least one Project, Work or piece.',
    ]);
  });

  it('the fingerprint changes when what a visitor sees changes', () => {
    const src = sources();
    const p = withItems(newPortfolio('creative', 'Ana'), itemFromPiece(src.content.get('poem')!));
    const a = snapshotHash(buildSnapshot(p, src).snapshot);
    expect(snapshotHash(buildSnapshot(p, src).snapshot)).toBe(a);
    expect(snapshotHash(buildSnapshot({ ...p, intro: 'Hello' }, src).snapshot)).not.toBe(a);
  });

  it('knows when a published portfolio has moved on, is off or has expired', () => {
    const pub = { remoteId: 'r', shareToken: 't', status: 'live' as const, visibility: 'unlisted' as const, publishedAt: 1, publishedHash: 'aaa', expiresAt: null, passwordSet: false };
    const p = { ...newPortfolio('creative'), publication: pub };
    expect(portfolioState(p, 'aaa')).toBe('live');
    expect(portfolioState(p, 'bbb')).toBe('changed');
    expect(portfolioState({ ...p, publication: { ...pub, status: 'disabled' } }, 'aaa')).toBe('disabled');
    expect(portfolioState({ ...p, publication: { ...pub, expiresAt: 10 } }, 'aaa', 11)).toBe('expired');
  });

  it('moves items', () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 0, 5)).toEqual([1, 2, 3]);
  });
});
