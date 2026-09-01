-- Allow multiple success-indicator lines under one OPCR output (nested rows).
-- Run once in the SQL editor. Safe to re-run.

alter table public.opcr_entries
  add column if not exists parent_entry_id uuid references public.opcr_entries(id) on delete cascade;

create index if not exists opcr_entries_parent_idx on public.opcr_entries (parent_entry_id);

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
    new.parent_entry_id := old.parent_entry_id;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_entry_columns on public.opcr_entries;
create trigger protect_entry_columns
  before update on public.opcr_entries
  for each row execute function public.protect_entry_columns();
