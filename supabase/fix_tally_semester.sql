-- Fix "opcr_tallies_semester_check" errors and sync daily logs to the tally board.
-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- Use this if staff saves fail with semester_check, or staff/admin tallies look out of sync.

-- 1) Switch tally semester from Jan–June / Jul–Dec to one Jan–Dec period.
alter table public.opcr_tallies
  drop constraint if exists opcr_tallies_semester_check;

insert into public.opcr_tallies (
  period_id, staff_id, user_id, item_id, semester, target, accomplished
)
select
  period_id,
  staff_id,
  (array_agg(user_id) filter (where user_id is not null))[1],
  item_id,
  'jan_dec',
  coalesce(sum(target), 0),
  coalesce(sum(accomplished), 0)
from public.opcr_tallies
where semester in ('jan_june', 'july_dec')
group by period_id, staff_id, item_id
on conflict (period_id, staff_id, item_id, semester)
do update set
  target = excluded.target,
  accomplished = excluded.accomplished,
  user_id = coalesce(public.opcr_tallies.user_id, excluded.user_id),
  updated_at = now();

delete from public.opcr_tallies
where semester in ('jan_june', 'july_dec');

alter table public.opcr_tallies
  add constraint opcr_tallies_semester_check check (semester in ('jan_dec'));

create or replace function public.tally_semester(p_date date)
returns text
language sql
immutable
as $$
  select 'jan_dec';
$$;

-- 2) Daily log → tally sync (uses jan_dec and bypasses staff insert rules).
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

grant execute on function public.tally_semester(date) to authenticated;
grant execute on function public.apply_daily_sum(uuid, uuid, uuid, uuid, text) to authenticated;
