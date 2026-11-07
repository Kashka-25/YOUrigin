import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Eye, Heading, Lock, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import { EmptyState, SaveIndicator, Spinner } from '../components/ui';
import { useAutoGrow } from '../hooks/useAutoGrow';
import { AddItemsDialog } from '../components/portfolio/AddItemsDialog';
import { useAutosave } from '../hooks/useAutosave';
import { updatePortfolio, usePortfolio, type PortfolioPatch } from '../db/portfolios';
import { PortfolioView } from '../portfolio/PortfolioView';
import { usePortfolioSnapshot, type BuiltPortfolio } from '../portfolio/usePortfolioSnapshot';
import {
  CONTACT_KINDS,
  LIMITS,
  PURPOSES,
  PURPOSE_ORDER,
  STATE_LABELS,
  TEXT_MODES,
  THEMES,
  VISIBILITY,
  headingItem,
  moveItem,
  portfolioState,
  publishBlockers,
  resolveItem,
  type ContactKind,
  type ContactLink,
  type Portfolio,
  type PortfolioItem,
  type PortfolioTheme,
  type PortfolioVisibility,
  type TextMode,
} from '../portfolio/model';
import { PROJECT_KIND_META, TYPE_LABEL, projectKind } from '../domain/constants';
import { displayTitle } from '../domain/text';

/** The draft fields this editor writes. Publication is never written from here. */
function toPatch(p: Portfolio): PortfolioPatch {
  const { title, purpose, theme, intro, ownerName, ownerLine, contactLinks, items, visibility, expiresAt, archived } = p;
  return { title, purpose, theme, intro, ownerName, ownerLine, contactLinks, items, visibility, expiresAt, archived };
}

