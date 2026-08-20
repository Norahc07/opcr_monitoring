-- Office roster for tally columns (names + positions).
-- Run after schema.sql. Safe to re-run.

create table if not exists public.office_staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null default '',
  short_name text not null default '',
  position text not null default '',
  role text not null default 'staff' check (role in ('staff', 'admin')),
  include_in_tally boolean not null default true,
  user_id uuid unique references public.profiles(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.office_staff
  add column if not exists include_in_tally boolean not null default true;

-- Staff names come from real login accounts. After creating users in
-- Authentication, run supabase/staffs.sql so they appear on Users and Tally.

alter table public.opcr_tallies
  add column if not exists staff_id uuid references public.office_staff(id) on delete cascade;

alter table public.opcr_tallies
  alter column user_id drop not null;

-- Link existing login tallies to roster rows when names match.
update public.opcr_tallies t
set staff_id = s.id
from public.office_staff s
where t.staff_id is null
  and s.user_id is not null
  and s.user_id = t.user_id;

update public.opcr_tallies t
set staff_id = s.id
from public.profiles p
join public.office_staff s
  on lower(nullif(trim(p.short_name), '')) = lower(s.short_name)
  or lower(nullif(trim(p.full_name), '')) = lower(s.full_name)
where t.staff_id is null
  and t.user_id = p.id;

-- Keep leftover login-only people so old tally rows are not lost.
insert into public.office_staff (full_name, short_name, position, role, include_in_tally, user_id, sort_order)
select
  coalesce(nullif(p.full_name, ''), 'Staff'),
  coalesce(nullif(p.short_name, ''), left(coalesce(nullif(p.full_name, ''), 'STAFF'), 8)),
  coalesce(p.position, ''),
  case when p.role = 'admin' then 'admin' else 'staff' end,
  true,
  p.id,
  500 + row_number() over (order by p.created_at)
from public.profiles p
where exists (
  select 1 from public.opcr_tallies t
  where t.user_id = p.id and t.staff_id is null
)
and not exists (
  select 1 from public.office_staff s where s.user_id = p.id
)
and not exists (
  select 1 from public.office_staff s
  where lower(s.short_name) = lower(nullif(trim(p.short_name), ''))
     or lower(s.full_name) = lower(nullif(trim(p.full_name), ''))
);

update public.opcr_tallies t
set staff_id = s.id
from public.office_staff s
where t.staff_id is null
  and s.user_id = t.user_id;

delete from public.opcr_tallies where staff_id is null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'opcr_tallies' and column_name = 'staff_id'
      and is_nullable = 'YES'
  ) then
    alter table public.opcr_tallies alter column staff_id set not null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'opcr_tallies_period_id_user_id_item_id_semester_key'
  ) then
    alter table public.opcr_tallies drop constraint opcr_tallies_period_id_user_id_item_id_semester_key;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.opcr_tallies'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%(period_id, staff_id, item_id, semester)%'
  ) then
    alter table public.opcr_tallies
      add constraint opcr_tallies_period_staff_item_sem_key unique (period_id, staff_id, item_id, semester);
  end if;
end $$;

create index if not exists opcr_tallies_staff_idx on public.opcr_tallies (staff_id);
create index if not exists office_staff_sort_idx on public.office_staff (sort_order);

create or replace function public.my_staff_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.office_staff
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.protect_tally_columns()
returns trigger
language plpgsql
as $$
begin
  new.period_id := old.period_id;
  new.staff_id := old.staff_id;
  new.user_id := old.user_id;
  new.item_id := old.item_id;
  new.semester := old.semester;
  new.updated_at := now();

  if not public.is_admin() then
    new.target := old.target;
    if new.staff_id is distinct from public.my_staff_id() then
      raise exception 'Staff can only update their own tally';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.protect_tally_insert()
returns trigger
language plpgsql
as $$
begin
  if not public.is_admin() then
    new.staff_id := public.my_staff_id();
    new.user_id := auth.uid();
    new.target := 0;
    if new.staff_id is null then
      raise exception 'Your login is not linked to an office staff name. Ask an admin to link it on Users.';
    end if;
  elsif new.user_id is null then
    select user_id into new.user_id from public.office_staff where id = new.staff_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_tally_columns on public.opcr_tallies;
create trigger protect_tally_columns
  before update on public.opcr_tallies
  for each row execute procedure public.protect_tally_columns();

drop trigger if exists protect_tally_insert on public.opcr_tallies;
create trigger protect_tally_insert
  before insert on public.opcr_tallies
  for each row execute procedure public.protect_tally_insert();

alter table public.office_staff enable row level security;

drop policy if exists "office_staff_select" on public.office_staff;
create policy "office_staff_select"
  on public.office_staff for select
  to authenticated
  using (true);

drop policy if exists "office_staff_write" on public.office_staff;
create policy "office_staff_write"
  on public.office_staff for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "tallies_select" on public.opcr_tallies;
create policy "tallies_select"
  on public.opcr_tallies for select
  to authenticated
  using (true);

drop policy if exists "tallies_insert" on public.opcr_tallies;
create policy "tallies_insert"
  on public.opcr_tallies for insert
  to authenticated
  with check (staff_id = public.my_staff_id() or public.is_admin());

drop policy if exists "tallies_update" on public.opcr_tallies;
create policy "tallies_update"
  on public.opcr_tallies for update
  to authenticated
  using (staff_id = public.my_staff_id() or public.is_admin())
  with check (staff_id = public.my_staff_id() or public.is_admin());

grant select, insert, update, delete on public.office_staff to authenticated;
grant execute on function public.my_staff_id() to authenticated;

alter table public.opcr_tallies replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'opcr_tallies'
  ) then
    execute 'alter publication supabase_realtime add table public.opcr_tallies';
  end if;
exception
  when undefined_object then
    null;
end $$;
