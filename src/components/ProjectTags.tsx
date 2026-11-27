import { ChevronDown, X } from 'lucide-react';
import type { useLibrary } from '../hooks/useLibrary';
import type { Project } from '../domain/types';
import { linkTagToProject, setProjectTagChapter, unlinkProjectTag } from '../db/projectTags';
import { TagInput } from './TagInput';
import { useToast } from './Toast';
import { useConfirm } from './Modal';

type Lib = NonNullable<ReturnType<typeof useLibrary>>;

/**
 * A Creation's own tags. Tag a note with one, in Capture or anywhere else, and it
 * joins this Creation (and its book: the chosen chapter, or the tray to place later).
 * Taking a tag off a note, or off this list, never takes a note out.
 */
export function ProjectTagsSection({ lib, project, workspaceId }: { lib: Lib; project: Project; workspaceId?: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const mine = lib.tags.filter((t) => t.projectId === project.id).sort((a, b) => a.name.localeCompare(b.name));
  const chapters = workspaceId ? lib.sections.filter((s) => s.bookId === workspaceId).sort((a, b) => a.order - b.order) : [];
  const projectTitle = (id: string) => lib.projects.find((p) => p.id === id)?.title;

  const add = async (name: string) => {
    const existing = lib.tags.find((t) => t.name === name);
    const other = existing?.projectId && existing.projectId !== project.id ? projectTitle(existing.projectId) : undefined;
    if (other && !(await confirm({ title: `Move #${name} here?`, message: `#${name} files notes into “${other}” now. It can belong to one creation at a time. Notes already in “${other}” stay there.`, confirmLabel: 'Move it here' }))) return;
    const filed = await linkTagToProject(name, project.id);
    toast(filed ? `#${name} added. ${filed} ${filed === 1 ? 'note' : 'notes'} with it joined ${project.title}.` : `#${name} added. Notes you tag with it will join ${project.title}.`);
  };
  const remove = async (tagId: string, name: string) => {
    await unlinkProjectTag(tagId);
    toast(`#${name} no longer files notes here. Notes already here stay.`);
  };

  return (
    // Folded away until wanted, like the workspace's Project progress and Contents.
    <details className="group mt-4 rounded-2xl border border-line bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 hover:bg-paper-2 [&::-webkit-details-marker]:hidden">
        <h2 id="creation-tags" className="font-serif text-xl">Tags</h2>
        <span className="text-sm text-muted tabular-nums">· {mine.length}</span>
        <ChevronDown size={18} className="ml-auto text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-4 pb-4">
        <p className="mb-3 max-w-2xl text-sm text-ink-2">
          Tag a note with one of these, in Capture or anywhere, and it joins {project.title}
          {workspaceId ? (chapters.length ? ', in the chapter you choose (or the tray, to place later)' : ', in its workspace tray to place later') : ''}. Taking the tag off never takes the note out.
        </p>
        <div className="panel space-y-2 p-4">
          {mine.length > 0 && (
            <ul className="space-y-2">
              {mine.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-paper-2 px-2.5 py-1 text-sm font-medium text-ink">#{t.name}</span>
                  {chapters.length > 0 && (
                    <select
                      className="input w-auto py-1 text-sm"
                      aria-label={`Where #${t.name} places notes`}
                      value={t.sectionId && chapters.some((c) => c.id === t.sectionId) ? t.sectionId : ''}
                      onChange={(e) => void setProjectTagChapter(t.id, e.target.value || null)}
                    >
                      <option value="">Tray (place later)</option>
                      {chapters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  )}
                  <button type="button" className="btn-ghost ml-auto p-2 text-muted" onClick={() => void remove(t.id, t.name)} aria-label={`Stop #${t.name} filing notes here`} title="Stop filing notes here (notes already here stay)">
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <TagInput value={mine.map((t) => t.name)} onAdd={(n) => void add(n)} onRemove={() => {}} showChips={false} placeholder={mine.length ? 'Add another tag…' : 'Add a tag, e.g. poetry'} />
        </div>
      </div>
    </details>
  );
}
