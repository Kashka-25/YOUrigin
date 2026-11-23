import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * A quiet, tap-to-open row: the title and a short "where it stands" line show; the
 * writing and controls stay folded away until wanted. Group several inside <FoldGroup>.
 */
export function Fold({
  id,
  title,
  summary,
  icon,
  open,
  children,
}: {
  id?: string;
  title: string;
  /** One short line on the current state, shown while folded. */
  summary?: ReactNode;
  /** A lucide icon element or an image URL. */
  icon?: ReactNode | string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details id={id} className="group scroll-mt-20 border-b border-line last:border-b-0" open={open}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
        {typeof icon === 'string' ? <img src={icon} alt="" className="h-7 w-7 shrink-0" /> : icon && <span className="shrink-0 text-ink-2">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-ink">{title}</span>
          {summary && <span className="block truncate text-sm text-muted">{summary}</span>}
        </span>
        <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-4 pb-5">{children}</div>
    </details>
  );
}

/** A card holding a few Folds under a small heading. */
export function FoldGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-6" aria-label={title}>
      {title && <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{title}</h2>}
      <div className="rounded-2xl border border-line bg-card px-4">{children}</div>
    </section>
  );
}

/** Longer explanations, folded inside a Fold: "How this works". */
export function MoreAbout({ label = 'How this works', children }: { label?: string; children: ReactNode }) {
  return (
    <details className="group/more rounded-xl border border-line px-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm text-ink-2 [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown size={15} className="ml-auto text-muted transition-transform group-open/more:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-2 pb-3 text-sm leading-relaxed text-ink-2">{children}</div>
    </details>
  );
}
