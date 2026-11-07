import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHandler, type PortfolioRow } from '../../supabase/functions/yourigin-portfolio/handler';
import { portfolioFilePrefix } from '../../supabase/functions/yourigin-portfolio/wire';
import { API_URL, loadPortfolio, tokenFromHash, type ClientDeps } from './client';
import { Viewer } from './Viewer';

// The real Edge Function handler with an in-memory row stands in for the
// server, so these tests run the page and the server's rules together.

const OWNER = '00000000-0000-0000-0000-00000000000a';
const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAA';
const PREFIX = await portfolioFilePrefix(OWNER, 'local-1');
let row: PortfolioRow | null;
let requests: { url: string; body: Record<string, unknown> }[];

const handler = createHandler({
  secret: 'viewer-test-secret-viewer-test-secret-0123',
  now: () => Date.now(),
  findByToken: async (t) => (row && row.share_token === t ? { ...row } : null),
  tryPassword: async (_id, pw) => (pw === 'correct horse' ? 'ok' : 'wrong'),
  noteView: async () => undefined,
  signImages: async (paths) => Object.fromEntries(paths.map((p) => [p, `https://yikoymzktspamahrsuje.supabase.co/storage/v1/object/sign/portfolios/${p}?token=x`])),
});

function memoryStorage(): ClientDeps['storage'] & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

let storage: ReturnType<typeof memoryStorage>;
const deps = (): ClientDeps => ({
  storage,
  fetch: (async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) });
    return handler(new Request(url, init));
  }) as typeof fetch,
});

beforeEach(() => {
  requests = [];
  storage = memoryStorage();
  row = {
    id: 'p-1', user_id: OWNER, local_id: 'local-1', share_token: TOKEN, status: 'live', visibility: 'unlisted',
    access_version: 0, expires_at: null,
    snapshot: {
      version: 1, title: 'Selected work', purpose: 'professional', theme: 'studio', ownerName: 'Ana Rivers', ownerLine: 'Designer', intro: 'Hello there.',
      contact: [{ kind: 'email', label: 'Email', href: 'mailto:ana@example.com' }],
      sections: [{ key: 's', heading: 'Work', items: [{
        key: 'i', kind: 'piece', label: 'Artwork', title: 'Harbour', subtitle: '', description: '', meta: [], text: [], textMode: 'none', truncated: false,
        image: { path: `${PREFIX}a.webp`, width: 1200, height: 800, alt: 'A harbour' },
      }] }],
    },
  };
  window.location.hash = `#${TOKEN}`;
  document.head.innerHTML = '<meta name="robots" content="noindex, nofollow">';
});

afterEach(() => cleanup());

