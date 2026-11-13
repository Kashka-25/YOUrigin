import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowUpRight, BookOpen, Compass, Feather, Layers3, Orbit, Sparkles } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { projectKind, PROJECT_KIND_META, PROJECT_STATUS_META } from '../domain/constants';
import { shelfNames } from '../domain/projects';
import { EmptyState, Spinner } from '../components/ui';
import { CoverPicture } from '../components/CoverPicture';

/**
 * My Universe is a map of the creative world already living in YOUrigin.
 * It brings together the independent Projects, Works and Library records.
 */
export function MyUniverse() {
  const lib = useLibrary();
  if (!lib) return <Spinner />;

  const works = lib.books.filter((b) => !b.archived).sort((a, b) => b.updatedAt - a.updatedAt);
  const projects = [...lib.projects].sort((a, b) => b.updatedAt - a.updatedAt);
  const pieces = lib.items.filter((i) => !i.deletedAt && !i.archived);
  const collections = lib.collections;
  const shelves = shelfNames(works);
  const threads = [...lib.tags]
    .map((tag) => ({ ...tag, count: lib.tagCounts.get(tag.id) ?? 0 }))
    .filter((tag) => tag.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const recent = [...pieces].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  const kindCounts = works.reduce<Record<string, number>>((acc, work) => {
    const kind = projectKind(work);
    acc[kind] = (acc[kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="page-frame">
      <section className="relative mb-9 overflow-hidden rounded-[28px] border border-[#806493]/25 bg-[#15101f] px-6 py-8 text-[#f0e8df] shadow-[0_24px_80px_rgba(0,0,0,.18)] md:px-10 md:py-11">
        <div className="pointer-events-none absolute inset-0 opacity-70" aria-hidden>
          <div className="absolute -right-16 -top-28 h-80 w-80 rounded-full border border-[#c6a16b]/20" />
          <div className="absolute -right-5 -top-16 h-60 w-60 rounded-full border border-[#b69acb]/20" />
          <div className="absolute right-12 top-0 h-44 w-44 rounded-full border border-dashed border-[#c6a16b]/20" />
          <div className="absolute right-[18%] top-[35%] h-2 w-2 rounded-full bg-[#d8b579] shadow-[0_0_24px_8px_rgba(216,181,121,.28)]" />
          <div className="absolute right-[9%] top-[22%] h-1.5 w-1.5 rounded-full bg-[#c5a6dc]" />
          <div className="absolute right-[28%] bottom-[18%] h-1 w-1 rounded-full bg-[#d8b579]" />
        </div>
        <div className="relative max-w-2xl">
          <p className="font-display text-[10px] tracking-[.24em] text-[#d6ad6d] uppercase">Your own universe</p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.02] tracking-tight md:text-6xl">A world made<br className="hidden md:block" /> from your ideas.</h1>
          
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/projects" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#d6ad6d] px-4 py-2 text-sm font-semibold text-[#211827] hover:brightness-105"><BookOpen size={16}/> Explore your works</Link>
            <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm text-[#e8dfe9] hover:bg-white/5"><Feather size={16}/> Gather a thought</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Your universe at a glance">
        <Stat icon={<Layers3 size={18}/>} label="Pieces" value={pieces.length}/>
        <Stat icon={<Orbit size={18}/>} label="Projects" value={projects.length}/>
        <Stat icon={<BookOpen size={18}/>} label="Works" value={works.length}/>
        <Stat icon={<Compass size={18}/>} label="Collections" value={collections.length}/>
      </section>

      {projects.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div><h2 className="section-heading">Your projects</h2></div>
            <Link to="/initiatives" className="text-sm text-ink-2 hover:text-ink">All projects <ArrowUpRight size={14} className="inline"/></Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.slice(0, 6).map((project) => (
              <Link key={project.id} to={'/initiative/' + project.id} className="archive-card group overflow-hidden p-0">
                <CoverPicture assetId={project.coverAssetId} colour={project.colour} seed={project.id} className="aspect-[16/7] w-full" />
                <div className="p-5">
                <div className="flex items-center justify-between gap-2">
                  {project.category ? <span className="eyebrow">{project.category}</span> : <span className="eyebrow">Project</span>}
                  <span className="text-xs text-muted">{PROJECT_STATUS_META[project.status].label}</span>
                </div>
                <h3 className="mt-2 font-serif text-2xl text-ink group-hover:text-accent">{project.title}</h3>
              </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="mt-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div><h2 className="section-heading">Your creative works</h2></div>
          <Link to="/projects" className="text-sm text-ink-2 hover:text-ink">All works <ArrowUpRight size={14} className="inline"/></Link>
        </div>
        {works.length === 0 ? (
          <div className="panel"><EmptyState title="Your first constellation is waiting"><span>Start a work and it will find its place here.</span><span className="mt-4 block"><Link className="btn-primary" to="/projects">Create your first work</Link></span></EmptyState></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {works.slice(0, 6).map((work, index) => {
              const kind = projectKind(work);
              const count = lib.entries.filter((entry) => entry.bookId === work.id).length;
              return <Link key={work.id} to={`/projects/${work.id}`} className="archive-card group relative overflow-hidden p-5">
                <div className="mb-5 flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/25 bg-gold/10 text-gold"><Orbit size={19}/></span>
                  <span className="font-display text-[9px] tracking-[.18em] text-muted">0{index + 1}</span>
                </div>
                <p className="eyebrow">{PROJECT_KIND_META[kind].label}{work.shelf ? ` · ${work.shelf}` : ''}</p>
                <h3 className="mt-1 font-serif text-2xl leading-tight text-ink group-hover:text-accent">{work.title}</h3>
                {work.subtitle && <p className="mt-1 font-serif italic text-ink-2">{work.subtitle}</p>}
                <p className="mt-4 text-xs text-muted">{count} {count === 1 ? 'piece' : 'pieces'} gathered</p>
              </Link>;
            })}
          </div>
        )}
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <div className="mb-4"><h2 className="section-heading">Threads through your world</h2></div>
          {threads.length ? <div className="flex flex-wrap gap-2">{threads.map((tag) => <Link key={tag.id} to={`/library?tags=${tag.id}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-2 text-sm text-ink-2 transition-colors hover:border-gold/50 hover:text-ink"><span className="text-gold">✳</span>{tag.name}<span className="text-xs text-muted">{tag.count}</span></Link>)}</div> : <div className="panel p-5 text-sm text-ink-2">As you add tags to your pieces, recurring themes will gather here.</div>}
          {shelves.length > 0 && <div className="mt-6"><p className="eyebrow mb-3">Creative realms</p><div className="flex flex-wrap gap-2">{shelves.map((shelf) => <Link key={shelf} to="/projects" className="rounded-xl border border-line/80 px-3 py-2 text-sm text-ink-2 hover:bg-paper-2">{shelf}</Link>)}</div></div>}
          {Object.keys(kindCounts).length > 0 && <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">{Object.entries(kindCounts).map(([kind,count]) => <span key={kind}>{PROJECT_KIND_META[kind as keyof typeof PROJECT_KIND_META].label} <strong className="ml-1 font-medium text-ink">{count}</strong></span>)}</div>}
        </div>
        <div>
          <div className="mb-4"><h2 className="section-heading">Newly gathered</h2></div>
          {recent.length ? <div className="space-y-2">{recent.map((item) => <Link key={item.id} to={`/item/${item.id}`} className="archive-card flex items-start gap-3 p-4"><span className="mt-1 text-gold"><Sparkles size={15}/></span><span className="min-w-0 flex-1"><span className="block truncate font-serif text-lg text-ink">{item.title || item.body.split('\n')[0] || 'Untitled piece'}</span><span className="mt-1 block truncate text-xs text-muted">{item.type} · {new Date(item.updatedAt).toLocaleDateString()}</span></span><ArrowUpRight size={15} className="mt-1 shrink-0 text-muted"/></Link>)}</div> : <div className="panel p-5 text-sm text-ink-2">Your next thought can begin in Gather.</div>}
        </div>
      </section>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <div className="archive-card flex items-center gap-4 p-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-paper-2 text-gold">{icon}</span><span className="min-w-0 flex-1"><span className="block font-serif text-2xl leading-none text-ink">{value.toLocaleString()}</span><span className="mt-1 block text-sm font-medium text-ink">{label}</span></span></div>;
}
