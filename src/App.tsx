import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { LibraryProvider } from './hooks/useLibrary';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/Modal';
import { AppShell } from './components/AppShell';
import { Onboarding } from './components/Onboarding';
import { useSettings } from './db/settings';
import { Gathering } from './pages/Gathering';
import { Library } from './pages/Library';
import { ItemPage } from './pages/ItemPage';
import { Books } from './pages/Books';
import { BookBuilder } from './pages/BookBuilder';
import { Manuscript } from './pages/Manuscript';
import { BookMap } from './pages/BookMap';
import { Tags } from './pages/Tags';
import { Orphans } from './pages/Orphans';
import { Collections, CollectionPage } from './pages/Collections';
import { Trash } from './pages/Trash';
import { Settings } from './pages/Settings';
import { EmptyState } from './components/ui';

function useTheme(theme: 'system' | 'light' | 'dark' | undefined) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || ((theme ?? 'system') === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1a1816' : '#f6f1e9');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
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
  useTheme(settings?.theme);

  return (
    <HashRouter>
      <ToastProvider>
        <ConfirmProvider>
          <LibraryProvider>
            <UpdateBanner />
            <Routes>
              {/* Manuscript mode is deliberately outside the app chrome: it should feel like a book. */}
              <Route path="/books/:id/read" element={<Manuscript />} />
              <Route
                path="*"
                element={
                  <AppShell>
                    <Routes>
                      <Route path="/" element={<Gathering />} />
                      <Route path="/library" element={<Library />} />
                      <Route path="/item/:id" element={<ItemPage />} />
                      <Route path="/books" element={<Books />} />
                      <Route path="/books/:id" element={<BookBuilder />} />
                      <Route path="/map" element={<BookMap />} />
                      <Route path="/tags" element={<Tags />} />
                      <Route path="/orphans" element={<Orphans />} />
                      <Route path="/collections" element={<Collections />} />
                      <Route path="/collections/:id" element={<CollectionPage />} />
                      <Route path="/trash" element={<Trash />} />
                      <Route path="/settings" element={<Settings />} />
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
