import { useLibrary } from '../hooks/useLibrary';
import { purgeContent, restoreFromTrash } from '../db/content';
import { EmptyState, Spinner } from '../components/ui';
import { useConfirm } from '../components/Modal';
import { useToast } from '../components/Toast';
import { displayTitle, excerpt } from '../domain/text';

export function Trash() {
  const lib = useLibrary();
  const confirm = useConfirm();
  const toast = useToast();
  if (!lib) return <Spinner />;
  const items = lib.items.filter((i) => i.deletedAt).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

  const purge = async (ids: string[]) => {
    const ok = await confirm({
      title: ids.length === 1 ? 'Delete forever?' : `Delete ${ids.length} pieces forever?`,
      message: 'This permanently removes the writing from this device. It cannot be undone. Consider exporting a backup first.',
      confirmLabel: 'Delete forever',
      danger: true,
    });
    if (ok) await purgeContent(ids);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 md:px-8 md:pt-12">
      <h1 className="page-title">Trash</h1>
      <p className="mt-2 text-[15px] text-ink-2">Pieces stay here until you delete them forever. Their book placements return if you restore them.</p>
      {items.length === 0 ? (
        <EmptyState title="Trash is empty" />
      ) : (
        <>
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                await restoreFromTrash(items.map((i) => i.id));
                toast(`Restored ${items.length}`);
              }}
            >
              Restore all
            </button>
            <button type="button" className="btn text-seed" onClick={() => void purge(items.map((i) => i.id))}>
              Empty trash
            </button>
          </div>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {items.map((i) => (
              <li key={i.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-serif text-lg">{displayTitle(i)}</p>
                  <p className="line-clamp-1 text-sm text-ink-2">{excerpt(i.body, 140)}</p>
                  <p className="text-xs text-muted">Trashed {new Date(i.deletedAt!).toLocaleString()}</p>
                </div>
                <button type="button" className="btn shrink-0" onClick={() => void restoreFromTrash([i.id])}>
                  Restore
                </button>
                <button type="button" className="btn-ghost shrink-0 text-seed" onClick={() => void purge([i.id])}>
                  Delete forever
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
