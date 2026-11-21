import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { UniversePanel } from '../components/UniversePanel';
import { CoverPicture } from '../components/CoverPicture';
import { BookOpen, ChevronDown, ChevronRight, FolderInput, Link2, Plus, Search, Trash2, Unlink, Upload } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { CONTENT_TYPES, DEFAULT_PROJECT_COLOUR, PROJECT_CATEGORIES, PROJECT_KIND_META, PROJECT_STATUS_META, TYPE_LABEL, projectKind } from '../domain/constants';
import type { ContentType, ProjectColour, ProjectStatus } from '../domain/types';
import { ProjectColourPicker, projectColourStyle } from '../components/ProjectColourPicker';
import { removeAssetIfUnused } from '../db/assets';
import { CoverPicker } from '../components/CoverPicker';
import { createProject, updateProject, deleteProject, addItemsToProject, removeItemFromProject, setCreationParent, moveItemToProject } from '../db/projectRecords';
import { createContent } from '../db/content';
import { createBook, deleteBook, updateBook } from '../db/books';
import { ImportDialog } from '../components/ImportDialog';
import { displayTitle, excerpt } from '../domain/text';
import { ancestorsOf, canMoveInto, childrenOf, descendantsOf, parentOf, topLevel, treeOrder } from '../domain/creations';
import { Modal, useConfirm } from '../components/Modal';
import { EmptyState, Spinner } from '../components/ui';

function noteTitle(item: { title: string; body: string }) {
  return item.title.trim() || item.body.split('\n')[0]?.trim() || 'Untitled note';
}

type Lib = NonNullable<ReturnType<typeof useLibrary>>;

/** Notes in this Creation and every branch inside it, each counted once. */
function noteCount(lib: Lib, id: string): number {
  const ids = new Set([id, ...descendantsOf(lib.projects, id).map((p) => p.id)]);
  return lib.items.filter((i) => !i.deletedAt && !i.archived && (i.projectIds ?? []).some((p) => ids.has(p))).length;
}

/** A Creation as a picture tile: its cover (or a generated one in its colour), name and a quiet count. */
function CreationTile({ lib, project }: { lib: Lib; project: Lib['projects'][number] }) {
  const branches = childrenOf(lib.projects, project.id).length;
  const notes = noteCount(lib, project.id);
  return (
    <Link to={'/initiative/' + project.id} className="archive-card project-card group flex h-full flex-col overflow-hidden p-0" style={projectColourStyle(project.colour)}>
      <CoverPicture assetId={project.coverAssetId} colour={project.colour} seed={project.id} className="aspect-[16/7] w-full" />
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-serif text-2xl leading-tight text-ink group-hover:text-accent">{project.title}</h3>
        <p className="mt-auto pt-3 text-xs text-muted">
          {branches > 0 && <>{branches} {branches === 1 ? 'branch' : 'branches'} · </>}
          {notes} {notes === 1 ? 'note' : 'notes'}
        </p>
      </div>
    </Link>
  );
}

