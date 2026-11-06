import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, BookOpen, FilePlus2, FolderPlus, Link2, Plus, Search, Trash2, Unlink } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { PROJECT_CATEGORIES, PROJECT_STATUS_META } from '../domain/constants';
import type { ProjectStatus } from '../domain/types';
import { createProject, updateProject, deleteProject, addItemsToProject, removeItemFromProject, addWorksToProject, removeWorkFromProject } from '../db/projectRecords';
import { createContent } from '../db/content';
import { createBook } from '../db/books';
import { Modal, useConfirm } from '../components/Modal';
import { EmptyState, Spinner } from '../components/ui';

function ProjectStatusLabel({ status }: { status: ProjectStatus }) {
  return <span className={'inline-flex rounded-full px-2.5 py-1 text-xs font-medium ' + PROJECT_STATUS_META[status].className}>{PROJECT_STATUS_META[status].label}</span>;
}

function noteTitle(item: { title: string; body: string }) {
  return item.title.trim() || item.body.split('\n')[0]?.trim() || 'Untitled note';
}

export function Projects() {
  const lib = useLibrary();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [workId, setWorkId] = useState('');

  if (!lib) return <Spinner />;
  const library = lib;
  const categories = [...new Set(lib.projects.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const unlinkedWorksCount = lib.books.filter((work) => !(work.projectIds ?? []).length).length;
  const projects = [...lib.projects]
    .filter((p) => {
      const text = (p.title + ' ' + p.description + ' ' + p.category).toLowerCase();
      return (!query.trim() || text.includes(query.trim().toLowerCase()))
        && (!categoryFilter || p.category === categoryFilter)
        && (statusFilter === 'all' || p.status === statusFilter);
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const existingWork = library.books.find((work) => work.id === workId);
    const id = await createProject({
      title: title.trim() || existingWork?.title || 'Untitled project',
      description: description.trim() || existingWork?.description || '',
      category,
      status: existingWork ? 'building' : 'idea',
    });
    if (existingWork) await addWorksToProject(id, [existingWork.id]);
    setCreating(false);
    setTitle('');
    setDescription('');
    setCategory('');
    setWorkId('');
    nav('/initiative/' + id);
  }

  return (
    <div className="page-frame">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">The things you're bringing into being</p>
          <h1 className="page-title">Projects</h1>
          <p className="mt-3 max-w-xl font-serif text-lg text-ink-2">A simple home for the ideas, ventures and places you're developing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {unlinkedWorksCount > 0 && <Link to="/initiatives/import-works" className="btn"><FolderPlus size={16} /> Organise existing Works <span className="text-xs text-muted">· {unlinkedWorksCount}</span></Link>}
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New project</button>
        </div>
      </header>

      {lib.projects.length > 0 && (
        <div className="mt-7 flex flex-wrap gap-2">
          <label className="relative min-w-48 flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input w-full pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a project…" aria-label="Find a project" />
          </label>
          <select className="input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | ProjectStatus)} aria-label="Filter by status">
            <option value="all">All statuses</option>
            {Object.entries(PROJECT_STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </div>
      )}

      {projects.length === 0 ? (
        lib.projects.length === 0 ? (
          <div className="panel mt-7">
            <EmptyState title="A place for what you're building">
              Projects can be apps, businesses, creative ventures, places, areas of research or anything else that matters to you.
              <div className="mt-4"><button className="btn-primary" type="button" onClick={() => setCreating(true)}>Create your first project</button></div>
            </EmptyState>
          </div>
        ) : <div className="panel mt-7 p-6 text-sm text-ink-2">No projects match those filters. Try another search or clear the filters.</div>
      ) : (
        <ul className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const notes = lib.items.filter((item) => !item.deletedAt && (item.projectIds ?? []).includes(project.id)).length;
            const works = lib.books.filter((work) => (work.projectIds ?? []).includes(project.id)).length;
            return (
              <li key={project.id}>
                <Link to={'/initiative/' + project.id} className="archive-card group flex h-full flex-col p-5 transition-colors hover:border-gold/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {project.category && <p className="eyebrow mb-2">{project.category}</p>}
                      <h2 className="font-serif text-2xl leading-tight text-ink group-hover:text-accent">{project.title}</h2>
                    </div>
                    <ProjectStatusLabel status={project.status} />
                  </div>
                  {project.description && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-2">{project.description}</p>}
                  <div className="mt-auto flex items-center gap-3 pt-5 text-xs text-muted">
                    <span>{notes} {notes === 1 ? 'note' : 'notes'}</span>
                    <span aria-hidden>·</span>
                    <span>{works} {works === 1 ? 'Work' : 'Works'}</span>
                    <span className="ml-auto"><ArrowUpRight size={15} /></span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New project">
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="label" htmlFor="project-title">Name</label>
            <input id="project-title" className="input font-serif text-lg" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="YOU App, Terra Senga, Empatherapy…" data-autofocus />
          </div>
          <div>
            <label className="label" htmlFor="project-description">What is it about? <span className="font-normal text-muted">(optional)</span></label>
            <textarea id="project-description" className="input min-h-20" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A little context to help you find your direction." />
          </div>
          <div>
            <label className="label" htmlFor="project-category">Category <span className="font-normal text-muted">(optional)</span></label>
            <input id="project-category" className="input" list="project-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="App, Business, Place…" />
            <datalist id="project-categories">{[...new Set([...PROJECT_CATEGORIES, ...categories])].map((name) => <option key={name} value={name} />)}</datalist>
          </div>
          {lib.books.length > 0 && (
            <div>
              <label className="label" htmlFor="project-start-work">Start from an existing Work <span className="font-normal text-muted">(optional)</span></label>
              <select id="project-start-work" className="input" value={workId} onChange={(e) => {
                const next = e.target.value;
                setWorkId(next);
                const work = lib.books.find((item) => item.id === next);
                if (work && !title.trim()) setTitle(work.title);
                if (work && !description.trim()) setDescription(work.description);
              }}>
                <option value="">Start fresh</option>
                {lib.books.map((work) => <option key={work.id} value={work.id}>{work.title}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted">This links the Work to the new Project. Its contents and structure stay as they are.</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setCreating(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!title.trim() && !workId}>Create project</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function ProjectHome() {
  const { id = '' } = useParams();
  const lib = useLibrary();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [choosingNotes, setChoosingNotes] = useState(false);
  const [creatingWork, setCreatingWork] = useState(false);
  const [choosingWorks, setChoosingWorks] = useState(false);
  const [noteQuery, setNoteQuery] = useState('');
  const [workQuery, setWorkQuery] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');
  const [newWorkTitle, setNewWorkTitle] = useState('');

  if (!lib) return <Spinner />;
  const project = lib.projects.find((item) => item.id === id);
  if (!project) return <EmptyState title="Project not found" action={<Link to="/initiatives" className="btn">All projects</Link>} />;
  const currentProject = project;

  const notes = lib.items
    .filter((item) => !item.deletedAt && (item.projectIds ?? []).includes(id))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const works = lib.books
    .filter((work) => (work.projectIds ?? []).includes(id))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const availableNotes = lib.items
    .filter((item) => !item.deletedAt && !(item.projectIds ?? []).includes(id))
    .filter((item) => (noteTitle(item) + ' ' + item.body).toLowerCase().includes(noteQuery.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 40);
  const availableWorks = lib.books
    .filter((work) => !(work.projectIds ?? []).includes(id))
    .filter((work) => work.title.toLowerCase().includes(workQuery.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 40);

  function openEdit() {
    setEditTitle(currentProject.title);
    setEditDescription(currentProject.description);
    setEditCategory(currentProject.category);
    setEditing(true);
  }

  async function saveProject(e: React.FormEvent) {
    e.preventDefault();
    await updateProject(id, { title: editTitle, description: editDescription, category: editCategory });
    setEditing(false);
  }

  async function saveNewNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNoteBody.trim()) return;
    const noteId = await createContent({ title: newNoteTitle, body: newNoteBody, type: 'note', status: 'seed' });
    await addItemsToProject(id, [noteId]);
    setNewNoteTitle('');
    setNewNoteBody('');
    setAddingNote(false);
    nav('/item/' + noteId);
  }

  async function saveNewWork(e: React.FormEvent) {
    e.preventDefault();
    if (!newWorkTitle.trim()) return;
    const workId = await createBook({ title: newWorkTitle, templateId: null, kind: 'custom', projectIds: [id] });
    setNewWorkTitle('');
    setCreatingWork(false);
    nav('/projects/' + workId);
  }

  async function removeThisProject() {
    const yes = await confirm({
      title: 'Delete this project?',
      message: 'The project and its links will be removed. Its notes, Works and their contents will remain in your Library.',
      confirmLabel: 'Delete project',
      danger: true,
    });
    if (!yes) return;
    await deleteProject(id);
    nav('/initiatives');
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 md:px-8 md:pt-10">
      <Link to="/initiatives" className="btn-ghost -ml-3"><ArrowLeft size={16} /> Projects</Link>
      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          {project.category && <span className="eyebrow">{project.category}</span>}
          <span className="text-muted">·</span>
          <select className="input min-h-8 w-auto py-1 text-xs" aria-label="Project status" value={project.status} onChange={(e) => void updateProject(id, { status: e.target.value as ProjectStatus })}>
            {Object.entries(PROJECT_STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={openEdit}>Edit details</button>
            <button type="button" className="btn-ghost px-2 py-1 text-xs text-muted" onClick={() => void removeThisProject()} title="Delete project"><Trash2 size={14} /></button>
          </div>
        </div>
        <h1 className="page-title mt-3">{project.title}</h1>
        {project.description && <p className="mt-3 max-w-2xl font-serif text-lg leading-relaxed text-ink-2">{project.description}</p>}
      </header>

      <section className="mt-9">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><p className="eyebrow">Thinking and gathering</p><h2 className="section-heading">Notes <span className="text-muted">· {notes.length}</span></h2></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => setChoosingNotes(true)}><Link2 size={14} /> Add existing</button>
            <button type="button" className="btn-primary" onClick={() => setAddingNote(true)}><Plus size={15} /> New note</button>
          </div>
        </div>
        {notes.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {notes.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <Link to={'/item/' + item.id} className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-lg text-ink hover:text-accent">{noteTitle(item)}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{item.type} · {new Date(item.updatedAt).toLocaleDateString()}</span>
                </Link>
                <button type="button" className="btn-ghost p-2" onClick={() => void removeItemFromProject(id, item.id)} aria-label={'Remove ' + noteTitle(item) + ' from project'} title="Remove from project"><Unlink size={15} /></button>
              </li>
            ))}
          </ul>
        ) : <div className="panel p-5 text-sm text-ink-2">No notes are linked yet. Add an existing note or start a new one.</div>}
      </section>

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><p className="eyebrow">Things taking shape</p><h2 className="section-heading">Works <span className="text-muted">· {works.length}</span></h2></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => setChoosingWorks(true)}><Link2 size={14} /> Add existing</button>
            <button type="button" className="btn-primary" onClick={() => setCreatingWork(true)}><FilePlus2 size={15} /> New work</button>
          </div>
        </div>
        {works.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {works.map((work) => (
              <li key={work.id} className="archive-card flex items-center gap-3 p-4">
                <BookOpen size={19} className="shrink-0 text-gold" />
                <Link to={'/projects/' + work.id} className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-xl text-ink hover:text-accent">{work.title}</span>
                  <span className="mt-1 block truncate text-xs text-muted">{work.description || 'Creative work'} · {work.kind ?? 'book'}</span>
                </Link>
                <button type="button" className="btn-ghost p-2" onClick={() => void removeWorkFromProject(id, work.id)} aria-label={'Remove ' + work.title + ' from project'} title="Remove from project"><Unlink size={15} /></button>
              </li>
            ))}
          </ul>
        ) : <div className="panel p-5 text-sm text-ink-2">No Works linked yet. You can create a separate output or connect an existing one.</div>}
      </section>

      <Modal open={editing} onClose={() => setEditing(false)} title="Project details">
        <form className="space-y-4" onSubmit={saveProject}>
          <div><label className="label" htmlFor="edit-project-title">Name</label><input id="edit-project-title" className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} data-autofocus /></div>
          <div><label className="label" htmlFor="edit-project-description">Description</label><textarea id="edit-project-description" className="input min-h-24" rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} /></div>
          <div><label className="label" htmlFor="edit-project-category">Category <span className="font-normal text-muted">(optional)</span></label><input id="edit-project-category" className="input" list="edit-project-categories" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="App, Business, Place…" /><datalist id="edit-project-categories">{PROJECT_CATEGORIES.map((name) => <option key={name} value={name} />)}</datalist></div>
          <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button><button type="submit" className="btn-primary">Save details</button></div>
        </form>
      </Modal>

      <Modal open={addingNote} onClose={() => setAddingNote(false)} title="New note for this project">
        <form className="space-y-4" onSubmit={saveNewNote}>
          <div><label className="label" htmlFor="new-note-title">Title <span className="font-normal text-muted">(optional)</span></label><input id="new-note-title" className="input" value={newNoteTitle} onChange={(e) => setNewNoteTitle(e.target.value)} placeholder="A thought or working title" data-autofocus /></div>
          <div><label className="label" htmlFor="new-note-body">Note</label><textarea id="new-note-body" className="input min-h-40 font-serif text-base" rows={6} value={newNoteBody} onChange={(e) => setNewNoteBody(e.target.value)} placeholder="Begin wherever you are…" required /></div>
          <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setAddingNote(false)}>Cancel</button><button type="submit" className="btn-primary" disabled={!newNoteBody.trim()}>Save note</button></div>
        </form>
      </Modal>

      <Modal open={choosingNotes} onClose={() => setChoosingNotes(false)} title="Add notes from your Library">
        <input className="input mb-3 w-full" value={noteQuery} onChange={(e) => setNoteQuery(e.target.value)} placeholder="Search notes…" aria-label="Search notes" data-autofocus />
        {availableNotes.length ? <ul className="divide-y divide-line">{availableNotes.map((item) => <li key={item.id} className="flex items-center gap-3 py-2"><span className="min-w-0 flex-1"><span className="block truncate font-serif">{noteTitle(item)}</span><span className="text-xs text-muted">{item.type}</span></span><button type="button" className="btn px-3 py-1.5 text-xs" onClick={() => void addItemsToProject(id, [item.id])}>Add</button></li>)}</ul> : <p className="py-5 text-sm text-muted">No matching notes to add.</p>}
      </Modal>

      <Modal open={creatingWork} onClose={() => setCreatingWork(false)} title="New Work">
        <form className="space-y-4" onSubmit={saveNewWork}>
          <div><label className="label" htmlFor="new-work-title">Title</label><input id="new-work-title" className="input" value={newWorkTitle} onChange={(e) => setNewWorkTitle(e.target.value)} placeholder="A document, manuscript, collection…" data-autofocus /></div>
          <p className="text-xs text-muted">This creates a separate Work with its own writing and structure tools, linked to this Project.</p>
          <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setCreatingWork(false)}>Cancel</button><button type="submit" className="btn-primary" disabled={!newWorkTitle.trim()}>Create Work</button></div>
        </form>
      </Modal>

      <Modal open={choosingWorks} onClose={() => setChoosingWorks(false)} title="Connect an existing Work">
        <input className="input mb-3 w-full" value={workQuery} onChange={(e) => setWorkQuery(e.target.value)} placeholder="Search Works…" aria-label="Search Works" data-autofocus />
        {availableWorks.length ? <ul className="divide-y divide-line">{availableWorks.map((work) => <li key={work.id} className="flex items-center gap-3 py-2"><span className="min-w-0 flex-1 truncate font-serif">{work.title}</span><button type="button" className="btn px-3 py-1.5 text-xs" onClick={() => void addWorksToProject(id, [work.id])}>Add</button></li>)}</ul> : <p className="py-5 text-sm text-muted">No matching Works to add.</p>}
      </Modal>
    </div>
  );
}
