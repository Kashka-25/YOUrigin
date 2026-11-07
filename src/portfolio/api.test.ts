import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { db } from '../db/db';
import { createPortfolio } from '../db/portfolios';
import { buildSnapshot, itemFromPiece, snapshotHash, type Portfolio } from './model';
import { cleanSnapshot, portfolioFilePrefix } from '../../supabase/functions/yourigin-portfolio/wire';
import type { ContentItem } from '../domain/types';

// A stand-in for the Supabase client: records what the app sends.
const calls: { rpc: [string, Record<string, unknown>][]; uploads: string[]; removed: string[][] } = { rpc: [], uploads: [], removed: [] };
let folder: string[] = [];
let rpcError: string | null = null;
const UID = '00000000-0000-0000-0000-00000000000a';
const fake = {
  auth: { getSession: async () => ({ data: { session: { user: { id: UID } } } }) },
  storage: {
    from: () => ({
      list: async (prefix: string) => ({ data: folder.filter((f) => f.startsWith(`${prefix}/`)).map((f) => ({ name: f.split('/').pop() })), error: null }),
      upload: async (path: string) => {
        calls.uploads.push(path);
        return { error: null };
      },
      remove: async (paths: string[]) => {
        calls.removed.push(paths);
        return { error: null };
      },
    }),
  },
  rpc: async (fn: string, args: Record<string, unknown>) => {
    calls.rpc.push([fn, args]);
    if (rpcError) return { data: null, error: { message: rpcError } };
    return {
      data: { id: 'remote-1', local_id: args.p_local_id, share_token: 'TTTTTTTTTTTTTTTTTTTTTTTT', status: fn.includes('status') ? args.p_status : 'live', visibility: args.p_visibility ?? 'unlisted', password_set: args.p_visibility === 'password', expires_at: args.p_expires_at ?? null, published_at: '2026-11-07T12:00:00Z' },
      error: null,
    };
  },
};
vi.mock('../sync/supabase', () => ({ getClient: async () => fake }));
vi.mock('../io/images', () => ({
  shrinkImage: async () => ({ dataUrl: 'data:image/webp;base64,AAAA', mime: 'image/webp', width: 1600, height: 1067, bytes: 3, originalBytes: 3 }),
}));

const { publishPortfolio, replacePortfolioLink, setPortfolioLive, shareUrl, toStoredSnapshot, unpublishPortfolio } = await import('./api');

const art = (id: string, assetId: string): ContentItem => ({
  id, title: id, body: '', type: 'image', status: 'polished', tagIds: [], notes: '', source: { kind: 'capture' },
  keepUnassigned: false, archived: false, deletedAt: null, createdAt: 0, updatedAt: 0, assetId,
});

