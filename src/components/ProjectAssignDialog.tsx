import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, Link2 } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { addItemsToProject } from '../db/projectRecords';
import { Modal } from './Modal';
import { useToast } from './Toast';

export function ProjectAssignDialog({
  open,
  onClose,
  contentIds,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  contentIds: string[];
  onDone?: () => void;
}) {
  const lib = useLibrary();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState('');

  const projects = [...(lib?.projects ?? [])].sort((a, b) => a.title.localeCompare(b.title));
  const targetId = projects.some((project) => project.id === selectedId) ? selectedId : projects[0]?.id ?? '';

  async function submit() {
    if (!targetId) return;
    await addItemsToProject(targetId, contentIds);
    const title = projects.find((project) => project.id === targetId)?.title ?? 'Project';
    toast('Linked ' + contentIds.length + ' ' + (contentIds.length === 1 ? 'note' : 'notes') + ' to “' + title + '”');
    onDone?.();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={'Add ' + (contentIds.length === 1 ? 'note' : contentIds.length + ' notes') + ' to a Project'}>
      {projects.length === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-2">Create a Project first, then you can link notes to it from here.</p>
          <div className="flex justify-end">
            <Link to="/initiatives" className="btn-primary" onClick={onClose}><FolderKanban size={15} /> Open Projects</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <fieldset className="space-y-1.5">
            <legend className="label">Choose a Project</legend>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {projects.map((project) => {
                const alreadyLinked = contentIds.every((id) => (lib?.contentById.get(id)?.projectIds ?? []).includes(project.id));
                return (
                  <label key={project.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-paper-2">
                    <input type="radio" name="project-target" checked={targetId === project.id} onChange={() => setSelectedId(project.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-serif text-lg">{project.title}</span>
                      {project.category && <span className="block text-xs text-muted">{project.category}</span>}
                    </span>
                    {alreadyLinked && <span className="text-xs text-muted">Already linked</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" onClick={() => void submit()} disabled={contentIds.every((id) => (lib?.contentById.get(id)?.projectIds ?? []).includes(targetId))}><Link2 size={15} /> Add to Project</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
