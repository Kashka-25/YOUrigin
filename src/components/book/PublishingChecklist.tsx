import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, Circle, ClipboardCheck, Minus } from 'lucide-react';
import { useLibrary } from '../../hooks/useLibrary';
import { resolveDesign } from '../../print/design';
import { publishingChecklist, type ItemState } from '../../print/checklist';
import type { Book } from '../../domain/types';

const MARK: Record<ItemState, { icon: typeof Check; cls: string; label: string }> = {
  done: { icon: Check, cls: 'text-polished', label: 'Done' },
  todo: { icon: Circle, cls: 'text-seed', label: 'To do' },
  optional: { icon: Minus, cls: 'text-muted', label: 'Optional' },
};

const n = (v: number) => v.toLocaleString();

/** How big the book is, chapter by chapter, and what it still needs before publishing. */
export function PublishingChecklist({ book }: { book: Book }) {
  const lib = useLibrary();
  const list = useMemo(() => {
    if (!lib) return null;
    return publishingChecklist(
      book,
      resolveDesign(book),
      lib.sections.filter((s) => s.bookId === book.id),
      lib.entries.filter((e) => e.bookId === book.id),
      lib.contentById,
    );
  }, [lib, book]);
  if (!list) return null;
  const { chapters, totals, laidOutPages, items, ready } = list;

  return (
    <details className="group mt-4 rounded-2xl border border-line bg-card">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl px-4 py-3 hover:bg-paper-2 [&::-webkit-details-marker]:hidden">
        <span className="font-serif text-xl">Ready to publish</span>
        <span className="text-sm text-muted tabular-nums">
          · {ready.done} of {ready.of} done · {n(totals.words)} words · ≈ {n(totals.pages)} pages
        </span>
        <ChevronDown size={18} className="ml-auto text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="grid gap-6 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-label="Chapter sizes" className="min-w-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 pr-3 font-normal">Chapter</th>
                <th className="px-2 py-2 text-right font-normal">Pieces</th>
                <th className="px-2 py-2 text-right font-normal">Words</th>
                <th className="px-2 py-2 text-right font-normal" title="Estimated from the trim size, margins and type in Design & print">≈ Pages</th>
                <th className="py-2 pl-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {chapters.map((c) => (
                <tr key={c.id} className="border-b border-line/60">
                  <td className={`max-w-[16rem] truncate py-1.5 pr-3 font-serif text-[15px] ${c.pieces ? '' : 'text-muted italic'}`}>{c.title}</td>
                  <td className="px-2 py-1.5 text-right">{c.pieces}</td>
                  <td className="px-2 py-1.5 text-right">{n(c.words)}</td>
                  <td className="px-2 py-1.5 text-right">{c.pages}</td>
                  <td className="py-1.5 pl-2">
                    <StatusDots status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular-nums">
              <tr className="font-semibold">
                <td className="py-2 pr-3">Book</td>
                <td className="px-2 py-2 text-right">{totals.pieces}</td>
                <td className="px-2 py-2 text-right">{n(totals.words)}</td>
                <td className="px-2 py-2 text-right">{n(totals.pages)}</td>
                <td className="py-2 pl-2">
                  <StatusDots status={totals.status} />
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="mt-2 text-xs text-muted">
            Pages are estimated from your page size and type, before front pages.
            {laidOutPages ? ` The full book came to ${n(laidOutPages)} pages when Design & print last laid it out.` : ''}
          </p>
        </section>

        <section aria-label="Checklist">
          <ul className="space-y-1.5">
            {items.map((i) => {
              const m = MARK[i.state];
              return (
                <li key={i.id} className="flex items-start gap-2.5 text-sm">
                  <m.icon size={16} className={`mt-0.5 shrink-0 ${m.cls}`} aria-label={m.label} />
                  <span className="min-w-0 flex-1">
                    <span className={i.state === 'done' ? 'text-ink-2' : 'text-ink'}>{i.label}</span>
                    {i.state === 'optional' && <span className="text-muted"> · optional</span>}
                    {i.detail && <span className="block text-xs text-muted">{i.detail}</span>}
                  </span>
                  {i.fix && i.state !== 'done' && (
                    <Link to={i.fix.to} className="shrink-0 text-xs text-accent underline-offset-2 hover:underline">
                      {i.fix.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
          <Link to={`/projects/${book.id}/print?check=1`} className="btn mt-4 w-full justify-center text-sm">
            <ClipboardCheck size={15} /> Full print check for KDP
          </Link>
        </section>
      </div>
    </details>
  );
}

function StatusDots({ status }: { status: { seed: number; developing: number; polished: number } }) {
  const parts = [
    { k: 'polished', n: status.polished, dot: 'bg-polished', label: 'polished' },
    { k: 'developing', n: status.developing, dot: 'bg-developing', label: 'developing' },
    { k: 'seed', n: status.seed, dot: 'bg-seed', label: 'seed' },
  ].filter((p) => p.n);
  if (!parts.length) return <span className="text-muted">–</span>;
  return (
    <span className="inline-flex gap-2.5">
      {parts.map((p) => (
        <span key={p.k} className="inline-flex items-center gap-1" title={`${p.n} ${p.label}`}>
          <span className={`h-2 w-2 rounded-full ${p.dot}`} aria-hidden />
          <span className="sr-only">{p.label}</span>
          {p.n}
        </span>
      ))}
    </span>
  );
}
