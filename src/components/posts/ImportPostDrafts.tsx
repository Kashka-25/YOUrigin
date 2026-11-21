import { useState } from 'react';
import { AlertTriangle, Link2, Sparkles } from 'lucide-react';
import { Modal } from '../Modal';
import { useToast } from '../Toast';
import { db } from '../../db/db';
import { importedDraftKeys, savePostDrafts } from '../../db/posts';
import { draftsToPosts, parsePostDrafts, resolvePostDrafts, type PostDraftsFile } from '../../io/importPosts';
import { FORMAT_LABEL, WORLD_LABEL, dateKey, timeKey } from '../../posts/model';
import { WorldDot } from './PostBits';

/** Reads a drafts file and shows every draft for review before anything is saved. */
export async function readPostDraftsFile(file: File): Promise<PostDraftsFile> {
  const parsed = parsePostDrafts(await file.text(), file.name);
  const [pieces, keys] = await Promise.all([db.content.toArray(), importedDraftKeys()]);
  return resolvePostDrafts(parsed, pieces, keys);
}

export function ImportPostDraftsDialog({ file, onClose }: { file: PostDraftsFile | null; onClose: () => void }) {
  const toast = useToast();
  const [edits, setEdits] = useState<{ source: PostDraftsFile | null; included: Record<string, boolean> }>({ source: null, included: {} });
  const [saving, setSaving] = useState(false);
  // Ticks reset whenever a different file is opened.
  const included = edits.source === file ? edits.included : {};
  if (!file) return null;

  const drafts = file.drafts.map((d) => ({ ...d, include: included[d.key] ?? d.include }));
  const count = drafts.filter((d) => d.include && !d.duplicate).length;

  const save = async () => {
    setSaving(true);
    try {
      const saved = await savePostDrafts(draftsToPosts({ ...file, drafts }));
      toast(saved ? `${saved} draft${saved === 1 ? '' : 's'} added for your review.` : 'Nothing new to add.');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Review drafts" wide>
      <p className="mb-4 text-sm text-ink-2">
        <Sparkles size={14} className="mr-1 inline text-gold" aria-hidden />
        From <strong>{file.fileName}</strong>{file.week ? `, week of ${file.week}` : ''}. Every post you keep arrives as a <strong>Draft</strong>: nothing is approved or scheduled until you say so.
      </p>
      <ul className="space-y-3">
        {drafts.map((d) => (
          <li key={d.key} className={`panel p-3 ${d.duplicate ? 'opacity-60' : ''}`}>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
                checked={d.include && !d.duplicate}
                disabled={d.duplicate}
                onChange={(e) => setEdits({ source: file, included: { ...included, [d.key]: e.target.checked } })}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
                  <WorldDot world={d.world} />
                  <span>{WORLD_LABEL[d.world]}</span>
                  <span aria-hidden>·</span>
                  <span>{FORMAT_LABEL[d.format]}</span>
                  <span aria-hidden>·</span>
                  <span>{d.scheduledAt !== null ? `${dateKey(new Date(d.scheduledAt))} ${timeKey(new Date(d.scheduledAt))}` : 'Not placed yet'}</span>
                </span>
                {d.hook && <span className="mt-1 block font-serif text-lg leading-snug">{d.hook}</span>}
                {d.caption && <span className="writing mt-1 line-clamp-4 block text-sm text-ink-2">{d.caption}</span>}
                {d.pieces.some((p) => p.pieceId) && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-polished">
                    <Link2 size={12} aria-hidden /> Linked to {d.pieces.filter((p) => p.pieceId).length} piece{d.pieces.filter((p) => p.pieceId).length === 1 ? '' : 's'}
                  </span>
                )}
                {d.duplicate && <span className="mt-1 block text-xs text-muted">Already imported, so it’s left as you have it.</span>}
                {d.warnings.map((w) => (
                  <span key={w} className="mt-1 flex items-start gap-1 text-xs text-seed">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden /> {w}
                  </span>
                ))}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="sticky bottom-0 -mx-5 mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-card px-5 pt-3 md:-mx-6 md:px-6">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn-primary" disabled={!count || saving} onClick={() => void save()}>
          {saving ? 'Adding…' : `Add ${count} as draft${count === 1 ? '' : 's'}`}
        </button>
      </div>
    </Modal>
  );
}
