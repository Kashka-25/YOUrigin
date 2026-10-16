import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, Plus, Share2, X } from 'lucide-react';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { ShowcaseSignIn } from './ShowcasePanels';
import { findShare, loadProfile, makeDisplayCopy, sharePiece, useShowcaseSession, type SharedWork } from '../showcase/api';
import {
  LIMITS,
  PLACEMENT_LABELS,
  STATUS_LABELS,
  kronkPostText,
  kronkShareUrl,
  newDraft,
  placementsFor,
  shareKindFor,
  validateShare,
  type ArtistProfile,
  type ShareDraft,
} from '../showcase/model';
import type { ContentItem } from '../domain/types';

/** The piece page's "Share to YOU" row: the button, and the share's status once there is one. */
export function ShareToYouButton({ item }: { item: ContentItem }) {
  const [open, setOpen] = useState(false);
  const { session } = useShowcaseSession();
  const [share, setShare] = useState<SharedWork | null>(null);
  const uid = session?.user.id;

  useEffect(() => {
    if (!uid) return setShare(null);
    findShare(item.id).then(setShare, () => setShare(null));
  }, [uid, item.id, open]);

  if (!shareKindFor(item)) return null;
  return (
    <section className="border-t border-line pt-4">
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Share2 size={15} /> {share ? 'Share again to YOU' : 'Share to YOU'}
      </button>
      {share && (
        <p className="mt-2 text-xs text-muted">
          {STATUS_LABELS[share.status]}.{' '}
          <Link to="/shared" className="underline">
            Manage
          </Link>
        </p>
      )}
      {open && <ShareDialog item={item} existing={share} onClose={() => setOpen(false)} />}
    </section>
  );
}