describe('the link', () => {
  it('carries only the token, after #', () => {
    expect(tokenFromHash(`#${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromHash(`#/${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromHash('#nope')).toBeNull();
    expect(tokenFromHash('')).toBeNull();
  });

  it('the page talks only to the fixed portfolio address, never one from the page’s own URL', async () => {
    window.location.hash = `#${TOKEN}?api=https://evil.example`;
    await loadPortfolio(TOKEN, null, deps());
    expect(requests.map((r) => r.url)).toEqual([API_URL]);
    expect(API_URL).toBe('https://yikoymzktspamahrsuje.supabase.co/functions/v1/yourigin-portfolio');
  });
});

describe('the public page', () => {
  it('shows an unlisted portfolio with no account, its pictures sized, and asks search engines not to list it', async () => {
    render(<Viewer deps={deps()} />);
    expect(await screen.findByRole('heading', { name: 'Ana Rivers' })).toBeTruthy();
    const img = screen.getByAltText('A harbour') as HTMLImageElement;
    expect(img.src).toContain('/storage/v1/object/sign/portfolios/');
    expect(img.getAttribute('width')).toBe('1200');
    expect(document.title).toBe('Ana Rivers — Selected work');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
  });

  it('lets search engines list only public portfolios', async () => {
    row!.visibility = 'public';
    render(<Viewer deps={deps()} />);
    await screen.findByRole('heading', { name: 'Ana Rivers' });
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index, follow');
  });

  it('says plainly when a portfolio isn’t available, the same for every reason', async () => {
    for (const change of [() => (row!.status = 'disabled'), () => (row!.expires_at = new Date(Date.now() - 1).toISOString()), () => (row = null)]) {
      change();
      render(<Viewer deps={deps()} />);
      expect(await screen.findByRole('heading', { name: 'This portfolio isn’t available' })).toBeTruthy();
      expect(document.body.textContent).not.toContain('Ana Rivers');
      cleanup();
    }
  });

  it('explains a missing or damaged link without calling the server', async () => {
    window.location.hash = '#half-a-link';
    render(<Viewer deps={deps()} />);
    expect(await screen.findByRole('heading', { name: 'No portfolio here' })).toBeTruthy();
    expect(requests).toEqual([]);
  });

  it('stays put when the address is re-announced with the same link, and opens another portfolio when it changes', async () => {
    render(<Viewer deps={deps()} />);
    await screen.findByRole('heading', { name: 'Ana Rivers' });
    await act(async () => window.dispatchEvent(new HashChangeEvent('hashchange')));
    expect(screen.getByRole('heading', { name: 'Ana Rivers' })).toBeTruthy();
    expect(requests).toHaveLength(1);
    window.location.hash = '#BBBBBBBBBBBBBBBBBBBBBBBB';
    await act(async () => window.dispatchEvent(new HashChangeEvent('hashchange')));
    expect(await screen.findByRole('heading', { name: 'This portfolio isn’t available' })).toBeTruthy();
    expect(requests.map((r) => r.body.token)).toEqual([TOKEN, 'BBBBBBBBBBBBBBBBBBBBBBBB']);
  });

  it('fetches fresh picture links when one has expired, but not in a loop', async () => {
    render(<Viewer deps={deps()} />);
    await screen.findByRole('heading', { name: 'Ana Rivers' });
    const img = screen.getByAltText('A harbour');
    fireEvent.error(img); // straight after loading: ignored
    expect(requests).toHaveLength(1);
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 31_000);
    await act(async () => fireEvent.error(img));
    fireEvent.error(img); // again at once: ignored
    clock.mockRestore();
    expect(requests).toHaveLength(2);
    expect(await screen.findByRole('heading', { name: 'Ana Rivers' })).toBeTruthy();
  });

  it('offers to try again when the server can’t be reached', async () => {
    const offline: ClientDeps = { storage, fetch: (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch };
    render(<Viewer deps={offline} />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('password-protected portfolios', () => {
  beforeEach(() => {
    row!.visibility = 'password';
    row!.access_version = 2;
  });

  async function unlock() {
    render(<Viewer deps={deps()} />);
    expect(await screen.findByRole('heading', { name: 'This portfolio is protected' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('Ana Rivers');
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'guess' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open portfolio' })));
    expect((await screen.findByRole('alert')).textContent).toContain('isn’t right');
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open portfolio' })));
    expect(await screen.findByRole('heading', { name: 'Ana Rivers' })).toBeTruthy();
    cleanup();
  }

  it('open with the password, then reopen in the same tab without it', async () => {
    await unlock();
    expect([...storage.data.keys()]).toEqual([`yourigin.portfolio.pass.${TOKEN}`]);
    requests = [];
    render(<Viewer deps={deps()} />);
    expect(await screen.findByRole('heading', { name: 'Ana Rivers' })).toBeTruthy();
    expect(requests[0].body).toEqual({ token: TOKEN, pass: storage.data.get(`yourigin.portfolio.pass.${TOKEN}`) });
  });

  it('a saved pass stops working when the password changes, and is forgotten', async () => {
    await unlock();
    row!.access_version = 3;
    render(<Viewer deps={deps()} />);
    expect(await screen.findByRole('heading', { name: 'This portfolio is protected' })).toBeTruthy();
    expect(storage.data.size).toBe(0);
  });

  it('a saved pass doesn’t survive turning the portfolio off, and turning it back on asks again', async () => {
    await unlock();
    row!.status = 'disabled';
    render(<Viewer deps={deps()} />);
    expect(await screen.findByRole('heading', { name: 'This portfolio isn’t available' })).toBeTruthy();
    expect(storage.data.size).toBe(0);
    cleanup();
    row!.status = 'live';
    render(<Viewer deps={deps()} />);
    expect(await screen.findByRole('heading', { name: 'This portfolio is protected' })).toBeTruthy();
  });

  it('a replaced link leaves the old link unavailable', async () => {
    await unlock();
    row!.share_token = 'CCCCCCCCCCCCCCCCCCCCCCCC';
    render(<Viewer deps={deps()} />);
    expect(await screen.findByRole('heading', { name: 'This portfolio isn’t available' })).toBeTruthy();
  });
});

describe('the built page', () => {
  it('is its own entry with no app code, manifest or service worker, and a strict policy in the build', () => {
    const html = readFileSync(resolve(process.cwd(), 'p/index.html'), 'utf8');
    expect(html).toContain('src="/src/viewer/main.tsx"');
    expect(html).toContain('<meta name="referrer" content="no-referrer" />');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(html).toContain('<!-- %PORTFOLIO_CSP% -->');
    const main = readFileSync(resolve(process.cwd(), 'src/viewer/main.tsx'), 'utf8');
    expect(main).not.toMatch(/pwa|registerSW|serviceWorker|db\/db|App/);
    const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(config).toContain("globIgnores: ['p/**', 'assets/viewer-*']");
    expect(config).toContain('navigateFallbackDenylist: [/\\/p(\\/|$)/]');
  });
});
