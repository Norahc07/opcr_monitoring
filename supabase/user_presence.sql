-- Presence for the Users page: last activity while a staff login is open.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

create index if not exists profiles_last_seen_idx on public.profiles (last_seen_at desc);

-- Admins must be able to read every profile, or the Users page shows "Never signed in".
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

create or replace function public.touch_last_seen()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  seen timestamptz := now();
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.profiles (id, last_seen_at)
  values (uid, seen)
  on conflict (id) do update
    set last_seen_at = seen;

  return seen;
end;
$$;

create or replace function public.list_last_seen()
returns table (id uuid, last_seen_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return query
    select p.id, p.last_seen_at
    from public.profiles p;
  else
    return query
    select p.id, p.last_seen_at
    from public.profiles p
    where p.id = auth.uid();
  end if;
end;
$$;

revoke all on function public.touch_last_seen() from public, anon;
revoke all on function public.list_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.list_last_seen() to authenticated;

notify pgrst, 'reload schema';
