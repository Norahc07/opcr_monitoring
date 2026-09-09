-- OPCR Monitoring System schema
-- Run this in the Supabase SQL editor before seed.sql.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role text not null default 'staff' check (role in ('staff', 'admin')),
  position text not null default '',
  office text not null default 'E-Learning Ville',
  short_name text not null default '',
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists short_name text not null default '';

alter table public.profiles
  add column if not exists avatar_url text not null default '';

alter table public.profiles
  add column if not exists last_seen_at timestamptz;

-- Official staffs = login accounts. Tally columns follow this table, including admin.
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

create table if not exists public.opcr_periods (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  title text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  office_name text not null default 'E-Learning Ville, LGU Mauban, Quezon',
  created_at timestamptz not null default now()
);

create table if not exists public.opcr_items (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.opcr_periods(id) on delete cascade,
  category text not null default 'Core Functions',
  output text not null,
  success_indicator text not null,
  sort_order integer not null default 0,
  origin text not null default 'office'
);

alter table public.opcr_items
  add column if not exists origin text not null default 'office';

alter table public.opcr_items
  drop constraint if exists opcr_items_origin_check;

alter table public.opcr_items
  add constraint opcr_items_origin_check check (origin in ('office', 'opcr'));

create table if not exists public.opcr_forms (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.opcr_periods(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'reviewed', 'finalized')),
  comments text not null default '',
  final_average numeric(4, 2),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (period_id, user_id)
);

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

alter table public.opcr_forms
  add column if not exists header_title text not null default '';

alter table public.opcr_forms
  add column if not exists header_office_line text not null default '';

alter table public.opcr_forms
  add column if not exists header_commitment_line text not null default '';

create table if not exists public.opcr_entries (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.opcr_forms(id) on delete cascade,
  item_id uuid references public.opcr_items(id) on delete set null,
  output text not null default '',
  success_indicator text not null default '',
  section integer not null default 1,
  sort_order integer not null default 0,
  parent_entry_id uuid references public.opcr_entries(id) on delete cascade,
  accountable text not null default '',
  actual_accomplishment text not null default '',
  remarks text not null default '',
  rating_q numeric(3, 1) check (rating_q is null or (rating_q >= 1 and rating_q <= 5)),
  rating_e numeric(3, 1) check (rating_e is null or (rating_e >= 1 and rating_e <= 5)),
  rating_t numeric(3, 1) check (rating_t is null or (rating_t >= 1 and rating_t <= 5)),
  rating_a numeric(4, 2) generated always as (
    case
      when rating_q is not null and rating_e is not null and rating_t is not null
        then round((rating_q + rating_e + rating_t) / 3.0, 2)
      else null
    end
  ) stored,
  unique (form_id, item_id)
);

create index if not exists opcr_items_period_idx on public.opcr_items (period_id, sort_order);
create index if not exists opcr_forms_period_idx on public.opcr_forms (period_id);
create index if not exists opcr_forms_user_idx on public.opcr_forms (user_id);
create index if not exists opcr_entries_form_idx on public.opcr_entries (form_id);
create index if not exists opcr_entries_parent_idx on public.opcr_entries (parent_entry_id);

alter table public.opcr_entries
  add column if not exists parent_entry_id uuid references public.opcr_entries(id) on delete cascade;

alter table public.opcr_entries
  alter column item_id drop not null;

alter table public.opcr_entries
  add column if not exists output text not null default '';

alter table public.opcr_entries
  add column if not exists success_indicator text not null default '';

alter table public.opcr_entries
  add column if not exists section integer not null default 1;

alter table public.opcr_entries
  add column if not exists sort_order integer not null default 0;

alter table public.opcr_entries
  add column if not exists accountable text not null default '';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), ''),
    'staff'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.ensure_staff_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_order integer;
begin
  select coalesce(max(sort_order), 0) + 10 into next_order from public.office_staff;

  insert into public.office_staff (
    full_name,
    short_name,
    position,
    role,
    include_in_tally,
    user_id,
    sort_order
  )
  values (
    coalesce(nullif(trim(new.full_name), ''), 'Staff'),
    coalesce(nullif(trim(new.short_name), ''), upper(left(coalesce(nullif(trim(new.full_name), ''), 'STAFF'), 12))),
    coalesce(new.position, ''),
    case when new.role = 'admin' then 'admin' else 'staff' end,
    true,
    new.id,
    next_order
  )
  on conflict (user_id) do update
  set
    full_name = excluded.full_name,
    short_name = excluded.short_name,
    position = excluded.position,
    role = excluded.role,
    include_in_tally = true;

  return new;
