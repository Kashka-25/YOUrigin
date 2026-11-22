import { useLiveQuery } from 'dexie-react-hooks';
import { Film, Loader2 } from 'lucide-react';
import { db } from '../db/db';
import { formatBytes } from '../io/images';
import { runClipSync, setClipSettings, useClipSyncStatus } from '../sync/clipSync';

const KEEP_OPTIONS = [3, 7, 14, 30, 90];

/** Videos across devices: what's in the cloud, what's moving, and this device's choices. */
export function VideoSyncPanel() {
  const status = useClipSyncStatus();
  const counts = useLiveQuery(async () => {
    const [infos, local] = await Promise.all([db.clipInfo.toArray(), db.clips.toCollection().primaryKeys()]);
    const here = new Set(local);
    const inCloud = infos.filter((i) => i.uploadedAt && !i.removedFromCloudAt);
    return {
      cloudBytes: inCloud.reduce((n, i) => n + i.bytes, 0),
      inCloud: inCloud.length,
      waiting: infos.filter((i) => !i.uploadedAt && !i.removedFromCloudAt && here.has(i.id)).length,
      elsewhere: inCloud.filter((i) => !here.has(i.id)).length,
    };
  }, []);
  const { settings, current } = status;

  return (
    <div className="panel space-y-3 p-4">
      <h3 className="flex items-center gap-2 font-serif text-lg">
        <Film size={17} aria-hidden /> Videos
      </h3>
      <p className="text-sm text-ink-2">
        A video added on one device reaches your others through an encrypted cloud copy, locked with your sync passphrase. Each device keeps the videos it has
        brought in.
      </p>
      {counts && (
        <p className="text-sm" role="status">
          {counts.inCloud} video{counts.inCloud === 1 ? '' : 's'} in the cloud ({formatBytes(counts.cloudBytes)})
          {counts.elsewhere ? ` · ${counts.elsewhere} not on this device yet` : ''}
          {counts.waiting ? ` · ${counts.waiting} waiting to upload` : ''}.
        </p>
      )}
      {current && (
        <p className="flex items-center gap-2 text-sm text-ink-2" aria-live="polite">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          {current.direction === 'up' ? 'Sending' : 'Bringing in'} {current.name}: {Math.round((current.done / Math.max(1, current.total)) * 100)}%
        </p>
      )}
      {status.error && <p className="text-sm text-seed">{status.error}</p>}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" checked={settings.autoDownload} onChange={(e) => setClipSettings({ autoDownload: e.target.checked })} />
        <span>
          Bring videos onto this device automatically
          <span className="block text-xs text-muted">Off: tap a video to bring it in when you need it (saves data on the phone).</span>
        </span>
      </label>
      <label className="block text-sm">
        <span className="label">Keep a posted video in the cloud for</span>
        <select className="input w-auto" value={settings.keepDays} onChange={(e) => setClipSettings({ keepDays: Number(e.target.value) })}>
          {KEEP_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {d} days
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-muted">After that its cloud copy is removed. Devices that have it keep theirs.</span>
      </label>
      <button type="button" className="btn" disabled={status.running} onClick={() => void runClipSync()}>
        {status.running ? 'Working…' : 'Check videos now'}
      </button>
    </div>
  );
}