/** Name and colour, nothing more. With a parent, the new Creation becomes a branch inside it. */
function NewCreationDialog({ open, onClose, parent }: { open: boolean; onClose: () => void; parent?: { id: string; title: string; colour?: ProjectColour } }) {
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [colour, setColour] = useState<ProjectColour>(parent?.colour ?? DEFAULT_PROJECT_COLOUR);
  useEffect(() => {
    if (open) {
      setTitle('');
      setColour(parent?.colour ?? DEFAULT_PROJECT_COLOUR);
    }
  }, [open, parent?.colour]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const id = await createProject({ title, colour, parentId: parent?.id });
    onClose();
    // A new branch stays on its parent's page, so several can be added in a row.
    if (!parent) nav('/initiative/' + id);
  }
  return (
    <Modal open={open} onClose={onClose} title={parent ? `New branch in ${parent.title}` : 'New creation'}>
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="label" htmlFor="creation-title">Name</label>
          <input id="creation-title" className="input font-serif text-lg" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={parent ? 'Writing, Finished, Book 1…' : 'Lyrics & Music, Philosophy, Books…'} data-autofocus />
        </div>
        <ProjectColourPicker value={colour} onChange={setColour} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!title.trim()}>{parent ? 'Add branch' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Creations: only the top level, as picture tiles. Branches live inside each one. */
export function Projects() {
  const lib = useLibrary();
  const [creating, setCreating] = useState(false);
  if (!lib) return <Spinner />;
  const top = [...topLevel(lib.projects)].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div className="page-frame">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">Creations</h1>
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New creation</button>
      </header>
      {top.length === 0 ? (
        <div className="panel mt-7">
          <EmptyState title="Your creations will live here">
            Lyrics and music, philosophy, book ideas: each becomes a Creation, with branches inside for whatever it needs.
            <div className="mt-4"><button className="btn-primary" type="button" onClick={() => setCreating(true)}>Make your first creation</button></div>
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {top.map((project) => <li key={project.id}><CreationTile lib={lib} project={project} /></li>)}
        </ul>
      )}
      <NewCreationDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

export function ProjectHome() {
  const { id = '' } = useParams();
  const lib = useLibrary();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [addingBranch, setAddingBranch] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [choosingNotes, setChoosingNotes] = useState(false);
  const [importingNotes, setImportingNotes] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editStatus, setEditStatus] = useState<ProjectStatus>('idea');
  const [editParent, setEditParent] = useState('');
  const [editColour, setEditColour] = useState<ProjectColour>(DEFAULT_PROJECT_COLOUR);
  const [editCoverAssetId, setEditCoverAssetId] = useState<string | undefined>(undefined);
  // Pictures added while the details are open; the ones not kept are cleared away afterwards.
  const [coverUploads, setCoverUploads] = useState<string[]>([]);
  const [newNoteType, setNewNoteType] = useState<ContentType>('note');
  const [noteQuery, setNoteQuery] = useState('');
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');

  if (!lib) return <Spinner />;
  const all = lib.projects;
  const project = all.find((item) => item.id === id);
  if (!project) return <EmptyState title="Creation not found" action={<Link to="/initiatives" className="btn">All creations</Link>} />;
  const currentProject = project;
  const trail = ancestorsOf(all, id);
  const up = parentOf(all, id);
  const branches = [...childrenOf(all, id)].sort((a, b) => a.title.localeCompare(b.title));
  const isMusic = /\b(music|lyrics?|songs?|band|gig|set[\s-]?list|album)\b/i.test(
    [project.title, project.category, project.description, ...trail.map((t) => t.title)].join(' '),
  );

  const notes = lib.items
    .filter((item) => !item.deletedAt && !item.archived && (item.projectIds ?? []).includes(id))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const visibleNotes = noteQuery.trim()
    ? notes.filter((item) => (noteTitle(item) + ' ' + item.body).toLowerCase().includes(noteQuery.trim().toLowerCase()))
    : notes;
  const workspace = lib.books.find((work) => work.id === id)
    ?? lib.books.find((work) => (work.projectIds ?? []).includes(id)
      && work.title.trim().toLocaleLowerCase() === project.title.trim().toLocaleLowerCase());
  const availableNotes = lib.items
    .filter((item) => !item.deletedAt && !item.archived && !(item.projectIds ?? []).includes(id))
    .filter((item) => (noteTitle(item) + ' ' + item.body).toLowerCase().includes(noteQuery.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 40);
  // Places this Creation could sit inside: anywhere except itself and its own branches.
  const homes = treeOrder(all).filter(({ project: p }) => canMoveInto(all, id, p.id));
  const movingItem = moving ? lib.items.find((i) => i.id === moving) : undefined;

  function openNewNote() {
    setNewNoteType(isMusic ? 'song' : 'note');
    setAddingNote(true);
  }

  function openEdit() {
    setEditTitle(currentProject.title);
    setEditDescription(currentProject.description);
    setEditCategory(currentProject.category);
    setEditStatus(currentProject.status);
    setEditParent(up?.id ?? '');
    setEditColour(currentProject.colour ?? DEFAULT_PROJECT_COLOUR);
    setEditCoverAssetId(currentProject.coverAssetId);
    setCoverUploads([]);
    setEditing(true);
  }

  async function saveProject(e: FormEvent) {
    e.preventDefault();
    const previousCover = currentProject.coverAssetId;
    await updateProject(id, { title: editTitle, description: editDescription, category: editCategory, status: editStatus, colour: editColour, coverAssetId: editCoverAssetId });
    if ((up?.id ?? '') !== editParent) await setCreationParent(id, editParent || null);
    if (workspace) await updateBook(workspace.id, { title: editTitle, description: editDescription });
    await closeDetails(previousCover);
  }

  /** Closes the details and clears away pictures nothing uses any more (only ever unused ones). */
  async function closeDetails(previousCover?: string) {
    setEditing(false);
    for (const assetId of new Set([...coverUploads, previousCover])) await removeAssetIfUnused(assetId);
    setCoverUploads([]);
  }

  async function saveNewNote(e: FormEvent) {
    e.preventDefault();
    if (!newNoteBody.trim()) return;
    const noteId = await createContent({ title: newNoteTitle, body: newNoteBody, type: newNoteType, status: 'seed' });
    await addItemsToProject(id, [noteId]);
    setNewNoteTitle('');
    setNewNoteBody('');
    setAddingNote(false);
    nav('/item/' + noteId);
  }

  async function openWorkspace() {
    if (workspace) {
      nav('/projects/' + workspace.id);
      return;
    }
    const workspaceId = await createBook({ id, title: currentProject.title, description: currentProject.description, templateId: null, kind: 'custom' });
    nav('/projects/' + workspaceId);
  }

  async function removeThisProject() {
    const ownsWorkspace = workspace?.id === id;
    const yes = await confirm({
      title: `Delete “${currentProject.title}”?`,
      message: [
        'Its notes stay safe in All notes.',
        branches.length ? `Its ${branches.length === 1 ? 'branch moves' : `${branches.length} branches move`} up into ${up ? `“${up.title}”` : 'Creations'}.` : '',
        ownsWorkspace ? 'Its workspace layout (sections and order) will be removed.' : '',
      ].filter(Boolean).join(' '),
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!yes) return;
    if (ownsWorkspace) await deleteBook(id);
    await deleteProject(id);
    nav(up ? '/initiative/' + up.id : '/initiatives');
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-16 md:px-8 md:pt-10">
      {/* Where you are: Creations › Lyrics & Music › Songs */}
      <nav aria-label="Where you are" className="flex flex-wrap items-center gap-1 text-sm text-muted">
        <Link to="/initiatives" className="rounded px-1 hover:text-ink">Creations</Link>
        {trail.map((t) => (
          <span key={t.id} className="flex items-center gap-1">
            <ChevronRight size={14} aria-hidden />
            <Link to={'/initiative/' + t.id} className="rounded px-1 hover:text-ink">{t.title}</Link>
          </span>
        ))}
      </nav>

      <header className="mt-4">
        <div className="flex items-start gap-2">
          <h1 className="page-title flex min-w-0 flex-1 items-center gap-3">
            <span className="project-colour-dot shrink-0" style={projectColourStyle(project.colour)} aria-hidden />
            <span className="min-w-0 break-words">{project.title}</span>
          </h1>
          <button type="button" className="btn-ghost mt-2 px-2 py-1 text-xs" onClick={openEdit}>Details</button>
          <button type="button" className="btn-ghost mt-2 px-2 py-1 text-xs text-muted" onClick={() => void removeThisProject()} title="Delete" aria-label={`Delete ${project.title}`}><Trash2 size={14} /></button>
        </div>
        {project.description && <p className="mt-3 max-w-2xl font-serif text-lg leading-relaxed text-ink-2">{project.description}</p>}
        <CoverPicture assetId={project.coverAssetId} colour={project.colour} seed={project.id} className="mt-6 aspect-[16/5] w-full rounded-2xl border border-line" />
      </header>

      <section className="mt-9" aria-labelledby="creation-branches">
        <h2 id="creation-branches" className="section-heading mb-3">Branches</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((b) => <li key={b.id}><CreationTile lib={lib} project={b} /></li>)}
          <li>
            <button type="button" onClick={() => setAddingBranch(true)} className="flex h-full min-h-28 w-full flex-col items-center justify-center gap-1 rounded-[18px] border border-dashed border-line text-sm text-ink-2 hover:border-gold/60 hover:text-ink">
              <Plus size={18} aria-hidden /> New branch
            </button>
          </li>
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="creation-notes">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="creation-notes" className="section-heading">Notes <span className="text-muted">· {notes.length}</span></h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => setChoosingNotes(true)}><Link2 size={15} /> Add existing</button>
            <button type="button" className="btn" onClick={() => setImportingNotes(true)}><Upload size={15} /> Upload</button>
            <button type="button" className="btn-primary" onClick={openNewNote}><Plus size={15} /> New note</button>
          </div>
        </div>
        {notes.length > 8 && (
          <label className="relative mb-3 block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input w-full pl-9" value={noteQuery} onChange={(e) => setNoteQuery(e.target.value)} placeholder="Find a note…" aria-label="Find a note here" />
          </label>
        )}
        {visibleNotes.length ? (
          <ul className="panel divide-y divide-line overflow-hidden">
            {visibleNotes.map((item) => (
              <li key={item.id} className="flex items-center gap-1 px-4 py-3">
                <Link to={'/item/' + item.id} className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-lg text-ink hover:text-accent">{displayTitle(item)}</span>
                  <span className="mt-1 block line-clamp-2 whitespace-pre-line text-sm text-ink-2">{excerpt(item.body, 150)}</span>
                </Link>
                <button type="button" className="btn-ghost p-2" onClick={() => setMoving(item.id)} aria-label={'Move ' + displayTitle(item)} title="Move to another creation"><FolderInput size={15} /></button>
                <button type="button" className="btn-ghost p-2" onClick={() => void removeItemFromProject(id, item.id)} aria-label={'Take ' + displayTitle(item) + ' out of here'} title="Take out of here (the note stays in All notes)"><Unlink size={15} /></button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="panel p-5 text-sm text-ink-2">{notes.length ? 'No notes match.' : 'No notes here yet.'}</div>
        )}
      </section>

      {/* Workspace and Creative Universe: there when needed, folded away otherwise. */}
      <details className="group mt-10 rounded-2xl border border-line">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-ink hover:bg-paper-2 [&::-webkit-details-marker]:hidden">
          <BookOpen size={16} className="text-gold" aria-hidden /> Workspace & publishing
          <ChevronDown size={16} className="ml-auto text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-6 px-4 pt-2 pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-ink-2">
              {workspace
                ? `A workspace for shaping this into a finished ${PROJECT_KIND_META[projectKind(workspace)].label.toLowerCase()}.`
                : 'Set up a workspace to shape this into a book, album or set list.'}
            </p>
            <button type="button" className="btn" onClick={() => void openWorkspace()}><BookOpen size={15} /> {workspace ? 'Open workspace' : 'Set up workspace'}</button>
          </div>
          <UniversePanel key={project.id} project={project} />
        </div>
      </details>

      <NewCreationDialog open={addingBranch} onClose={() => setAddingBranch(false)} parent={project} />

      <Modal open={editing} onClose={() => void closeDetails()} title="Details">
        <form className="space-y-4" onSubmit={saveProject}>
          <div><label className="label" htmlFor="edit-project-title">Name</label><input id="edit-project-title" className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} data-autofocus /></div>
          <div><label className="label" htmlFor="edit-project-description">About <span className="font-normal text-muted">(optional)</span></label><textarea id="edit-project-description" className="input min-h-20" rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} /></div>
          <div>
            <label className="label" htmlFor="edit-project-parent">Sits inside</label>
            <select id="edit-project-parent" className="input" value={editParent} onChange={(e) => setEditParent(e.target.value)}>
              <option value="">Creations (top level)</option>
              {homes.map(({ project: p, depth }) => <option key={p.id} value={p.id}>{' '.repeat(depth) + p.title}</option>)}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="edit-project-status">Status</label>
              <select id="edit-project-status" className="input" value={editStatus} onChange={(e) => setEditStatus(e.target.value as ProjectStatus)}>
                {Object.entries(PROJECT_STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="edit-project-category">Category <span className="font-normal text-muted">(optional)</span></label>
              <input id="edit-project-category" className="input" list="edit-project-categories" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} />
              <datalist id="edit-project-categories">{PROJECT_CATEGORIES.map((name) => <option key={name} value={name} />)}</datalist>
            </div>
          </div>
          <ProjectColourPicker value={editColour} onChange={setEditColour} />
          <CoverPicker
            label="Cover image"
            value={editCoverAssetId}
            onChange={(assetId) => {
              setEditCoverAssetId(assetId);
              if (assetId) setCoverUploads((u) => [...u, assetId]);
            }}
          />
          <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => void closeDetails()}>Cancel</button><button type="submit" className="btn-primary">Save</button></div>
        </form>
      </Modal>

      <Modal open={!!movingItem} onClose={() => setMoving(null)} title={movingItem ? `Move “${displayTitle(movingItem)}” to…` : 'Move to…'}>
        <ul className="max-h-[60vh] space-y-0.5 overflow-y-auto">
          {treeOrder(all).map(({ project: p, depth }) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={p.id === id}
                className="flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-left text-sm hover:bg-paper-2 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
                style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}
                onClick={async () => {
                  if (!movingItem) return;
                  await moveItemToProject(movingItem.id, id, p.id);
                  setMoving(null);
                }}
              >
                <span className="project-colour-dot h-2.5 w-2.5 shrink-0" style={projectColourStyle(p.colour)} aria-hidden />
                <span className="truncate">{p.title}</span>
                {p.id === id && <span className="text-xs text-muted">· here</span>}
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal open={addingNote} onClose={() => setAddingNote(false)} title={`New note in ${project.title}`}>
        <form className="space-y-4" onSubmit={saveNewNote}>
          <div>
            <label className="label" htmlFor="new-note-type">Kind</label>
            <select id="new-note-type" className="input" value={newNoteType} onChange={(e) => setNewNoteType(e.target.value as ContentType)}>
              {CONTENT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div><label className="label" htmlFor="new-note-title">Title <span className="font-normal text-muted">(optional)</span></label><input id="new-note-title" className="input" value={newNoteTitle} onChange={(e) => setNewNoteTitle(e.target.value)} data-autofocus /></div>
          <div><label className="label" htmlFor="new-note-body">Words</label><textarea id="new-note-body" className="input min-h-40 font-serif text-base" rows={6} value={newNoteBody} onChange={(e) => setNewNoteBody(e.target.value)} placeholder="Start wherever it begins…" required /></div>
          <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setAddingNote(false)}>Cancel</button><button type="submit" className="btn-primary" disabled={!newNoteBody.trim()}>Save note</button></div>
        </form>
      </Modal>

      <Modal open={choosingNotes} onClose={() => setChoosingNotes(false)} title="Add notes you already have">
        <input className="input mb-3 w-full" value={noteQuery} onChange={(e) => setNoteQuery(e.target.value)} placeholder="Search notes…" aria-label="Search notes" data-autofocus />
        {availableNotes.length ? (
          <ul className="divide-y divide-line">
            {availableNotes.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif">{noteTitle(item)}</span>
                  <span className="text-xs text-muted">{TYPE_LABEL[item.type]}</span>
                </span>
                <button type="button" className="btn px-3 py-1.5 text-xs" onClick={async () => {
                  await addItemsToProject(id, [item.id]);
                  setChoosingNotes(false);
                }}>Add</button>
              </li>
            ))}
          </ul>
        ) : <p className="py-5 text-sm text-muted">No matching notes to add.</p>}
      </Modal>

      <ImportDialog open={importingNotes} onClose={() => setImportingNotes(false)} projectId={id} projectTitle={project.title} initialType={isMusic ? 'song' : 'auto'} />
    </div>
  );
}
