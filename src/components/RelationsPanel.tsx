import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link2, Unlink } from 'lucide-react';
import { db } from '../db/db';
import { linkContent, unlink } from '../db/collections';
import { useLibrary } from '../hooks/useLibrary';
import { localProvider } from '../ai/local';
import type { Related } from '../ai';
import type { ContentItem } from '../domain/types';
import { displayTitle } from '../domain/text';
import { StatusBadge } from './ui';

/** Explicit links the writer made, plus on-device "this seems related" hints. */
export function RelationsPanel({ item }: { item: ContentItem }) {
  const lib = useLibrary();
  const links = useLiveQuery(
    () => db.relationships.where('fromId').equals(item.id).or('toId').equals(item.id).toArray(),
    [item.id],
  );
  const [related, setRelated] = useState<Related[]>([]);

  useEffect(() => {
    if (!lib) return;
    let alive = true;
    // Related-material lookup is always on-device: fast, private, works offline.
    void localProvider.findRelatedContent(item, lib.ai).then((r) => alive && setRelated(r));
    return () => {
      alive = false;
    };
  }, [item, lib]);

  if (!lib) return null;
  const linkedIds = new Set((links ?? []).map((l) => (l.fromId === item.id ? l.toId : l.fromId)));
  const suggestions = related.filter((r) => !linkedIds.has(r.id)).slice(0, 4);

  return (
    <section>
      <h2 className="label">Connections</h2>
      {(links ?? []).length > 0 && (
        <ul className="mb-3 space-y-1">
          {links!.map((l) => {
            const otherId = l.fromId === item.id ? l.toId : l.fromId;
            const other = lib.contentById.get(otherId);
            if (!other) return null;
            return (
              <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                <Link to={`/item/${other.id}`} className="min-w-0 truncate font-serif text-base hover:underline">
                  {displayTitle(other)}
                </Link>
                <span className="text-xs text-muted">{l.kind}</span>
                <button type="button" className="btn-ghost p-1" aria-label="Remove connection" onClick={() => void unlink(l.id)}>
                  <Unlink size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {suggestions.length > 0 ? (
        <>
          <p className="mb-1 text-xs text-ai">Possibly related</p>
          <ul className="space-y-2">
            {suggestions.map((r) => {
              const other = lib.contentById.get(r.id);
              if (!other) return null;
              return (
                <li key={r.id} className="rounded-xl border border-dashed border-ai/50 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/item/${other.id}`} className="min-w-0 font-serif text-[15px] leading-snug hover:underline">
                      {displayTitle(other)}
                    </Link>
                    <StatusBadge status={other.status} compact />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">{r.reason}</span>
                    <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => void linkContent(item.id, r.id)}>
                      <Link2 size={12} /> Connect
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        !(links ?? []).length && <p className="text-sm text-muted">No connections yet.</p>
      )}
    </section>
  );
}
