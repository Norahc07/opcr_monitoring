-- Additive tally-per-person schema.
-- DEPRECATED: use schema.sql + tally_annual.sql (or fix_tally_semester.sql) instead.
-- This file kept only for very old projects that never migrated to office_staff tallies.

alter table public.profiles
  add column if not exists short_name text not null default '';

create table if not exists public.opcr_tallies (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.opcr_periods(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.opcr_items(id) on delete cascade,
  semester text not null check (semester in ('jan_june', 'july_dec')),
  target numeric(12, 2) not null default 0,
  accomplished numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (period_id, user_id, item_id, semester)
);

create index if not exists opcr_tallies_period_idx on public.opcr_tallies (period_id);
create index if not exists opcr_tallies_user_idx on public.opcr_tallies (user_id);

create or replace function public.protect_tally_columns()
returns trigger
language plpgsql
as $$
begin
  new.period_id := old.period_id;
  new.user_id := old.user_id;
  new.item_id := old.item_id;
  new.semester := old.semester;
  new.updated_at := now();

  if not public.is_admin() then
    new.target := old.target;
    if new.user_id is distinct from auth.uid() then
      raise exception 'Staff can only update their own tally';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_tally_columns on public.opcr_tallies;
create trigger protect_tally_columns
  before update on public.opcr_tallies
  for each row execute procedure public.protect_tally_columns();

create or replace function public.protect_tally_insert()
returns trigger
language plpgsql
as $$
begin
  if not public.is_admin() then
    new.user_id := auth.uid();
    new.target := 0;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_tally_insert on public.opcr_tallies;
create trigger protect_tally_insert
  before insert on public.opcr_tallies
  for each row execute procedure public.protect_tally_insert();

alter table public.opcr_tallies enable row level security;

drop policy if exists "tallies_select" on public.opcr_tallies;
create policy "tallies_select"
  on public.opcr_tallies for select
  to authenticated
  using (true);

drop policy if exists "tallies_insert" on public.opcr_tallies;
create policy "tallies_insert"
  on public.opcr_tallies for insert
  to authenticated
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "tallies_update" on public.opcr_tallies;
create policy "tallies_update"
  on public.opcr_tallies for update
  to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

grant select, insert, update on public.opcr_tallies to authenticated;
