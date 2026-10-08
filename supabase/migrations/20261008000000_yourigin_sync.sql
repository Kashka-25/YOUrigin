-- YOUrigin end-to-end encrypted sync (applied to the shared "YOU" Supabase project).
-- Everything is prefixed `yourigin_` so it never touches the YOU app's tables.
-- The server only stores ciphertext; table names and record ids are the only plaintext.

create schema if not exists yourigin_private;
revoke all on schema yourigin_private from public, anon;
grant usage on schema yourigin_private to authenticated;

-- Only these accounts may sync (sign-in is shared with the YOU app).
create table yourigin_private.yourigin_allowed_users (
  email text primary key
);
alter table yourigin_private.yourigin_allowed_users enable row level security;
-- insert into yourigin_private.yourigin_allowed_users (email) values ('you@example.com');

create or replace function yourigin_private.is_allowed() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from yourigin_private.yourigin_allowed_users a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function yourigin_private.is_allowed() from public, anon;
grant execute on function yourigin_private.is_allowed() to authenticated;

create sequence public.yourigin_records_rev_seq;

create table public.yourigin_records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tbl text not null,
  id text not null,
  updated_at bigint not null,      -- client change time (ms); last write wins
  deleted boolean not null default false,
  payload text,                    -- base64 AES-GCM ciphertext (null when deleted)
  iv text,
  rev bigint not null default nextval('public.yourigin_records_rev_seq'),  -- pull cursor
  primary key (user_id, tbl, id)
);
create index yourigin_records_user_rev on public.yourigin_records (user_id, rev);

create or replace function public.yourigin_bump_rev() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.rev := nextval('public.yourigin_records_rev_seq');
  return new;
end
$$;
create trigger yourigin_records_bump_rev
  before update on public.yourigin_records
  for each row execute function public.yourigin_bump_rev();

alter table public.yourigin_records enable row level security;
create policy "yourigin: own records" on public.yourigin_records
  for all to authenticated
  using (user_id = (select auth.uid()) and (select yourigin_private.is_allowed()))
  with check (user_id = (select auth.uid()) and (select yourigin_private.is_allowed()));

-- Salt + verifier for the sync passphrase (the passphrase itself never leaves the device).
create table public.yourigin_sync_keys (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  salt text not null,
  verifier text not null,
  verifier_iv text not null,
  created_at timestamptz not null default now()
);
alter table public.yourigin_sync_keys enable row level security;
create policy "yourigin: own key" on public.yourigin_sync_keys
  for all to authenticated
  using (user_id = (select auth.uid()) and (select yourigin_private.is_allowed()))
  with check (user_id = (select auth.uid()) and (select yourigin_private.is_allowed()));

-- Batch upsert with last-write-wins on updated_at.
create or replace function public.yourigin_push(rows jsonb) returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  n integer;
begin
  if not yourigin_private.is_allowed() then
    raise exception 'This account is not allowed to use YOUrigin sync';
  end if;
  insert into public.yourigin_records as r (user_id, tbl, id, updated_at, deleted, payload, iv)
  select auth.uid(), x ->> 'tbl', x ->> 'id', (x ->> 'updated_at')::bigint,
         coalesce((x ->> 'deleted')::boolean, false), x ->> 'payload', x ->> 'iv'
  from jsonb_array_elements(rows) x
  on conflict (user_id, tbl, id) do update
    set updated_at = excluded.updated_at,
        deleted = excluded.deleted,
        payload = excluded.payload,
        iv = excluded.iv
    where excluded.updated_at > r.updated_at;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.yourigin_push(jsonb) from public, anon;
grant execute on function public.yourigin_push(jsonb) to authenticated;

revoke all on public.yourigin_records, public.yourigin_sync_keys from anon;
grant select, insert, update, delete on public.yourigin_records, public.yourigin_sync_keys to authenticated;
grant usage on sequence public.yourigin_records_rev_seq to authenticated;
revoke all on function public.yourigin_bump_rev() from public, anon;
