import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plus, X } from 'lucide-react';
import { isSyncEnabled } from '../sync/runtime';
import { loadProfile, loadYouProfile, saveProfile, showcaseSignIn, showcaseSignOut, useShowcaseSession } from '../showcase/api';
import { LIMITS, LINK_KINDS, fitText, validateProfile, type ArtistProfile, type LinkKind } from '../showcase/model';
import { useToast } from './Toast';

/** Sign in with a YOU account, just for sharing. With Sync on, Sync's sign-in is used. */
export function ShowcaseSignIn({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isSyncEnabled()) {
    return (
      <p className="text-sm text-ink-2">
        Your Sync sign-in has expired. Sign in again under <Link to="/settings" className="underline">Settings → Sync between devices</Link>, then come back.
      </p>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await showcaseSignIn(email, password);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {!compact && <p className="text-sm text-ink-2">Sign in with your YOU account. It's only used to share; your codex stays on this device.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Email</span>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
      </div>
      {error && <p className="text-sm text-seed" role="alert">{error}</p>}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy && <Loader2 size={15} className="animate-spin" />} Sign in
      </button>
    </form>
  );
}

const EMPTY: ArtistProfile = { displayName: '', bio: '', links: [], kronkHandle: '' };

/** Settings: who you are credited as on YOU, and where people can support you. */
export function ArtistProfilePanel() {
  const { session, ready } = useShowcaseSession();
  const toast = useToast();
  const [p, setP] = useState<ArtistProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [fromYou, setFromYou] = useState(false);
  const uid = session?.user.id;

  useEffect(() => {
    if (!uid) return;
    loadProfile()
      .then(async (x) => {
        if (x) return setP(x);
        // New here: start from your YOU profile, so you're the same person in both apps.
        const you = await loadYouProfile();
        setFromYou(Boolean(you?.name || you?.bio));
        setP({ ...EMPTY, displayName: fitText(you?.name ?? '', LIMITS.name), bio: fitText(you?.bio ?? '', LIMITS.bio) });
      })
      .catch((e) => {
        setP({ ...EMPTY });
        toast(e instanceof Error ? e.message : String(e));
      });
  }, [uid, toast]);

  if (!ready) return <Loader2 size={16} className="animate-spin text-muted" />;
  if (!session) return <ShowcaseSignIn />;
  if (!p) return <Loader2 size={16} className="animate-spin text-muted" />;

  const setLink = (i: number, patch: Partial<ArtistProfile['links'][number]>) =>
    setP({ ...p, links: p.links.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const found = validateProfile(p);
        setProblems(found);
        if (found.length) return;
        setBusy(true);
        try {
          await saveProfile(p);
          toast('Artist profile saved');
        } catch (err) {
          setProblems([err instanceof Error ? err.message : String(err)]);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm text-ink-2">
        Signed in with your YOU account, {session.user.email}. This is one artist profile: you can also edit it in YOU under Your Own Universe.{' '}
        {!isSyncEnabled() && (
          <button type="button" className="underline" onClick={() => void showcaseSignOut()}>
            Sign out
          </button>
        )}
      </p>
      {fromYou && <p className="rounded-xl bg-paper-2 p-2.5 text-sm text-ink-2">Filled in from your YOU profile. Change anything, then save.</p>}
      <label className="block">
        <span className="label">Credited as</span>
        <input className="input" maxLength={LIMITS.name} value={p.displayName} onChange={(e) => setP({ ...p, displayName: e.target.value })} placeholder="Your artist name" />
      </label>
      <label className="block">
        <span className="label">A line about you</span>
        <textarea className="input resize-y" rows={2} maxLength={LIMITS.bio} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} placeholder="Painter of tidal light, from Cornwall." />
      </label>
      <label className="block">
        <span className="label">Kronk handle (optional)</span>
        <input className="input" value={p.kronkHandle} onChange={(e) => setP({ ...p, kronkHandle: e.target.value })} placeholder="@you@kronk.social" autoCapitalize="off" />
        <span className="mt-1 block text-xs text-muted">Links your credit to Kronk, so artists who offer each other work can find and thank each other there.</span>
      </label>

      <fieldset className="space-y-2">
        <legend className="label">Support links</legend>
        {p.links.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select className="input w-auto" value={l.kind} onChange={(e) => setLink(i, { kind: e.target.value as LinkKind })} aria-label={`Link ${i + 1} kind`}>
              {Object.entries(LINK_KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input className="input min-w-0 flex-1" value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} placeholder="ko-fi.com/you" aria-label={`Link ${i + 1} address`} autoCapitalize="off" />
            <button type="button" className="btn-ghost p-2" aria-label={`Remove link ${i + 1}`} onClick={() => setP({ ...p, links: p.links.filter((_, j) => j !== i) })}>
              <X size={15} />
            </button>
          </div>
        ))}
        {p.links.length < LIMITS.links && (
          <button type="button" className="btn-ghost -ml-3 text-sm" onClick={() => setP({ ...p, links: [...p.links, { kind: 'kofi', label: '', url: '' }] })}>
            <Plus size={14} /> Add a link
          </button>
        )}
        <p className="text-xs text-muted">Contributions go straight to you through these links. YOU never handles the money.</p>
      </fieldset>

      {problems.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-seed" role="alert">
          {problems.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy && <Loader2 size={15} className="animate-spin" />} Save artist profile
        </button>
        <Link to="/shared" className="btn-ghost text-sm">
          See what you've shared
        </Link>
      </div>
    </form>
  );
}
