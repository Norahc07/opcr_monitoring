-- Make OPCR output / success indicator editable per person, and allow add/remove rows.
-- Run once in the SQL editor. Safe to re-run. Does not change the office tally items.

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

update public.opcr_entries e
set
  output = coalesce(nullif(trim(e.output), ''), i.output, e.output),
  success_indicator = coalesce(nullif(trim(e.success_indicator), ''), i.success_indicator, e.success_indicator),
  sort_order = case when e.sort_order = 0 then coalesce(i.sort_order, 0) else e.sort_order end
from public.opcr_items i
where e.item_id = i.id;

update public.opcr_entries
set section = case
  when lower(output) in ('training facilitated', 'lay out design', 'id', 'client assistance') then 1
  when lower(output) in (
    'sales report',
    'monthly sales report',
    'monthly clients report',
    'monthly training report',
    'certificates',
    'annual report',
    'maintenance',
    'project design'
  ) then 2
  when lower(output) in (
    'pr''s/ vouchers',
    'delivery inspection',
    'computer (desktop/laptop) repair & maintenance',
    'printer repair and maintenance',
    'social media',
    'dtr'
  ) then 3
  else 4
end
where section = 1
  and lower(output) not in ('training facilitated', 'lay out design', 'id', 'client assistance');

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
    new.section := old.section;
    new.sort_order := old.sort_order;
  end if;

  return new;
end;
$$;

drop policy if exists "entries_delete" on public.opcr_entries;
create policy "entries_delete"
  on public.opcr_entries for delete
  to authenticated
  using (
    exists (
      select 1 from public.opcr_forms f
      where f.id = form_id
        and f.user_id = auth.uid()
        and f.status in ('draft', 'submitted')
    )
  );

grant select, insert, update, delete on public.opcr_entries to authenticated;
