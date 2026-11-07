import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { PortfolioView } from '../portfolio/PortfolioView';
import { loadPortfolio, tokenFromHash, type ClientDeps, type LoadResult } from './client';

// The standalone public page: one portfolio, by the token after # in its
// link. It works without an account, has nothing of the YOUrigin app in it,
// and never registers a service worker.

type View = LoadResult | { kind: 'loading' } | { kind: 'no-link' };

function sessionStore(): ClientDeps['storage'] {
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage blocked: visitors are asked for the password each time
  }
}

const browserDeps = (): ClientDeps => ({ fetch: window.fetch.bind(window), storage: sessionStore() });

function setRobots(indexable: boolean) {
  document.querySelector('meta[name="robots"]')?.setAttribute('content', indexable ? 'index, follow' : 'noindex, nofollow');
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="pv-notice">
      <div className="pv-card" role="status">
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function Viewer({ deps = browserDeps() }: { deps?: ClientDeps }) {
  const [token, setToken] = useState(() => tokenFromHash(window.location.hash));
  const [view, setView] = useState<View>(() => (token ? { kind: 'loading' } : { kind: 'no-link' }));
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const lastRefresh = useRef(0);
  const refreshes = useRef(0);
  const depsRef = useRef(deps);
  const tokenRef = useRef(token);

  const load = useCallback(async (t: string, pw: string | null) => {
    const r = await loadPortfolio(t, pw, depsRef.current);
    setView(r);
    if (r.kind === 'ok') {
      lastRefresh.current = Date.now();
      setRobots(r.indexable);
      document.title = [r.snapshot.ownerName, r.snapshot.title].filter(Boolean).join(' — ') || 'Portfolio';
    } else {
      setRobots(false);
      document.title = 'Portfolio';
    }
    return r;
  }, []);

  useEffect(() => {
    const onHash = () => {
      const t = tokenFromHash(window.location.hash);
      // Only a different portfolio is a new page; the same token (re-announced) changes nothing.
      if (t === tokenRef.current) return;
      tokenRef.current = t;
      setToken(t);
      setView(t ? { kind: 'loading' } : { kind: 'no-link' });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (token) void load(token, null);
  }, [token, load]);

  // Picture links last ten minutes; when one has run out, fetch fresh ones (a few times at most).
  const onImageError = useCallback(() => {
    if (!token || refreshes.current >= 5 || Date.now() - lastRefresh.current < 30_000) return;
    refreshes.current++;
    lastRefresh.current = Date.now();
    void load(token, null);
  }, [token, load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !password) return;
    setBusy(true);
    const r = await load(token, password);
    setBusy(false);
    if (r.kind === 'ok') setPassword('');
  };

  switch (view.kind) {
    case 'loading':
      return (
        <main className="pv-notice" aria-busy="true">
          <div className="pv-spinner" role="status" aria-label="Loading portfolio" />
        </main>
      );
    case 'ok':
      return <PortfolioView snapshot={view.snapshot} resolveImage={(ref) => ref} onImageError={onImageError} />;
    case 'password':
      return (
        <main className="pv-notice">
          <form className="pv-card" onSubmit={submit}>
            <h1>This portfolio is protected</h1>
            <p>Enter the password you were given with the link.</p>
            <label htmlFor="pv-password">Password</label>
            <input
              id="pv-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={view.wrong || undefined}
              aria-describedby={view.wrong ? 'pv-error' : undefined}
            />
            {view.wrong && (
              <p id="pv-error" className="pv-error" role="alert">That password isn’t right. Check it and try again.</p>
            )}
            <button type="submit" disabled={busy || !password}>{busy ? 'Opening…' : 'Open portfolio'}</button>
          </form>
        </main>
      );
    case 'locked':
      return (
        <Notice title="Too many tries">
          <p>For safety, this portfolio can’t be opened from here for a little while. Please try again in 15 minutes.</p>
        </Notice>
      );
    case 'unavailable':
      return (
        <Notice title="This portfolio isn’t available">
          <p>The link may have been turned off, replaced or reached its end date. If you were expecting to see it, ask the person who sent it for a new link.</p>
        </Notice>
      );
    case 'try_later':
      return (
        <Notice title="Couldn’t load this portfolio">
          <p>Check your connection and try again.</p>
          <button type="button" onClick={() => token && (setView({ kind: 'loading' }), void load(token, null))}>Try again</button>
        </Notice>
      );
    case 'no-link':
      return (
        <Notice title="No portfolio here">
          <p>This page shows a portfolio when it’s opened from the full link you were sent. Check that the whole link was copied.</p>
        </Notice>
      );
  }
}
