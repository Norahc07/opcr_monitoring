-- Profile photos + OPCR signer name/position (does not change the account header).
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.profiles
  add column if not exists avatar_url text not null default '';

alter table public.opcr_forms
  add column if not exists signer_name text not null default '';

alter table public.opcr_forms
  add column if not exists signer_position text not null default '';

alter table public.opcr_forms
  add column if not exists approved_name text not null default '';

alter table public.opcr_forms
  add column if not exists approved_position text not null default '';

alter table public.opcr_forms
  add column if not exists approved_date date;

alter table public.opcr_forms
  add column if not exists assessed_name text not null default '';

alter table public.opcr_forms
  add column if not exists assessed_position text not null default '';

alter table public.opcr_forms
  add column if not exists discussed_date date;

alter table public.opcr_forms
  add column if not exists assessed_date date;

alter table public.opcr_forms
  add column if not exists final_rating_date date;

alter table public.opcr_forms
  add column if not exists final_rater_name text not null default '';

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_own_insert" on storage.objects;
create policy "avatars_own_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_own_update" on storage.objects;
create policy "avatars_own_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_own_delete" on storage.objects;
create policy "avatars_own_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
