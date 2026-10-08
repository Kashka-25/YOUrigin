import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import type { Check, Level } from '../../print/preflight';

const ICON: Record<Level, { icon: typeof Info; cls: string; label: string }> = {
  fail: { icon: XCircle, cls: 'text-seed', label: 'Must fix' },
  warn: { icon: AlertTriangle, cls: 'text-developing', label: 'Check' },
  info: { icon: Info, cls: 'text-muted', label: 'Note' },
  pass: { icon: CheckCircle2, cls: 'text-polished', label: 'Ready' },
};
const ORDER: Level[] = ['fail', 'warn', 'info', 'pass'];

/** The KDP print-ready report: what must be fixed, what to look at, and what's ready. */
export function PreflightPanel({ checks, measuring, bookId, onOpenDesign }: { checks: Check[]; measuring: boolean; bookId: string; onOpenDesign: () => void }) {
  const fails = checks.filter((c) => c.level === 'fail').length;
  const warns = checks.filter((c) => c.level === 'warn').length;
  const sorted = [...checks].sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-serif text-lg">Print-ready check · KDP</p>
        <p className="mt-1 text-xs text-muted">Amazon KDP paperback rules, checked against the pages as laid out.</p>
      </div>
      <div className={`rounded-xl px-3 py-2 ${fails ? 'bg-seed-bg text-seed' : warns ? 'bg-developing-bg text-developing' : 'bg-polished-bg text-polished'}`}>
        {measuring ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Checking the laid-out pages…
          </span>
        ) : fails ? (
          `${fails} thing${fails === 1 ? '' : 's'} to fix before uploading${warns ? `, ${warns} to look at` : ''}.`
        ) : warns ? (
          `Nothing blocks upload — ${warns} thing${warns === 1 ? '' : 's'} worth a look.`
        ) : (
          'Ready for KDP. Save as PDF and upload the interior.'
        )}
      </div>
      <ul className="space-y-2">
        {sorted.map((c) => {
          const { icon: Icon, cls, label } = ICON[c.level];
          return (
            <li key={c.id} className="rounded-xl border border-line p-3">
              <div className="flex gap-2">
                <Icon size={16} className={`mt-0.5 shrink-0 ${cls}`} aria-label={label} />
                <div className="min-w-0 flex-1">
                  <p>{c.title}</p>
                  {c.detail && <p className="mt-1 text-xs text-muted">{c.detail}</p>}
                  {c.items && c.items.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1">
                      {c.items.map((i) => (
                        <li key={i.id}>
                          <Link to={`/item/${i.id}?book=${bookId}`} className="inline-block max-w-[14rem] truncate rounded-full border border-line px-2 py-0.5 text-xs hover:border-accent">
                            {i.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {c.fix &&
                    (c.fix.to.endsWith('/print') ? (
                      <button type="button" className="mt-2 text-xs text-accent underline" onClick={onOpenDesign}>
                        {c.fix.label} →
                      </button>
                    ) : (
                      <Link to={c.fix.to} className="mt-2 inline-block text-xs text-accent underline">
                        {c.fix.label} →
                      </Link>
                    ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted">
        Uploading: Save as PDF from <strong>Print / PDF</strong> (margins None, background graphics on). On KDP choose your trim size, paper, and{' '}
        <strong>Bleed</strong> or <strong>No bleed</strong> to match. KDP’s online previewer is the final word.
      </p>
    </div>
  );
}
