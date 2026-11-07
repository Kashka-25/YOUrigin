import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BriefcaseBusiness, Copy, Lock, Plus, Trash2 } from 'lucide-react';
import { EmptyState, Spinner } from '../components/ui';
import { Modal, useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { createPortfolio, deletePortfolio, duplicatePortfolio, usePortfolios } from '../db/portfolios';
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
  const live = portfolios?.filter((p) => !p.archived) ?? [];

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
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> New portfolio
        </button>
      </header>

      {!portfolios ? (
        <Spinner />
      ) : live.length === 0 ? (
        <EmptyState
          title="No portfolios yet"
          action={
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              <BriefcaseBusiness size={16} /> Make your first portfolio
            </button>
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

      <NewPortfolioDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
