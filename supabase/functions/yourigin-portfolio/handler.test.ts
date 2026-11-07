// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { createHandler, IMAGE_LINK_SECONDS, type Deps, type PortfolioRow } from './handler.ts';
import { cleanSnapshot, portfolioFilePrefix, safeHref, signPass, tokenTag, type VisitorResponse } from './wire.ts';

const OWNER = '00000000-0000-0000-0000-00000000000a';
const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAA';
const SECRET = 'test-secret-test-secret-test-secret-0123456789';
const HOUR = 3_600_000;
// The owner's folder for local-1, as the app and database compute it.
const PREFIX = await portfolioFilePrefix(OWNER, 'local-1');

const snapshot = {
  version: 1,
  title: 'Selected work',
  purpose: 'creative',
  theme: 'gallery',
  ownerName: 'Ana Rivers',
  ownerLine: 'Poet and painter',
  intro: 'Hello',
  contact: [
    { kind: 'email', label: 'Email', href: 'mailto:ana@example.com' },
    { kind: 'website', label: 'Site', href: 'https://ana.example.com/' },
    { kind: 'other', label: 'Evil', href: 'javascript:alert(1)' },
  ],
  sections: [
    {
      key: 's1',
      heading: 'Paintings',
      items: [
        {
          key: 'i1', kind: 'piece', label: 'Artwork', title: 'Harbour', subtitle: '', description: 'Oil', meta: ['2026'],
          text: [], textMode: 'none', truncated: false,
          image: { path: `${PREFIX}harbour.webp`, width: 1200, height: 800, alt: 'A harbour' },
          notes: 'PRIVATE', tagIds: ['secret-tag'],
        },
        {
          key: 'i2', kind: 'piece', label: 'Artwork', title: 'Not mine', subtitle: '', description: '', meta: [],
          text: [], textMode: 'none', truncated: false,
          image: { path: `someone-else/local-1/x.webp`, width: 10, height: 10, alt: '' },
        },
      ],
    },
  ],
  userId: 'leaky',
};

let row: PortfolioRow;
let now: number;
let views: number;
let failures: Map<string, number>;
let signed: { paths: string[]; seconds: number }[];
let broken: boolean;

const deps: Deps = {
  secret: SECRET,
  now: () => now,
  async findByToken(token) {
    if (broken) throw new Error('database down');
    return row && row.share_token === token ? { ...row } : null;
  },
  async tryPassword(_id, password, client) {
    const n = failures.get(client) ?? 0;
    if (n >= 8) return 'locked';
    if (password === 'correct horse') return 'ok';
    failures.set(client, n + 1);
    return 'wrong';
  },
  async noteView() {
    views++;
  },
  async signImages(paths, seconds) {
    signed.push({ paths, seconds });
    return Object.fromEntries(paths.map((p) => [p, `https://storage.example/signed/${p}?token=short`]));
  },
};
const handle = createHandler(deps);

