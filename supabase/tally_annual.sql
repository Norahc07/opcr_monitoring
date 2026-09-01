-- Switch tally board from two semesters (Jan–June / Jul–Dec) to one annual period (Jan–Dec).
-- Run once in the SQL editor. Safe to re-run.

alter table public.opcr_tallies
  drop constraint if exists opcr_tallies_semester_check;

insert into public.opcr_tallies (
  period_id, staff_id, user_id, item_id, semester, target, accomplished
)
select
  period_id,
  staff_id,
  max(user_id),
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
