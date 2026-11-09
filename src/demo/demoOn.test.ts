import { afterAll, describe, expect, it, vi } from 'vitest';

// Load the app's modules as they are when opened with ?demo in the address.
window.history.replaceState(null, '', '/?demo#/');
vi.resetModules();
const mode = await import('./mode');
const { db, ensureBuiltIns } = await import('../db/db');
const { getClient } = await import('../sync/supabase');
const { isSyncEnabled, setSyncEnabled, appOutbox } = await import('../sync/runtime');
const { isSignedIn } = await import('../sync/buildNotes');
const { providerFor } = await import('../ai');
const { startDemo, resetDemo } = await import('./state');

afterAll(async () => {
  await db.delete();
  window.history.replaceState(null, '', '/');
});

describe('with ?demo', () => {
  it('uses its own database, never the real one', () => {
    expect(mode.DEMO).toBe(true);
    expect(db.name).toBe('yourigin-demo');
  });

  it('never reaches a server: no client, no sync, no sign-in, no Claude', async () => {
    await expect(getClient()).rejects.toThrow(/Not available in the demo/);
    localStorage.setItem('yourigin.sync.enabled', '1'); // even when the real app has sync on
    expect(isSyncEnabled()).toBe(false);
    setSyncEnabled(true);
    expect(isSyncEnabled()).toBe(false);
    expect(await isSignedIn()).toBe(false);
    expect(providerFor({ aiProvider: 'claude', claudeApiKey: 'sk-test', claudeModel: 'x' }).id).toBe('local');
    localStorage.removeItem('yourigin.sync.enabled');
  });

  it('starts as the example person, records nothing for sync, and resets to empty', async () => {
    await ensureBuiltIns();
    const before = appOutbox.size;
    await startDemo('example');
    expect(await db.projects.count()).toBe(7);
    expect((await db.settings.get('demo'))?.value).toBe('example');
    expect(appOutbox.size).toBe(before); // demo writes are never queued for sync
    await resetDemo();
    expect(await db.content.count()).toBe(0);
    expect(await db.settings.get('demo')).toBeUndefined();
  });

  it('can start blank', async () => {
    await startDemo('blank');
    expect(await db.content.count()).toBe(0);
    expect((await db.settings.get('demo'))?.value).toBe('blank');
  });
});
