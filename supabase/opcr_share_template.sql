-- Share the admin My OPCR output list with every staff login.
-- IMPORTANT: Select the WHOLE file (Ctrl+A) then click Run. Do not run only the first part.
-- Safe to re-run.

alter table public.opcr_entries
  add column if not exists accountable text not null default '';

drop policy if exists "forms_select" on public.opcr_forms;
create policy "forms_select"
  on public.opcr_forms for select
  to authenticated
  using (true);

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

create or replace function public.office_opcr_form_id(p_period_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select f.id
  from public.opcr_forms f
  join public.profiles p on p.id = f.user_id
  join lateral (
    select count(*)::int as n
    from public.opcr_entries e
    where e.form_id = f.id
      and e.parent_entry_id is null
  ) s on true
  where f.period_id = p_period_id
    and s.n > 0
  order by
    case when p.role = 'admin' then 0 else 1 end,
    s.n desc,
    f.created_at asc
  limit 1;
$$;

drop function if exists public.office_opcr_template(uuid);

create function public.office_opcr_template(p_period_id uuid)
returns setof public.opcr_entries
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_form_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  v_form_id := public.office_opcr_form_id(p_period_id);
  if v_form_id is null then
    return;
  end if;

  return query
  select e.*
  from public.opcr_entries e
  where e.form_id = v_form_id
  order by e.section, e.sort_order, e.id;
end;
$$;

drop function if exists public.apply_office_opcr_template(uuid);

create function public.apply_office_opcr_template(p_form_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_id uuid;
  v_owner uuid;
  v_template_id uuid;
  v_src record;
  v_match uuid;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select period_id, user_id
  into v_period_id, v_owner
  from public.opcr_forms
  where id = p_form_id;

  if v_period_id is null then
    return false;
  end if;

  if v_owner is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Only admins can update another person’s OPCR';
  end if;

  v_template_id := public.office_opcr_form_id(v_period_id);
  if v_template_id is null or v_template_id = p_form_id then
    return false;
  end if;

  create temporary table if not exists _opcr_tpl_map (
    src_id uuid primary key,
    dst_id uuid not null
  );
  delete from _opcr_tpl_map where src_id is not null;

  for v_src in
    select *
    from public.opcr_entries
    where form_id = v_template_id
      and parent_entry_id is null
    order by section, sort_order, id
  loop
    v_match := null;

    select e.id
    into v_match
    from public.opcr_entries e
    where e.form_id = p_form_id
      and e.parent_entry_id is null
      and not exists (select 1 from _opcr_tpl_map m where m.dst_id = e.id)
      and v_src.item_id is not null
      and e.item_id = v_src.item_id
    limit 1;

    if v_match is null then
      select e.id
      into v_match
      from public.opcr_entries e
      where e.form_id = p_form_id
        and e.parent_entry_id is null
        and not exists (select 1 from _opcr_tpl_map m where m.dst_id = e.id)
        and lower(trim(coalesce(e.output, ''))) = lower(trim(coalesce(v_src.output, '')))
        and length(trim(coalesce(v_src.output, ''))) > 0
      limit 1;
    end if;

    if v_match is not null then
      update public.opcr_entries
      set
        item_id = coalesce(v_src.item_id, item_id),
        output = coalesce(v_src.output, ''),
        success_indicator = coalesce(v_src.success_indicator, ''),
        accountable = coalesce(v_src.accountable, ''),
        section = v_src.section,
        sort_order = coalesce(v_src.sort_order, 0),
        parent_entry_id = null
      where id = v_match;

      insert into _opcr_tpl_map (src_id, dst_id) values (v_src.id, v_match);
    else
      insert into public.opcr_entries (
        form_id,
        item_id,
        output,
        success_indicator,
        accountable,
        section,
        sort_order,
        parent_entry_id,
        actual_accomplishment,
        remarks
      )
      values (
        p_form_id,
        v_src.item_id,
        coalesce(v_src.output, ''),
        coalesce(v_src.success_indicator, ''),
        coalesce(v_src.accountable, ''),
        v_src.section,
        coalesce(v_src.sort_order, 0),
        null,
        '',
        ''
      )
      returning id into v_new_id;

      insert into _opcr_tpl_map (src_id, dst_id) values (v_src.id, v_new_id);
    end if;
  end loop;

  delete from public.opcr_entries e
  where e.form_id = p_form_id
    and e.parent_entry_id is null
    and not exists (select 1 from _opcr_tpl_map m where m.dst_id = e.id);

  delete from public.opcr_entries e
  where e.form_id = p_form_id
    and e.parent_entry_id is not null;

  insert into public.opcr_entries (
    form_id,
    item_id,
    output,
    success_indicator,
    accountable,
    section,
    sort_order,
    parent_entry_id,
    actual_accomplishment,
    remarks
  )
  select
    p_form_id,
    c.item_id,
    coalesce(c.output, ''),
    coalesce(c.success_indicator, ''),
    coalesce(c.accountable, ''),
    c.section,
    coalesce(c.sort_order, 0),
    m.dst_id,
    '',
    ''
  from public.opcr_entries c
  join _opcr_tpl_map m on m.src_id = c.parent_entry_id
  where c.form_id = v_template_id
    and c.parent_entry_id is not null;

  return true;
end;
$$;

drop function if exists public.sync_all_office_opcr_templates(uuid);

create function public.sync_all_office_opcr_templates(p_period_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id uuid;
  v_form record;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not public.is_admin() then
    return 0;
  end if;

  v_template_id := public.office_opcr_form_id(p_period_id);
  if v_template_id is null then
    return 0;
  end if;

  for v_form in
    select id
    from public.opcr_forms
    where period_id = p_period_id
      and id is distinct from v_template_id
  loop
    if public.apply_office_opcr_template(v_form.id) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.office_opcr_form_id(uuid) from public;
revoke all on function public.office_opcr_template(uuid) from public;
revoke all on function public.apply_office_opcr_template(uuid) from public;
revoke all on function public.sync_all_office_opcr_templates(uuid) from public;

grant execute on function public.office_opcr_form_id(uuid) to authenticated;
grant execute on function public.office_opcr_template(uuid) to authenticated;
grant execute on function public.apply_office_opcr_template(uuid) to authenticated;
grant execute on function public.sync_all_office_opcr_templates(uuid) to authenticated;