/** A text box that grows with its text, from a modest starting height. */
function GrowingText({ id, value, onChange, min, className = '' }: { id: string; value: string; onChange: (v: string) => void; min: number; className?: string }) {
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  useAutoGrow(el, value, min);
  return <textarea ref={setEl} id={id} rows={2} className={`input resize-none ${className}`} value={value} onChange={(e) => onChange(e.target.value)} />;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="panel p-4 md:p-5">
      <h2 className="font-serif text-2xl">{title}</h2>
      {hint && <p className="mt-1 text-sm text-ink-2">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, htmlFor, count, children }: { label: string; htmlFor: string; count?: [number, number]; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="label" htmlFor={htmlFor}>{label}</label>
        {count && count[0] > count[1] * 0.8 && (
          <span className={`text-xs ${count[0] > count[1] ? 'text-seed' : 'text-muted'}`}>{count[0]} / {count[1]}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function sourceSummary(item: PortfolioItem, built: BuiltPortfolio): { kindLabel: string; title: string; hasImage: boolean; hasText: boolean; problem?: string } {
  const r = resolveItem(item, built.sources);
  if (r.problem) return { kindLabel: item.kind === 'project' ? 'Project' : item.kind === 'work' ? 'Work' : 'Piece', title: '', hasImage: false, hasText: false, problem: r.problem };
  if (r.project) return { kindLabel: 'Project', title: r.project.title, hasImage: false, hasText: false };
  if (r.work) return { kindLabel: `Work · ${PROJECT_KIND_META[projectKind(r.work)].label}`, title: r.work.title || 'Untitled', hasImage: !!r.work.coverAssetId, hasText: true };
  const c = r.piece!;
  return { kindLabel: c.type === 'image' ? 'Artwork' : TYPE_LABEL[c.type], title: displayTitle(c), hasImage: c.type === 'image', hasText: c.body.trim().length > 0 };
}

function ItemEditor({
  item,
  index,
  total,
  built,
  onChange,
  onMove,
  onRemove,
}: {
  item: PortfolioItem;
  index: number;
  total: number;
  built: BuiltPortfolio;
  onChange: (patch: Partial<PortfolioItem>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const id = `pi-${item.id}`;
  const controls = (
    <div className="flex shrink-0 gap-0.5">
      <button type="button" className="btn-ghost px-2" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp size={16} /></button>
      <button type="button" className="btn-ghost px-2" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down"><ArrowDown size={16} /></button>
      <button type="button" className="btn-ghost px-2" onClick={onRemove} aria-label="Remove from portfolio"><X size={16} /></button>
    </div>
  );

  if (item.kind === 'heading') {
    return (
      <li className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2">
        <Heading size={16} className="shrink-0 text-muted" aria-hidden="true" />
        <label className="sr-only" htmlFor={id}>Heading</label>
        <input id={id} className="input border-transparent bg-transparent font-serif text-lg" value={item.heading} placeholder="Heading" maxLength={LIMITS.heading} onChange={(e) => onChange({ heading: e.target.value })} />
        {controls}
      </li>
    );
  }

  const s = sourceSummary(item, built);
  const textModes: TextMode[] = item.kind === 'project' ? [] : ['none', 'excerpt', 'full'];
  return (
    <li className="rounded-xl border border-line bg-paper/40 p-3 md:p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">{s.kindLabel}</p>
          <p className="truncate font-serif text-lg">{item.heading.trim() || s.title || 'Missing'}</p>
        </div>
        {controls}
      </div>
      {s.problem ? (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-seed/10 px-3 py-2 text-sm text-seed" role="status">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {s.problem} It won’t be shown.
        </p>
      ) : (
        <div className="mt-3 grid gap-3">
          <Field label="Title shown" htmlFor={`${id}-t`} count={[item.heading.length, LIMITS.heading]}>
            <input id={`${id}-t`} className="input" value={item.heading} placeholder={s.title} onChange={(e) => onChange({ heading: e.target.value })} />
          </Field>
          <Field label="Description for this portfolio" htmlFor={`${id}-d`} count={[item.description.length, LIMITS.description]}>
            <GrowingText id={`${id}-d`} min={72} value={item.description} onChange={(v) => onChange({ description: v })} />
          </Field>
          {item.kind === 'project' && (
            <Field label="Link to the live project" htmlFor={`${id}-url`}>
              <input
                id={`${id}-url`}
                className="input"
                type="url"
                inputMode="url"
                value={item.destinationUrl ?? ''}
                placeholder="https://your-project.com"
                onChange={(e) => onChange({ destinationUrl: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted">Visitors will get an Explore project link. Only secure HTTPS addresses are accepted.</p>
            </Field>
          )}
          {(textModes.length > 0 && s.hasText) || s.hasImage ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {textModes.length > 0 && s.hasText && (
                <Field label={item.kind === 'piece' && s.kindLabel === 'Artwork' ? 'Caption' : 'Writing'} htmlFor={`${id}-x`}>
                  <select id={`${id}-x`} className="input" value={item.textMode} onChange={(e) => onChange({ textMode: e.target.value as TextMode })}>
                    {textModes.map((m) => (
                      <option key={m} value={m}>{s.kindLabel === 'Artwork' ? { none: 'No caption', excerpt: 'Short caption', full: 'Full caption' }[m] : TEXT_MODES[m]}</option>
                    ))}
                  </select>
                </Field>
              )}
              {s.hasImage && (
                <Field label="Picture" htmlFor={`${id}-i`}>
                  <select id={`${id}-i`} className="input" value={item.image} onChange={(e) => onChange({ image: e.target.value as PortfolioItem['image'] })}>
                    <option value="default">{item.kind === 'work' ? 'Show the cover' : 'Show the artwork'}</option>
                    <option value="none">No picture</option>
                  </select>
                </Field>
              )}
            </div>
          ) : null}
          {s.hasImage && item.image !== 'none' && (
            <Field label="Picture description (for screen readers)" htmlFor={`${id}-a`} count={[item.alt.length, LIMITS.alt]}>
              <input id={`${id}-a`} className="input" value={item.alt} placeholder="What the picture shows" onChange={(e) => onChange({ alt: e.target.value })} />
            </Field>
          )}
        </div>
      )}
    </li>
  );
}

function ContactEditor({ links, onChange }: { links: ContactLink[]; onChange: (links: ContactLink[]) => void }) {
  const set = (i: number, patch: Partial<ContactLink>) => onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <>
      {links.length === 0 && <p className="text-sm text-muted">No contact links yet. Visitors will only see your name.</p>}
      <ul className="space-y-3">
        {links.map((l, i) => (
          <li key={i} className="grid gap-2 sm:grid-cols-[9rem_1fr_9rem_auto] sm:items-end">
            <div>
              <label className="label" htmlFor={`cl-k-${i}`}>Kind</label>
              <select id={`cl-k-${i}`} className="input" value={l.kind} onChange={(e) => set(i, { kind: e.target.value as ContactKind })}>
                {(Object.keys(CONTACT_KINDS) as ContactKind[]).map((k) => <option key={k} value={k}>{CONTACT_KINDS[k]}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`cl-v-${i}`}>{l.kind === 'email' ? 'Email address' : 'Web address'}</label>
              <input id={`cl-v-${i}`} className="input" value={l.value} inputMode={l.kind === 'email' ? 'email' : 'url'} placeholder={l.kind === 'email' ? 'you@example.com' : 'https://'} onChange={(e) => set(i, { value: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor={`cl-l-${i}`}>Shown as</label>
              <input id={`cl-l-${i}`} className="input" value={l.label} placeholder={CONTACT_KINDS[l.kind]} maxLength={LIMITS.linkLabel} onChange={(e) => set(i, { label: e.target.value })} />
            </div>
            <button type="button" className="btn-ghost" onClick={() => onChange(links.filter((_, j) => j !== i))} aria-label={`Remove contact link ${i + 1}`}>
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
      {links.length < LIMITS.links && (
        <button type="button" className="btn" onClick={() => onChange([...links, { kind: links.length ? 'website' : 'email', label: '', value: '' }])}>
          <Plus size={16} /> Add a contact link
        </button>
      )}
    </>
  );
}

function dateInputValue(ms: number | null): string {
  if (ms === null) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The end of the chosen day, local time. */
function fromDateInput(v: string): number | null {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).getTime();
}

export function PortfolioEditor() {
  const { id } = useParams();
  const stored = usePortfolio(id);
  const [draft, setDraft] = useState<Portfolio | null>(null);
  const [adding, setAdding] = useState(false);
  const save = useCallback(async (p: Portfolio) => updatePortfolio(p.id, toPatch(p)), []);
  const { state: saveState, schedule } = useAutosave(save);

  // Take the stored copy once per portfolio; after that the editor's own copy leads.
  useEffect(() => {
    if (stored && (!draft || draft.id !== stored.id)) setDraft(stored);
  }, [stored, draft]);

  const view = draft ?? stored ?? null;
  const built = usePortfolioSnapshot(view);

  const change = (patch: Partial<Portfolio>) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    schedule(next);
  };
  const changeItem = (itemId: string, patch: Partial<PortfolioItem>) => change({ items: view!.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) });

  const already = useMemo(() => new Set(view?.items.map((i) => `${i.kind}:${i.sourceId}`) ?? []), [view]);

  if (stored === undefined || (stored && !view)) return <Spinner />;
  if (!view || !built) return <EmptyState title="This portfolio doesn’t exist" action={<Link className="btn" to="/portfolios">Back to Portfolios</Link>} />;

  const state = portfolioState(view, built.hash);
  const blockers = publishBlockers(view, built);

  return (
    <div className="page-frame max-w-none xl:w-[min(100%-2rem,1440px)]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link to="/portfolios" className="btn-ghost -ml-3"><ArrowLeft size={16} /> Portfolios</Link>
        <div className="flex flex-wrap items-center gap-3">
          <SaveIndicator state={saveState} />
          <Link to={`/portfolios/${view.id}/preview`} className="btn-primary"><Eye size={16} /> Preview as a visitor</Link>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          <header>
            <p className="eyebrow mb-2">{PURPOSES[view.purpose].label} portfolio</p>
            <h1 className="page-title break-words">{view.title || 'Untitled portfolio'}</h1>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-paper-2 px-3 py-1 text-sm text-ink-2" role="status">
              {state === 'draft' && <Lock size={14} aria-hidden="true" />}
              {STATE_LABELS[state]}
              {state === 'draft' && <span className="text-muted">· only you can see it</span>}
            </p>
          </header>

          <Section title="About this portfolio">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Portfolio title" htmlFor="pf-title" count={[view.title.length, LIMITS.title]}>
                <input id="pf-title" className="input" value={view.title} placeholder="e.g. Selected work" onChange={(e) => change({ title: e.target.value })} />
              </Field>
              <Field label="What it’s for" htmlFor="pf-purpose">
                <select id="pf-purpose" className="input" value={view.purpose} onChange={(e) => change({ purpose: e.target.value as Portfolio['purpose'] })}>
                  {PURPOSE_ORDER.map((p) => <option key={p} value={p}>{PURPOSES[p].label}</option>)}
                </select>
              </Field>
              <Field label="Your name, as visitors should see it" htmlFor="pf-name" count={[view.ownerName.length, LIMITS.ownerName]}>
                <input id="pf-name" className="input" value={view.ownerName} autoComplete="name" onChange={(e) => change({ ownerName: e.target.value })} />
              </Field>
              <Field label="A line under your name" htmlFor="pf-line" count={[view.ownerLine.length, LIMITS.ownerLine]}>
                <input id="pf-line" className="input" value={view.ownerLine} placeholder="e.g. Writer and designer, Bristol" onChange={(e) => change({ ownerLine: e.target.value })} />
              </Field>
            </div>
            <Field label="Introduction" htmlFor="pf-intro" count={[view.intro.length, LIMITS.intro]}>
              <GrowingText id="pf-intro" min={120} className="font-serif text-base" value={view.intro} onChange={(v) => change({ intro: v })} />
              <p className="mt-1 text-xs text-muted">{PURPOSES[view.purpose].introHint}</p>
            </Field>
            <fieldset>
              <legend className="label">Look</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(THEMES) as PortfolioTheme[]).map((t) => (
                  <label key={t} className={`cursor-pointer rounded-xl border p-3 text-sm ${view.theme === t ? 'border-accent bg-accent/10' : 'border-line hover:bg-paper-2'}`}>
                    <input type="radio" name="pf-theme" value={t} checked={view.theme === t} onChange={() => change({ theme: t })} className="sr-only" />
                    <span className="block font-semibold">{THEMES[t].label}</span>
                    <span className="block text-xs text-muted">{THEMES[t].blurb}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </Section>

          <Section title="Contact" hint="Only the links you add here are shown. Nothing is taken from your account or other profiles.">
            <ContactEditor links={view.contactLinks} onChange={(contactLinks) => change({ contactLinks })} />
          </Section>

          <Section title="What it shows" hint="Choose the order, and write a description for each item for this audience. Your notes, tags and drafts are never shown.">
            {view.items.length === 0 && <p className="text-sm text-muted">Nothing here yet.</p>}
            <ul className="space-y-3">
              {view.items.map((item, i) => (
                <ItemEditor
                  key={item.id}
                  item={item}
                  index={i}
                  total={view.items.length}
                  built={built}
                  onChange={(patch) => changeItem(item.id, patch)}
                  onMove={(dir) => change({ items: moveItem(view.items, i, i + dir) })}
                  onRemove={() => change({ items: view.items.filter((x) => x.id !== item.id) })}
                />
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add Projects, Works or pieces</button>
              <button type="button" className="btn" onClick={() => change({ items: [...view.items, headingItem('New section')] })}><Heading size={16} /> Add a heading</button>
            </div>
          </Section>

          <Section title="Sharing" hint="Your choice for when you publish. Visitors never need a YOU or YOUrigin account.">
            <fieldset>
              <legend className="label">Who can open it</legend>
              <div className="space-y-2">
                {(['unlisted', 'password', 'public'] as PortfolioVisibility[]).map((v) => (
                  <label key={v} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${view.visibility === v ? 'border-accent bg-accent/10' : 'border-line hover:bg-paper-2'}`}>
                    <input type="radio" name="pf-visibility" value={v} checked={view.visibility === v} onChange={() => change({ visibility: v })} className="mt-1 accent-[var(--accent)]" />
                    <span>
                      <span className="block font-semibold">{VISIBILITY[v].label}{v === 'unlisted' && <span className="ml-2 text-xs font-normal text-muted">Recommended</span>}</span>
                      <span className="block text-sm text-ink-2">{VISIBILITY[v].blurb}</span>
                      {v === 'password' && view.visibility === 'password' && <span className="mt-1 block text-xs text-muted">You’ll set the password when you publish. It is never stored on your devices.</span>}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Link stops working after (optional)" htmlFor="pf-expiry">
              <div className="flex flex-wrap items-center gap-2">
                <input id="pf-expiry" type="date" className="input w-auto" value={dateInputValue(view.expiresAt)} min={dateInputValue(Date.now())} onChange={(e) => change({ expiresAt: fromDateInput(e.target.value) })} />
                {view.expiresAt !== null && <button type="button" className="btn-ghost" onClick={() => change({ expiresAt: null })}>No end date</button>}
              </div>
            </Field>
            <div className="rounded-xl bg-paper-2 p-3 text-sm">
              <p className="font-semibold">Before publishing</p>
              {blockers.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-2">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
              ) : (
                <p className="mt-1 text-ink-2">Ready. Check the visitor preview on a phone width before you publish.</p>
              )}
              <p className="mt-2 text-xs text-muted">
                Publishing isn’t switched on in this version yet. Until it is, this portfolio stays a private draft on your devices (synced end-to-end encrypted).
              </p>
            </div>
          </Section>
        </div>

        <aside className="hidden xl:block" aria-label="Visitor preview at phone width">
          <div className="sticky top-6">
            <div className="mb-2 flex items-center justify-between text-sm text-muted">
              <span>What a visitor sees on a phone</span>
              <Link to={`/portfolios/${view.id}/preview`} className="underline">Full preview</Link>
            </div>
            <div className="h-[calc(100dvh-7rem)] overflow-y-auto rounded-[28px] border-[6px] border-ink/80 bg-white shadow-lg" style={{ width: 390 + 12 }}>
              <PortfolioView snapshot={built.snapshot} resolveImage={built.resolveImage} />
            </div>
          </div>
        </aside>
      </div>

      <AddItemsDialog open={adding} onClose={() => setAdding(false)} already={already} onAdd={(items) => change({ items: [...view.items, ...items] })} />
    </div>
  );
}
