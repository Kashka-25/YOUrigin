import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Lock, Monitor, Smartphone, Tablet } from 'lucide-react';
import { EmptyState, Spinner } from '../components/ui';
import { usePortfolio } from '../db/portfolios';
import { PortfolioView } from '../portfolio/PortfolioView';
import { usePortfolioSnapshot } from '../portfolio/usePortfolioSnapshot';
import { portfolioState, STATE_LABELS } from '../portfolio/model';

type Device = 'phone' | 'tablet' | 'desktop';
const DEVICES: { key: Device; label: string; width: number | null; icon: typeof Monitor }[] = [
  { key: 'phone', label: 'Phone', width: 390, icon: Smartphone },
  { key: 'tablet', label: 'Tablet', width: 820, icon: Tablet },
  { key: 'desktop', label: 'Desktop', width: null, icon: Monitor },
];

/**
 * The page exactly as a visitor will see it, at phone, tablet or desktop
 * width. The page lays out by the frame's width, so each size is the real
 * layout for that screen. Outside the app chrome, like a separate website.
 */
export function PortfolioPreview() {
  const { id } = useParams();
  const p = usePortfolio(id);
  const back = (useLocation().state as { back?: string } | null)?.back;
  const built = usePortfolioSnapshot(p);
  const [device, setDevice] = useState<Device>(() => (window.innerWidth < 700 ? 'desktop' : 'phone'));

  if (p === undefined) return <Spinner />;
  if (!p || !built) return <EmptyState title="This portfolio doesn’t exist" action={<Link className="btn" to="/portfolios">Back to Portfolios</Link>} />;

  const d = DEVICES.find((x) => x.key === device)!;
  const state = portfolioState(p, built.hash);
  // On a small screen the frame can't be wider than the screen, so the page simply fills it.
  const framed = d.width !== null && window.innerWidth > d.width + 32;

  return (
    <div className="flex h-dvh flex-col bg-paper-2">
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-line bg-card px-3 py-2">
        <Link to={back?.startsWith(`/portfolios/${p.id}`) ? back : `/portfolios/${p.id}`} className="btn-ghost"><ArrowLeft size={16} /> Back to editing</Link>
        <p className="mr-auto inline-flex items-center gap-1.5 text-sm text-ink-2" role="status">
          {state === 'draft' && <Lock size={14} aria-hidden="true" />}
          Visitor preview · {STATE_LABELS[state]}
        </p>
        <div role="group" aria-label="Screen size" className="flex gap-1">
          {DEVICES.map((x) => (
            <button key={x.key} type="button" aria-pressed={device === x.key} className={device === x.key ? 'btn-primary px-3' : 'btn px-3'} onClick={() => setDevice(x.key)}>
              <x.icon size={16} aria-hidden="true" /> <span className="max-sm:sr-only">{x.label}</span>
            </button>
          ))}
        </div>
      </div>
      {built.problems.length > 0 && (
        <p className="no-print bg-seed/10 px-4 py-2 text-sm text-seed" role="status">
          {built.problems.length === 1 ? '1 item can’t be shown' : `${built.problems.length} items can’t be shown`} and is left out. Fix it in the editor.
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-0 sm:p-4">
        <div
          className={`mx-auto h-full overflow-y-auto bg-white ${framed ? 'rounded-2xl shadow-xl ring-1 ring-black/10' : ''}`}
          style={{ width: framed ? d.width! : '100%' }}
          data-testid="portfolio-frame"
        >
          <PortfolioView snapshot={built.snapshot} resolveImage={built.resolveImage} />
        </div>
      </div>
    </div>
  );
}
