// @vitest-environment node
//
// Runs the sync and portfolio migrations on PGlite (real Postgres, in
// process) with Supabase-like roles, default privileges, auth and storage,
// then checks every access rule as an owner, another account, a signed-out
// visitor and the Edge Function's service role.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { portfolioFilePrefix } from '../functions/yourigin-portfolio/wire.ts';

const migration = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const SYNC = migration('20261008000000_yourigin_sync.sql');
const PORTFOLIOS = migration('20261107120000_yourigin_portfolios.sql');

const ANA = '00000000-0000-0000-0000-00000000000a';
const BEN = '00000000-0000-0000-0000-00000000000b';
const ana = { id: ANA, email: 'ana@example.com' };
const ben = { id: BEN, email: 'ben@example.com' };

let db: PGlite;

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    grant anon, authenticated, service_role to current_user;

    create schema extensions;
    create extension pgcrypto schema extensions;
    grant usage on schema extensions to anon, authenticated, service_role;

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

    -- Supabase's defaults: the API roles get everything new in public unless revoked.
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

    insert into auth.users values ('${ANA}', 'ana@example.com'), ('${BEN}', 'ben@example.com');
  `);
  await db.exec(SYNC);
  await db.exec(PORTFOLIOS);
  await db.exec(`grant all on all tables in schema public to service_role;`);
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    reset role;
    delete from public.yourigin_portfolios;
    delete from storage.objects;
    delete from yourigin_private.yourigin_allowed_users;
    insert into yourigin_private.yourigin_allowed_users values ('ana@example.com');
  `);
});

type Who = { id: string; email: string } | 'anon' | 'service';

