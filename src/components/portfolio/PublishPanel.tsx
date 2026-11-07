import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Eye, EyeOff, Globe, Link2, Loader2, Lock, Power, RefreshCw, Trash2 } from 'lucide-react';
import { useConfirm } from '../Modal';
import { useToast } from '../Toast';
import { ShowcaseSignIn } from '../ShowcasePanels';
import {
  publishPortfolio,
  refreshPublication,
  replacePortfolioLink,
  setPortfolioLive,
  shareUrl,
  unpublishPortfolio,
  useYouSession,
} from '../../portfolio/api';
import { portfolioState, STATE_LABELS, VISIBILITY, type Portfolio } from '../../portfolio/model';
import type { BuiltPortfolio } from '../../portfolio/usePortfolioSnapshot';

const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Publishing and access for one portfolio: publish or update, copy the link,
 * turn it off or on, replace the link, unpublish. Every way of ending access
 * works at once and never needs the allowlist.
 */
export function PublishPanel({ portfolio: p, built, blockers, flush }: { portfolio: Portfolio; built: BuiltPortfolio; blockers: string[]; flush: () => Promise<void> }) {
  const { session, ready } = useYouSession();
  const confirm = useConfirm();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [views, setViews] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const uid = session?.user.id;
  const pub = p.publication;
  const state = portfolioState(p, built.hash);

  // Match this device's record to the server whenever the panel opens signed in.
  useEffect(() => {
    if (!uid) return;
    let live = true;
    refreshPublication(p)
      .then((r) => live && setViews(r.views))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // Only when the account or portfolio changes, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, p.id]);

  const run = async (label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      toast(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const needsPassword = p.visibility === 'password' && !(pub?.passwordSet && pub.visibility === 'password');
  const passwordProblem = p.visibility === 'password' && password && password.length < 8 ? 'Passwords need at least 8 characters.' : null;
  const settingsChanged = !!pub && (pub.visibility !== p.visibility || pub.expiresAt !== p.expiresAt);
  const canPublish = !blockers.length && !passwordProblem && !(needsPassword && !password);

  const publish = async () => {
    const first = !pub;
    if (first) {
      const ok = await confirm({
        title: 'Publish this portfolio?',
        message: (
          <>
            <p>{VISIBILITY[p.visibility].blurb} Visitors don’t need an account.</p>
            <p className="mt-2">They’ll see exactly what the preview shows, and nothing else from YOUrigin. You can turn the link off, replace it or unpublish at any time.</p>
          </>
        ),
        confirmLabel: 'Publish',
      });
      if (!ok) return;
    }
    await run('publish', async () => {
      await flush();
      await publishPortfolio(p, built.snapshot, built.hash, password || undefined);
      setPassword('');
    }, first ? 'Published. Copy the link to send it.' : 'Published version updated.');
  };

  const link = pub ? shareUrl(pub.shareToken) : '';

  if (!ready) return <Loader2 size={18} className="animate-spin text-muted" />;

  return (
    <div className="space-y-4 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-2 px-3 py-1 text-sm font-medium" role="status">
          {state === 'draft' ? <Lock size={14} aria-hidden="true" /> : state === 'live' ? <Globe size={14} aria-hidden="true" /> : <Power size={14} aria-hidden="true" />}
          {STATE_LABELS[state]}
        </span>
        {pub && views !== null && <span className="text-sm text-muted">{views === 1 ? '1 visit' : `${views} visits`} (counted anonymously)</span>}
      </div>

      {!session ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-2">Publishing uses your YOU account. Visitors never need one.</p>
          <ShowcaseSignIn compact />
        </div>
      ) : (
        <>
          {pub && (
            <div>
              <label className="label" htmlFor="pf-link">Link to send</label>
              <div className="flex flex-wrap gap-2">
                <input id="pf-link" className="input min-w-0 flex-1 font-mono text-xs" readOnly value={link} onFocus={(e) => e.target.select()} />
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}
                </button>
                <a className="btn" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Open</a>
              </div>
              <p className="mt-1 text-xs text-muted">
                {VISIBILITY[pub.visibility].label}
                {pub.expiresAt !== null && ` · stops working after ${date(pub.expiresAt)}`}
                {pub.status === 'disabled' && ' · turned off: visitors see “no longer available”'}
              </p>
            </div>
          )}

          {p.visibility === 'password' && (
            <div>
              <label className="label" htmlFor="pf-password">{pub?.passwordSet && pub.visibility === 'password' ? 'New password (optional)' : 'Password for visitors'}</label>
              <div className="flex gap-2">
                <input
                  id="pf-password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
                <button type="button" className="btn-ghost" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted">
                Send it separately from the link. It’s stored only as a scrambled check on the server, never on your devices. Changing it signs out everyone who entered the old one.
              </p>
              {passwordProblem && <p className="mt-1 text-sm text-seed">{passwordProblem}</p>}
            </div>
          )}

          {blockers.length > 0 && (
            <div className="rounded-lg bg-paper-2 p-3 text-sm">
              <p className="font-semibold">Before publishing</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-2">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          )}

          {error && <p className="text-sm text-seed" role="alert">{error}</p>}

          <div className="flex flex-wrap gap-2">
            {(!pub || state === 'changed' || settingsChanged || password) && (
              <button type="button" className="btn-primary" disabled={!canPublish || !!busy} onClick={() => void publish()}>
                {busy === 'publish' ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
                {pub ? 'Update published version' : 'Publish'}
              </button>
            )}
            {pub && (
              <>
                <button
                  type="button"
                  className="btn"
                  disabled={!!busy}
                  onClick={() => void run('status', () => setPortfolioLive(p, pub.status !== 'live'), pub.status === 'live' ? 'Link turned off.' : 'Link turned back on.')}
                >
                  {busy === 'status' ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                  {pub.status === 'live' ? 'Turn link off' : 'Turn link back on'}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!!busy}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Replace the link?',
                      message: 'The current link stops working straight away, for everyone who has it. You’ll get a new link to send.',
                      confirmLabel: 'Replace link',
                      danger: true,
                    });
                    if (ok) await run('rotate', () => replacePortfolioLink(p), 'New link ready. The old one no longer works.');
                  }}
                >
                  {busy === 'rotate' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Replace link
                </button>
                <button
                  type="button"
                  className="btn-ghost text-seed"
                  disabled={!!busy}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Unpublish this portfolio?',
                      message: 'The link stops working and the published copy and its pictures are deleted from the server. Your draft stays here, and you can publish it again later with a new link.',
                      confirmLabel: 'Unpublish',
                      danger: true,
                    });
                    if (ok) await run('unpublish', () => unpublishPortfolio(p), 'Unpublished. The link no longer works.');
                  }}
                >
                  {busy === 'unpublish' ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Unpublish
                </button>
              </>
            )}
          </div>
          {pub && state === 'live' && !settingsChanged && !password && (
            <p className="flex items-center gap-1.5 text-xs text-muted"><Link2 size={13} aria-hidden="true" /> Visitors see the version you published. Edits here stay private until you update it.</p>
          )}
        </>
      )}
    </div>
  );
}
