-- Merge duplicate opcr_items that share the same output name within a period.
-- Rewires My OPCR entries and tallies to the kept item, then removes duplicates.
-- Run once in the SQL editor after opcr_tally_sync.sql. Safe to re-run.

do $$
declare
  rec record;
  dup record;
begin
  for rec in
    select
      period_id,
      lower(trim(output)) as output_key,
      (
        array_agg(id order by case when origin = 'office' then 0 else 1 end, sort_order, id)
      )[1] as keep_id,
      array_agg(id order by case when origin = 'office' then 0 else 1 end, sort_order, id) as all_ids
    from public.opcr_items
    group by period_id, lower(trim(output))
    having count(*) > 1
  loop
    for dup in
      select unnest(rec.all_ids) as id
    loop
      continue when dup.id = rec.keep_id;

      update public.opcr_entries
      set item_id = rec.keep_id
      where item_id = dup.id;

      insert into public.opcr_tallies (
        period_id, staff_id, user_id, item_id, semester, target, accomplished
      )
      select
        period_id,
        staff_id,
        user_id,
        rec.keep_id,
        semester,
        coalesce(sum(target), 0),
        coalesce(sum(accomplished), 0)
      from public.opcr_tallies
      where item_id = dup.id
      group by period_id, staff_id, user_id, semester
      on conflict (period_id, staff_id, item_id, semester)
      do update set
        target = public.opcr_tallies.target + excluded.target,
        accomplished = public.opcr_tallies.accomplished + excluded.accomplished,
        updated_at = now();

      delete from public.opcr_tallies where item_id = dup.id;
      delete from public.opcr_daily_logs where item_id = dup.id;
      delete from public.opcr_items where id = dup.id;
    end loop;
  end loop;
end;
$$;
