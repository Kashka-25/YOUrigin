import { Compass } from 'lucide-react';
import type { BookProgress } from '../../domain/progress';
import { pct } from '../../domain/progress';
import { ProgressBar, StatusBadge } from '../ui';

export function BookDashboard({ progress }: { progress: BookProgress }) {
  const { counts } = progress;
  return (
    <section className="panel p-5 md:p-6" aria-label="Book progress">
      <div className="grid gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
        <div>
          <p className="eyebrow">Overall</p>
          <p className="font-serif text-6xl leading-none tabular-nums">{pct(progress.overall)}</p>
          <dl className="mt-3 grid w-max grid-cols-[auto_auto] items-center gap-x-3 gap-y-1.5">
            {(['polished', 'developing', 'seed'] as const).map((s) => (
              <div key={s} className="contents">
                <dt>
                  <StatusBadge status={s} />
                </dt>
                <dd className="text-sm tabular-nums">{counts[s]}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="space-y-3">
          <ProgressBar value={progress.structure} label="Structure — sections with material" />
          <ProgressBar value={progress.content} label="Writing — pieces grown past seed" />
          <ProgressBar value={progress.editing} label="Editing — pieces polished" tone="polished" />
          <div className="flex items-start gap-2 rounded-xl bg-paper-2 px-4 py-3">
            <Compass size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <p className="text-[15px]">
              <span className="font-semibold">Next: </span>
              {progress.nextAction}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
