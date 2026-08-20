-- Audit trail for OPCR actions. Run once in the SQL editor. Safe to re-run.

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
