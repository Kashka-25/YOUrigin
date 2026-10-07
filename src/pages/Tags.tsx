import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { createFamily, deleteFamily, deleteTag, renameFamily, renameTag, setTagFamily, ensureTags } from '../db/tags';
import { normaliseTagName } from '../domain/text';
import { Spinner, EmptyState } from '../components/ui';
import { useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import type { Tag } from '../domain/types';

type Sort = 'count' | 'name';

export function Tags() {
  const lib = useLibrary();
  const nav = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('count');
  const [picked, setPicked] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [newFamily, setNewFamily] = useState('');

  const groups = useMemo(() => {
    if (!lib) return [];
    const nq = normaliseTagName(q);
    const tags = lib.tags
      .filter((t) => !nq || t.name.includes(nq))
      .sort((a, b) =>
        sort === 'name' ? a.name.localeCompare(b.name) : (lib.tagCounts.get(b.id) ?? 0) - (lib.tagCounts.get(a.id) ?? 0) || a.name.localeCompare(b.name),
      );
    const out = lib.families.map((f) => ({ family: f, tags: tags.filter((t) => t.familyId === f.id) }));
    out.push({ family: { id: '', name: 'Unsorted', order: 999, createdAt: 0, updatedAt: 0 }, tags: tags.filter((t) => !t.familyId || !lib.families.some((f) => f.id === t.familyId)) });
    return out;
  }, [lib, q, sort]);

  if (!lib) return <Spinner />;

  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 md:px-8 md:pt-12">
      <p className="eyebrow">Words that describe your material</p>
      <h1 className="page-title">Tags</h1>
      <p className="mt-2 max-w-2xl text-[15px] text-ink-2">
        Tags describe; they don’t decide where something belongs. Select several to see the pieces that carry all of them.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <input type="search" className="input max-w-xs" placeholder="Find a tag" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a tag" />
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort tags">
          <option value="count">Most used</option>
          <option value="name">A–Z</option>
        </select>
        <form
          className="ml-auto flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!normaliseTagName(newTag)) return;
            await ensureTags([newTag]);
            toast(`Created #${normaliseTagName(newTag)}`);
            setNewTag('');
          }}
        >
          <input className="input w-40" placeholder="New tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} aria-label="New tag name" />
          <button type="submit" className="btn shrink-0">
            <Plus size={15} /> Tag
          </button>
        </form>
      </div>

      {picked.length > 0 && (
        <div className="sticky top-14 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-accent bg-card px-4 py-2 md:top-2">
          <span className="text-sm">{picked.map((id) => '#' + lib.ctx.tagName.get(id)).join(' + ')}</span>
          <button type="button" className="btn-primary ml-auto py-1" onClick={() => nav(`/library?tags=${picked.join(',')}`)}>
            Show pieces with all
          </button>
          <button type="button" className="btn-ghost" onClick={() => setPicked([])}>
            Clear
          </button>
        </div>
      )}

      {lib.tags.length === 0 ? (
        <EmptyState title="No tags yet">
          Add <code>#hashtags</code> while you capture, or create tags here.
        </EmptyState>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map(({ family, tags }) =>
            tags.length === 0 && !family.id ? null : (
              <section key={family.id || 'unsorted'}>
                <FamilyHeader
                  name={family.name}
                  editable={!!family.id}
                  onRename={(n) => renameFamily(family.id, n)}
                  onDelete={async () => {
                    if (await confirm({ title: `Remove family “${family.name}”?`, message: 'Its tags stay; they just become unsorted.', confirmLabel: 'Remove' }))
                      await deleteFamily(family.id);
                  }}
                />
                {tags.length === 0 ? (
                  <p className="text-sm text-muted">No tags in this family yet.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {tags.map((t) => (
                      <TagRow
                        key={t.id}
                        tag={t}
                        count={lib.tagCounts.get(t.id) ?? 0}
                        picked={picked.includes(t.id)}
                        onPick={() => togglePick(t.id)}
                        families={lib.families}
                        onDelete={async () => {
                          const n = lib.tagCounts.get(t.id) ?? 0;
                          if (
                            await confirm({
                              title: `Delete #${t.name}?`,
                              message: `It will be removed from ${n} piece${n === 1 ? '' : 's'}. The writing itself is untouched.`,
                              confirmLabel: 'Delete tag',
                              danger: true,
                            })
                          )
                            await deleteTag(t.id);
                        }}
                        onRename={async (name) => {
                          const r = await renameTag(t.id, name);
                          toast(r === 'merged' ? `Merged into #${normaliseTagName(name)}` : 'Renamed');
                        }}
                      />
                    ))}
                  </ul>
                )}
              </section>
            ),
          )}
          <form
            className="flex max-w-sm gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newFamily.trim()) return;
              await createFamily(newFamily);
              setNewFamily('');
            }}
          >
            <input className="input" placeholder="New family (e.g. Season)" value={newFamily} onChange={(e) => setNewFamily(e.target.value)} aria-label="New tag family" />
            <button type="submit" className="btn shrink-0">
              Add family
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function FamilyHeader({ name, editable, onRename, onDelete }: { name: string; editable: boolean; onRename: (n: string) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(name);
  return (
    <div className="mb-2 flex items-center gap-2">
      {editing ? (
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            onRename(v);
            setEditing(false);
          }}
        >
          <input className="input py-1" value={v} onChange={(e) => setV(e.target.value)} autoFocus aria-label="Family name" />
          <button className="btn-ghost p-1" type="submit" aria-label="Save">
            <Check size={15} />
          </button>
        </form>
      ) : (
        <h2 className="eyebrow">{name}</h2>
      )}
      {editable && !editing && (
        <>
          <button type="button" className="btn-ghost p-1" onClick={() => setEditing(true)} aria-label={`Rename family ${name}`}>
            <Pencil size={12} />
          </button>
          <button type="button" className="btn-ghost p-1" onClick={onDelete} aria-label={`Remove family ${name}`}>
            <Trash2 size={12} />
          </button>
        </>
      )}
    </div>
  );
}

function TagRow({
  tag,
  count,
  picked,
  onPick,
  families,
  onDelete,
  onRename,
}: {
  tag: Tag;
  count: number;
  picked: boolean;
  onPick: () => void;
  families: { id: string; name: string }[];
  onDelete: () => void;
  onRename: (name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <input type="checkbox" checked={picked} onChange={onPick} aria-label={`Select #${tag.name}`} className="h-4 w-4" />
      {editing ? (
        <form
          className="flex gap-1"
          onSubmit={async (e) => {
            e.preventDefault();
            await onRename(name);
            setEditing(false);
          }}
        >
          <input className="input py-1" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Tag name" />
          <button className="btn-ghost p-1" type="submit" aria-label="Save tag name">
            <Check size={15} />
          </button>
        </form>
      ) : (
        <Link to={`/library?tags=${tag.id}`} className="font-medium hover:underline">
          #{tag.name}
        </Link>
      )}
      <span className="text-xs text-muted tabular-nums">{count}</span>
      <div className="ml-auto flex items-center gap-1">
        <select
          className="rounded-full border border-line bg-card px-2 py-0.5 text-xs text-ink-2"
          value={tag.familyId ?? ''}
          onChange={(e) => void setTagFamily(tag.id, e.target.value || null)}
          aria-label={`Family for #${tag.name}`}
        >
          <option value="">No family</option>
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn-ghost p-1" onClick={() => setEditing(true)} aria-label={`Rename #${tag.name}`}>
          <Pencil size={14} />
        </button>
        <button type="button" className="btn-ghost p-1" onClick={onDelete} aria-label={`Delete #${tag.name}`}>
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}
