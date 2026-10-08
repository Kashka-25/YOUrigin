import Dexie, { type Table } from 'dexie';
import { Outbox } from './outbox';

// Device-local sync bookkeeping. Deliberately separate from the library
// database so it is never included in backups or synced itself.

const ENABLED_KEY = 'yourigin.sync.enabled';

let enabled = (() => {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
})();

export function isSyncEnabled(): boolean {
  return enabled;
}

export function setSyncEnabled(on: boolean): void {
  enabled = on;
  try {
    if (on) localStorage.setItem(ENABLED_KEY, '1');
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* storage unavailable */
  }
}

export const appOutbox = new Outbox('yourigin.sync.outbox');

interface KV {
  key: string;
  value: unknown;
}

class SyncStateDB extends Dexie {
  kv!: Table<KV, string>;
  constructor() {
    super('yourigin-sync');
    this.version(1).stores({ kv: 'key' });
  }
}

const stateDb = new SyncStateDB();

export interface SyncState {
  /** Non-extractable AES key derived from the passphrase. */
  cryptoKey?: CryptoKey;
  userId?: string;
  email?: string;
  cursor?: number;
  seeded?: boolean;
  lastSyncedAt?: number;
}

export async function getState<K extends keyof SyncState>(key: K): Promise<SyncState[K] | undefined> {
  return (await stateDb.kv.get(key))?.value as SyncState[K] | undefined;
}

export async function setState<K extends keyof SyncState>(key: K, value: SyncState[K]): Promise<void> {
  await stateDb.kv.put({ key, value });
}

export async function clearState(): Promise<void> {
  await stateDb.kv.clear();
}
