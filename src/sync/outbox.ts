/**
 * The set of local records changed since they were last pushed. Kept in
 * localStorage because it is written synchronously, so a change is never
 * forgotten even if the app is closed straight after an edit.
 * Only keys are stored — the current value is read at push time.
 */
export interface OutboxEntry {
  tbl: string;
  id: string;
  /** Local time of the change (ms) — the last-write-wins timestamp. */
  at: number;
}

type Listener = () => void;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class Outbox {
  private entries: Map<string, OutboxEntry>;
  private listeners = new Set<Listener>();

  constructor(
    private storageKey: string,
    private store: KeyValueStore | null = typeof localStorage !== 'undefined' ? localStorage : null,
  ) {
    this.entries = new Map();
    try {
      const raw = this.store?.getItem(storageKey);
      if (raw) for (const e of JSON.parse(raw) as OutboxEntry[]) this.entries.set(keyOf(e.tbl, e.id), e);
    } catch {
      /* corrupt or unavailable: start empty */
    }
  }

  get size(): number {
    return this.entries.size;
  }

  mark(tbl: string, ids: string[], at: number): void {
    if (!ids.length) return;
    for (const id of ids) {
      const k = keyOf(tbl, id);
      const prev = this.entries.get(k);
      if (!prev || prev.at <= at) this.entries.set(k, { tbl, id, at });
    }
    this.persist();
  }

  get(tbl: string, id: string): OutboxEntry | undefined {
    return this.entries.get(keyOf(tbl, id));
  }

  snapshot(): OutboxEntry[] {
    return [...this.entries.values()];
  }

  /** Remove entries that were pushed — unless they changed again meanwhile. */
  settle(pushed: OutboxEntry[]): void {
    for (const e of pushed) {
      const k = keyOf(e.tbl, e.id);
      if (this.entries.get(k)?.at === e.at) this.entries.delete(k);
    }
    this.persist();
  }

  /** A newer remote version replaced the local one; nothing left to push. */
  drop(tbl: string, id: string): void {
    if (this.entries.delete(keyOf(tbl, id))) this.persist();
  }

  clear(): void {
    this.entries.clear();
    this.persist();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist() {
    try {
      this.store?.setItem(this.storageKey, JSON.stringify([...this.entries.values()]));
    } catch (e) {
      console.warn('[YOUrigin] Could not persist sync outbox', e);
    }
    this.listeners.forEach((l) => l());
  }
}

function keyOf(tbl: string, id: string) {
  return `${tbl}\u0000${id}`;
}
