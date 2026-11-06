import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, BookOpen, Link2, Music2, Plus, Search, Trash2, Unlink, Upload } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { DEFAULT_PROJECT_COLOUR, PROJECT_CATEGORIES, PROJECT_KIND_META, PROJECT_STATUS_META, TYPE_LABEL, projectKind } from '../domain/constants';
import type { ContentType, ProjectColour, ProjectStatus } from '../domain/types';
import { ProjectColourPicker, projectColourStyle } from '../components/ProjectColourPicker';
import { createProject, updateProject, deleteProject, addItemsToProject, removeItemFromProject } from '../db/projectRecords';
import { createContent } from '../db/content';
import { createBook } from '../db/books';
import { ImportDialog } from '../components/ImportDialog';
import { displayTitle, excerpt } from '../domain/text';
import { PROJECT_HOME_ORDER, suggestedProjectHome } from '../domain/projects';
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
  const [colour, setColour] = useState<ProjectColour>(DEFAULT_PROJECT_COLOUR);

  // Save only clear, title-based suggestions for older Projects that have no home yet.
  // Existing categories are never overwritten and no notes or Works are changed.
  useEffect(() => {
    const suggestions = (lib?.projects ?? [])
      .filter((project) => !(project.category ?? '').trim())
      .map((project) => ({ id: project.id, category: suggestedProjectHome(project) }))
      .filter((project) => !!project.category);
    if (suggestions.length) {
      void Promise.all(suggestions.map((project) => updateProject(project.id, { category: project.category })));
    }
  }, [lib?.projects]);

  if (!lib) return <Spinner />;
  const categories = [...new Set(lib.projects.map((project) => suggestedProjectHome(project) || 'Needs a home'))]
    .sort((a, b) => {
      const ai = PROJECT_HOME_ORDER.indexOf(a as (typeof PROJECT_HOME_ORDER)[number]);
      const bi = PROJECT_HOME_ORDER.indexOf(b as (typeof PROJECT_HOME_ORDER)[number]);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      if (a === 'Needs a home') return 1;
      if (b === 'Needs a home') return -1;
      return a.localeCompare(b);
    });
  const projects = [...lib.projects]
    .filter((project) => {
      const home = suggestedProjectHome(project) || 'Needs a home';
      const text = (project.title + ' ' + project.description + ' ' + home).toLowerCase();
      return (!query.trim() || text.includes(query.trim().toLowerCase()))
        && (!categoryFilter || home === categoryFilter)
        && (statusFilter === 'all' || project.status === statusFilter);
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const projectGroups = categories
    .map((home) => ({ home, projects: projects.filter((project) => (suggestedProjectHome(project) || 'Needs a home') === home) }))
    .filter((group) => group.projects.length > 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const id = await createProject({ title, description, category, colour });
    setCreating(false);
    setTitle('');
    setDescription('');
    setCategory('');
    setColour(DEFAULT_PROJECT_COLOUR);
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
        <div className="mt-7 space-y-9">
          {projectGroups.map((group) => (
            <section key={group.home} aria-labelledby={'project-home-' + group.home.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 id={'project-home-' + group.home.replace(/[^a-z0-9]+/gi, '-').toLowerCase()} className="section-heading">{group.home}</h2>
                <span className="text-xs text-muted">{group.projects.length} {group.projects.length === 1 ? 'project' : 'projects'}</span>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.projects.map((project) => {
                  const notes = lib.items.filter((item) => !item.deletedAt && (item.projectIds ?? []).includes(project.id)).length;
                  const hasWorkspace = lib.books.some((work) => work.id === project.id
                    || ((work.projectIds ?? []).includes(project.id)
                      && work.title.trim().toLocaleLowerCase() === project.title.trim().toLocaleLowerCase()));
                  return (
                    <li key={project.id}>
                      <Link to={'/initiative/' + project.id} className="archive-card project-card group flex h-full flex-col p-5 transition-colors" style={projectColourStyle(project.colour)}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="project-colour-dot mb-3 block" aria-hidden />
                            <p className="eyebrow mb-2">{group.home === 'Needs a home' ? 'Uncategorised' : group.home}</p>
                            <h3 className="font-serif text-2xl leading-tight text-ink group-hover:text-accent">{project.title}</h3>
                          </div>
                          <ProjectStatusLabel status={project.status} />
                        </div>
                        {project.description && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-2">{project.description}</p>}
                        <div className="mt-auto flex items-center gap-3 pt-5 text-xs text-muted">
                          <span>{notes} {notes === 1 ? 'note' : 'notes'}</span>
                          <span aria-hidden>·</span>
                          <span>{hasWorkspace ? 'Creative workspace' : 'Project space'}</span>
                          <span className="ml-auto"><ArrowUpRight size={15} /></span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
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
            <datalist id="project-categories">{[...new Set([...PROJECT_CATEGORIES, ...categories.filter((name) => name !== 'Needs a home')])].map((name) => <option key={name} value={name} />)}</datalist>
          </div>
          <ProjectColourPicker value={colour} onChange={setColour} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={() => setCreating(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!title.trim()}>Create project</button>
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
  const [importingNotes, setImportingNotes] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editColour, setEditColour] = useState<ProjectColour>(DEFAULT_PROJECT_COLOUR);
  const [newNoteType, setNewNoteType] = useState<ContentType>('song');
  const [noteQuery, setNoteQuery] = useState('');
  const [noteTypeFilter, setNoteTypeFilter] = useState<ContentType | 'all' | 'music'>('music');
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');

  if (!lib) return <Spinner />;
  const project = lib.projects.find((item) => item.id === id);
  if (!project) return <EmptyState title="Project not found" action={<Link to="/initiatives" className="btn">All projects</Link>} />;
  const currentProject = project;
  const isMusicProject = /\b(music|lyrics?|songs?|band|gig|set[\s-]?list|album)\b/i.test(
    [project.title, project.category, project.description].join(' '),
  );

  const notes = lib.items
    .filter((item) => !item.deletedAt && !item.archived && (item.projectIds ?? []).includes(id))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const visibleNotes = notes
    .filter((item) => {
      const isMusicPiece = ['song', 'idea', 'fragment', 'poem'].includes(item.type);
      const matchesType = !isMusicProject || (noteTypeFilter === 'music'
        ? isMusicPiece
        : noteTypeFilter === 'all' || item.type === noteTypeFilter);
      const haystack = (noteTitle(item) + ' ' + item.body + ' ' + TYPE_LABEL[item.type]).toLowerCase();
      return matchesType && haystack.includes(noteQuery.trim().toLowerCase());
    });
  const workspace = lib.books.find((work) => work.id === id)
    ?? lib.books.find((work) => (work.projectIds ?? []).includes(id)
      && work.title.trim().toLocaleLowerCase() === project.title.trim().toLocaleLowerCase());
  const availableNotes = lib.items
    .filter((item) => !item.deletedAt && !item.archived && !(item.projectIds ?? []).includes(id))
    .filter((item) => (noteTitle(item) + ' ' + item.body).toLowerCase().includes(noteQuery.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 40);

  function openNewNote() {
    setNewNoteType(isMusicProject ? 'song' : 'note');
    setAddingNote(true);
  }

  function openEdit() {
    setEditTitle(currentProject.title);
    setEditDescription(currentProject.description);
    setEditCategory(currentProject.category);
    setEditColour(currentProject.colour ?? DEFAULT_PROJECT_COLOUR);
    setEditing(true);
  }

  async function saveProject(e: React.FormEvent) {
    e.preventDefault();
    await updateProject(id, { title: editTitle, description: editDescription, category: editCategory, colour: editColour });
    setEditing(false);
  }

  async function saveNewNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNoteBody.trim()) return;
    const noteId = await createContent({ title: newNoteTitle, body: newNoteBody, type: newNoteType, status: 'seed' });
    await addItemsToProject(id, [noteId]);
    setNewNoteTitle('');
    setNewNoteBody('');
    setNewNoteType('song');
    setAddingNote(false);
    nav('/item/' + noteId);
  }

  async function openWorkspace() {
    if (workspace) {
      nav('/projects/' + workspace.id);
      return;
    }
    const workspaceId = await createBook({ id, title: project.title, description: project.description, templateId: null, kind: 'custom' });
    nav('/projects/' + workspaceId);
  }

  async function removeThisProject() {
    const yes = await confirm({
      title: 'Delete this project?',
      message: 'The project and its links will be removed. Its notes and creative workspace will remain in your Library.',
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
        <h1 className="page-title mt-3 flex items-center gap-3"><span className="project-colour-dot shrink-0" style={projectColourStyle(project.colour)} aria-hidden />{project.title}</h1>
        {project.description && <p className="mt-3 max-w-2xl font-serif text-lg leading-relaxed text-ink-2">{project.description}</p>}
      </header>

      <section className="mt-9" aria-labelledby="project-material">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">{isMusicProject ? 'Your creative library' : 'Thinking and gathering'}</p>
            <h2 id="project-material" className="section-heading">{isMusicProject ? 'Songs & ideas' : 'Notes'} <span className="text-muted">· {notes.length}</span></h2>
            {isMusicProject && <p className="mt-1 max-w-xl text-sm text-ink-2">A home for lyrics, melodies, fragments and musical thoughts.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => setChoosingNotes(true)}><Link2 size={15} /> Add existing</button>
            <button type="button" className="btn" onClick={() => setImportingNotes(true)}><Upload size={15} /> Upload from phone</button>
            <button type="button" className="btn-primary" onClick={openNewNote}><Plus size={15} /> {isMusicProject ? 'Write new' : 'New note'}</button>
          </div>
        </div>
        {notes.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            <label className="relative min-w-48 flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input w-full pl-9" value={noteQuery} onChange={(e) => setNoteQuery(e.target.value)} placeholder={isMusicProject ? 'Find a song or idea…' : 'Find a note…'} aria-label="Find project material" />
            </label>
            {isMusicProject && (
              <select className="input w-auto min-w-32" value={noteTypeFilter} onChange={(e) => setNoteTypeFilter(e.target.value as ContentType | 'all' | 'music')} aria-label="Filter project pieces by type">
                <option value="music">Music pieces</option>
                <option value="all">All types</option>
                <option value="song">Songs</option>
                <option value="idea">Ideas</option>
                <option value="poem">Poems</option>
                <option value="fragment">Fragments</option>
                <option value="note">Notes</option>
              </select>
            )}
          </div>
        )}
        {visibleNotes.length ? (
          <ul className="divide-y divide-line border-y border-line">
            {visibleNotes.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <Link to={'/item/' + item.id} className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-lg text-ink hover:text-accent">{displayTitle(item)}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted">{TYPE_LABEL[item.type]} · {new Date(item.updatedAt).toLocaleDateString()}</span>
                  <span className="mt-1 block line-clamp-2 whitespace-pre-line text-sm text-ink-2">{excerpt(item.body, 150)}</span>
                </Link>
                <button type="button" className="btn-ghost p-2" onClick={() => void removeItemFromProject(id, item.id)} aria-label={'Remove ' + displayTitle(item) + ' from project'} title="Remove from project"><Unlink size={15} /></button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="panel p-5 text-sm text-ink-2">
            {isMusicProject ? 'No songs or ideas linked yet. Write something new or bring in existing material.' : 'No notes linked yet. Add an existing note, upload from your phone or write a new one.'}
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="project-workspace">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="eyebrow">Your existing writing and creative tools stay here</p>
            <h2 id="project-workspace" className="section-heading">Creative workspace</h2>
          </div>
          <button type="button" className="btn-primary" onClick={() => void openWorkspace()}>
            <BookOpen size={15} /> {workspace ? 'Open workspace' : 'Set up workspace'}
          </button>
        </div>
        {workspace ? (
          <div className="archive-card flex flex-wrap items-center gap-3 p-4">
            <BookOpen size={20} className="shrink-0 text-gold" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-serif text-xl text-ink">{workspace.title}</p>
              <p className="mt-1 text-xs text-muted">{PROJECT_KIND_META[projectKind(workspace)].label}{workspace.shelf ? ' · ' + workspace.shelf : ''}</p>
              {workspace.description && <p className="mt-1 text-sm text-ink-2">{workspace.description}</p>}
            </div>
            <Link to={'/projects/' + workspace.id} className="btn">Open</Link>
          </div>
        ) : (
          <div className="panel p-5 text-sm text-ink-2">Create a writing and creative workspace for this Project. Your notes and project details remain in place.</div>
        )}
      </section>
      <Modal open={editing} onClose={() => setEditing(false)} title="Project details">
        <form className="space-y-4" onSubmit={saveProject}>
          <div><label className="label" htmlFor="edit-project-title">Name</label><input id="edit-project-title" className="input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} data-autofocus /></div>
          <div><label className="label" htmlFor="edit-project-description">Description</label><textarea id="edit-project-description" className="input min-h-24" rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} /></div>
          <div><label className="label" htmlFor="edit-project-category">Category <span className="font-normal text-muted">(optional)</span></label><input id="edit-project-category" className="input" list="edit-project-categories" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="App, Business, Place…" /><datalist id="edit-project-categories">{PROJECT_CATEGORIES.map((name) => <option key={name} value={name} />)}</datalist></div>
          <ProjectColourPicker value={editColour} onChange={setEditColour} />
          <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button><button type="submit" className="btn-primary">Save details</button></div>
        </form>
      </Modal>

      <Modal open={addingNote} onClose={() => setAddingNote(false)} title="New note for this project">
        <form className="space-y-4" onSubmit={saveNewNote}>
          <div><label className="label" htmlFor="new-note-type">What are you adding?</label><select id="new-note-type" className="input" value={newNoteType} onChange={(e) => setNewNoteType(e.target.value as ContentType)}><option value="song">Song / lyrics</option><option value="idea">Music idea</option><option value="fragment">Fragment</option><option value="note">Note</option></select></div>
          <div><label className="label" htmlFor="new-note-title">Title <span className="font-normal text-muted">(optional)</span></label><input id="new-note-title" className="input" value={newNoteTitle} onChange={(e) => setNewNoteTitle(e.target.value)} placeholder="A song title or working name" data-autofocus /></div>
          <div><label className="label" htmlFor="new-note-body">Words, lyrics or ideas</label><textarea id="new-note-body" className="input min-h-40 font-serif text-base" rows={6} value={newNoteBody} onChange={(e) => setNewNoteBody(e.target.value)} placeholder="Start wherever the song begins…" required /></div>
          <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={() => setAddingNote(false)}>Cancel</button><button type="submit" className="btn-primary" disabled={!newNoteBody.trim()}>Save note</button></div>
        </form>
      </Modal>

      <ImportDialog open={importingNotes} onClose={() => setImportingNotes(false)} projectId={id} projectTitle={project.title} initialType={isMusicProject ? 'song' : 'auto'} />
    </div>
  );
}
