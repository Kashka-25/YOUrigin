-- YOUrigin: videos reach every device (applied to the shared "YOU" Supabase project).
--
-- Each video is cut into 4 MiB pieces and encrypted ON THE DEVICE with the sync
-- key (AES-GCM) before upload. The server only stores ciphertext: no names, no
-- types, no pictures. What the video is lives in the encrypted `clipInfo` sync
-- records, not here.
--
-- Paths are <account id>/<video id>/<piece number>. The bucket is private and
-- only the account that owns a folder can read, add, replace or remove its
-- pieces. Additive only; depends on the sync migration (yourigin_private.is_allowed).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('yourigin-clips', 'yourigin-clips', false, 5242880, array['application/octet-stream'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function yourigin_private.owns_clip_piece(p_name text) returns boolean
language sql stable set search_path = ''
as $$
  select auth.uid() is not null
     and array_length(storage.foldername(p_name), 1) = 2
     and (storage.foldername(p_name))[1] = auth.uid()::text;
$$;
revoke all on function yourigin_private.owns_clip_piece(text) from public, anon;
grant execute on function yourigin_private.owns_clip_piece(text) to authenticated;

-- Reading your own (encrypted) pieces needs only ownership, so clean-up still works
-- after leaving the allowlist: Postgres checks this rule before a delete too.
drop policy if exists "yourigin clips: owner reads pieces" on storage.objects;
create policy "yourigin clips: owner reads pieces" on storage.objects
  for select to authenticated
  using (bucket_id = 'yourigin-clips' and yourigin_private.owns_clip_piece(name));

drop policy if exists "yourigin clips: owner adds pieces" on storage.objects;
create policy "yourigin clips: owner adds pieces" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'yourigin-clips' and yourigin_private.owns_clip_piece(name)
              and (select yourigin_private.is_allowed()));

drop policy if exists "yourigin clips: owner replaces pieces" on storage.objects;
create policy "yourigin clips: owner replaces pieces" on storage.objects
  for update to authenticated
  using (bucket_id = 'yourigin-clips' and yourigin_private.owns_clip_piece(name))
  with check (bucket_id = 'yourigin-clips' and yourigin_private.owns_clip_piece(name)
              and (select yourigin_private.is_allowed()));

-- Removing your own pieces always works, so clean-up and "start over" can finish.
drop policy if exists "yourigin clips: owner removes pieces" on storage.objects;
create policy "yourigin clips: owner removes pieces" on storage.objects
  for delete to authenticated
  using (bucket_id = 'yourigin-clips' and yourigin_private.owns_clip_piece(name));
