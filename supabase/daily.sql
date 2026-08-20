-- Daily accomplishment logs. Staff enter counts each day; totals write to the tally board.
-- Run once in the SQL editor. Safe to re-run.

create or replace function public.tally_semester(p_date date)
returns text
language sql
immutable
as $$
  select case
    when p_date is null then 'jan_june'
    when extract(month from p_date) <= 6 then 'jan_june'
    else 'july_dec'
  end;
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
    and item_id = p_item_id
    and public.tally_semester(work_date) = p_semester;

  insert into public.opcr_tallies (
    period_id, staff_id, user_id, item_id, semester, target, accomplished
  )
  values (
    p_period_id,
    p_staff_id,
    p_user_id,
    p_item_id,
    p_semester,
    0,
    v_sum
  )
  on conflict (period_id, staff_id, item_id, semester)
  do update set
    accomplished = excluded.accomplished,
    user_id = coalesce(public.opcr_tallies.user_id, excluded.user_id),
    updated_at = now();
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
      old.period_id, old.staff_id, old.user_id, old.item_id, public.tally_semester(old.work_date)
    );
    return old;
  end if;

  if tg_op = 'UPDATE' then
    perform public.apply_daily_sum(
      old.period_id, old.staff_id, old.user_id, old.item_id, public.tally_semester(old.work_date)
    );
  end if;

  perform public.apply_daily_sum(
    new.period_id, new.staff_id, new.user_id, new.item_id, public.tally_semester(new.work_date)
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
