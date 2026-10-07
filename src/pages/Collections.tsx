import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { createCollection, deleteCollection, removeFromCollection, updateCollection } from '../db/collections';
import { EmptyState, Spinner } from '../components/ui';
import { ItemCard } from '../components/ItemCard';
import { useConfirm } from '../components/Modal';
import { AssignDialog } from '../components/AssignDialog';

export function Collections() {
  const lib = useLibrary();
  const nav = useNavigate();
  const [name, setName] = useState('');
  if (!lib) return <Spinner />;
  const cols = [...lib.collections].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 md:px-8 md:pt-12">
      <p className="eyebrow">Loose groupings, lighter than books</p>
      <h1 className="page-title">Collections</h1>
      <form
        className="mt-6 flex max-w-md gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const id = await createCollection(name);
          setName('');
          nav(`/collections/${id}`);
        }}
      >
        <input className="input" placeholder="New collection name" value={name} onChange={(e) => setName(e.target.value)} aria-label="New collection name" />
        <button type="submit" className="btn shrink-0" disabled={!name.trim()}>
          <Plus size={15} /> Create
        </button>
      </form>
      {cols.length === 0 ? (
        <EmptyState title="No collections yet">Collections gather pieces without giving them a structure — a theme, a season, a mood.</EmptyState>
      ) : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {cols.map((c) => (
            <li key={c.id} className="py-3">
              <Link to={`/collections/${c.id}`} className="font-serif text-xl hover:underline">
                {c.name}
              </Link>
              <p className="text-xs text-muted">
                {c.contentIds.filter((id) => !lib.contentById.get(id)?.deletedAt).length} pieces
                {c.description ? ` · ${c.description}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CollectionPage() {
  const { id } = useParams();
  const lib = useLibrary();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [toBook, setToBook] = useState(false);
  if (!lib) return <Spinner />;
  const c = lib.collections.find((x) => x.id === id);
  if (!c) return <EmptyState title="Collection not found" action={<Link to="/collections" className="btn">All collections</Link>} />;
  const items = c.contentIds.map((cid) => lib.contentById.get(cid)).filter((i) => i && !i.deletedAt) as NonNullable<ReturnType<typeof lib.contentById.get>>[];

  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 md:px-8 md:pt-10">
      <Link to="/collections" className="btn-ghost -ml-3">
        <ArrowLeft size={16} /> Collections
      </Link>
      <input
        className="mt-3 w-full bg-transparent font-serif text-4xl focus:outline-none"
        defaultValue={c.name}
        onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && void updateCollection(c.id, { name: e.target.value.trim() })}
        aria-label="Collection name"
      />
      <textarea
        className="mt-2 w-full resize-none bg-transparent text-ink-2 placeholder:text-muted focus:outline-none"
        defaultValue={c.description}
        placeholder="What holds these together?"
        rows={2}
        onBlur={(e) => e.target.value !== c.description && void updateCollection(c.id, { description: e.target.value })}
        aria-label="Collection description"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => setToBook(true)} disabled={!items.length}>
          Turn into / add to a book
        </button>
        <button
          type="button"
          className="btn text-seed"
          onClick={async () => {
            if (await confirm({ title: `Remove collection “${c.name}”?`, message: 'Only the grouping is removed. Every piece stays in your Library.', confirmLabel: 'Remove', danger: true })) {
              await deleteCollection(c.id);
              nav('/collections');
            }
          }}
        >
          <Trash2 size={15} /> Remove collection
        </button>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Empty collection">Add pieces from the Library (select → Collection) or from any piece’s page.</EmptyState>
      ) : (
        <div className="mt-4">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              extra={
                <button type="button" className="btn-ghost mt-1 px-2 py-0.5 text-xs" onClick={() => void removeFromCollection(c.id, [item.id])}>
                  <X size={12} /> Remove from collection
                </button>
              }
            />
          ))}
        </div>
      )}
      {toBook && <AssignDialog open mode="book" contentIds={items.map((i) => i.id)} defaultNewName={c.name} onClose={() => setToBook(false)} />}
    </div>
  );
}
