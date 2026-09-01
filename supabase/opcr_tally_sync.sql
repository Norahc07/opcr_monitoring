-- Let OPCR add/remove rows show on the tally board and daily log.
-- Run once in the SQL editor. Safe to re-run.
-- Does not delete the original office core functions.

alter table public.opcr_items
  add column if not exists origin text not null default 'office';

alter table public.opcr_items
  drop constraint if exists opcr_items_origin_check;

alter table public.opcr_items
  add constraint opcr_items_origin_check check (origin in ('office', 'opcr'));

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

grant select, insert, update, delete on public.opcr_items to authenticated;

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

grant execute on function public.delete_unused_opcr_item(uuid) to authenticated;
