import { useSyncExternalStore } from 'react';
import { db } from '../db/db';
import { createKeyInfo, unlockWithPassphrase } from './crypto';
import { SyncEngine } from './engine';
import { appOutbox, clearState, getState, isSyncEnabled, setState, setSyncEnabled } from './runtime';
import { fetchKeyInfo, getClient, saveKeyInfo, SupabaseTransport } from './supabase';

export type SyncPhase =
  | 'off' // not set up on this device
  | 'checking'
  | 'needs-passphrase' // signed in; this account already has a passphrase
  | 'new-passphrase' // signed in; first device — choose a passphrase
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  email?: string;
  lastSyncedAt?: number;
  error?: string;
  pending: number;
}

let status: SyncStatus = { phase: isSyncEnabled() ? 'checking' : 'off', pending: appOutbox.size };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch, pending: appOutbox.size };
  listeners.forEach((l) => l());
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
  );
}

let engine: SyncEngine | null = null;
let running: Promise<void> | null = null;
let rerun = false;
let debounce: ReturnType<typeof setTimeout> | null = null;
let started = false;

async function buildEngine(key: CryptoKey): Promise<SyncEngine> {
  const client = await getClient();
  return new SyncEngine(db, appOutbox, new SupabaseTransport(client), key, {
    get: async () => (await getState('cursor')) ?? 0,
    set: (rev) => setState('cursor', rev),
  });
}

/** Called once at app start. Does nothing (and loads nothing) unless sync is set up here. */
export async function startSync(): Promise<void> {
  if (started) return;
  started = true;
  appOutbox.subscribe(() => {
    setStatus({});
    scheduleSync(3000);
  });
  window.addEventListener('online', () => scheduleSync(500));
  window.addEventListener('offline', () => engine && setStatus({ phase: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(500);
    else if (appOutbox.size) void syncNow(); // best effort before the app is backgrounded
  });
  setInterval(() => document.visibilityState === 'visible' && scheduleSync(0), 60_000);

  if (!isSyncEnabled()) return;
  const key = await getState('cryptoKey');
  if (!key) {
    setSyncEnabled(false);
    setStatus({ phase: 'off' });
    return;
  }
  engine = await buildEngine(key);
  setStatus({ phase: 'idle', email: await getState('email'), lastSyncedAt: await getState('lastSyncedAt') });
  scheduleSync(0);
}

export function scheduleSync(delay: number): void {
  if (!engine) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void syncNow(), delay);
}

export async function syncNow(): Promise<void> {
  if (!engine) return;
  if (running) {
    rerun = true;
    return running;
  }
  if (!navigator.onLine) {
    setStatus({ phase: 'offline' });
    return;
  }
  running = (async () => {
    setStatus({ phase: 'syncing', error: undefined });
    try {
      if (!(await getState('seeded'))) {
        await engine!.seed();
        await setState('seeded', true);
      }
      await engine!.syncOnce();
      const now = Date.now();
      await setState('lastSyncedAt', now);
      setStatus({ phase: 'idle', lastSyncedAt: now });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setStatus(navigator.onLine ? { phase: 'error', error: friendly(message) } : { phase: 'offline' });
    } finally {
      running = null;
    }
  })();
  await running;
  if (rerun) {
    rerun = false;
    scheduleSync(1000);
  }
}

function friendly(message: string): string {
  if (/JWT|session|refresh token|401/i.test(message)) return 'Your sign-in has expired. Sign in again to keep syncing.';
  if (/not allowed/i.test(message)) return 'This account is not allowed to use YOUrigin sync.';
  if (/OperationError|decrypt/i.test(message)) return 'Could not decrypt synced data — was a different passphrase used on another device?';
  if (/Failed to fetch|NetworkError|network/i.test(message)) return 'Could not reach the sync server. It will try again shortly.';
  return message;
}

// ---- set-up flow (Settings) ---------------------------------------------

export async function signIn(email: string, password: string): Promise<void> {
  setStatus({ phase: 'checking', error: undefined });
  try {
    const client = await getClient();
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message);
    const user = data.user!;
    const previousUser = await getState('userId');
    if (previousUser && previousUser !== user.id) {
      // A different account than before: start this device's sync fresh.
      await clearState();
      appOutbox.clear();
    }
    await setState('userId', user.id);
    await setState('email', user.email ?? email);
    const existingKey = await getState('cryptoKey');
    if (existingKey) {
      await enable(existingKey, user.email ?? email);
      return;
    }
    const info = await fetchKeyInfo(client);
    setStatus({ phase: info ? 'needs-passphrase' : 'new-passphrase', email: user.email ?? email });
  } catch (e) {
    setStatus({ phase: 'off', error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

export async function createPassphrase(passphrase: string): Promise<void> {
  const client = await getClient();
  const { key, info } = await createKeyInfo(passphrase);
  await saveKeyInfo(client, info);
  await enable(key, status.email);
}

/** Returns false if the passphrase is wrong. */
export async function unlock(passphrase: string): Promise<boolean> {
  const client = await getClient();
  const info = await fetchKeyInfo(client);
  if (!info) throw new Error('No sync passphrase found for this account.');
  const key = await unlockWithPassphrase(passphrase, info);
  if (!key) return false;
  await enable(key, status.email);
  return true;
}

async function enable(key: CryptoKey, email?: string) {
  await setState('cryptoKey', key);
  setSyncEnabled(true);
  engine = await buildEngine(key);
  setStatus({ phase: 'idle', email, error: undefined });
  void syncNow();
}

/** Stop syncing on this device. Everything already here stays here. */
export async function stopSync(): Promise<void> {
  if (debounce) clearTimeout(debounce);
  engine = null;
  setSyncEnabled(false);
  appOutbox.clear();
  await clearState();
  try {
    const client = await getClient();
    await client.auth.signOut({ scope: 'local' });
  } catch {
    /* offline: the local session is still cleared */
  }
  setStatus({ phase: 'off', email: undefined, lastSyncedAt: undefined, error: undefined });
}

/** Pull and re-send everything (repairs a device that seems out of step). */
export async function resyncEverything(): Promise<void> {
  await setState('cursor', 0);
  await setState('seeded', false);
  await syncNow();
}

export async function cancelSetup(): Promise<void> {
  await stopSync();
}