end;
$$;

drop trigger if exists profiles_sync_staff on public.profiles;
create trigger profiles_sync_staff
  after insert or update of full_name, short_name, position, role
  on public.profiles
  for each row execute procedure public.ensure_staff_for_profile();

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
as $$
begin
  if not public.is_admin() and new.role is distinct from old.role then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute procedure public.protect_profile_role();

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

create or replace function public.protect_form_updates()
returns trigger
language plpgsql
as $$
begin
  new.user_id := old.user_id;
  new.period_id := old.period_id;

  if new.user_id = auth.uid() and new.status in ('reviewed', 'finalized') then
    new.status := old.status;
  end if;

  if not public.is_admin() then
    new.comments := old.comments;
    new.final_average := old.final_average;
    new.reviewed_at := old.reviewed_at;
    if new.status is distinct from old.status
       and not (old.status = 'draft' and new.status = 'submitted') then
      new.status := old.status;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_form_updates on public.opcr_forms;
create trigger protect_form_updates
  before update on public.opcr_forms
  for each row execute procedure public.protect_form_updates();

create or replace function public.protect_entry_columns()
returns trigger
language plpgsql
as $$
declare
  form_owner uuid;
  form_status text;
begin
  select user_id, status into form_owner, form_status
  from public.opcr_forms
  where id = new.form_id;

  if form_owner = auth.uid() or not public.is_admin() then
    new.rating_q := old.rating_q;
    new.rating_e := old.rating_e;
    new.rating_t := old.rating_t;
  end if;

  if form_status in ('reviewed', 'finalized') and not public.is_admin() then
    new.actual_accomplishment := old.actual_accomplishment;
    new.remarks := old.remarks;
    new.output := old.output;
    new.success_indicator := old.success_indicator;
    new.accountable := old.accountable;
    new.section := old.section;
    new.sort_order := old.sort_order;
    new.parent_entry_id := old.parent_entry_id;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_entry_columns on public.opcr_entries;
create trigger protect_entry_columns
  before update on public.opcr_entries
  for each row execute procedure public.protect_entry_columns();

create or replace function public.delete_unused_opcr_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  if p_item_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.opcr_items
    where id = p_item_id
      and origin = 'opcr'
  ) then
    return;
  end if;

  if exists (
    select 1
    from public.opcr_entries
    where item_id = p_item_id
  ) then
    return;
  end if;

  delete from public.opcr_daily_logs
  where item_id = p_item_id;

  delete from public.opcr_tallies
  where item_id = p_item_id;

  delete from public.opcr_items
  where id = p_item_id
    and origin = 'opcr';
end;
$$;

alter table public.profiles enable row level security;
alter table public.opcr_periods enable row level security;
alter table public.opcr_items enable row level security;
alter table public.opcr_forms enable row level security;
alter table public.opcr_entries enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid() and role = 'staff');

drop policy if exists "periods_select" on public.opcr_periods;
create policy "periods_select"
  on public.opcr_periods for select
  to authenticated
  using (true);

drop policy if exists "items_select" on public.opcr_items;
create policy "items_select"
  on public.opcr_items for select
  to authenticated
  using (true);

drop policy if exists "items_insert" on public.opcr_items;
create policy "items_insert"
  on public.opcr_items for insert
  to authenticated
  with check (origin = 'opcr' or public.is_admin());

drop policy if exists "items_update" on public.opcr_items;
create policy "items_update"
  on public.opcr_items for update
  to authenticated
  using (origin = 'opcr' or public.is_admin())
  with check (origin = 'opcr' or public.is_admin());

drop policy if exists "items_delete" on public.opcr_items;
create policy "items_delete"
  on public.opcr_items for delete
  to authenticated
  using (origin = 'opcr' or public.is_admin());

drop policy if exists "forms_select" on public.opcr_forms;
create policy "forms_select"
  on public.opcr_forms for select
  to authenticated
  using (true);

drop policy if exists "forms_insert" on public.opcr_forms;
create policy "forms_insert"
  on public.opcr_forms for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "forms_update" on public.opcr_forms;
create policy "forms_update"
  on public.opcr_forms for update
  to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "entries_select" on public.opcr_entries;
create policy "entries_select"
  on public.opcr_entries for select
  to authenticated
  using (true);

drop policy if exists "entries_insert" on public.opcr_entries;
create policy "entries_insert"
  on public.opcr_entries for insert
  to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.opcr_forms f
      where f.id = form_id and f.user_id = auth.uid()
    )
  );

