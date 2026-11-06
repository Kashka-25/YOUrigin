import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Check, Search } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { PROJECT_CATEGORIES, PROJECT_KIND_META, PROJECT_STATUS_META, projectKind } from '../domain/constants';
import type { ProjectStatus } from '../domain/types';
import { createProjectForWorks, importWorksAsProjects } from '../db/projectRecords';
import { useToast } from '../components/Toast';
import { EmptyState, Spinner } from '../components/ui';

type ImportMode = 'individual' | 'group';

export function ImportWorks() {
  const lib = useLibrary();
  const nav = useNavigate();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<ImportMode>('individual');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('idea');
  const [groupTitle, setGroupTitle] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [busy, setBusy] = useState(false);

  const allUnlinkedWorks = useMemo(() => (lib?.books ?? []).filter((work) => !(work.projectIds ?? []).length), [lib]);
  const unlinkedWorks = useMemo(
    () => allUnlinkedWorks.filter((work) => includeArchived || !work.archived),
    [allUnlinkedWorks, includeArchived],
  );
  const filteredWorks = useMemo(
    () => unlinkedWorks.filter((work) => {
      const text = [work.title, work.subtitle, work.description, work.shelf ?? ''].join(' ').toLowerCase();
      return text.includes(query.trim().toLowerCase());
    }),
    [unlinkedWorks, query],
  );
  const availableIds = new Set(unlinkedWorks.map((work) => work.id));
  const selectedWorks = lib ? selectedIds.map((id) => lib.books.find((work) => work.id === id)).filter((work): work is NonNullable<typeof work> => !!work && availableIds.has(work.id)) : [];
  const categories = [...new Set([...(lib?.projects.map((project) => project.category).filter(Boolean) ?? []), ...PROJECT_CATEGORIES])].sort((a, b) => a.localeCompare(b));
  const allFilteredSelected = filteredWorks.length > 0 && filteredWorks.every((work) => selectedIds.includes(work.id));

  if (!lib) return <Spinner />;

  function toggleWork(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function toggleFiltered() {
    const ids = filteredWorks.map((work) => work.id);
    setSelectedIds((current) => allFilteredSelected
      ? current.filter((id) => !ids.includes(id))
      : [...new Set([...current, ...ids])]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ids = selectedWorks.map((work) => work.id);
    if (!ids.length || (mode === 'group' && !groupTitle.trim())) return;
    setBusy(true);
    try {
      if (mode === 'individual') {
        const created = await importWorksAsProjects(ids, { category, status });
        if (!created.length) {
          toast('Those Works are already linked to a Project.');
          return;
        }
        toast('Created ' + created.length + ' Projects and connected their Works.');
      } else {
        const id = await createProjectForWorks({
          title: groupTitle,
          description: groupDescription,
          category,
          status,
        }, ids);
        toast('Created “' + groupTitle.trim() + '” with ' + ids.length + ' Works.');
        nav('/initiative/' + id);
        return;
      }
      nav('/initiatives');
    } catch (error) {
      toast(error instanceof Error ? 'Could not organise these Works: ' + error.message : 'Could not organise these Works.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-frame">
      <Link to="/initiatives" className="btn-ghost -ml-3"><ArrowLeft size={16} /> Projects</Link>
      <header className="mt-3 max-w-3xl">
        <p className="eyebrow mb-2">Bring your existing work into focus</p>
        <h1 className="page-title">Organise existing Works</h1>
        <p className="mt-3 font-serif text-lg text-ink-2">
          Select the Works that were really Projects in disguise. You can give each Work its own Project, or gather several Works beneath one shared Project.
        </p>
      </header>

      {allUnlinkedWorks.length === 0 ? (
        <div className="panel mt-8">
          <EmptyState title="Everything is already connected">
            There are no unlinked Works to organise. You can still connect any Work to additional Projects from its Project page.
            <div className="mt-4"><Link to="/initiatives" className="btn-primary">Back to Projects</Link></div>
          </EmptyState>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)]">
          <section className="min-w-0">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Your existing library of Works</p>
                <h2 className="section-heading mt-1">Choose what to organise <span className="text-muted">· {unlinkedWorks.length}</span></h2>
              </div>
              <span className="text-sm text-muted">{selectedWorks.length} selected</span>
            </div>

            <label className="relative block">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input w-full pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Works by title, description or shelf…" aria-label="Search existing Works" />
            </label>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <button type="button" className="btn-ghost px-2 py-1" onClick={toggleFiltered} disabled={!filteredWorks.length}>
                {allFilteredSelected ? 'Clear visible selection' : 'Select all matching Works'}
              </button>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
                Include archived Works
              </label>
            </div>

            {filteredWorks.length === 0 ? (
              <div className="panel mt-3 p-5 text-sm text-ink-2">{includeArchived ? 'No unlinked Works match this search.' : 'No active unlinked Works match this search. Turn on “Include archived Works” to see archived entries.'}</div>
            ) : (
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {filteredWorks.map((work) => {
                  const checked = selectedIds.includes(work.id);
                  const kind = projectKind(work);
                  return (
                    <li key={work.id}>
                      <label className={'flex cursor-pointer items-start gap-3 px-2 py-3 transition-colors hover:bg-paper-2 ' + (checked ? 'bg-paper-2' : '')}>
                        <input className="mt-1 h-4 w-4 accent-[var(--accent)]" type="checkbox" checked={checked} onChange={() => toggleWork(work.id)} />
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-gold/10 text-gold"><BookOpen size={17} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-serif text-lg text-ink">{work.title || 'Untitled Work'}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {PROJECT_KIND_META[kind].label}
                            {work.shelf ? ' · ' + work.shelf : ''}
                            {work.archived ? ' · Archived' : ''}
                          </span>
                          {work.description && <span className="mt-1 block line-clamp-2 text-sm text-ink-2">{work.description}</span>}
                        </span>
                        {checked && <Check size={16} className="mt-1 shrink-0 text-accent" aria-hidden />}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Only Works not already linked to a Project are shown. Their writing, sections and design stay exactly where they are; organising them adds a Project relationship rather than copying or moving anything.
            </p>
          </section>

          <aside className="panel h-fit p-5">
            <p className="eyebrow">How would you like to organise them?</p>
            <h2 className="mt-1 font-serif text-2xl">Choose a structure</h2>

            <div className="mt-4 grid gap-2">
              <button type="button" aria-pressed={mode === 'individual'} onClick={() => setMode('individual')} className={'rounded-xl border p-3 text-left transition-colors ' + (mode === 'individual' ? 'border-accent bg-paper-2' : 'border-line hover:bg-paper-2')}>
                <span className="block font-semibold text-ink">A Project for each Work</span>
                <span className="mt-1 block text-sm text-ink-2">Create a separate Project for every selected Work, using its existing title and description.</span>
              </button>
              <button type="button" aria-pressed={mode === 'group'} onClick={() => setMode('group')} className={'rounded-xl border p-3 text-left transition-colors ' + (mode === 'group' ? 'border-accent bg-paper-2' : 'border-line hover:bg-paper-2')}>
                <span className="block font-semibold text-ink">Group Works in one Project</span>
                <span className="mt-1 block text-sm text-ink-2">Create one Project and connect every selected Work to it.</span>
              </button>
            </div>

            {mode === 'group' && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="label" htmlFor="import-project-title">Project name</label>
                  <input id="import-project-title" className="input" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} placeholder="The wider initiative…" required />
                </div>
                <div>
                  <label className="label" htmlFor="import-project-description">Description <span className="font-normal text-muted">(optional)</span></label>
                  <textarea id="import-project-description" className="input min-h-20" rows={3} value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)} placeholder="What connects these Works?" />
                </div>
              </div>
            )}

            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <div>
                <label className="label" htmlFor="import-project-category">Category <span className="font-normal text-muted">(optional)</span></label>
                <input id="import-project-category" className="input" list="import-project-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="App, Business, Place…" />
                <datalist id="import-project-categories">{categories.map((name) => <option key={name} value={name} />)}</datalist>
                <p className="mt-1 text-xs text-muted">You can leave this blank or edit it later.</p>
              </div>
              <div>
                <label className="label" htmlFor="import-project-status">Starting status</label>
                <select id="import-project-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
                  {Object.entries(PROJECT_STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <p className="text-sm text-ink-2">
                {selectedWorks.length === 0
                  ? 'Select at least one Work to continue.'
                  : mode === 'individual'
                    ? selectedWorks.length + ' separate ' + (selectedWorks.length === 1 ? 'Project will' : 'Projects will') + ' be created.'
                    : selectedWorks.length + ' Works will be connected to one Project.'}
              </p>
              <button type="submit" className="btn-primary mt-3 w-full" disabled={busy || selectedWorks.length === 0 || (mode === 'group' && !groupTitle.trim())}>
                {busy ? 'Organising…' : mode === 'individual' ? 'Create ' + selectedWorks.length + (selectedWorks.length === 1 ? ' Project' : ' Projects') : 'Create Project and connect Works'}
              </button>
            </div>
          </aside>
        </form>
      )}
    </div>
  );
}
