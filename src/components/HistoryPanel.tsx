import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { History } from 'lucide-react';
import { db } from '../db/db';
import type { ContentItem, Revision } from '../domain/types';
import { snapshotRevision, updateContent } from '../db/content';
import { Modal, useConfirm } from './Modal';
import { useToast } from './Toast';

export function HistoryPanel({ item }: { item: ContentItem }) {
  const revisions = useLiveQuery(
    () => db.revisions.where('contentId').equals(item.id).reverse().sortBy('createdAt'),
    [item.id],
  );
  const [view, setView] = useState<Revision | null>(null);
  const confirm = useConfirm();
  const toast = useToast();
  if (!revisions?.length) return null;

  const restore = async (r: Revision) => {
    const ok = await confirm({
      title: 'Restore this version?',
      message: 'Your current text will be saved to History first, so nothing is lost.',
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    await snapshotRevision(item.id, true);
    await updateContent(item.id, { title: r.title, body: r.body });
    setView(null);
    toast('Earlier version restored');
  };

  return (
    <section>
      <h2 className="label flex items-center gap-1">
        <History size={12} aria-hidden /> History
      </h2>
      <ul className="space-y-0.5 text-sm">
        {revisions.slice(0, 8).map((r) => (
          <li key={r.id}>
            <button type="button" className="text-ink-2 hover:text-ink hover:underline" onClick={() => setView(r)}>
              {new Date(r.createdAt).toLocaleString()}
            </button>
          </li>
        ))}
      </ul>
      <Modal open={!!view} onClose={() => setView(null)} title="Earlier version" wide>
        {view && (
          <>
            <p className="text-xs text-muted">{new Date(view.createdAt).toLocaleString()}</p>
            {view.title && <p className="mt-3 font-serif text-2xl">{view.title}</p>}
            <p className="writing mt-3 text-[1.05rem] leading-relaxed">{view.body}</p>
            <div className="mt-6 flex justify-end">
              <button type="button" className="btn-primary" onClick={() => void restore(view)}>
                Restore this version
              </button>
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}
