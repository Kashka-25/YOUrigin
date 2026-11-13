import type { ReactNode } from 'react';
import { Sparkles, X, Check, CloudOff, Loader2, AlertCircle } from 'lucide-react';
import type { ContentType, Status } from '../domain/types';
import { CONTENT_TYPES, STATUSES, STATUS_META, TYPE_LABEL } from '../domain/constants';
import type { SaveState } from '../hooks/useAutosave';

const STATUS_CLASSES: Record<Status, { dot: string; ring: string }> = {
  none: { dot: 'border border-muted bg-transparent', ring: 'ring-ink-2' },
  seed: { dot: 'bg-seed', ring: 'ring-seed' },
  developing: { dot: 'bg-developing', ring: 'ring-developing' },
  polished: { dot: 'bg-polished', ring: 'ring-polished' },
};

/** A traffic-light dot for a piece's status; nothing at all when it has none. */
export function StatusBadge({ status }: { status: Status; compact?: boolean }) {
  if (status === 'none') return null;
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center" title={meta.meaning}>
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${STATUS_CLASSES[status].dot}`} />
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}

/** Pick a traffic light: no colour, red, amber or green. Dots only; names are for screen readers and tooltips. */
export function StatusPicker({
  value,
  onChange,
  size = 'md',
  label = 'Traffic light',
}: {
  value: Status;
  onChange: (s: Status) => void;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const box = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  const dot = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex items-center gap-1">
      {STATUSES.map((s) => {
        const active = s === value;
        const meta = STATUS_META[s];
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={meta.label}
            title={meta.meaning}
            onClick={() => onChange(s)}
            className={`inline-flex ${box} items-center justify-center rounded-full transition-colors hover:bg-paper-2 ${active ? `ring-2 ring-offset-2 ring-offset-card ${STATUS_CLASSES[s].ring}` : ''}`}
          >
            <span aria-hidden className={`${dot} rounded-full ${STATUS_CLASSES[s].dot} ${active ? '' : 'opacity-70'}`} />
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
