-- Reset My OPCR, tally board counts, and daily logs for the active period.
-- Keeps office seed rows in opcr_items but removes all links and counts.
-- Run opcr_fix_tally_sync.sql first if bulk delete failed before.
-- Safe to re-run.

do $$
declare
  v_period_id uuid;
begin
  select id
  into v_period_id
  from public.opcr_periods
  where status = 'active'
  order by year desc
  limit 1;

  if v_period_id is null then
    raise notice 'No active OPCR period found.';
    return;
  end if;

  perform set_config('opcr.internal_sync', 'on', true);

  delete from public.opcr_tallies
  where period_id = v_period_id;

  alter table public.opcr_daily_logs disable trigger sync_daily_tally;

  delete from public.opcr_daily_logs
  where period_id = v_period_id;

  alter table public.opcr_daily_logs enable trigger sync_daily_tally;

  delete from public.opcr_entries
  where form_id in (
    select id from public.opcr_forms where period_id = v_period_id
  );

  delete from public.opcr_items
  where period_id = v_period_id
    and origin = 'opcr';

  perform set_config('opcr.internal_sync', 'off', true);

  raise notice 'Reset complete for active period %.', v_period_id;
exception
  when others then
    perform set_config('opcr.internal_sync', 'off', true);
    alter table public.opcr_daily_logs enable trigger sync_daily_tally;
    raise;
end;
$$;
