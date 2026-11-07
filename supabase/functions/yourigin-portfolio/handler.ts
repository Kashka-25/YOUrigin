// The visitor flow for a portfolio link, with the database and storage
// passed in, so the whole flow is tested without a server.
//
// POST { token, password?, pass? } → 200 VisitorResponse, or
//   404 unavailable       no such link, turned off or past its end date (the
//                         same answer for all three, so a link reveals nothing)
//   401 password_required / wrong_password
//   429 locked            too many wrong passwords from this visitor
//   400 bad_request
//   503 try_later         the database or storage didn't answer
// Every request re-reads the portfolio: nothing issued earlier (a pass or a
// picture link) can bring back access that has been turned off.

import {
  PASS_HOURS,
  SHARE_TOKEN_RE,
  cleanSnapshot,
  clientKey,
  imagePaths,
  portfolioFilePrefix,
  signPass,
  tokenTag,
  verifyPass,
  withImageUrls,
  type VisitorError,
  type VisitorResponse,
} from './wire.ts';

export interface PortfolioRow {
  id: string;
  user_id: string;
  local_id: string;
  share_token: string;
  status: 'live' | 'disabled';
  visibility: 'unlisted' | 'password' | 'public';
  access_version: number;
  expires_at: string | null;
  snapshot: unknown;
}

export interface Deps {
  /** The row for a link token, without the password hash. */
  findByToken(token: string): Promise<PortfolioRow | null>;
  tryPassword(id: string, password: string, client: string): Promise<'ok' | 'wrong' | 'locked'>;
  noteView(id: string): Promise<void>;
  /** Signed links for pictures in the private bucket, by path. */
  signImages(paths: string[], seconds: number): Promise<Record<string, string>>;
  /** Secret for access passes and scrambling visitor addresses. */
  secret: string;
  now(): number;
}

/** Picture links last ten minutes; the page asks for fresh ones if a picture fails to load. */
export const IMAGE_LINK_SECONDS = 600;

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

function reply(body: VisitorResponse | { error: VisitorError }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

const fail = (error: VisitorError, status: number) => reply({ error }, status);

function visitorAddress(req: Request): string {
  return (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '').trim();
}

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const handle = serve(deps);
  return async (req) => {
    try {
      return await handle(req);
    } catch (e) {
      console.error('[yourigin-portfolio]', e instanceof Error ? e.message : e);
      return fail('try_later', 503);
    }
  };
}

function serve(deps: Deps): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (req.method !== 'POST') return fail('bad_request', 405);

    let body: Record<string, unknown>;
    try {
      const text = await req.text();
      if (text.length > 4000) return fail('bad_request', 400);
      body = JSON.parse(text);
    } catch {
      return fail('bad_request', 400);
    }
    const token = body?.token;
    if (typeof token !== 'string' || !SHARE_TOKEN_RE.test(token)) return fail('unavailable', 404);

    const row = await deps.findByToken(token);
    const now = deps.now();
    if (!row || row.share_token !== token || row.status !== 'live' || (row.expires_at !== null && Date.parse(row.expires_at) <= now)) {
      return fail('unavailable', 404);
    }

    let pass: string | undefined;
    if (row.visibility === 'password') {
      const current = { id: row.id, accessVersion: row.access_version, shareToken: row.share_token };
      const passOk = await verifyPass(deps.secret, body.pass, current, now);
      if (!passOk) {
        const password = body.password;
        if (typeof password !== 'string' || !password) return fail('password_required', 401);
        if (password.length > 200) return fail('wrong_password', 401);
        const result = await deps.tryPassword(row.id, password, await clientKey(deps.secret, visitorAddress(req), row.id));
        if (result === 'locked') return fail('locked', 429);
        if (result !== 'ok') return fail('wrong_password', 401);
        const expires = row.expires_at ? Math.min(Date.parse(row.expires_at), now + PASS_HOURS * 3_600_000) : now + PASS_HOURS * 3_600_000;
        pass = await signPass(deps.secret, { p: row.id, v: row.access_version, t: await tokenTag(row.share_token), e: expires });
      }
    }

    const stored = cleanSnapshot(row.snapshot, await portfolioFilePrefix(row.user_id, row.local_id));
    const paths = imagePaths(stored);
    const urls = paths.length ? await deps.signImages(paths, IMAGE_LINK_SECONDS) : {};
    // Counting is best effort; a visitor never waits on it or sees it fail.
    await deps.noteView(row.id).catch(() => undefined);

    return reply({ portfolio: withImageUrls(stored, urls), indexable: row.visibility === 'public', ...(pass ? { pass } : {}) });
  };
}