drop policy if exists "entries_update" on public.opcr_entries;
create policy "entries_update"
  on public.opcr_entries for update
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.opcr_forms f
      where f.id = form_id
        and f.user_id = auth.uid()
        and f.status in ('draft', 'submitted')
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.opcr_forms f
      where f.id = form_id
        and f.user_id = auth.uid()
        and f.status in ('draft', 'submitted')
    )
  );

drop policy if exists "entries_delete" on public.opcr_entries;
create policy "entries_delete"
  on public.opcr_entries for delete
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.opcr_forms f
      where f.id = form_id
        and f.user_id = auth.uid()
        and f.status in ('draft', 'submitted')
    )
  );

create table if not exists public.opcr_tallies (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.opcr_periods(id) on delete cascade,
  staff_id uuid not null references public.office_staff(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  item_id uuid not null references public.opcr_items(id) on delete cascade,
  semester text not null check (semester in ('jan_dec')),
  target numeric(12, 2) not null default 0,
  accomplished numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (period_id, staff_id, item_id, semester)
);

create index if not exists opcr_tallies_period_idx on public.opcr_tallies (period_id);
create index if not exists opcr_tallies_user_idx on public.opcr_tallies (user_id);
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

drop trigger if exists protect_tally_columns on public.opcr_tallies;
create trigger protect_tally_columns
  before update on public.opcr_tallies
  for each row execute procedure public.protect_tally_columns();

create or replace function public.protect_tally_insert()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('opcr.internal_sync', true), '') = 'on' then
    new.updated_at := now();
    return new;
  end if;

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

drop trigger if exists protect_tally_insert on public.opcr_tallies;
create trigger protect_tally_insert
  before insert on public.opcr_tallies
  for each row execute procedure public.protect_tally_insert();

alter table public.office_staff enable row level security;
alter table public.opcr_tallies enable row level security;

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

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.office_staff to authenticated;
grant select on public.opcr_periods to authenticated;
grant select, insert, update, delete on public.opcr_items to authenticated;
grant select, insert, update on public.opcr_forms to authenticated;
grant select, insert, update, delete on public.opcr_entries to authenticated;
grant select, insert, update on public.opcr_tallies to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_staff_id() to authenticated;
grant execute on function public.delete_unused_opcr_item(uuid) to authenticated;
grant execute on function public.touch_last_seen() to authenticated;

-- After the first admin exists, run supabase/admin_users.sql and supabase/staffs.sql
-- so the Users page lists real login accounts as Staffs.
-- Existing projects: also run supabase/audit.sql once for the Audit logs page.
-- Existing projects: run supabase/opcr_editable.sql so staff can edit OPCR rows.
-- Existing projects: run supabase/daily.sql for the Daily log page.
-- Existing projects: run supabase/tally_annual.sql to use one Jan–Dec column on the tally board.
-- If staff saves fail with opcr_tallies_semester_check, run supabase/fix_tally_semester.sql instead.

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

-- Audit trail (also in supabase/audit.sql for existing projects)

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default '',
  actor_role text not null default 'staff',
  action text not null default '',
  page text not null default '',
  details text not null default ''
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_user_idx on public.audit_logs (user_id);

