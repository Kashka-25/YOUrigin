import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import Dexie from 'dexie';
import { YOUriginDB, SCHEMA_VERSION } from '../db/db';
import { exportBackup } from '../db/backup';
import { newId } from '../domain/text';
import { newPost } from '../posts/model';
import type { Clip, ClipInfo } from '../domain/types';
import { SYNC_TABLES } from './tracking';
import { createKeyInfo } from './crypto';
import { chunkPath, clipPass, cloudCopiesToRemove, decryptChunk, downloadClip, encryptChunk, ensureClipInfo, removeCloudCopy, UPLOAD_PAUSED_AFTER, uploadClip, uploadState, type ClipStore } from './clips';

// The test database (fake IndexedDB) can store Node's Blob but not jsdom's; browsers store either.
const JsdomBlob = globalThis.Blob;
beforeAll(() => {
  globalThis.Blob = NodeBlob as unknown as typeof Blob;
});
afterAll(() => {
  globalThis.Blob = JsdomBlob;
});

const USER = 'user-1';
const opened: YOUriginDB[] = [];

async function device(): Promise<YOUriginDB> {
  const d = new YOUriginDB(`clips-${newId()}`);
  await d.open();
  opened.push(d);
  return d;
}

afterEach(async () => {
  for (const d of opened.splice(0)) {
    d.close();
    await Dexie.delete(d.name);
  }
});

/** The server: holds whatever bytes it is given. Can be told to fail on a given call. */
class MemoryStore implements ClipStore {
  objects = new Map<string, Uint8Array>();
  puts = 0;
  gets = 0;
  failPutAt = -1;
  failGetAt = -1;
  async put(path: string, bytes: Uint8Array) {
    if (this.puts++ === this.failPutAt) throw new Error('Failed to fetch');
    this.objects.set(path, new Uint8Array(bytes));
  }
  async get(path: string) {
    if (this.gets++ === this.failGetAt) throw new Error('Failed to fetch');
    const b = this.objects.get(path);
    if (!b) throw new Error('Object not found');
    return b;
  }
  async remove(paths: string[]) {
    for (const p of paths) this.objects.delete(p);
  }
}

const KEY = (await createKeyInfo('a long test passphrase')).key;
/** Invented video bytes: 50 bytes cut into 10-byte pieces → 5 pieces. */
const BYTES = new Uint8Array(Array.from({ length: 50 }, (_, i) => (i * 7 + 3) % 256));

async function addVideo(d: YOUriginDB, bytes = BYTES, used = true): Promise<string> {
  const id = newId();
  const now = Date.now();
  const clip: Clip = { id, name: 'reel.mp4', mime: 'video/mp4', blob: new Blob([bytes], { type: 'video/mp4' }), bytes: bytes.length, width: 1080, height: 1920, duration: 12, createdAt: now, updatedAt: now };
  await d.clips.add(clip);
  await ensureClipInfo(d, id, 10);
  if (used) await d.posts.add(newPost({ media: [{ kind: 'clip', clipId: id, name: 'reel.mp4' }] }));
  return id;
}

/** What record sync would carry from one device to another. */
async function carryRecords(from: YOUriginDB, to: YOUriginDB) {
  await to.clipInfo.bulkPut(await from.clipInfo.toArray());
  await to.posts.bulkPut(await from.posts.toArray());
}

const bytesOf = async (d: YOUriginDB, id: string) => new Uint8Array(await ((await d.clips.get(id)) as Clip).blob.arrayBuffer());