function post(body: unknown, ip = '203.0.113.7') {
  return handle(new Request('https://fn.example/yourigin-portfolio', { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': ip } }));
}

async function visit(body: Record<string, unknown> = {}, ip?: string) {
  const res = await post({ token: TOKEN, ...body }, ip);
  return { status: res.status, body: (await res.json()) as VisitorResponse & { error?: string }, headers: res.headers };
}

beforeEach(() => {
  now = Date.parse('2026-11-07T12:00:00Z');
  views = 0;
  failures = new Map();
  signed = [];
  broken = false;
  row = {
    id: 'p-1', user_id: OWNER, local_id: 'local-1', share_token: TOKEN, status: 'live',
    visibility: 'unlisted', access_version: 0, expires_at: null, snapshot,
  };
});

describe('reaching a portfolio', () => {
  it('needs no account: the link token alone opens an unlisted portfolio', async () => {
    const r = await visit();
    expect(r.status).toBe(200);
    expect(r.body.portfolio.ownerName).toBe('Ana Rivers');
    expect(r.body.indexable).toBe(false);
    expect(r.body.pass).toBeUndefined();
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(views).toBe(1);
  });

  it('only public portfolios may be indexed', async () => {
    row.visibility = 'public';
    expect((await visit()).body.indexable).toBe(true);
  });

  it('a wrong, malformed, turned-off or ended link all get the same answer', async () => {
    const expected = { status: 404, body: { error: 'unavailable' } };
    const pick = (r: Awaited<ReturnType<typeof visit>>) => ({ status: r.status, body: r.body });
    expect(pick(await visit({ token: 'BBBBBBBBBBBBBBBBBBBBBBBB' }))).toEqual(expected);
    expect(pick(await visit({ token: '../../etc' }))).toEqual(expected);
    row.status = 'disabled';
    expect(pick(await visit())).toEqual(expected);
    row.status = 'live';
    row.expires_at = new Date(now - 1).toISOString();
    expect(pick(await visit())).toEqual(expected);
    expect(views).toBe(0);
  });

  it('a link with an end date works until then', async () => {
    row.expires_at = new Date(now + HOUR).toISOString();
    expect((await visit()).status).toBe(200);
  });

  it('answers only POST, and preflight', async () => {
    expect((await handle(new Request('https://fn.example/', { method: 'GET' }))).status).toBe(405);
    const pre = await handle(new Request('https://fn.example/', { method: 'OPTIONS' }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
    expect((await handle(new Request('https://fn.example/', { method: 'POST', body: 'not json' }))).status).toBe(400);
  });

  it('when the database is down the visitor gets a clean answer the browser can read', async () => {
    broken = true;
    const r = await visit();
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'try_later' });
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('what a visitor receives', () => {
  it('only known fields, safe links and the owner’s own pictures, as short-lived links', async () => {
    const r = await visit();
    const json = JSON.stringify(r.body);
    for (const leak of ['PRIVATE', 'secret-tag', 'leaky', OWNER, TOKEN, 'javascript:', 'someone-else']) expect(json).not.toContain(leak);
    const items = r.body.portfolio.sections[0].items;
    expect(items[0].image).toEqual({ url: expect.stringContaining('https://storage.example/signed/'), width: 1200, height: 800, alt: 'A harbour' });
    expect(items[1].image).toBeNull();
    expect(r.body.portfolio.contact.map((c) => c.href)).toEqual(['mailto:ana@example.com', 'https://ana.example.com/']);
    expect(signed).toEqual([{ paths: [`${PREFIX}harbour.webp`], seconds: IMAGE_LINK_SECONDS }]);
    expect(IMAGE_LINK_SECONDS).toBeLessThanOrEqual(600);
  });

  it('cleans odd values instead of passing them through', () => {
    const s = cleanSnapshot({ theme: 'hacker', purpose: 1, sections: [{ items: [{ kind: 'script', textMode: 'all', text: [{ kind: 'html', text: '<b>x</b>' }] }] }] }, PREFIX);
    expect(s.theme).toBe('studio');
    expect(s.purpose).toBe('professional');
    expect(s.sections[0].items[0]).toMatchObject({ kind: 'piece', textMode: 'none', text: [{ kind: 'body', text: '<b>x</b>' }] });
    expect(safeHref('https://ok.example/')).toBe('https://ok.example/');
    for (const bad of ['http://plain.example', 'data:text/html,x', 'javascript:alert(1)', 'mailto:not-an-email']) expect(safeHref(bad)).toBeNull();
  });

  it('keeps layout choices, text sections and a Project’s own https link, and nothing unsafe', () => {
    const s = cleanSnapshot({ sections: [
      { heading: 'About', description: 'A few words.', items: [] },
      { heading: 'Empty', items: [] },
      { heading: 'Work', items: [
        { kind: 'project', destinationUrl: 'https://site.example/', layoutSpan: 2, imageShape: 'portrait' },
        { kind: 'project', destinationUrl: 'javascript:alert(1)', layoutSpan: 7, imageShape: 'giant' },
        { kind: 'project', destinationUrl: 'mailto:a@b.example' },
        { kind: 'piece', destinationUrl: 'https://site.example/' },
      ] },
    ] }, PREFIX);
    expect(s.sections.map((x) => [x.heading, x.description, x.items.length])).toEqual([['About', 'A few words.', 0], ['Work', '', 4]]);
    const [a, b, c, d] = s.sections[1].items;
    expect(a).toMatchObject({ destinationUrl: 'https://site.example/', layoutSpan: 2, imageShape: 'portrait' });
    expect(b).toMatchObject({ destinationUrl: null, layoutSpan: 1, imageShape: 'natural' });
    expect(c.destinationUrl).toBeNull();
    expect(d).not.toHaveProperty('destinationUrl');
  });

  it('pictures outside the portfolio’s own folder are never signed', () => {
    const s = cleanSnapshot({ sections: [{ items: [
      { image: { path: `${PREFIX}../other/x.webp` } },
      { image: { path: `${OWNER}/local-1/x.webp` } },
      { image: { path: `${PREFIX}sub/x.webp` } },
      { image: { path: `${PREFIX}fine.webp` } },
    ] }] }, PREFIX);
    expect(s.sections[0].items.map((i) => i.image?.path ?? null)).toEqual([null, null, null, `${PREFIX}fine.webp`]);
    expect(PREFIX).not.toContain(OWNER);
  });
});

describe('password-protected portfolios', () => {
  beforeEach(() => {
    row.visibility = 'password';
    row.access_version = 3;
  });

  it('ask for the password, refuse a wrong one, and give a pass for the right one', async () => {
    expect((await visit()).body).toEqual({ error: 'password_required' });
    expect((await visit({ password: 'guess' })).body).toEqual({ error: 'wrong_password' });
    expect(views).toBe(0);
    const ok = await visit({ password: 'correct horse' });
    expect(ok.status).toBe(200);
    expect(ok.body.pass).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(JSON.stringify(ok.body)).not.toContain('correct horse');
    const again = await visit({ pass: ok.body.pass });
    expect(again.status).toBe(200);
    expect(again.body.pass).toBeUndefined();
  });

  it('lock a visitor out after repeated wrong tries without locking out others', async () => {
    for (let i = 0; i < 8; i++) await visit({ password: 'guess' }, '198.51.100.1');
    expect((await visit({ password: 'correct horse' }, '198.51.100.1')).body).toEqual({ error: 'locked' });
    expect((await visit({ password: 'correct horse' }, '198.51.100.2')).status).toBe(200);
  });

  describe('an earlier pass never outlives revocation', () => {
    let pass: string;
    beforeEach(async () => {
      pass = (await visit({ password: 'correct horse' })).body.pass!;
      expect((await visit({ pass })).status).toBe(200);
    });

    it('turned off, and still after turning back on (the database moves the access version on)', async () => {
      row.status = 'disabled';
      row.access_version++;
      expect((await visit({ pass })).status).toBe(404);
      row.status = 'live';
      expect((await visit({ pass })).body).toEqual({ error: 'password_required' });
    });

    it('link ended', async () => {
      row.expires_at = new Date(now).toISOString();
      expect((await visit({ pass })).status).toBe(404);
    });

    it('link replaced: the old link is gone, and the pass doesn’t open the new one', async () => {
      row.share_token = 'CCCCCCCCCCCCCCCCCCCCCCCC';
      expect((await visit({ pass })).status).toBe(404);
      expect((await visit({ token: 'CCCCCCCCCCCCCCCCCCCCCCCC', pass })).body).toEqual({ error: 'password_required' });
    });

    it('password changed', async () => {
      row.access_version = 4;
      expect((await visit({ pass })).body).toEqual({ error: 'password_required' });
    });

    it('unpublished', async () => {
      row = null as unknown as PortfolioRow;
      expect((await visit({ pass })).status).toBe(404);
    });

    it('after twelve hours', async () => {
      now += 12 * HOUR + 1;
      expect((await visit({ pass })).body).toEqual({ error: 'password_required' });
    });

    it('tampered with', async () => {
      const [body, sig] = pass.split('.');
      const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
      const forged = Buffer.from(JSON.stringify({ ...claims, e: now + 1000 * HOUR })).toString('base64url');
      expect((await visit({ pass: `${forged}.${sig}` })).body).toEqual({ error: 'password_required' });
      expect((await visit({ pass: `${body}.${sig}x` })).body).toEqual({ error: 'password_required' });
    });
  });

  it('a pass for another portfolio, or signed with another secret, doesn’t work', async () => {
    const t = await tokenTag(TOKEN);
    const other = await signPass(SECRET, { p: 'p-2', v: 3, t, e: now + HOUR });
    const wrongKey = await signPass('another-secret-another-secret-another', { p: 'p-1', v: 3, t, e: now + HOUR });
    expect((await visit({ pass: other })).body).toEqual({ error: 'password_required' });
    expect((await visit({ pass: wrongKey })).body).toEqual({ error: 'password_required' });
  });

  it('a pass never lasts past the link’s end date', async () => {
    row.expires_at = new Date(now + HOUR).toISOString();
    const pass = (await visit({ password: 'correct horse' })).body.pass!;
    const claims = JSON.parse(Buffer.from(pass.split('.')[0], 'base64url').toString());
    expect(claims.e).toBe(now + HOUR);
  });
});
