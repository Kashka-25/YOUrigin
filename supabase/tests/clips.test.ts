// @vitest-environment node
//
// Runs the sync and video migrations on PGlite (real Postgres, in process) with
// Supabase-like roles, auth and storage, then checks who can reach video pieces.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const SYNC = migration('20261008000000_yourigin_sync.sql');
const CLIPS = migration('20261122120000_yourigin_clips.sql');

const ANA = '00000000-0000-0000-0000-00000000000a';
const BEN = '00000000-0000-0000-0000-00000000000b';
const ana = { id: ANA, email: 'ana@example.com' };
const ben = { id: BEN, email: 'ben@example.com' };

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant anon, authenticated, service_role to current_user;

    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to anon, authenticated, service_role;

    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    grant usage on schema storage to anon, authenticated, service_role;
    grant all on storage.objects to anon, authenticated, service_role;

    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

    insert into auth.users values ('${ANA}', 'ana@example.com'), ('${BEN}', 'ben@example.com');
  `);
  await db.exec(SYNC);
  await db.exec(CLIPS);
}, 120_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    reset role;
    delete from storage.objects;
    delete from yourigin_private.yourigin_allowed_users;
    insert into yourigin_private.yourigin_allowed_users values ('ana@example.com'), ('ben@example.com');
  `);
});

type Who = { id: string; email: string } | 'anon';

async function rows(who: Who, sql: string, params: unknown[] = []) {
  const sub = typeof who === 'object' ? who.id : '';
  const claims = typeof who === 'object' ? JSON.stringify({ sub: who.id, email: who.email }) : '{}';
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [sub, claims]);
  await db.exec(`set role ${who === 'anon' ? 'anon' : 'authenticated'}`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}

const put = (who: Who, name: string) => rows(who, `insert into storage.objects (bucket_id, name) values ('yourigin-clips', $1)`, [name]);
const names = async (who: Who) => (await rows(who, `select name from storage.objects where bucket_id = 'yourigin-clips' order by name`)).map((r) => (r as { name: string }).name);

describe('video pieces', () => {
  it('owners add and read pieces only in their own folder', async () => {
    await put(ana, `${ANA}/video-1/0`);
    await put(ana, `${ANA}/video-1/1`);
    await expect(put(ana, `${BEN}/video-1/0`)).rejects.toThrow(/row-level security/);
    await expect(put(ana, `${ANA}/0`)).rejects.toThrow(/row-level security/); // must be <account>/<video>/<piece>
    expect(await names(ana)).toEqual([`${ANA}/video-1/0`, `${ANA}/video-1/1`]);
  });

  it('another account and signed-out visitors see nothing', async () => {
    await put(ana, `${ANA}/video-1/0`);
    expect(await names(ben)).toEqual([]);
    expect(await names('anon')).toEqual([]);
    await rows(ben, `delete from storage.objects where name = $1`, [`${ANA}/video-1/0`]);
    expect(await names(ana)).toHaveLength(1);
  });

  it('adding needs the allowlist; removing your own never does', async () => {
    await put(ana, `${ANA}/video-1/0`);
    await db.exec(`delete from yourigin_private.yourigin_allowed_users where email = 'ana@example.com'`);
    await expect(put(ana, `${ANA}/video-2/0`)).rejects.toThrow(/row-level security/);
    await rows(ana, `delete from storage.objects where name = $1`, [`${ANA}/video-1/0`]);
    expect((await db.query(`select count(*)::int as n from storage.objects`)).rows[0]).toEqual({ n: 0 });
  });

  it('the bucket is private, takes only opaque bytes, and pieces are at most 5 MB', async () => {
    expect((await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'yourigin-clips'`)).rows).toEqual([
      { public: false, file_size_limit: 5242880, allowed_mime_types: ['application/octet-stream'] },
    ]);
  });

  it('running the migration again changes nothing', async () => {
    await db.exec(CLIPS);
    expect((await db.query(`select count(*)::int as n from storage.buckets where id = 'yourigin-clips'`)).rows[0]).toEqual({ n: 1 });
  });
});