describe('videos across devices', () => {
  it('a video added on the phone plays on the laptop, and the server only sees ciphertext', async () => {
    const [phone, laptop, store] = [await device(), await device(), new MemoryStore()];
    const id = await addVideo(phone);
    expect(await uploadClip(phone, store, KEY, USER, id)).toBe(true);
    expect(store.objects.size).toBe(5);
    expect([...store.objects.keys()]).toContain(chunkPath(USER, id, 4));
    expect((await phone.clipInfo.get(id))?.uploadedAt).toBeTypeOf('number');

    // nothing the server holds contains the video's bytes
    const plain = Buffer.from(BYTES.slice(0, 10)).toString('hex');
    for (const b of store.objects.values()) expect(Buffer.from(b).toString('hex')).not.toContain(plain);

    await carryRecords(phone, laptop);
    expect(await laptop.clips.get(id)).toBeUndefined();
    expect(await downloadClip(laptop, store, KEY, USER, id)).toBe(true);
    expect(await bytesOf(laptop, id)).toEqual(BYTES);
    expect(await laptop.clipChunks.count()).toBe(0);
    expect((await laptop.clips.get(id))?.name).toBe('reel.mp4');
  });

  it('an upload that drops picks up after the last piece that went up', async () => {
    const [phone, store] = [await device(), new MemoryStore()];
    const id = await addVideo(phone);
    store.failPutAt = 2;
    await expect(uploadClip(phone, store, KEY, USER, id)).rejects.toThrow();
    expect((await phone.clips.get(id))?.uploadedChunks).toBe(2);
    expect((await phone.clipInfo.get(id))?.uploadedAt).toBeNull();
    const before = store.puts;
    await uploadClip(phone, store, KEY, USER, id);
    expect(store.puts - before).toBe(3);
    expect((await phone.clipInfo.get(id))?.uploadedAt).toBeTypeOf('number');
  });

  it('how far an upload has come reaches the other devices, and shows when it stopped', async () => {
    const [phone, laptop, store] = [await device(), await device(), new MemoryStore()];
    const id = await addVideo(phone);
    store.failPutAt = 3; // the phone is put away after three pieces
    await expect(uploadClip(phone, store, KEY, USER, id)).rejects.toThrow();
    await carryRecords(phone, laptop);
    const seen = (await laptop.clipInfo.get(id)) as ClipInfo;
    expect(seen.uploadedChunks).toBe(3);
    expect(uploadState(seen, seen.updatedAt + 1000)).toEqual({ done: 3, total: 5, paused: false });
    expect(uploadState(seen, seen.updatedAt + UPLOAD_PAUSED_AFTER + 1).paused).toBe(true);

    await uploadClip(phone, store, KEY, USER, id);
    await carryRecords(phone, laptop);
    const done = (await laptop.clipInfo.get(id)) as ClipInfo;
    expect(done.uploadedChunks).toBe(5);
    expect(done.uploadedAt).toBeTypeOf('number');
  });

  it('progress never goes backwards or touches a copy that is finished or removed', async () => {
    const [phone, store] = [await device(), new MemoryStore()];
    const id = await addVideo(phone);
    // another device already finished this one and it has since been removed
    await phone.clipInfo.update(id, { removedFromCloudAt: 5, uploadedChunks: 4 });
    expect(await uploadClip(phone, store, KEY, USER, id)).toBe(false);
    expect((await phone.clipInfo.get(id))?.uploadedChunks).toBe(4);
    expect(uploadState({ chunks: 5, uploadedChunks: 9, updatedAt: 0 }, 1).done).toBe(5);
    expect(uploadState({ chunks: 5, updatedAt: 0 }, 1).done).toBe(0);
  });

  it('a download that drops keeps what arrived and fetches only the rest', async () => {
    const [phone, laptop, store] = [await device(), await device(), new MemoryStore()];
    const id = await addVideo(phone);
    await uploadClip(phone, store, KEY, USER, id);
    await carryRecords(phone, laptop);
    store.failGetAt = 3;
    await expect(downloadClip(laptop, store, KEY, USER, id)).rejects.toThrow();
    expect(await laptop.clipChunks.count()).toBe(3);
    const before = store.gets;
    await downloadClip(laptop, store, KEY, USER, id);
    expect(store.gets - before).toBe(2);
    expect(await bytesOf(laptop, id)).toEqual(BYTES);
  });

  it('pieces can’t be swapped or read with another passphrase', async () => {
    const sealed = await encryptChunk(KEY, 'v', 0, 2, BYTES.slice(0, 10).buffer);
    expect(new Uint8Array(await decryptChunk(KEY, 'v', 0, 2, sealed))).toEqual(BYTES.slice(0, 10));
    await expect(decryptChunk(KEY, 'v', 1, 2, sealed)).rejects.toThrow();
    await expect(decryptChunk(KEY, 'other', 0, 2, sealed)).rejects.toThrow();
    const other = (await createKeyInfo('a different passphrase')).key;
    await expect(decryptChunk(other, 'v', 0, 2, sealed)).rejects.toThrow();
  });

  it('a video still uploading, or whose cloud copy is gone, isn’t downloaded', async () => {
    const [phone, laptop, store] = [await device(), await device(), new MemoryStore()];
    const id = await addVideo(phone);
    await carryRecords(phone, laptop);
    expect(await downloadClip(laptop, store, KEY, USER, id)).toBe(false);
    await uploadClip(phone, store, KEY, USER, id);
    await removeCloudCopy(phone, store, USER, id);
    expect(store.objects.size).toBe(0);
    await carryRecords(phone, laptop);
    expect(await downloadClip(laptop, store, KEY, USER, id)).toBe(false);
    expect(await phone.clips.get(id)).toBeTruthy(); // the phone keeps its own copy
  });

  it('a pass uploads used videos, and downloads only when asked to', async () => {
    const [phone, laptop, store] = [await device(), await device(), new MemoryStore()];
    const used = await addVideo(phone);
    await addVideo(phone, new Uint8Array([1, 2, 3]), false);
    expect(await clipPass(phone, store, KEY, USER, { autoDownload: false, keepDays: 14 })).toMatchObject({ uploaded: 1 });
    await carryRecords(phone, laptop);
    expect(await clipPass(laptop, store, KEY, USER, { autoDownload: false, keepDays: 14 })).toMatchObject({ downloaded: 0 });
    expect(await clipPass(laptop, store, KEY, USER, { autoDownload: true, keepDays: 14 })).toMatchObject({ downloaded: 1 });
    expect(await bytesOf(laptop, used)).toEqual(BYTES);
  });

  it('cloud copies go once every post using them has been posted for a while, or nothing uses them', async () => {
    const d = await device();
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const info = (id: string, updatedAt = now): ClipInfo => ({ id, name: 'v.mp4', mime: 'video/mp4', bytes: 10, width: 1, height: 1, duration: 1, chunkSize: 10, chunks: 1, uploadedAt: now - 30 * day, removedFromCloudAt: null, createdAt: now, updatedAt });
    await d.clipInfo.bulkAdd([info('old-posted'), info('new-posted'), info('draft'), info('unused', now - 2 * day), info('unused-fresh')]);
    const clip = (id: string) => [{ kind: 'clip' as const, clipId: id, name: 'v.mp4' }];
    await d.posts.bulkAdd([
      newPost({ status: 'posted', postedAt: now - 20 * day, media: clip('old-posted') }),
      newPost({ status: 'posted', postedAt: now - 2 * day, media: clip('new-posted') }),
      newPost({ status: 'draft', media: clip('draft') }),
    ]);
    expect((await cloudCopiesToRemove(d, 14, now)).sort()).toEqual(['old-posted', 'unused']);
  });
});

describe('video records', () => {
  it('sync and are backed up; the videos themselves are not', async () => {
    expect(SYNC_TABLES).toContain('clipInfo');
    expect(SYNC_TABLES).not.toContain('clipChunks');
    const tables = Object.keys((await exportBackup()).tables);
    expect(tables).toContain('clipInfo');
    expect(tables).not.toContain('clips');
  });

  it('upgrading from version 7 keeps videos and adds the new tables', async () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(8);
    const name = `upgrade-${newId()}`;
    const old = new Dexie(name);
    old.version(70).stores({ posts: 'id, updatedAt, status, scheduledAt, world, *pieceIds', clips: 'id, updatedAt' });
    await old.open();
    await old.table('clips').add({ id: 'keep', name: 'kept.mp4', blob: new Blob([BYTES]), updatedAt: 1 });
    old.close();
    const upgraded = new YOUriginDB(name);
    await upgraded.open();
    expect((await upgraded.clips.get('keep'))?.name).toBe('kept.mp4');
    expect(await upgraded.clipInfo.count()).toBe(0);
    expect(await upgraded.clipChunks.count()).toBe(0);
    upgraded.close();
    await Dexie.delete(name);
  });
});
