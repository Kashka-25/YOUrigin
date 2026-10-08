import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Feather,
  FolderOpen,
  Hash,
  Library,
  Menu,
  Network,
  Search,
  Settings,
  Sprout,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { Logo } from './Logo';
import { SearchPalette } from './SearchPalette';
import { useLibrary } from '../hooks/useLibrary';
import { isOrphan } from '../domain/query';
import { Modal } from './Modal';
import { SyncBadge } from './SyncBadge';

const PRIMARY = [
  { to: '/', label: 'Gathering', icon: Feather, end: true },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/map', label: 'Book Map', icon: Network },
  { to: '/books', label: 'Books', icon: BookOpen },
  { to: '/tags', label: 'Tags', icon: Hash },
  { to: '/orphans', label: 'Orphans', icon: Sprout },
];

const SECONDARY = [
  { to: '/collections', label: 'Collections', icon: FolderOpen },
  { to: '/settings', label: 'Settings & backup', icon: Settings },
  { to: '/trash', label: 'Trash', icon: Trash2 },
];

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export function AppShell({ children }: { children: ReactNode }) {
  const lib = useLibrary();
  const nav = useNavigate();
  const loc = useLocation();
  const online = useOnline();
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if ((mod && e.key.toLowerCase() === 'n') || (e.altKey && e.key.toLowerCase() === 'n')) {
        // Browsers may reserve Ctrl+N; Alt+N and plain "n" are reliable fallbacks.
        e.preventDefault();
        nav('/?focus=1');
      } else if (!mod && !e.altKey && e.key === 'n' && !isTyping(e.target)) {
        e.preventDefault();
        nav('/?focus=1');
      } else if (!mod && e.key === '/' && !isTyping(e.target)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);

  useEffect(() => setMoreOpen(false), [loc.pathname]);

  const orphanCount = lib ? lib.items.filter((i) => !i.deletedAt && !i.archived && !i.keepUnassigned && isOrphan(i, lib.ctx)).length : 0;
  const recentBooks = lib ? [...lib.books].filter((b) => !b.archived).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6) : [];

  const navItem = (item: { to: string; label: string; icon: typeof Feather; end?: boolean }, badge?: number) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors ${
          isActive ? 'bg-paper-2 font-semibold text-ink' : 'text-ink-2 hover:bg-paper-2 hover:text-ink'
        }`
      }
    >
      <item.icon size={18} aria-hidden />
      <span className="flex-1">{item.label}</span>
      {!!badge && <span className="rounded-full bg-paper-2 px-2 text-xs text-muted tabular-nums">{badge}</span>}
    </NavLink>
  );

  return (
    <div className="min-h-dvh md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 btn">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line px-4 py-6 md:flex">
        <div className="px-3">
          <Logo />
          <p className="mt-2 max-w-[210px] text-center font-display text-[10px] tracking-[0.25em] text-muted uppercase">Your Creative Codex</p>
        </div>
        <button type="button" onClick={() => setSearchOpen(true)} className="mt-6 flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-sm text-muted hover:text-ink">
          <Search size={16} aria-hidden />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border border-line px-1.5 text-[11px]">Ctrl K</kbd>
        </button>
        <nav aria-label="Main" className="mt-5 space-y-0.5">
          {PRIMARY.map((i) => navItem(i, i.to === '/orphans' ? orphanCount : undefined))}
        </nav>
        {recentBooks.length > 0 && (
          <div className="mt-6">
            <p className="eyebrow px-3">Books</p>
            <ul className="mt-2 space-y-0.5">
              {recentBooks.map((b) => (
                <li key={b.id}>
                  <NavLink
                    to={`/books/${b.id}`}
                    className={({ isActive }) =>
                      `block truncate rounded-lg px-3 py-1.5 font-serif text-[15px] ${isActive ? 'bg-paper-2 text-ink' : 'text-ink-2 hover:text-ink'}`
                    }
                  >
                    {b.title}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}
        <nav aria-label="Secondary" className="mt-auto space-y-0.5 pt-6">
          {SECONDARY.map((i) => navItem(i))}
          <SyncBadge />
          {!online && (
            <p className="flex items-center gap-2 px-3 pt-2 text-xs text-muted">
              <WifiOff size={14} aria-hidden /> Offline — everything still works
            </p>
          )}
        </nav>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/95 px-4 py-2.5 backdrop-blur md:hidden">
        <Logo size="sm" />
        <div className="flex items-center gap-1">
          {!online && <WifiOff size={16} className="text-muted" aria-label="Offline" />}
          <SyncBadge compact />
          <button type="button" className="btn-ghost" onClick={() => setSearchOpen(true)} aria-label="Search">
            <Search size={20} />
          </button>
        </div>
      </header>

      <main id="main" className="min-w-0 flex-1 pb-24 md:pb-10">
        {children}
      </main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="Main"
        className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {[PRIMARY[0], PRIMARY[1], PRIMARY[3], PRIMARY[5]].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'font-semibold text-accent' : 'text-ink-2'}`}
          >
            <item.icon size={21} aria-hidden />
            {item.label === 'Gathering' ? 'Gather' : item.label}
            {item.to === '/orphans' && orphanCount > 0 && (
              <span className="absolute top-1 right-[calc(50%-1.4rem)] h-2 w-2 rounded-full bg-accent" aria-hidden />
            )}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-ink-2">
          <Menu size={21} aria-hidden />
          More
        </button>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <nav className="space-y-0.5" aria-label="More">
          {[PRIMARY[2], PRIMARY[4], ...SECONDARY].map((i) => navItem(i))}
        </nav>
      </Modal>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
