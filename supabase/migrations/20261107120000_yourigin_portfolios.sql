-- YOUrigin Portfolios: published copies of portfolios, for visitors without an account.
--
-- Applied to the shared "YOU" Supabase project, like the sync migration.
-- Everything is prefixed yourigin_ / lives in yourigin_private, and nothing
-- here reads or writes YOU's tables (Showcase included).
--
--   yourigin_portfolios         one row per published portfolio: the snapshot a
--                               visitor sees, its link token, visibility, status,
--                               optional end date and bcrypt password hash.
--   yourigin_portfolio_attempts failed password tries, to slow guessing. Only a
--                               scrambled client fingerprint is kept, for a day.
--   storage bucket "portfolios" display copies of pictures, private; owners
--                               manage their own (hashed) folders; visitors only
--                               get short-lived signed links from the Edge Function.
--
-- Clients can't write these tables directly: every change goes through the
-- functions below, which check the caller owns the row. Publishing (and
-- turning a portfolio back on) needs the YOUrigin allowlist; turning a
-- portfolio off, ending its link, replacing the link or unpublishing never
-- does, so access can always be revoked. Visitors have no access at all; the
-- `yourigin-portfolio` Edge Function reads with the service role and never
-- sees password hashes (passwords are checked inside the database).
--
-- Needs pgcrypto in the "extensions" schema (enabled on Supabase by default)
-- and the sync migration (yourigin_private.is_allowed). Additive only.

-- ── tables ──────────────────────────────────────────────────────────────
create table if not exists public.yourigin_portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The portfolio's id on the owner's devices; publishing again updates this row.
  local_id text not null check (char_length(local_id) between 1 and 64),
  -- The secret part of the link: 144 random bits, base64url.
  share_token text not null unique check (share_token ~ '^[A-Za-z0-9_-]{24}$'),
  status text not null default 'live' check (status in ('live', 'disabled')),
  visibility text not null check (visibility in ('unlisted', 'password', 'public')),
  password_hash text,
  -- Changes whenever the password is set, changed or removed, so earlier access passes stop working.
  password_version integer not null default 0,
  expires_at timestamptz,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  view_count bigint not null default 0,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_id),
  constraint yourigin_portfolios_password_iff_protected check ((visibility = 'password') = (password_hash is not null))
);
alter table public.yourigin_portfolios enable row level security;

create table if not exists public.yourigin_portfolio_attempts (
  portfolio_id uuid not null references public.yourigin_portfolios (id) on delete cascade,
  client text not null check (char_length(client) <= 128),
  attempted_at timestamptz not null default now()
);
create index if not exists yourigin_portfolio_attempts_recent on public.yourigin_portfolio_attempts (portfolio_id, attempted_at);
alter table public.yourigin_portfolio_attempts enable row level security;

-- Owners can read their own rows (never the password hash). No direct writes.
revoke all on public.yourigin_portfolios, public.yourigin_portfolio_attempts from anon, authenticated;
grant select (id, local_id, share_token, status, visibility, password_version, expires_at, view_count, published_at, updated_at)
  on public.yourigin_portfolios to authenticated;
drop policy if exists "yourigin portfolios: owner reads" on public.yourigin_portfolios;
create policy "yourigin portfolios: owner reads" on public.yourigin_portfolios
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "No direct client access" on public.yourigin_portfolio_attempts;
create policy "No direct client access" on public.yourigin_portfolio_attempts
  for all to anon, authenticated using (false) with check (false);

-- ── helpers ─────────────────────────────────────────────────────────────
create or replace function yourigin_private.new_share_token() returns text
language sql volatile set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
$$;
revoke all on function yourigin_private.new_share_token() from public, anon, authenticated;

-- The caller's portfolio, or an error. Locks the row for the change.
create or replace function yourigin_private.own_portfolio(p_id uuid) returns public.yourigin_portfolios
language plpgsql security definer set search_path = ''
as $$
declare
  r public.yourigin_portfolios;
begin
  select * into r from public.yourigin_portfolios where id = p_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'No such portfolio' using errcode = 'P0002';
  end if;
  return r;
end
$$;
revoke all on function yourigin_private.own_portfolio(uuid) from public, anon, authenticated;

create or replace function yourigin_private.portfolio_result(r public.yourigin_portfolios) returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'local_id', r.local_id, 'share_token', r.share_token, 'status', r.status,
    'visibility', r.visibility, 'password_set', r.password_hash is not null,
    'expires_at', r.expires_at, 'published_at', r.published_at, 'view_count', r.view_count
  );
$$;
revoke all on function yourigin_private.portfolio_result(public.yourigin_portfolios) from public, anon, authenticated;

