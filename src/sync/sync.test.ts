import { describe, expect, it } from 'vitest';
import { YOUriginDB, ensureBuiltIns } from '../db/db';
import { Outbox, type KeyValueStore } from './outbox';
import { installChangeTracking } from './tracking';
import { SyncEngine, type PushRow, type RemoteRow, type SyncTransport } from './engine';
import { createKeyInfo, unlockWithPassphrase } from './crypto';
import { newId } from '../domain/text';
import type { ContentItem, Tag } from '../domain/types';

/** In-memory stand-in for the Supabase table + push function (same LWW rule). */
class FakeServer implements SyncTransport {
  rows = new Map<string, RemoteRow>();
  private rev = 0;
  async push(rows: PushRow[]) {
    for (const r of rows) {
      const k = `${r.tbl}:${r.id}`;
      const prev = this.rows.get(k);
      if (!prev || r.updated_at > prev.updated_at) this.rows.set(k, { ...r, rev: ++this.rev });
    }
  }
  async pull(after: number, limit: number) {
    return [...this.rows.values()].filter((r) => r.rev > after).sort((a, b) => a.rev - b.rev).slice(0, limit);
  }
}

class MemStore implements KeyValueStore {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

async function device(name: string, server: FakeServer, key: CryptoKey) {
  const db = new YOUriginDB(`${name}-${newId()}`);
  const outbox = new Outbox('outbox', new MemStore());
  installChangeTracking(db, outbox, () => true);
  await db.open();
  await ensureBuiltIns(db);
  let cursor = 0;
  const engine = new SyncEngine(db, outbox, server, key, { get: async () => cursor, set: async (r) => void (cursor = r) });
  return { db, outbox, engine };
}

function piece(body: string, tagIds: string[] = [], at = Date.now()): ContentItem {
  return {
    id: newId(),
    title: '',
    body,
    type: 'poem',
    status: 'seed',
    tagIds,
    notes: '',
    source: { kind: 'capture' },
    keepUnassigned: false,
    archived: false,
    deletedAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

function tag(name: string, id = newId()): Tag {
  return { id, name, familyId: null, createdAt: 1, updatedAt: 1 };
}

describe('end-to-end encryption', () => {
  it('unlocks only with the right passphrase', async () => {
    const { key, info } = await createKeyInfo('correct horse battery');
    expect(key).toBeTruthy();
    expect(await unlockWithPassphrase('wrong passphrase', info)).toBeNull();
    expect(await unlockWithPassphrase('correct horse battery', info)).not.toBeNull();
  });

  it('never sends readable writing to the server', async () => {
    const server = new FakeServer();
    const { key } = await createKeyInfo('pass phrase one');
    const a = await device('a', server, key);
    await a.db.content.add(piece('The ocean does not ask the shore'));
    await a.engine.syncOnce();
    const stored = JSON.stringify([...server.rows.values()]);
    expect(stored).not.toContain('ocean');
    expect(stored).not.toContain('shore');
  });
});

describe('two-device sync', () => {
  it('carries captures, edits and deletes between phone and laptop', async () => {
    const server = new FakeServer();
    const { key } = await createKeyInfo('pass phrase one');
    const phone = await device('phone', server, key);
    const laptop = await device('laptop', server, key);

    const p = piece('written on the phone');
    await phone.db.content.add(p);
    await phone.engine.syncOnce();
    await laptop.engine.syncOnce();
    expect((await laptop.db.content.get(p.id))?.body).toBe('written on the phone');

    await laptop.db.content.update(p.id, { body: 'edited on the laptop', updatedAt: Date.now() + 5 });
    await laptop.engine.syncOnce();
    await phone.engine.syncOnce();
    expect((await phone.db.content.get(p.id))?.body).toBe('edited on the laptop');

    await phone.db.content.delete(p.id);
    await phone.engine.syncOnce();
    await laptop.engine.syncOnce();
    expect(await laptop.db.content.get(p.id)).toBeUndefined();

    // Applying remote changes must not queue them to be pushed back.
    expect(laptop.outbox.size).toBe(0);
  });

  it('tracks deletes done through queries (e.g. removing a book)', async () => {
    const server = new FakeServer();
    const { key } = await createKeyInfo('pass phrase one');
    const a = await device('a', server, key);
    const b = await device('b', server, key);
    const bookId = newId();
    await a.db.sections.bulkAdd([
      { id: newId(), bookId, title: 'One', order: 0, notes: '', createdAt: 1, updatedAt: 1 },
      { id: newId(), bookId, title: 'Two', order: 1, notes: '', createdAt: 1, updatedAt: 1 },
    ]);
    await a.engine.syncOnce();
    await b.engine.syncOnce();
    expect(await b.db.sections.where('bookId').equals(bookId).count()).toBe(2);
    await a.db.sections.where('bookId').equals(bookId).delete();
    await a.engine.syncOnce();
    await b.engine.syncOnce();
    expect(await b.db.sections.where('bookId').equals(bookId).count()).toBe(0);
  });

  it('keeps the newer version when both devices edited offline', async () => {
    const server = new FakeServer();
    const { key } = await createKeyInfo('pass phrase one');
    const a = await device('a', server, key);
    const b = await device('b', server, key);
    const p = piece('original');
    await a.db.content.add(p);
    await a.engine.syncOnce();
    await b.engine.syncOnce();

    await a.db.content.update(p.id, { body: 'A edit (earlier)' });
    await new Promise((r) => setTimeout(r, 5));
    await b.db.content.update(p.id, { body: 'B edit (later)' });
    await a.engine.syncOnce();
    await b.engine.syncOnce();
    await a.engine.syncOnce();
    expect((await a.db.content.get(p.id))?.body).toBe('B edit (later)');
    expect((await b.db.content.get(p.id))?.body).toBe('B edit (later)');
  });

  it('saves the losing offline edit to History instead of losing it', async () => {
    const server = new FakeServer();
    const { key } = await createKeyInfo('pass phrase one');
    const a = await device('a', server, key);
    const b = await device('b', server, key);
    const p = piece('original');
    await a.db.content.add(p);
    await a.engine.syncOnce();
    await b.engine.syncOnce();

    await a.db.content.update(p.id, { body: 'my phone wording' }); // not yet synced
    await new Promise((r) => setTimeout(r, 5));
    await b.db.content.update(p.id, { body: 'my laptop wording' });
    await b.engine.syncOnce();
    await a.engine.syncOnce();

    expect((await a.db.content.get(p.id))?.body).toBe('my laptop wording');
    const history = await a.db.revisions.where('contentId').equals(p.id).toArray();
    expect(history.map((h) => h.body)).toContain('my phone wording');
  });

  it('merges a tag created separately on each device', async () => {
    const server = new FakeServer();
    const { key } = await createKeyInfo('pass phrase one');
    const a = await device('a', server, key);
    const b = await device('b', server, key);
    const [lowId, highId] = [newId(), newId()].sort();
    await a.db.tags.add(tag('water', lowId));
    await b.db.tags.add(tag('water', highId));
    const pa = piece('from a', [lowId]);
    const pb = piece('from b', [highId]);
    await a.db.content.add(pa);
    await b.db.content.add(pb);

    for (let i = 0; i < 3; i++) {
      await a.engine.syncOnce();
      await b.engine.syncOnce();
    }
    for (const d of [a, b]) {
      const waters = await d.db.tags.where('name').equals('water').toArray();
      expect(waters.map((t) => t.id)).toEqual([lowId]);
      expect((await d.db.content.get(pa.id))?.tagIds).toEqual([lowId]);
      expect((await d.db.content.get(pb.id))?.tagIds).toEqual([lowId]);
    }
  });

  it('first sync on a second device merges both libraries without losing anything', async () => {
    const server = new FakeServer();
    const { key } = await createKeyInfo('pass phrase one');
    const laptop = await device('laptop', server, key);
    const phone = await device('phone', server, key);
    const l = piece('laptop poem', [], 1000);
    const ph = piece('phone poem', [], 2000);
    await laptop.db.content.add(l);
    await phone.db.content.add(ph);
    laptop.outbox.clear();
    phone.outbox.clear();
    await laptop.engine.seed();
    await phone.engine.seed();
    await laptop.engine.syncOnce();
    await phone.engine.syncOnce();
    await laptop.engine.syncOnce();
    for (const d of [laptop, phone]) {
      expect((await d.db.content.toArray()).map((c) => c.body).sort()).toEqual(['laptop poem', 'phone poem']);
      expect(await d.db.templates.count()).toBeGreaterThanOrEqual(6);
    }
  });
});
