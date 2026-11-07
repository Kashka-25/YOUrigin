// The public page's only connection: the yourigin-portfolio Edge Function.
// No Supabase client, no account, nothing from the YOUrigin app.

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../sync/config';
import type { PortfolioSnapshot } from '../portfolio/model';
import { SHARE_TOKEN_RE, type PublicSnapshot, type VisitorError, type VisitorResponse } from '../../supabase/functions/yourigin-portfolio/wire';

/** Fixed at build time (a custom host can set VITE_PORTFOLIO_API); never taken from the page's address. */
export const API_URL: string = import.meta.env.VITE_PORTFOLIO_API || `${SUPABASE_URL}/functions/v1/yourigin-portfolio`;

/** The token after #. Anything else in the address is ignored. */
export function tokenFromHash(hash: string): string | null {
  const t = hash.replace(/^#\/?/, '').replace(/^t=/, '').trim();
  return SHARE_TOKEN_RE.test(t) ? t : null;
}

export type LoadResult =
  | { kind: 'ok'; snapshot: PortfolioSnapshot; indexable: boolean }
  | { kind: 'password'; wrong: boolean }
  | { kind: 'locked' }
  | { kind: 'unavailable' }
  | { kind: 'try_later' };

/** The public snapshot in the shape the shared PortfolioView renders; a picture's ref is its link. */
export function toViewSnapshot(s: PublicSnapshot): PortfolioSnapshot {
  return {
    ...s,
    sections: s.sections.map((sec) => ({
      ...sec,
      items: sec.items.map((i) => ({ ...i, image: i.image ? { ref: i.image.url, alt: i.image.alt, width: i.image.width, height: i.image.height } : null })),
    })),
  };
}

export interface ClientDeps {
  fetch: typeof fetch;
  /** Where this tab keeps a pass after a correct password (sessionStorage in the browser). */
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

const passKey = (token: string) => `yourigin.portfolio.pass.${token}`;

function stored(deps: ClientDeps, token: string): string | null {
  try {
    return deps.storage?.getItem(passKey(token)) ?? null;
  } catch {
    return null;
  }
}

function remember(deps: ClientDeps, token: string, pass: string | null) {
  try {
    if (pass) deps.storage?.setItem(passKey(token), pass);
    else deps.storage?.removeItem(passKey(token));
  } catch {
    /* private mode: they'll be asked again next time */
  }
}

export async function loadPortfolio(token: string, password: string | null, deps: ClientDeps): Promise<LoadResult> {
  const pass = stored(deps, token);
  let res: Response;
  try {
    res = await deps.fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ token, ...(password ? { password } : pass ? { pass } : {}) }),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    return { kind: 'try_later' };
  }
  const body: (VisitorResponse & { error?: undefined }) | { error: VisitorError } | null = await res.json().catch(() => null);
  if (res.ok && body && 'portfolio' in body) {
    if (body.pass) remember(deps, token, body.pass);
    return { kind: 'ok', snapshot: toViewSnapshot(body.portfolio), indexable: body.indexable === true };
  }
  const error = body && 'error' in body ? body.error : null;
  if (error === 'password_required' || error === 'wrong_password') {
    // Whatever pass this tab had no longer works (password changed, link replaced…).
    remember(deps, token, null);
    return { kind: 'password', wrong: error === 'wrong_password' };
  }
  if (error === 'locked') return { kind: 'locked' };
  if (error === 'unavailable' || res.status === 404) {
    remember(deps, token, null);
    return { kind: 'unavailable' };
  }
  return { kind: 'try_later' };
}