-- ── owner functions ─────────────────────────────────────────────────────
-- Publishes a portfolio, or replaces what an already published one shows.
-- p_password: a new password (visibility 'password' only); null keeps the
-- current one. A disabled portfolio stays disabled; its link stays the same.
create or replace function public.yourigin_publish_portfolio(
  p_local_id text,
  p_snapshot jsonb,
  p_visibility text,
  p_expires_at timestamptz default null,
  p_password text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.yourigin_portfolios;
  new_hash text;
begin
  if uid is null then
    raise exception 'Sign in to publish' using errcode = '42501';
  end if;
  if not yourigin_private.is_allowed() then
    raise exception 'This account is not allowed to publish portfolios yet' using errcode = '42501';
  end if;
  if p_visibility not in ('unlisted', 'password', 'public') then
    raise exception 'Unknown visibility %', p_visibility using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'The end date has already passed' using errcode = '22023';
  end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object' or octet_length(p_snapshot::text) > 2000000 then
    raise exception 'This portfolio is too large to publish' using errcode = '22023';
  end if;
  if p_password is not null and (char_length(p_password) < 8 or char_length(p_password) > 200) then
    raise exception 'Passwords need 8 to 200 characters' using errcode = '22023';
  end if;

  select * into r from public.yourigin_portfolios where user_id = uid and local_id = p_local_id for update;

  new_hash := case
    when p_visibility <> 'password' then null
    when p_password is not null then extensions.crypt(p_password, extensions.gen_salt('bf', 10))
    else r.password_hash
  end;
  if p_visibility = 'password' and new_hash is null then
    raise exception 'Choose a password' using errcode = '22023';
  end if;

  if r.id is null then
    if (select count(*) from public.yourigin_portfolios where user_id = uid) >= 20 then
      raise exception 'You can publish up to 20 portfolios' using errcode = '54000';
    end if;
    insert into public.yourigin_portfolios (user_id, local_id, share_token, visibility, password_hash, expires_at, snapshot)
    values (uid, p_local_id, yourigin_private.new_share_token(), p_visibility, new_hash, p_expires_at, p_snapshot)
    returning * into r;
  else
    update public.yourigin_portfolios
       set snapshot = p_snapshot,
           visibility = p_visibility,
           expires_at = p_expires_at,
           password_hash = new_hash,
           password_version = password_version + case when new_hash is distinct from r.password_hash then 1 else 0 end,
           published_at = now(),
           updated_at = now()
     where id = r.id
    returning * into r;
  end if;
  return yourigin_private.portfolio_result(r);
end
$$;

-- live / disabled. Turning off works for any owner; turning back on needs the allowlist.
create or replace function public.yourigin_set_portfolio_status(p_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.yourigin_portfolios := yourigin_private.own_portfolio(p_id);
begin
  if p_status not in ('live', 'disabled') then
    raise exception 'Unknown status %', p_status using errcode = '22023';
  end if;
  if p_status = 'live' and not yourigin_private.is_allowed() then
    raise exception 'This account is not allowed to publish portfolios yet' using errcode = '42501';
  end if;
  update public.yourigin_portfolios set status = p_status, updated_at = now() where id = r.id returning * into r;
  return yourigin_private.portfolio_result(r);
end
$$;

-- A new link. The old one stops working at once (and so do access passes issued for it).
create or replace function public.yourigin_rotate_portfolio_link(p_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.yourigin_portfolios := yourigin_private.own_portfolio(p_id);
begin
  update public.yourigin_portfolios
     set share_token = yourigin_private.new_share_token(), updated_at = now()
   where id = r.id
  returning * into r;
  return yourigin_private.portfolio_result(r);
end
$$;

-- Sets or clears the end date. Ending it now (or sooner) always works; a later date needs the allowlist.
create or replace function public.yourigin_set_portfolio_expiry(p_id uuid, p_expires_at timestamptz) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r public.yourigin_portfolios := yourigin_private.own_portfolio(p_id);
begin
  if (p_expires_at is null or p_expires_at > now())
     and (r.expires_at is null or p_expires_at is null or p_expires_at > r.expires_at)
     and not yourigin_private.is_allowed() then
    raise exception 'This account is not allowed to publish portfolios yet' using errcode = '42501';
  end if;
  update public.yourigin_portfolios set expires_at = p_expires_at, updated_at = now() where id = r.id returning * into r;
  return yourigin_private.portfolio_result(r);
end
$$;

-- Deletes the published copy; the link stops working. Pictures are removed by the app (owner's own folder).
create or replace function public.yourigin_unpublish_portfolio(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r public.yourigin_portfolios := yourigin_private.own_portfolio(p_id);
begin
  delete from public.yourigin_portfolios where id = r.id;
end
$$;

revoke all on function public.yourigin_publish_portfolio(text, jsonb, text, timestamptz, text) from public, anon;
revoke all on function public.yourigin_set_portfolio_status(uuid, text) from public, anon;
revoke all on function public.yourigin_rotate_portfolio_link(uuid) from public, anon;
revoke all on function public.yourigin_set_portfolio_expiry(uuid, timestamptz) from public, anon;
revoke all on function public.yourigin_unpublish_portfolio(uuid) from public, anon;
grant execute on function public.yourigin_publish_portfolio(text, jsonb, text, timestamptz, text) to authenticated;
grant execute on function public.yourigin_set_portfolio_status(uuid, text) to authenticated;
grant execute on function public.yourigin_rotate_portfolio_link(uuid) to authenticated;
grant execute on function public.yourigin_set_portfolio_expiry(uuid, timestamptz) to authenticated;
grant execute on function public.yourigin_unpublish_portfolio(uuid) to authenticated;

-- ── Edge Function only (service role) ───────────────────────────────────
-- Checks a visitor's password without the hash ever leaving the database.
-- 'locked' after 8 wrong tries from one client, or 60 in all, within 15 minutes.
create or replace function public.yourigin_portfolio_try_password(p_id uuid, p_password text, p_client text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  h text;
begin
  delete from public.yourigin_portfolio_attempts where attempted_at < now() - interval '1 day';
  if (select count(*) from public.yourigin_portfolio_attempts
       where portfolio_id = p_id and client = p_client and attempted_at > now() - interval '15 minutes') >= 8
     or (select count(*) from public.yourigin_portfolio_attempts
          where portfolio_id = p_id and attempted_at > now() - interval '15 minutes') >= 60 then
    return 'locked';
  end if;
  select password_hash into h from public.yourigin_portfolios where id = p_id;
  if h is not null and p_password is not null and char_length(p_password) <= 200
     and extensions.crypt(p_password, h) = h then
    return 'ok';
  end if;
  insert into public.yourigin_portfolio_attempts (portfolio_id, client) values (p_id, left(coalesce(p_client, ''), 128));
  return 'wrong';
end
$$;

-- An anonymous count of visits. Nothing about the visitor is kept.
create or replace function public.yourigin_portfolio_note_view(p_id uuid) returns void
language sql security definer set search_path = ''
as $$
  update public.yourigin_portfolios set view_count = view_count + 1 where id = p_id;
$$;

revoke all on function public.yourigin_portfolio_try_password(uuid, text, text) from public, anon, authenticated;
revoke all on function public.yourigin_portfolio_note_view(uuid) from public, anon, authenticated;
grant execute on function public.yourigin_portfolio_try_password(uuid, text, text) to service_role;
grant execute on function public.yourigin_portfolio_note_view(uuid) to service_role;

-- ── storage: display copies of pictures ─────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolios', 'portfolios', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Paths are <folder>/<portfolio local id>/<file>, where <folder> is a one-way
-- hash of the owner's account id and the portfolio's local id. Visitors see
-- these paths inside signed links, so the account id never appears there, and
-- two portfolios by the same person can't be linked by their folders.
create or replace function yourigin_private.portfolio_folder(p_local text) returns text
language sql stable set search_path = ''
as $$
  select left(encode(extensions.digest(coalesce(auth.uid()::text, '') || ':' || coalesce(p_local, ''), 'sha256'), 'hex'), 32);
$$;
revoke all on function yourigin_private.portfolio_folder(text) from public, anon;
grant execute on function yourigin_private.portfolio_folder(text) to authenticated;

create or replace function yourigin_private.owns_portfolio_file(p_name text) returns boolean
language sql stable set search_path = ''
as $$
  select auth.uid() is not null
     and array_length(storage.foldername(p_name), 1) = 2
     and (storage.foldername(p_name))[1] = yourigin_private.portfolio_folder((storage.foldername(p_name))[2]);
$$;
revoke all on function yourigin_private.owns_portfolio_file(text) from public, anon;
grant execute on function yourigin_private.owns_portfolio_file(text) to authenticated;

-- Only the owner can see or change their files.
drop policy if exists "yourigin portfolios: owner reads files" on storage.objects;
create policy "yourigin portfolios: owner reads files" on storage.objects
  for select to authenticated
  using (bucket_id = 'portfolios' and yourigin_private.owns_portfolio_file(name));
drop policy if exists "yourigin portfolios: owner adds files" on storage.objects;
create policy "yourigin portfolios: owner adds files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portfolios' and yourigin_private.owns_portfolio_file(name)
              and (select yourigin_private.is_allowed()));
drop policy if exists "yourigin portfolios: owner replaces files" on storage.objects;
create policy "yourigin portfolios: owner replaces files" on storage.objects
  for update to authenticated
  using (bucket_id = 'portfolios' and yourigin_private.owns_portfolio_file(name))
  with check (bucket_id = 'portfolios' and yourigin_private.owns_portfolio_file(name)
              and (select yourigin_private.is_allowed()));
-- Removing your own files always works, so unpublishing can clean up.
drop policy if exists "yourigin portfolios: owner removes files" on storage.objects;
create policy "yourigin portfolios: owner removes files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'portfolios' and yourigin_private.owns_portfolio_file(name));

notify pgrst, 'reload schema';
