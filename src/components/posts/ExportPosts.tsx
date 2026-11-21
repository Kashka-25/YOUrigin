import { useState } from 'react';
import { FileJson, FileText } from 'lucide-react';
import { Modal } from '../Modal';
import { useToast } from '../Toast';
import { db } from '../../db/db';
import { download } from '../../io/export';
import { approvedBetween, buildSchedule, scheduleToMarkdown } from '../../posts/export';
import { addDays, dateKey, startOfWeek, type Post } from '../../posts/model';

function parseDay(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Saves approved posts as a file for the scheduling step. It changes nothing and sends nothing. */
export function ExportPostsDialog({ open, onClose, posts }: { open: boolean; onClose: () => void; posts: Post[] }) {
  const toast = useToast();
  const monday = startOfWeek(new Date());
  const [from, setFrom] = useState(dateKey(monday));
  const [to, setTo] = useState(dateKey(addDays(monday, 13)));
  const fromDay = parseDay(from);
  const toDay = parseDay(to);
  const chosen = fromDay && toDay ? approvedBetween(posts, fromDay, toDay) : [];

  const save = async (kind: 'json' | 'md') => {
    if (!fromDay || !toDay) return;
    const ids = [...new Set(chosen.flatMap((p) => p.pieceIds))];
    const assetIds = [...new Set(chosen.flatMap((p) => p.media.flatMap((m) => (m.kind === 'asset' ? [m.assetId] : []))))];
    const [pieces, assets] = await Promise.all([db.content.bulkGet(ids), db.assets.bulkGet(assetIds)]);
    const schedule = buildSchedule(posts, fromDay, toDay, {
      pieces: new Map(pieces.flatMap((p) => (p ? [[p.id, p] as const] : []))),
      assets: new Map(assets.flatMap((a) => (a ? [[a.id, a] as const] : []))),
    });
    const name = `approved-posts-${schedule.from}-to-${schedule.to}`;
    if (kind === 'json') download(`${name}.json`, JSON.stringify(schedule, null, 2), 'application/json');
    else download(`${name}.md`, scheduleToMarkdown(schedule), 'text/markdown');
    toast(`Saved ${schedule.posts.length} approved post${schedule.posts.length === 1 ? '' : 's'}.`);
  };

  return (
    <Modal open={open} onClose={onClose} title="Export approved posts">
      <p className="mb-4 text-sm text-ink-2">
        Saves the approved posts in these dates as a file for scheduling. Nothing is sent anywhere and the posts stay Approved until you mark them Posted.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">From</span>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <span className="label">To</span>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <p className="mt-3 text-sm" role="status">
        {chosen.length ? `${chosen.length} approved post${chosen.length === 1 ? '' : 's'} in these dates.` : 'No approved posts in these dates yet.'}
      </p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" disabled={!chosen.length} onClick={() => void save('md')}>
          <FileText size={16} /> Readable (.md)
        </button>
        <button type="button" className="btn-primary" disabled={!chosen.length} onClick={() => void save('json')}>
          <FileJson size={16} /> For scheduling (.json)
        </button>
      </div>
    </Modal>
  );
}
