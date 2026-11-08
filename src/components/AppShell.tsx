import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BriefcaseBusiness, Feather, FolderKanban, FolderOpen, Hash, Images, Library, Menu,
  Search, Settings, Share2, Sprout, SpellCheck, Trash2, WifiOff, Orbit, Waypoints,
} from 'lucide-react';
import { Logo } from './Logo';
import { SearchPalette } from './SearchPalette';
import { useLibrary } from '../hooks/useLibrary';
import { isOrphan } from '../domain/query';
import { Modal } from './Modal';
import { SyncBadge } from './SyncBadge';
import { useOnline } from '../hooks/useOnline';

type NavDef = { to: string; label: string; icon: typeof Feather; end?: boolean };
const PRIMARY: NavDef[] = [
  { to: '/', label: 'Gather', icon: Feather, end: true },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/initiatives', label: 'Projects', icon: FolderKanban },
  { to: '/universe', label: 'My Universe', icon: Orbit },
];
const SECONDARY: NavDef[] = [
  { to: '/atlas', label: 'Creation Atlas', icon: Waypoints },
  { to: '/library?view=gallery', label: 'Gallery', icon: Images },
  { to: '/collections', label: 'Collections', icon: FolderOpen },
  { to: '/tags', label: 'Tags', icon: Hash },
  { to: '/orphans', label: 'Unsorted', icon: Sprout },
  { to: '/spelling', label: 'Spelling', icon: SpellCheck },
  { to: '/portfolios', label: 'Portfolios', icon: BriefcaseBusiness },
  { to: '/shared', label: 'Shared to YOU', icon: Share2 },
  { to: '/settings', label: 'Settings & backup', icon: Settings },
  { to: '/trash', label: 'Trash', icon: Trash2 },
];
const MOBILE_PRIMARY: NavDef[] = PRIMARY.filter((item) => item.to !== '/universe');
const MOBILE_MORE: NavDef[] = [{ to: '/universe', label: 'My Universe', icon: Orbit }, ...SECONDARY];
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
  const galleryOn = loc.pathname === '/library' && new URLSearchParams(loc.search).get('view') === 'gallery';
  const activeFor = (to: string, isActive: boolean) => to === '/library?view=gallery' ? galleryOn : to === '/library' ? isActive && !galleryOn : to === '/initiatives' ? isActive || loc.pathname.startsWith('/initiative/') || loc.pathname.startsWith('/projects/') : isActive;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); }
      else if ((mod && e.key.toLowerCase() === 'n') || (e.altKey && e.key.toLowerCase() === 'n')) { e.preventDefault(); nav('/?focus=1'); }
      else if (!mod && !e.altKey && e.key.toLowerCase() === 'n' && !isTyping(e.target)) { e.preventDefault(); nav('/?focus=1'); }
      else if (!mod && e.key === '/' && !isTyping(e.target)) { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);
  useEffect(() => setMoreOpen(false), [loc.pathname]);
  const orphanCount = lib ? lib.items.filter((i) => !i.deletedAt && !i.archived && !i.keepUnassigned && isOrphan(i, lib.ctx)).length : 0;
  const recent = lib ? [...lib.projects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5) : [];
  const navItem = (item: NavDef, badge?: number) => (
    <NavLink key={item.to} to={item.to} end={item.end} className={({isActive}) =>
      `nav-link flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${activeFor(item.to,isActive) ? 'font-semibold' : ''}`}>
      <item.icon size={18} strokeWidth={1.7} aria-hidden />
      <span className="min-w-0 flex-1">{item.label}</span>
      {!!badge && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] tabular-nums">{badge}</span>}
    </NavLink>
  );
  return (
    <div className="app-shell min-h-dvh md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 btn">Skip to content</a>
      <aside className="app-sidebar no-print chrome sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col border-r px-4 py-6 md:flex">
        <div className="px-2">
          <Logo size="md" />
          <p className="mt-2 text-center font-display text-[9px] tracking-[.26em] text-[#c5a574] uppercase">Your Own Universe</p>
          <div className="mx-auto mt-5 h-px w-16 bg-gradient-to-r from-transparent via-[#b18b60]/60 to-transparent" />
        </div>
        <button type="button" onClick={() => setSearchOpen(true)} className="mt-6 flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[.045] px-3 text-sm text-[#aa9bb2] hover:border-[#bda276]/40">
          <Search size={16} /><span className="flex-1 text-left">Search your codex</span><kbd className="rounded border border-white/10 px-1.5 py-0.5 text-[10px]">⌘ K</kbd>
        </button>
        <p className="eyebrow mb-2 mt-8 px-3">Your space</p>
        <nav aria-label="Main" className="space-y-1">{PRIMARY.map((i) => navItem(i))}</nav>
        {recent.length > 0 && <div className="mt-8">
          <p className="eyebrow px-3">Recently opened</p>
          <ul className="mt-2 space-y-1">{recent.map((b) => <li key={b.id}><NavLink to={`/initiative/${b.id}`} className={({isActive}) => `block truncate rounded-lg px-3 py-2 font-serif text-[15px] transition-colors ${isActive ? 'bg-white/10 text-[#f2e3c8]' : 'text-[#a99ab1] hover:bg-white/[.05] hover:text-white'}`}>{b.title}</NavLink></li>)}</ul>
        </div>}
        <div className="mt-auto border-t border-white/10 pt-4">
          <p className="eyebrow mb-2 px-3">Studio tools</p>
          <nav aria-label="More" className="space-y-0.5">{SECONDARY.map((i) => navItem(i, i.to === '/orphans' ? orphanCount : undefined))}</nav>
          <div className="mt-4 flex items-center justify-between px-3"><SyncBadge /><span className="sidebar-muted text-[11px]">{online ? 'Local-first · Online' : 'Offline · Ready'}</span></div>
          {!online && <p className="sidebar-muted mt-2 flex items-center gap-2 px-3 text-xs"><WifiOff size={13}/> Everything still works offline</p>}
        </div>
      </aside>
      <div className="app-main min-h-dvh flex-1">
        <header className="no-print chrome sticky top-0 z-30 hidden h-14 items-center justify-between border-b border-line/70 bg-paper/75 px-8 backdrop-blur-xl md:flex">
          <div className="flex items-center gap-2 text-xs text-muted"><span className="h-1.5 w-1.5 rounded-full bg-gold/80"/>{loc.pathname === '/' ? 'A place to begin' : loc.pathname.startsWith('/library') ? 'Your collected thoughts' : loc.pathname.startsWith('/initiatives') || loc.pathname.startsWith('/initiative/') ? 'The things you are building' : loc.pathname.startsWith('/projects') ? 'Your creative workspace' : 'Your creative codex'}</div>
          <div className="flex items-center gap-3"><span className="text-xs text-muted">A little space to think, make and become.</span><SyncBadge compact /></div>
        </header>
        <header className="no-print chrome sticky top-0 z-30 flex items-center justify-between border-b border-line/70 bg-paper/90 px-4 py-3 backdrop-blur-xl md:hidden">
          <Logo size="sm" />
          <div className="flex items-center gap-2"><SyncBadge compact /><button type="button" className="btn-ghost min-h-10 px-2" onClick={() => setSearchOpen(true)} aria-label="Search"><Search size={20}/></button></div>
        </header>
        <main id="main" className="min-w-0 pb-24 md:pb-8">{children}</main>
      </div>
      <nav aria-label="Main" className="mobile-dock no-print chrome fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] md:hidden">
        {MOBILE_PRIMARY.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({isActive}) => `relative flex min-h-[60px] flex-col items-center justify-center gap-1 text-[10px] ${activeFor(item.to,isActive) ? 'font-semibold' : 'text-[#9f91a8]'}`}><item.icon size={19} strokeWidth={1.7}/>{item.label}</NavLink>)}
        <button type="button" onClick={() => setMoreOpen(true)} className="flex min-h-[60px] flex-col items-center justify-center gap-1 text-[10px] text-[#9f91a8]"><Menu size={19}/>More</button>
      </nav>
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More"><nav className="space-y-1" aria-label="More">{MOBILE_MORE.map((i) => navItem(i, i.to === '/orphans' ? orphanCount : undefined))}</nav></Modal>
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}