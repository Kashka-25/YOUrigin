import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BriefcaseBusiness, Copy, Download, Lock, Plus, Trash2 } from 'lucide-react';
import { EmptyState, Spinner } from '../components/ui';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { createPortfolio, importStarterPortfolio, deletePortfolio, duplicatePortfolio, usePortfolios } from '../db/portfolios';
import { parseStarterPack } from '../portfolio/starter';
import { PURPOSES, PURPOSE_ORDER, STATE_LABELS, portfolioState, type Portfolio, type PortfolioPurpose } from '../portfolio/model';

/** Choose what a new portfolio is for; it starts with a matching look and first heading. */
export function NewPortfolioDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const start = async (purpose: PortfolioPurpose) => {
    try {
      const id = await createPortfolio(purpose);
      onClose();
      navigate(`/portfolios/${id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="New portfolio" wide>
      <p className="mb-4 text-sm text-ink-2">
        What is it for? This sets its starting look and layout, and you can change both later. It starts as a private draft: nobody else can see it until you publish it.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {PURPOSE_ORDER.map((p, i) => (
          <button
            key={p}
            type="button"
            data-autofocus={i === 0 ? true : undefined}
            className="panel p-4 text-left transition-colors hover:border-accent/60 focus-visible:border-accent"
            onClick={() => void start(p)}
          >
            <span className="block font-serif text-xl">{PURPOSES[p].label}</span>
            <span className="mt-1 block text-sm text-ink-2">{PURPOSES[p].blurb}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function PortfolioCard({ p }: { p: Portfolio }) {
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const state = portfolioState(p, null);
  const count = p.items.filter((i) => i.kind !== 'heading').length;

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this portfolio?',
      message: `“${p.title || 'Untitled portfolio'}” will be deleted from this device and your other synced devices. The Projects, Works and pieces in it are not touched.`,
      confirmLabel: 'Delete portfolio',
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePortfolio(p.id);
      toast('Portfolio deleted.');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <li className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <Link to={`/portfolios/${p.id}`} className="min-w-0 flex-1 rounded-lg focus-visible:outline-2 focus-visible:outline-accent">
        <span className="block truncate font-serif text-xl">{p.title || 'Untitled portfolio'}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
          <span>{PURPOSES[p.purpose].label}</span>
          <span aria-hidden="true">·</span>
          <span>{count === 1 ? '1 item' : `${count} items`}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            {state === 'draft' && <Lock size={13} aria-hidden="true" />}
            {STATE_LABELS[state]}
          </span>
        </span>
      </Link>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          className="btn-ghost"
          onClick={async () => navigate(`/portfolios/${await duplicatePortfolio(p.id)}`)}
          aria-label={`Duplicate ${p.title}`}
        >
          <Copy size={16} /> Duplicate
        </button>
        <button type="button" className="btn-ghost" onClick={() => void remove()} aria-label={`Delete ${p.title}`}>
          <Trash2 size={16} /> Delete
        </button>
      </div>
    </li>
  );
}

/** Every portfolio: curated pages made from chosen work, for sending to the people who need to see it. */
export function Portfolios() {
  const portfolios = usePortfolios();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const live = portfolios?.filter((p) => !p.archived) ?? [];

  const starterFile = useRef<HTMLInputElement>(null);
  const [building, setBuilding] = useState(false);

  // The starter is a file you bring; nothing about anyone's work is built into the app.
  const buildStarter = async (file: File | undefined) => {
    if (!file) return;
    setBuilding(true);
    try {
      const r = await importStarterPortfolio(parseStarterPack(await file.text()));
      const made = r.createdProjects ? ` ${r.createdProjects} new Project${r.createdProjects === 1 ? '' : 's'}.` : '';
      const extras = [r.coversAdded && `${r.coversAdded} cover${r.coversAdded === 1 ? '' : 's'}`, r.linksAdded && `${r.linksAdded} link${r.linksAdded === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
      toast(
        r.created
          ? `Starter portfolio ready, as a private draft.${made}`
          : r.addedItems
            ? `Added ${r.addedItems} to your starter portfolio.${made}`
            : extras
              ? `Added ${extras} to your starter portfolio.`
              : 'Your starter portfolio already has everything.',
      );
      navigate(`/portfolios/${r.portfolioId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBuilding(false);
    }
  };
  const starterButton = (className: string) => (
    <button type="button" className={className} disabled={building} onClick={() => starterFile.current?.click()}>
      <Download size={16} /> {building ? 'Building…' : 'Build my starter portfolio'}
    </button>
  );

  return (
    <div className="page-frame">
      <header className="page-intro flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Your work, presented</p>
          <h1 className="page-title">Portfolios</h1>
          <p className="mt-3 max-w-xl font-serif text-lg text-ink-2">
            Curated pages made from the Projects, Works and pieces you choose, to send to an employer, collaborator, investor or client.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {live.length > 0 && starterButton('btn')}
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> New portfolio
          </button>
        </div>
      </header>

      {!portfolios ? (
        <Spinner />
      ) : live.length === 0 ? (
        <EmptyState
          title="No portfolios yet"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                <BriefcaseBusiness size={16} /> Make your first portfolio
              </button>
              {starterButton('btn')}
            </div>
          }
        >
          Make one for each audience: a professional portfolio for employers, a creative one for galleries and publishers, one for investors, one for friends. Each is
          its own selection, and choosing something for a portfolio never shares it anywhere else, including YOU’s Showcase.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {live.map((p) => (
            <PortfolioCard key={p.id} p={p} />
          ))}
        </ul>
      )}

      <input
        ref={starterFile}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-label="Starter portfolio file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void buildStarter(file);
        }}
      />
      <NewPortfolioDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
