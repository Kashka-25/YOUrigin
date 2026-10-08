import { Link } from 'react-router-dom';
import { AlertCircle, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { useSyncStatus } from '../sync/controller';

/** Small sync indicator for the navigation. Hidden until sync is set up. */
export function SyncBadge({ compact = false }: { compact?: boolean }) {
  const s = useSyncStatus();
  if (s.phase === 'off' || s.phase === 'new-passphrase' || s.phase === 'needs-passphrase') return null;
  const view =
    s.phase === 'syncing' || s.phase === 'checking'
      ? { icon: <RefreshCw size={14} className="animate-spin" />, text: 'Syncing…', cls: 'text-muted' }
      : s.phase === 'error'
        ? { icon: <AlertCircle size={14} />, text: 'Sync needs attention', cls: 'text-seed' }
        : s.phase === 'offline'
          ? { icon: <CloudOff size={14} />, text: s.pending ? `${s.pending} to sync` : 'Will sync later', cls: 'text-muted' }
          : { icon: <Cloud size={14} />, text: s.pending ? `${s.pending} to sync` : 'Synced', cls: 'text-muted' };
  return (
    <Link
      to="/settings#s-sync"
      className={`flex items-center gap-2 rounded-lg text-xs hover:text-ink ${view.cls} ${compact ? 'p-1.5' : 'px-3 pt-2'}`}
      title={s.error ?? view.text}
      aria-label={`Sync: ${view.text}`}
    >
      {view.icon}
      {!compact && <span>{view.text}</span>}
    </Link>
  );
}
