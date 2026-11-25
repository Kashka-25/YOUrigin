import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Moon, Undo2, X } from 'lucide-react';
import type { Book, ContentItem, Project } from '../../domain/types';
import { displayTitle, excerpt } from '../../domain/text';
import { PROJECT_KIND_META, TYPE_LABEL, projectKind } from '../../domain/constants';
import { placeFromRest, wakeFromRest, worksOfProject } from '../../db/resting';
import { useToast } from '../Toast';

/**
 * The Resting box: pieces taken out of a Work that still belong to the Project, waiting
 * until they find their place. Each can be placed back into any Work of its Project.
 */
export function RestingBox({
  projects,
  works,
  contentById,
  preferWorkId,
  className = '',
}: {
  /** The Projects whose resting pieces to show (one on a Project home; a Work's Projects in a Work). */
  projects: Project[];
  works: Book[];
  contentById: Map<string, ContentItem>;
  /** The Work to offer first (the one being edited). */
  preferWorkId?: string;
  className?: string;
}) {
  // Each piece once, even when it rests in more than one of these Projects.
  const seen = new Set<string>();
  const pieces = projects
    .flatMap((project) => (project.resting ?? []).map((r) => ({ ...r, project })))
    .sort((a, b) => b.at - a.at)
    .filter((r) => {
      const item = contentById.get(r.contentId);
      if (!item || item.deletedAt || seen.has(r.contentId)) return false;
      seen.add(r.contentId);
      return true;
    });
  if (!pieces.length) return null;
  const allProjectIds = projects.map((p) => p.id);

  return (
    <section className={`rounded-2xl border border-dashed border-line bg-paper-2/40 p-4 ${className}`} aria-labelledby="resting-box">
      <h2 id="resting-box" className="flex items-center gap-2 font-serif text-xl">
        <Moon size={17} className="text-muted" aria-hidden /> Resting <span className="text-sm text-muted">· {pieces.length}</span>
      </h2>
      <p className="mt-1 text-sm text-ink-2">Out of the running order, still part of the project. Resting until each finds its place.</p>
      <ul className="mt-3 space-y-2">
        {pieces.map((r) => (
          <RestingRow
            key={r.contentId}
            item={contentById.get(r.contentId)!}
            projectId={r.project.id}
            allProjectIds={allProjectIds}
            works={worksOfProject(r.project.id, works).filter((w) => !w.archived || w.id === preferWorkId)}
            defaultWorkId={[preferWorkId, r.fromWorkId].find((id) => id && worksOfProject(r.project.id, works).some((w) => w.id === id))}
            fromTitle={works.find((w) => w.id === r.fromWorkId)?.title}
          />
        ))}
      </ul>
    </section>
  );
}

function RestingRow({
  item,
  projectId,
  allProjectIds,
  works,
  defaultWorkId,
  fromTitle,
}: {
  item: ContentItem;
  projectId: string;
  allProjectIds: string[];
  works: Book[];
  defaultWorkId?: string;
  fromTitle?: string;
}) {
  const toast = useToast();
  const [workId, setWorkId] = useState(defaultWorkId ?? works[0]?.id ?? '');
  const target = works.find((w) => w.id === workId);
  const title = displayTitle(item);
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl bg-card px-3 py-2">
      <div className="min-w-0 flex-1 basis-48">
        <Link to={`/item/${item.id}`} className="block truncate font-serif text-base hover:underline">{title}</Link>
        <span className="block truncate text-xs text-muted">
          {TYPE_LABEL[item.type]}
          {fromTitle ? ` · out of ${fromTitle}` : ''}
          {item.body.trim() ? ` · ${excerpt(item.body, 60)}` : ''}
        </span>
      </div>
      {works.length > 0 && (
        <>
          {works.length > 1 && (
            <select
              className="max-w-[10rem] rounded-full border border-line bg-card px-2 py-1 text-xs text-ink-2"
              value={workId}
              onChange={(e) => setWorkId(e.target.value)}
              aria-label={`Where to place “${title}”`}
            >
              {works.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title} ({PROJECT_KIND_META[projectKind(w)].label.toLowerCase()})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="btn px-3 py-1 text-xs"
            disabled={!target}
            onClick={async () => {
              if (!target) return;
              await placeFromRest(projectId, item.id, target.id);
              toast(`“${title}” placed in ${target.title}`);
            }}
          >
            <Undo2 size={13} /> {works.length > 1 ? 'Place' : `Place in ${target?.title}`}
          </button>
        </>
      )}
      <button
        type="button"
        className="btn-ghost p-1 text-muted"
        title="Take out of the Resting box (it stays a note of this project)"
        aria-label={`Take “${title}” out of the Resting box`}
        onClick={() => void wakeFromRest(allProjectIds, [item.id])}
      >
        <X size={14} />
      </button>
    </li>
  );
}
