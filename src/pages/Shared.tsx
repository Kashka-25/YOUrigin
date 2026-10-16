import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bookmark, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { db } from '../db/db';
import { EmptyState } from '../components/ui';
import { useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { ShowcaseSignIn } from '../components/ShowcasePanels';
import { listMyShares, loadProfile, saveCounts, setKronkPostUrl, unshare, useShowcaseSession, type SharedWork } from '../showcase/api';
import { PLACEMENT_LABELS, STATUS_LABELS, kronkPostText, kronkShareUrl, type ArtistProfile } from '../showcase/model';

const STATUS_CLS: Record<SharedWork['status'], string> = {
  waiting: 'bg-paper-2 text-ink-2',
  live: 'bg-polished/15 text-polished',
  declined: 'bg-seed/10 text-seed',
  removed: 'bg-seed/10 text-seed',
};

/** Everything you've shared to YOU: its status, who saved it, Kronk, and Unshare. */
export function Shared() {
  const { session, ready } = useShowcaseSession();
  const [works, setWorks] = useState<SharedWork[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uid = session?.user.id;

  const refresh = useCallback(async () => {
    try {
      const [w, c, p] = await Promise.all([listMyShares(), saveCounts(), loadProfile()]);
      setWorks(w);
      setCounts(c);
      setProfile(p);
      setError(null);
    } catch (e) {
      setWorks([]);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (uid) void refresh();
  }, [uid, refresh]);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 pb-28 md:px-8 md:pt-12">
      <h1 className="page-title">Shared to YOU</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
        Pieces you've shared to be displayed on YOU, credited to you with your support links. Each one waits for approval before anyone sees it, and you
        can unshare at any time.
      </p>

      <div className="mt-6">
        {!ready ? (
          <Loader2 size={18} className="animate-spin text-muted" />
        ) : !session ? (
          <div className="rounded-2xl border border-line bg-card p-4">
            <ShowcaseSignIn />
          </div>
        ) : works === null ? (
          <Loader2 size={18} className="animate-spin text-muted" />
        ) : (
          <>
            {error && (
              <p className="mb-4 text-sm text-seed" role="alert">
                {error}
              </p>
            )}
            {!profile && (
              <p className="mb-4 rounded-xl bg-paper-2 p-3 text-sm text-ink-2">
                Set up your <Link to="/settings#s-artist" className="underline">artist profile</Link> so people know who made your work and how to support you.
              </p>
            )}
            {works.length === 0 ? (
              <EmptyState title="Nothing shared yet">Open a piece in your Library and choose “Share to YOU”.</EmptyState>
            ) : (
              <ul className="space-y-4">
                {works.map((w) => (
                  <ShareRow key={w.id} work={w} saves={counts[w.id] ?? 0} profile={profile} onChange={refresh} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ShareRow({ work, saves, profile, onChange }: { work: SharedWork; saves: number; profile: ArtistProfile | null; onChange: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const piece = useLiveQuery(() => (work.sourceId ? db.content.get(work.sourceId) : undefined), [work.sourceId]);
  const [postUrl, setPostUrl] = useState(work.kronkPostUrl ?? '');
  const [busy, setBusy] = useState(false);
  const kronk = profile ? kronkShareUrl(profile.kronkHandle, kronkPostText(work, profile)) : null;

  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-serif text-xl">{work.title || (work.kind === 'image' ? 'Untitled image' : 'Untitled words')}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {work.placements.map((p) => PLACEMENT_LABELS[p]).join(' · ')} · {work.saveMode === 'free' ? 'free to save' : 'save after a contribution'}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLS[work.status]}`}>{STATUS_LABELS[work.status]}</span>
      </div>

      {work.kind === 'words' && <p className="mt-2 line-clamp-3 font-serif text-[15px] whitespace-pre-line text-ink-2">{work.body}</p>}
      {work.credits.length > 0 && <p className="mt-2 text-sm text-ink-2">Offered by {work.credits.map((c) => c.name).join(', ')}</p>}
      {work.reviewNote && <p className="mt-2 rounded-xl bg-paper-2 p-2.5 text-sm text-ink-2">Note from YOU: {work.reviewNote}</p>}
      {work.status === 'live' && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-2">
          <Bookmark size={14} /> {saves === 1 ? '1 person keeps' : `${saves} people keep`} this in their collection
        </p>
      )}

      <div className="mt-3 space-y-2 border-t border-line pt-3">
        <p className="label">Kronk</p>
        {kronk ? (
          <a href={kronk} target="_blank" rel="noopener noreferrer" className="btn text-sm">
            Post on Kronk <ExternalLink size={14} />
          </a>
        ) : (
          <p className="text-xs text-muted">
            Add your Kronk handle to your <Link to="/settings#s-artist" className="underline">artist profile</Link> to post this on Kronk too.
          </p>
        )}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await setKronkPostUrl(work, postUrl);
              toast(postUrl.trim() ? 'Kronk post linked' : 'Kronk link removed');
              onChange();
            } catch (err) {
              toast(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            className="input min-w-0 flex-1"
            value={postUrl}
            onChange={(e) => setPostUrl(e.target.value)}
            placeholder="Paste your Kronk post's link"
            aria-label="Link to your Kronk post"
            autoCapitalize="off"
          />
          <button type="submit" className="btn text-sm" disabled={busy || postUrl === (work.kronkPostUrl ?? '')}>
            Save link
          </button>
        </form>
        <p className="text-xs text-muted">YOU shows “Also shared on Kronk” with this link.</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        {piece && (
          <Link to={`/item/${piece.id}`} className="btn text-sm">
            Open the piece
          </Link>
        )}
        <button
          type="button"
          className="btn text-sm text-seed"
          disabled={busy}
          onClick={async () => {
            const ok = await confirm({
              title: 'Unshare from YOU?',
              message: 'It comes off YOU straight away, including from anyone’s collection. Your piece stays here in YOUrigin.',
              confirmLabel: 'Unshare',
              danger: true,
            });
            if (!ok) return;
            setBusy(true);
            try {
              await unshare(work);
              toast('Unshared from YOU');
              onChange();
            } catch (err) {
              toast(err instanceof Error ? err.message : String(err));
              setBusy(false);
            }
          }}
        >
          <Trash2 size={14} /> Unshare
        </button>
      </div>
    </li>
  );
}
