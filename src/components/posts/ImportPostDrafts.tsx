import { useEffect, useState } from 'react';
import { AlertTriangle, Film, ImageIcon, Link2, Sparkles } from 'lucide-react';
import { Modal } from '../Modal';
import { useToast } from '../Toast';
import { db } from '../../db/db';
import { importedDraftKeys, savePostDrafts } from '../../db/posts';
import { withMediaFiles } from '../../db/postMedia';
import { draftsToPosts, parsePostDrafts, resolvePostDrafts, type PostDraftsFile } from '../../io/importPosts';
import { collectImportFiles, findMedia, isVideoFile } from '../../io/postMedia';
import { FORMAT_LABEL, WORLD_LABEL, dateKey, timeKey } from '../../posts/model';
import { WorldDot } from './PostBits';

/** A drafts file under review, with the images and videos picked alongside it. */
export interface DraftsReview {
  file: PostDraftsFile;
  media: Map<string, File>;
}

/**
 * Reads what was picked: a drafts file on its own, or together with its images
 * and videos (picked as files, as a folder, or inside a .zip). Nothing is saved yet.
 */
export async function readPostDraftsFiles(picked: File[]): Promise<DraftsReview> {
  const { drafts, media } = await collectImportFiles(picked);
  if (!drafts.length) throw new Error('No drafts file (.json) was picked. Pick it together with its images and videos, or a .zip that holds them.');
  const parsed = parsePostDrafts(await drafts[0].text(), drafts[0].name);
  const [pieces, keys] = await Promise.all([db.content.toArray(), importedDraftKeys()]);
  return { file: resolvePostDrafts(parsed, pieces, keys), media };
}

/** Reads a drafts file and shows every draft for review before anything is saved. */
export async function readPostDraftsFile(file: File): Promise<PostDraftsFile> {
  return (await readPostDraftsFiles([file])).file;
}

/** A small preview of a picked file, before it is stored. */
function PickedThumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  const video = isVideoFile(file);
  useEffect(() => {
    if (video) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file, video]);
  if (video) {
    return (
      <span className="flex aspect-[4/5] w-12 shrink-0 items-center justify-center rounded-md bg-ink text-white" title={file.name}>
        <Film size={16} aria-label="Video" />
      </span>
    );
  }
  return url ? <img src={url} alt="" className="aspect-[4/5] w-12 shrink-0 rounded-md object-cover" title={file.name} /> : <span className="aspect-[4/5] w-12 shrink-0 rounded-md bg-paper-2" />;
}

export function ImportPostDraftsDialog({ review, onClose }: { review: DraftsReview | null; onClose: () => void }) {
  const file = review?.file ?? null;
  const media = review?.media ?? new Map<string, File>();
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
      const posts = await withMediaFiles(draftsToPosts({ ...file, drafts }), media);
      const saved = await savePostDrafts(posts);
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
      {!media.size && file.drafts.some((d) => d.media.length) && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-seed/30 p-3 text-sm text-ink-2">
          <ImageIcon size={16} className="mt-0.5 shrink-0 text-seed" aria-hidden />
          These drafts name images and videos, but none were picked, so they’ll arrive as file names. To see them, import the drafts together with their media (or the .zip), or use “Add media” on the Posts page afterwards.
        </p>
      )}
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
                {d.media.length > 0 && media.size > 0 && (
                  <span className="mt-2 block">
                    <span className="flex gap-1.5 overflow-x-auto pb-1">
                      {d.media.map((m) => {
                        const f = findMedia(media, m.name);
                        return f ? <PickedThumb key={m.name} file={f} /> : null;
                      })}
                    </span>
                    <span className="text-xs text-ink-2">
                      {d.media.filter((m) => findMedia(media, m.name)).length} of {d.media.length} image{d.media.length === 1 ? '' : 's'} and video{d.media.length === 1 ? '' : 's'} found
                    </span>
                  </span>
                )}
                {d.duplicate && <span className="mt-1 block text-xs text-muted">Already in your Posts, so it’s left as you have it. To bring in a fresh copy, set that post aside first.</span>}
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
