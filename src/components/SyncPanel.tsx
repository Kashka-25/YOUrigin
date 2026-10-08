import { useState } from 'react';
import { Cloud, CloudOff, Loader2, Lock, RefreshCw, AlertCircle, Check } from 'lucide-react';
import {
  cancelSetup,
  createPassphrase,
  resyncEverything,
  signIn,
  stopSync,
  syncNow,
  unlock,
  useSyncStatus,
  type SyncStatus,
} from '../sync/controller';
import { useConfirm } from './Modal';
import { useToast } from './Toast';

function ago(ts?: number) {
  if (!ts) return 'not yet';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(ts).toLocaleString();
}

export function SyncStatusLine({ status }: { status: SyncStatus }) {
  const map: Record<string, { icon: React.ReactNode; text: string; cls: string }> = {
    idle: {
      icon: <Check size={14} />,
      text: status.pending ? `${status.pending} change${status.pending === 1 ? '' : 's'} waiting to sync` : `Synced ${ago(status.lastSyncedAt)}`,
      cls: 'text-polished',
    },
    syncing: { icon: <Loader2 size={14} className="animate-spin" />, text: 'Syncing…', cls: 'text-ink-2' },
    offline: {
      icon: <CloudOff size={14} />,
      text: `Offline — ${status.pending ? `${status.pending} change${status.pending === 1 ? '' : 's'} will sync` : 'will sync'} when you reconnect`,
      cls: 'text-muted',
    },
    error: { icon: <AlertCircle size={14} />, text: status.error ?? 'Sync problem', cls: 'text-seed' },
    checking: { icon: <Loader2 size={14} className="animate-spin" />, text: 'Connecting…', cls: 'text-ink-2' },
  };
  const m = map[status.phase];
  if (!m) return null;
  return (
    <p className={`flex items-center gap-1.5 text-sm ${m.cls}`} role="status" aria-live="polite">
      {m.icon}
      {m.text}
    </p>
  );
}

export function SyncPanel() {
  const status = useSyncStatus();
  const confirm = useConfirm();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setFormError(null);
    try {
      await fn();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (status.phase === 'off') {
    return (
      <div className="space-y-4">
        <p className="text-[15px] leading-relaxed text-ink-2">
          Keep your phone and laptop in step automatically. Your writing is <strong className="text-ink">encrypted on this device</strong> with a passphrase
          only you know before it is uploaded, so the server can never read it. Sign in with the same email and password you use for the YOU app.
        </p>
        <form
          className="panel grid gap-3 p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await signIn(email, password);
              setPassword('');
            });
          }}
        >
          <div>
            <label className="label" htmlFor="sync-email">
              Email
            </label>
            <input id="sync-email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="sync-password">
              Password
            </label>
            <input
              id="sync-password"
              type="password"
              autoComplete="current-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {(formError || status.error) && <p className="text-sm text-seed sm:col-span-2">{formError ?? status.error}</p>}
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Cloud size={15} />} Sign in to sync
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (status.phase === 'new-passphrase') {
    const tooShort = pass1.length > 0 && pass1.length < 10;
    const mismatch = pass2.length > 0 && pass1 !== pass2;
    return (
      <form
        className="panel space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (pass1.length < 10 || pass1 !== pass2) return;
          void run(async () => {
            await createPassphrase(pass1);
            setPass1('');
            setPass2('');
            toast('Sync is on — your library is uploading, encrypted');
          });
        }}
      >
        <p className="flex items-center gap-2 font-semibold">
          <Lock size={16} aria-hidden /> Choose a sync passphrase
        </p>
        <p className="text-sm leading-relaxed text-ink-2">
          This encrypts everything before it leaves your device. You'll enter it once on each device you sync.{' '}
          <strong className="text-ink">It can't be reset or recovered</strong> — if it's forgotten, the cloud copy can't be read (your devices keep their
          own copies). Use at least 10 characters; a short sentence works well.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="sync-pass1">
              Passphrase
            </label>
            <input id="sync-pass1" type="password" autoComplete="new-password" className="input" value={pass1} onChange={(e) => setPass1(e.target.value)} />
            {tooShort && <p className="mt-1 text-xs text-seed">At least 10 characters, please.</p>}
          </div>
          <div>
            <label className="label" htmlFor="sync-pass2">
              Repeat passphrase
            </label>
            <input id="sync-pass2" type="password" autoComplete="new-password" className="input" value={pass2} onChange={(e) => setPass2(e.target.value)} />
            {mismatch && <p className="mt-1 text-xs text-seed">The two don't match yet.</p>}
          </div>
        </div>
        {formError && <p className="text-sm text-seed">{formError}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={busy || pass1.length < 10 || pass1 !== pass2}>
            {busy && <Loader2 size={15} className="animate-spin" />} Turn on sync
          </button>
          <button type="button" className="btn" onClick={() => void cancelSetup()}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  if (status.phase === 'needs-passphrase') {
    return (
      <form
        className="panel space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const ok = await unlock(pass1);
            if (!ok) throw new Error('That passphrase doesn’t match the one used on your other device.');
            setPass1('');
            toast('Sync is on — bringing your library together');
          });
        }}
      >
        <p className="flex items-center gap-2 font-semibold">
          <Lock size={16} aria-hidden /> Enter your sync passphrase
        </p>
        <p className="text-sm text-ink-2">
          Signed in as {status.email}. Use the passphrase you chose on your first device. Anything already on this device will be merged in — nothing is
          deleted.
        </p>
        <div>
          <label className="label" htmlFor="sync-unlock">
            Passphrase
          </label>
          <input id="sync-unlock" type="password" autoComplete="current-password" className="input" value={pass1} onChange={(e) => setPass1(e.target.value)} />
        </div>
        {formError && <p className="text-sm text-seed">{formError}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={busy || !pass1}>
            {busy && <Loader2 size={15} className="animate-spin" />} Unlock and sync
          </button>
          <button type="button" className="btn" onClick={() => void cancelSetup()}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  if (status.phase === 'checking' && !status.email) return <SyncStatusLine status={status} />;

  return (
    <div className="space-y-3">
      <div className="panel space-y-3 p-4">
        <SyncStatusLine status={status} />
        <p className="text-sm text-ink-2">
          Syncing as {status.email ?? 'your account'} · end-to-end encrypted. Changes sync a few seconds after you make them, when you return to the app, and
          every minute while it's open.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => void syncNow()} disabled={status.phase === 'syncing'}>
            <RefreshCw size={15} /> Sync now
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={async () => {
              if (
                await confirm({
                  title: 'Re-sync everything?',
                  message: 'This device will download everything again and re-send its own pieces. Nothing is deleted. Useful if a device seems out of step.',
                  confirmLabel: 'Re-sync',
                })
              )
                await resyncEverything();
            }}
          >
            Re-sync everything
          </button>
          <button
            type="button"
            className="btn-ghost text-seed"
            onClick={async () => {
              if (
                await confirm({
                  title: 'Stop syncing on this device?',
                  message:
                    'This device signs out of sync. Everything already here stays here, and your other devices keep syncing. You can turn it back on any time with your passphrase.',
                  confirmLabel: 'Stop syncing',
                })
              )
                await stopSync();
            }}
          >
            Stop syncing on this device
          </button>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Edited the same piece on two devices while offline? The most recent edit wins, and the earlier wording stays in that piece's History on the device
        where it was written.
      </p>
    </div>
  );
}