async function as<T>(who: Who, fn: () => Promise<T>): Promise<T> {
  const sub = typeof who === 'object' ? who.id : '';
  const claims = typeof who === 'object' ? JSON.stringify({ sub: who.id, email: who.email }) : '{}';
  const role = who === 'anon' ? 'anon' : who === 'service' ? 'service_role' : 'authenticated';
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [sub, claims]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

async function rows<T = Record<string, unknown>>(who: Who, sql: string, params: unknown[] = []): Promise<T[]> {
  return as(who, async () => (await db.query<T>(sql, params)).rows);
}

async function call(who: Who, fn: string, args: unknown[]) {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ');
  const [r] = await rows<{ result: Record<string, unknown> }>(who, `select public.${fn}(${ph}) as result`, args);
  return r.result;
}

const SNAP = { version: 1, title: 'Selected work', sections: [] };

function publish(who: Who, opts: { local?: string; visibility?: string; expires?: string | null; password?: string | null } = {}) {
  return call(who, 'yourigin_publish_portfolio', [opts.local ?? 'local-1', JSON.stringify(SNAP), opts.visibility ?? 'unlisted', opts.expires ?? null, opts.password ?? null]);
}

async function hashOf(id: unknown): Promise<{ password_hash: string | null; password_version: number }> {
  return (await db.query<{ password_hash: string | null; password_version: number }>('select password_hash, password_version from public.yourigin_portfolios where id = $1', [id])).rows[0];
}

describe('publishing', () => {
  it('an allowlisted account publishes with an unguessable link, live and unlisted', async () => {
    const r = await publish(ana);
    expect(r).toMatchObject({ local_id: 'local-1', status: 'live', visibility: 'unlisted', password_set: false });
    expect(String(r.share_token)).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });

  it('publishing again updates the same row and keeps the link', async () => {
    const a = await publish(ana);
    const b = await publish(ana, { visibility: 'public' });
    expect(b.id).toBe(a.id);
    expect(b.share_token).toBe(a.share_token);
    expect(b.visibility).toBe('public');
  });

  it('accounts not on the allowlist can’t publish', async () => {
    await expect(publish(ben)).rejects.toThrow(/not allowed/);
  });

  it('signed-out visitors can’t publish or read anything', async () => {
    await publish(ana);
    await expect(publish('anon')).rejects.toThrow(/permission denied/);
    await expect(rows('anon', 'select id from public.yourigin_portfolios')).rejects.toThrow(/permission denied/);
    await expect(rows('anon', 'select * from public.yourigin_portfolio_attempts')).rejects.toThrow(/permission denied/);
  });

  it('refuses an end date in the past, and caps each account at 20', async () => {
    await expect(publish(ana, { expires: '2000-01-01T00:00:00Z' })).rejects.toThrow(/already passed/);
    for (let i = 0; i < 20; i++) await publish(ana, { local: `p${i}` });
    await expect(publish(ana, { local: 'p20' })).rejects.toThrow(/up to 20/);
  });
});

describe('owners and other accounts', () => {
  it('owners read their own rows, but never the password hash, and can’t write directly', async () => {
    const r = await publish(ana, { visibility: 'password', password: 'correct horse' });
    expect(await rows(ana, 'select id, share_token from public.yourigin_portfolios')).toHaveLength(1);
    await expect(rows(ana, 'select password_hash from public.yourigin_portfolios')).rejects.toThrow(/permission denied/);
    await expect(rows(ana, 'select * from public.yourigin_portfolios')).rejects.toThrow(/permission denied/);
    await expect(rows(ana, `update public.yourigin_portfolios set status = 'live' where id = $1`, [r.id])).rejects.toThrow(/permission denied/);
    await expect(rows(ana, `delete from public.yourigin_portfolios where id = $1`, [r.id])).rejects.toThrow(/permission denied/);
    await expect(rows(ana, `insert into public.yourigin_portfolios (local_id, share_token, visibility, snapshot) values ('x', 'aaaaaaaaaaaaaaaaaaaaaaaa', 'public', '{}')`)).rejects.toThrow(/permission denied/);
  });

  it('another account sees nothing and can’t change someone else’s portfolio', async () => {
    const r = await publish(ana);
    await db.exec(`insert into yourigin_private.yourigin_allowed_users values ('ben@example.com')`);
    expect(await rows(ben, 'select id from public.yourigin_portfolios')).toEqual([]);
    for (const [fn, args] of [
      ['yourigin_set_portfolio_status', [r.id, 'disabled']],
      ['yourigin_rotate_portfolio_link', [r.id]],
      ['yourigin_set_portfolio_expiry', [r.id, null]],
      ['yourigin_unpublish_portfolio', [r.id]],
    ] as const) {
      await expect(call(ben, fn, [...args])).rejects.toThrow(/No such portfolio/);
    }
  });
});

describe('revoking access', () => {
  it('a new link replaces the old one', async () => {
    const r = await publish(ana);
    const n = await call(ana, 'yourigin_rotate_portfolio_link', [r.id]);
    expect(n.share_token).not.toBe(r.share_token);
    expect(await rows('service', 'select id from public.yourigin_portfolios where share_token = $1', [r.share_token])).toEqual([]);
  });

  it('turning off, ending and unpublishing work even after leaving the allowlist; turning back on doesn’t', async () => {
    const r = await publish(ana);
    await db.exec(`delete from yourigin_private.yourigin_allowed_users`);
    expect((await call(ana, 'yourigin_set_portfolio_status', [r.id, 'disabled'])).status).toBe('disabled');
    await expect(call(ana, 'yourigin_set_portfolio_status', [r.id, 'live'])).rejects.toThrow(/not allowed/);
    expect((await call(ana, 'yourigin_set_portfolio_expiry', [r.id, new Date().toISOString()])).expires_at).toBeTruthy();
    await expect(call(ana, 'yourigin_set_portfolio_expiry', [r.id, null])).rejects.toThrow(/not allowed/);
    await call(ana, 'yourigin_rotate_portfolio_link', [r.id]);
    await call(ana, 'yourigin_unpublish_portfolio', [r.id]);
    expect(await rows('service', 'select id from public.yourigin_portfolios')).toEqual([]);
  });

  it('re-publishing keeps a turned-off portfolio off', async () => {
    const r = await publish(ana);
    await call(ana, 'yourigin_set_portfolio_status', [r.id, 'disabled']);
    expect((await publish(ana)).status).toBe('disabled');
  });
});

describe('passwords', () => {
  it('are stored only as bcrypt hashes, and each change moves the password version on', async () => {
    await expect(publish(ana, { visibility: 'password' })).rejects.toThrow(/Choose a password/);
    await expect(publish(ana, { visibility: 'password', password: 'short' })).rejects.toThrow(/8 to 200/);
    const r = await publish(ana, { visibility: 'password', password: 'correct horse' });
    let h = await hashOf(r.id);
    expect(h.password_hash).toMatch(/^\$2[aby]\$10\$/);
    expect(h.password_hash).not.toContain('correct horse');
    expect(h.password_version).toBe(0);

    await publish(ana, { visibility: 'password' }); // keeps the password
    expect((await hashOf(r.id)).password_version).toBe(0);
    await publish(ana, { visibility: 'password', password: 'battery staple' });
    expect((await hashOf(r.id)).password_version).toBe(1);
    await publish(ana, { visibility: 'unlisted' });
    h = await hashOf(r.id);
    expect(h).toEqual({ password_hash: null, password_version: 2 });
  });

  it('are checked inside the database, only by the service role, and lock after repeated wrong tries', async () => {
    const r = await publish(ana, { visibility: 'password', password: 'correct horse' });
    await expect(call(ana, 'yourigin_portfolio_try_password', [r.id, 'correct horse', 'c1'])).rejects.toThrow(/permission denied/);
    await expect(call('anon', 'yourigin_portfolio_try_password', [r.id, 'correct horse', 'c1'])).rejects.toThrow(/permission denied/);
    expect(await call('service', 'yourigin_portfolio_try_password', [r.id, 'correct horse', 'c1'])).toBe('ok');
    for (let i = 0; i < 8; i++) expect(await call('service', 'yourigin_portfolio_try_password', [r.id, 'guess', 'c1'])).toBe('wrong');
    expect(await call('service', 'yourigin_portfolio_try_password', [r.id, 'correct horse', 'c1'])).toBe('locked');
    // Another visitor isn't locked out by someone else's guessing.
    expect(await call('service', 'yourigin_portfolio_try_password', [r.id, 'correct horse', 'c2'])).toBe('ok');
  });

  it('views are counted anonymously, by the service role only', async () => {
    const r = await publish(ana);
    await expect(call(ana, 'yourigin_portfolio_note_view', [r.id])).rejects.toThrow(/permission denied/);
    await call('service', 'yourigin_portfolio_note_view', [r.id]);
    expect(await rows(ana, 'select view_count from public.yourigin_portfolios')).toEqual([{ view_count: 1 }]);
  });
});

describe('pictures', () => {
  const put = (who: Who, name: string) => rows(who, `insert into storage.objects (bucket_id, name) values ('portfolios', $1)`, [name]);
  let ANA_DIR: string;
  let BEN_DIR: string;
  beforeAll(async () => {
    ANA_DIR = await portfolioFilePrefix(ANA, 'local-1');
    BEN_DIR = await portfolioFilePrefix(BEN, 'local-1');
  });

  it('folders are a one-way hash the app and database agree on, with no account id in them', async () => {
    const [r] = await rows<{ f: string }>(ana, `select yourigin_private.portfolio_folder('local-1') as f`);
    expect(`${r.f}/local-1/`).toBe(ANA_DIR);
    expect(ANA_DIR).not.toContain(ANA);
    expect(ANA_DIR).not.toBe(await portfolioFilePrefix(ANA, 'local-2'));
  });

  it('owners manage only their own folder, and nobody else can read it', async () => {
    await put(ana, `${ANA_DIR}a.webp`);
    await expect(put(ana, `${BEN_DIR}a.webp`)).rejects.toThrow(/row-level security/);
    await expect(put(ana, `${ANA}/local-1/a.webp`)).rejects.toThrow(/row-level security/);
    await expect(put(ana, `${ANA_DIR}deeper/a.webp`)).rejects.toThrow(/row-level security/);
    expect(await rows(ana, `select name from storage.objects where bucket_id = 'portfolios'`)).toHaveLength(1);
    expect(await rows(ben, `select name from storage.objects where bucket_id = 'portfolios'`)).toEqual([]);
    expect(await rows('anon', `select name from storage.objects where bucket_id = 'portfolios'`)).toEqual([]);
  });

  it('adding needs the allowlist, removing never does', async () => {
    await put(ana, `${ANA_DIR}a.webp`);
    await expect(put(ben, `${BEN_DIR}a.webp`)).rejects.toThrow(/row-level security/);
    await db.exec(`delete from yourigin_private.yourigin_allowed_users`);
    await rows(ana, `delete from storage.objects where name = $1`, [`${ANA_DIR}a.webp`]);
    expect(await rows('service', `select name from storage.objects`)).toEqual([]);
  });

  it('the bucket is private with a size and type limit', async () => {
    expect((await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'portfolios'`)).rows).toEqual([
      { public: false, file_size_limit: 2097152, allowed_mime_types: ['image/webp', 'image/jpeg', 'image/png'] },
    ]);
  });
});

describe('separation', () => {
  it('the migration never touches YOU’s Showcase or other YOU tables', () => {
    const code = PORTFOLIOS.replace(/--.*$/gm, '');
    expect(code).not.toMatch(/showcase|artist_profiles|public\.profiles/i);
    const tables = [...code.matchAll(/create table if not exists (\S+)/g)].map((m) => m[1]);
    expect(tables).toEqual(['public.yourigin_portfolios', 'public.yourigin_portfolio_attempts']);
  });
});
