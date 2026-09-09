-- Presence for the Users page: last activity while a staff login is open.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

create index if not exists profiles_last_seen_idx on public.profiles (last_seen_at desc);

create or replace function public.touch_last_seen()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  seen timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
  set last_seen_at = seen
  where id = auth.uid();

  if not found then
    raise exception 'Profile not found';
  end if;

  return seen;
end;
$$;

revoke all on function public.touch_last_seen() from public;
grant execute on function public.touch_last_seen() to authenticated;

notify pgrst, 'reload schema';