function ShareDialog({ item, existing, onClose }: { item: ContentItem; existing: SharedWork | null; onClose: () => void }) {
  const { session, ready } = useShowcaseSession();
  const toast = useToast();
  const [profile, setProfile] = useState<ArtistProfile | null | undefined>(undefined);
  const [draft, setDraft] = useState<ShareDraft | null>(() => {
    const d = newDraft(item);
    if (!d || !existing) return d;
    // Sharing again starts from what was shared before.
    return {
      ...d,
      altText: existing.altText,
      placements: existing.placements.filter((p) => placementsFor(d.kind).includes(p)),
      saveMode: existing.saveMode,
      suggestedAmount: existing.suggestedAmount ?? '',
      credits: existing.credits,
      title: existing.title || d.title,
    };
  });
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<SharedWork | null>(null);
  const uid = session?.user.id;

  useEffect(() => {
    if (!uid) return;
    loadProfile().then(setProfile, () => setProfile(null));
  }, [uid]);

  // Show exactly the display-sized copy that will be shared.
  useEffect(() => {
    if (draft?.kind !== 'image' || !item.assetId) return;
    makeDisplayCopy(item.assetId).then(
      (c) => setPreview(c.dataUrl),
      (e) => setPreviewError(e instanceof Error ? e.message : String(e)),
    );
  }, [draft?.kind, item.assetId]);

  if (!draft) return null;
  const set = (patch: Partial<ShareDraft>) => setDraft({ ...draft, ...patch });
  const setCredit = (i: number, patch: Partial<ShareDraft['credits'][number]>) =>
    set({ credits: draft.credits.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const kronkUrl = profile ? kronkShareUrl(profile.kronkHandle, kronkPostText(draft, profile)) : null;

  let content;
  if (!ready || (session && profile === undefined)) {
    content = <Loader2 size={18} className="animate-spin text-muted" />;
  } else if (!session) {
    content = <ShowcaseSignIn />;
  } else if (!profile) {
    content = (
      <div className="space-y-3 text-sm text-ink-2">
        <p>First, set up your artist profile: the name you're credited as, and where people can support you.</p>
        <Link to="/settings#s-artist" className="btn-primary" onClick={onClose}>
          Set up artist profile
        </Link>
      </div>
    );
  } else if (done) {
    content = (
      <div className="space-y-4 text-sm text-ink-2">
        <p>
          Sent. It's <strong>waiting for approval</strong> and nothing shows on YOU until it's approved. You can follow it, or unshare it at any time, from{' '}
          <Link to="/shared" className="underline" onClick={onClose}>
            Shared to YOU
          </Link>
          .
        </p>
        {kronkUrl ? (
          <a href={kronkUrl} target="_blank" rel="noopener noreferrer" className="btn">
            Post it on Kronk too <ExternalLink size={14} />
          </a>
        ) : (
          <p className="text-xs text-muted">
            Add your Kronk handle to your artist profile to post shares on Kronk as well.
          </p>
        )}
        <div className="flex justify-end">
          <button type="button" className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  } else {
    content = (
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const found = validateShare(draft);
          setProblems(found);
          if (found.length) return;
          setBusy(true);
          try {
            setDone(await sharePiece(item, draft));
            toast('Shared to YOU, waiting for approval');
          } catch (err) {
            setProblems([err instanceof Error ? err.message : String(err)]);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-sm text-ink-2">
          Your codex stays private. Only this copy becomes public, credited to <strong>{profile.displayName}</strong>, once it's approved.
        </p>

        {draft.kind === 'image' ? (
          <div className="overflow-hidden rounded-xl border border-line bg-paper-2">
            {preview ? (
              <img src={preview} alt="" className="mx-auto max-h-64 w-auto object-contain" />
            ) : previewError ? (
              <p className="p-3 text-sm text-seed">{previewError}</p>
            ) : (
              <div className="flex h-32 items-center justify-center">
                <Loader2 size={18} className="animate-spin text-muted" />
              </div>
            )}
            <p className="px-3 py-1.5 text-xs text-muted">Display size only (up to 1600px). Your original stays on this device.</p>
          </div>
        ) : (
          <blockquote className="max-h-40 overflow-y-auto border-l-2 border-accent pl-3 font-serif text-[15px] whitespace-pre-line text-ink-2">{draft.body}</blockquote>
        )}

        <label className="block">
          <span className="label">Title</span>
          <input className="input" maxLength={LIMITS.title} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        {draft.kind === 'image' && (
          <>
            <label className="block">
              <span className="label">Caption (optional)</span>
              <textarea className="input resize-y" rows={2} maxLength={LIMITS.body} value={draft.body} onChange={(e) => set({ body: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">Describe the image (for people using screen readers)</span>
              <input className="input" maxLength={LIMITS.alt} value={draft.altText} onChange={(e) => set({ altText: e.target.value })} placeholder="A heron standing in gold evening water" />
            </label>
          </>
        )}

        <fieldset>
          <legend className="label">Where it can appear on YOU</legend>
          <div className="space-y-1.5">
            {placementsFor(draft.kind).map((p) => (
              <label key={p} className="flex min-h-[36px] items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={draft.placements.includes(p)}
                  onChange={(e) => set({ placements: e.target.checked ? [...draft.placements, p] : draft.placements.filter((x) => x !== p) })}
                />
                {PLACEMENT_LABELS[p]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">Saving on YOU</legend>
          <div className="space-y-1.5">
            <label className="flex min-h-[36px] items-center gap-2.5 text-sm">
              <input type="radio" name="save" checked={draft.saveMode === 'free'} onChange={() => set({ saveMode: 'free' })} />
              Free to save to a personal collection
            </label>
            <label className="flex min-h-[36px] items-center gap-2.5 text-sm">
              <input type="radio" name="save" checked={draft.saveMode === 'contribution'} onChange={() => set({ saveMode: 'contribution' })} />
              Save only after a contribution
            </label>
            {draft.saveMode === 'contribution' && (
              <label className="ml-7 block">
                <span className="label">Suggested amount (optional)</span>
                <input className="input" maxLength={LIMITS.amount} value={draft.suggestedAmount} onChange={(e) => set({ suggestedAmount: e.target.value })} placeholder="£3, or any amount" />
              </label>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">Saved pieces stay inside YOU with your credit; they aren't file downloads. For now, contributions are on trust (“I've contributed”).</p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="label">Offered by (optional)</legend>
          <p className="text-xs text-muted">If another artist gifted or offered this piece (cover art, a collaboration), credit them too.</p>
          {draft.credits.map((c, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-line p-3">
              <div className="flex items-center gap-2">
                <input className="input" placeholder="Their name" maxLength={LIMITS.name} value={c.name} onChange={(e) => setCredit(i, { name: e.target.value })} aria-label={`Credit ${i + 1} name`} />
                <button type="button" className="btn-ghost p-2" aria-label={`Remove credit ${i + 1}`} onClick={() => set({ credits: draft.credits.filter((_, j) => j !== i) })}>
                  <X size={15} />
                </button>
              </div>
              <input className="input" placeholder="Their link (optional)" value={c.url} onChange={(e) => setCredit(i, { url: e.target.value })} aria-label={`Credit ${i + 1} link`} autoCapitalize="off" />
              <input className="input" placeholder="Their Kronk handle, @name@server (optional)" value={c.kronkHandle} onChange={(e) => setCredit(i, { kronkHandle: e.target.value })} aria-label={`Credit ${i + 1} Kronk handle`} autoCapitalize="off" />
            </div>
          ))}
          {draft.credits.length < LIMITS.credits && (
            <button type="button" className="btn-ghost -ml-3 text-sm" onClick={() => set({ credits: [...draft.credits, { name: '', url: '', kronkHandle: '' }] })}>
              <Plus size={14} /> Add an "offered by" credit
            </button>
          )}
        </fieldset>

        <label className="flex items-start gap-2.5 rounded-xl bg-paper-2 p-3 text-sm">
          <input type="checkbox" className="mt-0.5" checked={draft.rights} onChange={(e) => set({ rights: e.target.checked })} />
          <span>I made this (or have permission) and allow YOU to display it with credit.</span>
        </label>

        {existing && <p className="text-xs text-muted">Sharing again replaces what's on YOU and waits for approval again.</p>}
        {problems.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-seed" role="alert">
            {problems.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy || (draft.kind === 'image' && !preview)}>
            {busy && <Loader2 size={15} className="animate-spin" />} Send for approval
          </button>
        </div>
      </form>
    );
  }

  return (
    <Modal open onClose={onClose} title="Share to YOU">
      {content}
    </Modal>
  );
}
