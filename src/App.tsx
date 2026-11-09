import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { LibraryProvider } from './hooks/useLibrary';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/Modal';
import { AppShell } from './components/AppShell';
import { Onboarding } from './components/Onboarding';
import { useSettings } from './db/settings';
import { applyColourScale, DEFAULT_COLOUR_SCALE } from './domain/colourScale';
import type { ColourScale } from './domain/types';
import { Gathering } from './pages/Gathering';
import { MyUniverse } from './pages/MyUniverse';
import { Library } from './pages/Library';
import { ItemPage } from './pages/ItemPage';
import { Projects, ProjectHome } from './pages/Projects';
import { BookBuilder } from './pages/BookBuilder';
import { Manuscript } from './pages/Manuscript';
import { Stage } from './pages/Stage';
import { BookContents } from './pages/BookContents';
import { Atlas, LineagePage, MotifsPage } from './pages/Atlas';
import { Tags } from './pages/Tags';
import { Orphans } from './pages/Orphans';
import { Collections, CollectionPage } from './pages/Collections';
import { Trash } from './pages/Trash';
import { Settings } from './pages/Settings';
import { Spelling } from './pages/Spelling';
import { Shared } from './pages/Shared';
import { Portfolios } from './pages/Portfolios';
import { PortfolioEditor } from './pages/PortfolioEditor';
import { PortfolioPreview } from './pages/PortfolioPreview';
import { EmptyState, Spinner } from './components/ui';

// The print designer (and its page-layout engine) only loads when opened.
const PrintLayout = lazy(() => import('./pages/PrintLayout').then((m) => ({ default: m.PrintLayout })));

const Workspace = lazy(() => import('./pages/Workspace').then((m) => ({ default: m.Workspace })));

const CoverDesigner = lazy(() => import('./pages/CoverDesigner').then((m) => ({ default: m.CoverDesigner })));

/** One creative workspace per Project, so open pieces and pages never carry over. */
function WorkspaceRoute() {
  const { id } = useParams();
  return (
    <Suspense fallback={<Spinner />}>
      <Workspace key={id} />
    </Suspense>
  );
}

function CoverRoute() {
  const { id } = useParams();
  return (
    <Suspense fallback={<Spinner />}>
      <CoverDesigner key={id} />
    </Suspense>
  );
}

/** A fresh print view per Project workspace, so one manuscript's pages never linger while another lays out. */
function PrintRoute() {
  const { id } = useParams();
  return (
    <Suspense fallback={<Spinner />}>
      <PrintLayout key={id} />
    </Suspense>
  );
}

/** Legacy /books links still resolve to their creative workspace without breaking bookmarks or history. */
function BooksRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate replace to={pathname.replace(/^\/books/, '/projects') + search} />;
}

function useTheme(theme: 'system' | 'light' | 'dark' | undefined, colourScale: ColourScale | undefined) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || ((theme ?? 'system') === 'system' && mq.matches);
      const mode = dark ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', dark);
      applyColourScale(colourScale ?? DEFAULT_COLOUR_SCALE, mode);
      const background = window.getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background || (dark ? '#090711' : '#f4efe7'));
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme, colourScale]);
}

function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="no-print fixed inset-x-0 top-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-ink px-4 py-2 text-sm text-paper">
      A new version of YOUrigin is ready.
      <button type="button" className="font-semibold underline" onClick={() => void updateServiceWorker(true)}>
        Reload
      </button>
      <button type="button" className="opacity-70" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  );
}

export default function App() {
  const settings = useSettings();
  useTheme(settings?.theme, settings?.colourScale);

  return (
    <HashRouter>
      <ToastProvider>
        <ConfirmProvider>
          <LibraryProvider>
            <UpdateBanner />
            <Routes>
              {/* Manuscript mode is deliberately outside the app chrome: it should feel like a book. */}
              <Route path="/projects/:id/read" element={<Manuscript />} />
              <Route
                path="/projects/:id/print"
                element={<PrintRoute />}
              />
              <Route path="/projects/:id/cover" element={<CoverRoute />} />
              <Route path="/projects/:id/write" element={<WorkspaceRoute />} />
              {/* Stage view: songs in large type for performing, outside the app chrome. */}
              <Route path="/projects/:id/stage" element={<Stage />} />
              {/* The visitor preview is outside the app chrome too: it should look like its own website. */}
              <Route path="/portfolios/:id/preview" element={<PortfolioPreview />} />
              <Route path="/books/*" element={<BooksRedirect />} />
              <Route
                path="*"
                element={
                  <AppShell>
                    <Routes>
                      <Route path="/" element={<Gathering />} />
                      <Route path="/library" element={<Library />} />
                      <Route path="/universe" element={<MyUniverse />} />
                      <Route path="/item/:id" element={<ItemPage />} />
                      <Route path="/initiatives" element={<Projects />} />
                      <Route path="/initiatives/import-works" element={<Navigate replace to="/initiatives" />} />
                      <Route path="/initiative/:id" element={<ProjectHome />} />
                      <Route path="/projects" element={<Navigate replace to="/initiatives" />} />
                      <Route path="/projects/:id" element={<BookBuilder />} />
                      <Route path="/projects/:id/contents" element={<BookContents />} />
                      {/* Book Map became the Atlas Motifs plate. */}
                      <Route path="/map" element={<Navigate replace to="/atlas/motifs" />} />
                      <Route path="/atlas" element={<Atlas />} />
                      <Route path="/atlas/lineage/:id" element={<LineagePage />} />
                      <Route path="/atlas/motifs" element={<MotifsPage />} />
                      <Route path="/tags" element={<Tags />} />
                      <Route path="/orphans" element={<Orphans />} />
                      <Route path="/collections" element={<Collections />} />
                      <Route path="/collections/:id" element={<CollectionPage />} />
                      <Route path="/trash" element={<Trash />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/spelling" element={<Spelling />} />
                      <Route path="/shared" element={<Shared />} />
                      <Route path="/portfolios" element={<Portfolios />} />
                      <Route path="/portfolios/:id" element={<PortfolioEditor />} />
                      <Route path="*" element={<EmptyState title="Nothing here" />} />
                    </Routes>
                  </AppShell>
                }
              />
            </Routes>
            {settings && !settings.onboarded && <Onboarding open />}
          </LibraryProvider>
        </ConfirmProvider>
      </ToastProvider>
    </HashRouter>
  );
}
