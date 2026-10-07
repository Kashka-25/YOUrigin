import type { ReactNode } from 'react';
import { Sparkles, X, Check, CloudOff, Loader2, AlertCircle } from 'lucide-react';
import type { ContentType, Status } from '../domain/types';
import { CONTENT_TYPES, STATUSES, STATUS_META, TYPE_LABEL } from '../domain/constants';
import type { SaveState } from '../hooks/useAutosave';

const STATUS_CLASSES: Record<Status, { chip: string; dot: string; ring: string }> = {
  seed: { chip: 'bg-seed-bg text-seed', dot: 'bg-seed', ring: 'border-seed' },
  developing: { chip: 'bg-developing-bg text-developing', dot: 'bg-developing', ring: 'border-developing' },
  polished: { chip: 'bg-polished-bg text-polished', dot: 'bg-polished', ring: 'border-polished' },
};

export function StatusBadge({ status, compact = false }: { status: Status; compact?: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASSES[status].chip}`}
      title={meta.meaning}
    >
      <span aria-hidden>{meta.symbol}</span>
      {compact ? <span className="sr-only">{meta.label}</span> : meta.label}
    </span>
  );
}

export function StatusPicker({
  value,
  onChange,
  size = 'md',
  label = 'Creative status',
}: {
  value: Status;
  onChange: (s: Status) => void;
  size?: 'sm' | 'md';
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1.5">
      {STATUSES.map((s) => {
        const active = s === value;
        const meta = STATUS_META[s];
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            title={meta.meaning}
            onClick={() => onChange(s)}
            className={`inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors ${
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'
            } ${active ? `${STATUS_CLASSES[s].chip} ${STATUS_CLASSES[s].ring}` : 'border-line text-ink-2 hover:bg-paper-2'}`}
          >
            <span aria-hidden className={active ? '' : 'opacity-60'}>
              {meta.symbol}
            </span>
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

export function TypeSelect({
  value,
  onChange,
  id,
  className = '',
}: {
  value: ContentType;
  onChange: (t: ContentType) => void;
  id?: string;
  className?: string;
}) {
  return (
    <select
      id={id}
      aria-label="Type"
      value={value}
      onChange={(e) => onChange(e.target.value as ContentType)}
      className={`rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none ${className}`}
    >
      {CONTENT_TYPES.map((t) => (
        <option key={t} value={t}>
          {TYPE_LABEL[t]}
        </option>
      ))}
    </select>
  );
}

export function TagChip({
  name,
  onRemove,
  onClick,
  active,
  count,
}: {
  name: string;
  onRemove?: () => void;
  onClick?: () => void;
  active?: boolean;
  count?: number;
}) {
  const base = `inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
    active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-paper-2 text-ink-2'
  }`;
  const content = (
    <>
      <span>#{name}</span>
      {count !== undefined && <span className="opacity-60">{count}</span>}
    </>
  );
  return (
    <span className={base}>
      {onClick ? (
        <button type="button" onClick={onClick} className="inline-flex items-center gap-1" aria-pressed={active}>
          {content}
        </button>
      ) : (
        content
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove tag ${name}`} className="-mr-1 rounded-full p-0.5 hover:bg-line">
          <X size={12} />
        </button>
      )}
    </span>
  );
}

/** AI suggestions are visibly different from the writer's own metadata. */
export function SuggestedChip({ label, onAccept, onDismiss }: { label: string; onAccept: () => void; onDismiss: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-ai bg-ai-bg px-2 py-0.5 text-xs text-ai">
      <Sparkles size={11} aria-hidden />
      <span>{label}</span>
      <button type="button" onClick={onAccept} aria-label={`Accept suggestion ${label}`} className="rounded-full p-0.5 hover:bg-card">
        <Check size={12} />
      </button>
      <button type="button" onClick={onDismiss} aria-label={`Dismiss suggestion ${label}`} className="rounded-full p-0.5 hover:bg-card">
        <X size={12} />
      </button>
    </span>
  );
}

export function ProgressBar({ value, label, tone = 'accent' }: { value: number; label?: string; tone?: 'accent' | 'polished' }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      {label && (
        <div className="mb-1 flex justify-between text-xs text-ink-2">
          <span>{label}</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
      )}
      <div
        className="h-1.5 overflow-hidden rounded-full bg-paper-2"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={`h-full rounded-full ${tone === 'polished' ? 'bg-polished' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <p className="font-serif text-2xl text-ink">{title}</p>
      {children && <div className="mt-3 text-sm leading-relaxed text-ink-2">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { text: string; icon: ReactNode; cls: string }> = {
    saved: { text: 'Saved', icon: <Check size={13} />, cls: 'text-polished' },
    unsaved: { text: 'Unsaved changes', icon: <CloudOff size={13} />, cls: 'text-muted' },
    saving: { text: 'Saving…', icon: <Loader2 size={13} className="animate-spin" />, cls: 'text-muted' },
    error: { text: 'Could not save — retrying on next edit', icon: <AlertCircle size={13} />, cls: 'text-seed' },
  };
  const m = map[state];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${m.cls}`} role="status" aria-live="polite">
      {m.icon}
      {m.text}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center p-16 text-muted" role="status">
      <Loader2 className="animate-spin" aria-hidden />
      <span className="sr-only">Loading</span>
    </div>
  );
}