create or replace function public.record_audit(
  p_action text,
  p_page text default '',
  p_details text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text := 'User';
  actor_role text := 'staff';
begin
  if auth.uid() is null then
    return;
  end if;
  if p_action is null or length(trim(p_action)) = 0 then
    return;
  end if;

  select
    coalesce(nullif(trim(full_name), ''), nullif(trim(short_name), ''), 'User'),
    coalesce(role, 'staff')
  into actor_name, actor_role
  from public.profiles
  where id = auth.uid();

  insert into public.audit_logs (user_id, actor_name, actor_role, action, page, details)
  values (
    auth.uid(),
    coalesce(actor_name, 'User'),
    coalesce(actor_role, 'staff'),
    left(trim(p_action), 80),
    left(coalesce(trim(p_page), ''), 80),
    left(coalesce(trim(p_details), ''), 500)
  );
end;
$$;

alter table public.audit_logs enable row level security;

drop policy if exists "audit_select_admin" on public.audit_logs;
create policy "audit_select_admin"
  on public.audit_logs for select
  to authenticated
  using (public.is_admin());

revoke all on public.audit_logs from public, anon;
grant select on public.audit_logs to authenticated;

revoke all on function public.record_audit(text, text, text) from public;
grant execute on function public.record_audit(text, text, text) to authenticated;

-- Daily accomplishment logs (also in supabase/daily.sql for existing projects)

create or replace function public.tally_semester(p_date date)
returns text
language sql
immutable
as $$
  select 'jan_dec';
$$;

create table if not exists public.opcr_daily_logs (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.opcr_periods(id) on delete cascade,
  staff_id uuid not null references public.office_staff(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.opcr_items(id) on delete cascade,
  work_date date not null default current_date,
  quantity numeric(12, 2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (staff_id, item_id, work_date)
);

create index if not exists opcr_daily_logs_staff_date_idx
  on public.opcr_daily_logs (staff_id, work_date desc);

create index if not exists opcr_daily_logs_item_idx
  on public.opcr_daily_logs (item_id, work_date desc);

create or replace function public.apply_daily_sum(
  p_period_id uuid,
  p_staff_id uuid,
  p_user_id uuid,
  p_item_id uuid,
  p_semester text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sum numeric(12, 2) := 0;
begin
  if p_period_id is null or p_staff_id is null or p_item_id is null then
    return;
  end if;

  select coalesce(sum(quantity), 0)
  into v_sum
  from public.opcr_daily_logs
  where period_id = p_period_id
    and staff_id = p_staff_id
    and item_id = p_item_id;

  perform set_config('opcr.internal_sync', 'on', true);

  insert into public.opcr_tallies (
    period_id, staff_id, user_id, item_id, semester, target, accomplished
  )
  values (
    p_period_id,
    p_staff_id,
    p_user_id,
    p_item_id,
    'jan_dec',
    0,
    v_sum
  )
  on conflict (period_id, staff_id, item_id, semester)
  do update set
    accomplished = excluded.accomplished,
    user_id = coalesce(public.opcr_tallies.user_id, excluded.user_id),
    updated_at = now();

  perform set_config('opcr.internal_sync', 'off', true);
exception
  when others then
    perform set_config('opcr.internal_sync', 'off', true);
    raise;
end;
$$;

create or replace function public.sync_daily_tally()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.apply_daily_sum(
      old.period_id, old.staff_id, old.user_id, old.item_id, 'jan_dec'
    );
    return old;
  end if;

  if tg_op = 'UPDATE' and (
    old.quantity is distinct from new.quantity
    or old.work_date is distinct from new.work_date
    or old.item_id is distinct from new.item_id
  ) then
    perform public.apply_daily_sum(
      old.period_id, old.staff_id, old.user_id, old.item_id, 'jan_dec'
    );
  end if;

  perform public.apply_daily_sum(
    new.period_id, new.staff_id, new.user_id, new.item_id, 'jan_dec'
  );
  return new;
end;
$$;

drop trigger if exists sync_daily_tally on public.opcr_daily_logs;
create trigger sync_daily_tally
  after insert or update or delete on public.opcr_daily_logs
  for each row execute procedure public.sync_daily_tally();

create or replace function public.protect_daily_logs()
returns trigger
language plpgsql
as $$
begin
  if not public.is_admin() then
    new.staff_id := public.my_staff_id();
    new.user_id := auth.uid();
    if new.staff_id is null then
      raise exception 'Your login is not linked to an office staff name. Ask an admin to add you on Users.';
    end if;
  elsif new.user_id is null then
    select user_id into new.user_id from public.office_staff where id = new.staff_id;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_daily_logs on public.opcr_daily_logs;
create trigger protect_daily_logs
  before insert or update on public.opcr_daily_logs
  for each row execute procedure public.protect_daily_logs();

alter table public.opcr_daily_logs enable row level security;

drop policy if exists "daily_select" on public.opcr_daily_logs;
create policy "daily_select"
  on public.opcr_daily_logs for select
  to authenticated
  using (staff_id = public.my_staff_id() or user_id = auth.uid() or public.is_admin());

drop policy if exists "daily_insert" on public.opcr_daily_logs;
create policy "daily_insert"
  on public.opcr_daily_logs for insert
  to authenticated
  with check (staff_id = public.my_staff_id() or public.is_admin());

drop policy if exists "daily_update" on public.opcr_daily_logs;
create policy "daily_update"
  on public.opcr_daily_logs for update
  to authenticated
  using (staff_id = public.my_staff_id() or public.is_admin())
  with check (staff_id = public.my_staff_id() or public.is_admin());

drop policy if exists "daily_delete" on public.opcr_daily_logs;
create policy "daily_delete"
  on public.opcr_daily_logs for delete
  to authenticated
  using (staff_id = public.my_staff_id() or public.is_admin());

revoke all on public.opcr_daily_logs from public, anon;
grant select, insert, update, delete on public.opcr_daily_logs to authenticated;
grant execute on function public.tally_semester(date) to authenticated;
grant execute on function public.apply_daily_sum(uuid, uuid, uuid, uuid, text) to authenticated;