async function setup(over: Partial<Portfolio> = {}) {
  const id = await createPortfolio('creative', 'Ana');
  const pieces = [art('a1', 'asset-1'), art('a2', 'asset-1'), art('a3', 'asset-2')];
  for (const assetId of ['asset-1', 'asset-2']) {
    await db.assets.put({ id: assetId, name: 'x.jpg', mime: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AAAA', width: 10, height: 10, bytes: 3, createdAt: 0, updatedAt: 0 });
  }
  const p: Portfolio = { ...(await db.portfolios.get(id))!, items: pieces.map(itemFromPiece), ...over };
  const built = buildSnapshot(p, { projects: new Map(), works: new Map(), content: new Map(pieces.map((c) => [c.id, c])), sections: [], entries: [] });
  return { p, snapshot: built.snapshot, hash: snapshotHash(built.snapshot) };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  calls.rpc = [];
  calls.uploads = [];
  calls.removed = [];
  folder = [];
  rpcError = null;
});

describe('links', () => {
  it('put the token after # under p/, next to the app', () => {
    expect(shareUrl('TOK', 'https://kashka-25.github.io/YOUrigin/')).toBe('https://kashka-25.github.io/YOUrigin/p/#TOK');
    expect(shareUrl('TOK', 'https://kashka-25.github.io/YOUrigin/index.html')).toBe('https://kashka-25.github.io/YOUrigin/p/#TOK');
    expect(shareUrl('TOK', 'https://portfolio.example.com')).toBe('https://portfolio.example.com/p/#TOK');
  });
});

describe('what is uploaded', () => {
  it('each picture once, into the portfolio’s hashed folder, in the shape the server accepts unchanged', async () => {
    const { p, snapshot } = await setup();
    const prefix = await portfolioFilePrefix(UID, p.id);
    const uploads: string[] = [];
    const stored = await toStoredSnapshot(snapshot, prefix, async (path) => void uploads.push(path), new Set([`${prefix}asset-2.webp`]));
    expect(uploads).toEqual([`${prefix}asset-1.webp`]);
    expect(stored.sections[0].items.map((i) => i.image?.path)).toEqual([`${prefix}asset-1.webp`, `${prefix}asset-1.webp`, `${prefix}asset-2.webp`]);
    expect(cleanSnapshot(JSON.parse(JSON.stringify(stored)), prefix)).toEqual(stored);
  });
});

describe('publishing', () => {
  it('sends the snapshot and settings, removes pictures no longer used, and records the publication', async () => {
    const { p, snapshot, hash } = await setup();
    const prefix = await portfolioFilePrefix(UID, p.id);
    folder = [`${prefix}old-asset.webp`, `${prefix}asset-2.webp`];
    const pub = await publishPortfolio(p, snapshot, hash, 'ignored for unlisted');
    const [fn, args] = calls.rpc[0];
    expect(fn).toBe('yourigin_publish_portfolio');
    expect(args).toMatchObject({ p_local_id: p.id, p_visibility: 'unlisted', p_expires_at: null, p_password: null });
    expect(calls.uploads).toEqual([`${prefix}asset-1.webp`]);
    expect(calls.removed).toEqual([[`${prefix}old-asset.webp`]]);
    expect(pub).toMatchObject({ remoteId: 'remote-1', status: 'live', publishedHash: hash, passwordSet: false });
    expect((await db.portfolios.get(p.id))?.publication).toEqual(pub);
  });

  it('sends a password only for password-protected portfolios, and never keeps it', async () => {
    const { p, snapshot, hash } = await setup({ visibility: 'password', expiresAt: Date.parse('2027-01-01T00:00:00Z') });
    await publishPortfolio(p, snapshot, hash, 'correct horse');
    expect(calls.rpc[0][1]).toMatchObject({ p_visibility: 'password', p_password: 'correct horse', p_expires_at: '2027-01-01T00:00:00.000Z' });
    expect(JSON.stringify(await db.portfolios.toArray())).not.toContain('correct horse');
  });

  it('takes back new uploads when the server refuses', async () => {
    const { p, snapshot, hash } = await setup();
    rpcError = 'This account is not allowed to publish portfolios yet';
    await expect(publishPortfolio(p, snapshot, hash)).rejects.toThrow(/allowlisted/);
    expect(calls.removed.flat().sort()).toEqual([...calls.uploads].sort());
    expect((await db.portfolios.get(p.id))?.publication).toBeNull();
  });
});

describe('ending access', () => {
  async function published() {
    const { p, snapshot, hash } = await setup();
    await publishPortfolio(p, snapshot, hash);
    calls.rpc = [];
    return (await db.portfolios.get(p.id))!;
  }

  it('turning off and replacing the link go to the owner functions', async () => {
    const p = await published();
    expect((await setPortfolioLive(p, false)).status).toBe('disabled');
    await replacePortfolioLink(p);
    expect(calls.rpc.map(([fn, a]) => [fn, a.p_id])).toEqual([
      ['yourigin_set_portfolio_status', 'remote-1'],
      ['yourigin_rotate_portfolio_link', 'remote-1'],
    ]);
  });

  it('unpublishing deletes the server copy and every picture, and the draft becomes private again', async () => {
    const p = await published();
    const prefix = await portfolioFilePrefix(UID, p.id);
    folder = [`${prefix}asset-1.webp`, `${prefix}asset-2.webp`];
    calls.removed = [];
    await unpublishPortfolio(p);
    expect(calls.rpc).toEqual([['yourigin_unpublish_portfolio', { p_id: 'remote-1' }]]);
    expect(calls.removed).toEqual([[`${prefix}asset-1.webp`, `${prefix}asset-2.webp`]]);
    expect((await db.portfolios.get(p.id))?.publication).toBeNull();
  });
});

describe('separation from YOU Showcase', () => {
  it('the portfolio code never reads or writes Showcase tables, its bucket or its functions', () => {
    for (const file of ['./api.ts', './model.ts', '../../supabase/functions/yourigin-portfolio/handler.ts', '../../supabase/functions/yourigin-portfolio/wire.ts']) {
      const code = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/showcase|artist_profiles/i);
    }
  });
});
