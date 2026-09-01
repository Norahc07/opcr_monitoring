-- Official staffs = people who already have a Supabase login (auth.users + profiles).
-- Run this once in the SQL editor. Safe to re-run.
-- After it succeeds, refresh Users — Add staff will work, and existing logins will appear.

-- Deleting a login also removes that staff row.
alter table public.office_staff
  drop constraint if exists office_staff_user_id_fkey;

alter table public.office_staff
  add constraint office_staff_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

create or replace function public.ensure_staff_for_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_order integer;
begin
  select coalesce(max(sort_order), 0) + 10 into next_order from public.office_staff;

  insert into public.office_staff (
    full_name,
    short_name,
    position,
    role,
    include_in_tally,
    user_id,
    sort_order
  )
  values (
    coalesce(nullif(trim(new.full_name), ''), 'Staff'),
    coalesce(nullif(trim(new.short_name), ''), upper(left(coalesce(nullif(trim(new.full_name), ''), 'STAFF'), 12))),
    coalesce(new.position, ''),
    case when new.role = 'admin' then 'admin' else 'staff' end,
    true,
    new.id,
    next_order
  )
  on conflict (user_id) do update
  set
    full_name = excluded.full_name,
    short_name = excluded.short_name,
    position = excluded.position,
    role = excluded.role,
    include_in_tally = true;

  return new;
end;
$$;

drop trigger if exists profiles_sync_staff on public.profiles;
create trigger profiles_sync_staff
  after insert or update of full_name, short_name, position, role
  on public.profiles
  for each row execute procedure public.ensure_staff_for_profile();

-- Link leftover roster names to matching logins so their tally columns are kept.
update public.office_staff s
set user_id = p.id
from public.profiles p
where s.user_id is null
  and (
    lower(nullif(trim(s.full_name), '')) = lower(nullif(trim(p.full_name), ''))
    or lower(nullif(trim(s.short_name), '')) = lower(nullif(trim(p.short_name), ''))
  )
  and not exists (
    select 1 from public.office_staff x where x.user_id = p.id
  );

-- Create / refresh a staff row for every login, including admin.
insert into public.office_staff (full_name, short_name, position, role, include_in_tally, user_id, sort_order)
select
  coalesce(nullif(trim(p.full_name), ''), 'Staff'),
  coalesce(nullif(trim(p.short_name), ''), upper(left(coalesce(nullif(trim(p.full_name), ''), 'STAFF'), 12))),
  coalesce(p.position, ''),
  case when p.role = 'admin' then 'admin' else 'staff' end,
  true,
  p.id,
  500 + row_number() over (order by p.created_at)
from public.profiles p
on conflict (user_id) do update
set
  full_name = excluded.full_name,
  short_name = excluded.short_name,
  position = excluded.position,
  role = excluded.role,
  include_in_tally = true;

update public.office_staff
set include_in_tally = true
where include_in_tally is distinct from true;

-- Remove names that were never given a Supabase account.
delete from public.office_staff
where user_id is null;

-- Users page: list / create / delete staff logins.
grant select, insert, update, delete on public.office_staff to authenticated;

create or replace function public.admin_list_logins()
returns table (
  id uuid,
  email text,
  full_name text,
  short_name text,
  "position" text,
  office text,
  role text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can list logins';
  end if;

  return query
  select
    p.id,
    u.email::text,
    p.full_name,
    p.short_name,
    p."position",
    p.office,
    p.role,
    p.created_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  order by p.created_at asc;
end;
$$;

create or replace function public.admin_create_login(
  p_email text,
  p_password text,
  p_full_name text default '',
  p_short_name text default '',
  p_position text default '',
  p_office text default 'E-Learning Ville',
  p_role text default 'staff'
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  new_id uuid := gen_random_uuid();
  clean_email text := lower(trim(p_email));
begin
  if not public.is_admin() then
    raise exception 'Only admins can create logins';
  end if;
  if p_role not in ('staff', 'admin') then
    raise exception 'Invalid role';
  end if;
  if clean_email is null or length(clean_email) < 3 or position('@' in clean_email) = 0 then
    raise exception 'A valid email is required';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if exists (select 1 from auth.users where lower(email) = clean_email) then
    raise exception 'That email already has an account';
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    email_change_token_current
  ) values (
    coalesce(
      (select instance_id from auth.users limit 1),
      '00000000-0000-0000-0000-000000000000'
    ),
    new_id,
    'authenticated',
    'authenticated',
    clean_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', coalesce(p_full_name, '')),
    now(),
    now(),
    '',
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    gen_random_uuid(),
    new_id,
    jsonb_build_object('sub', new_id::text, 'email', clean_email),
    'email',
    new_id::text,
    now(),
    now(),
    now()
  );

  insert into public.profiles (id, full_name, short_name, position, office, role)
  values (
    new_id,
    coalesce(p_full_name, ''),
    coalesce(p_short_name, ''),
    coalesce(p_position, ''),
    coalesce(nullif(p_office, ''), 'E-Learning Ville'),
    p_role
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    short_name = excluded.short_name,
    position = excluded.position,
    office = excluded.office,
    role = excluded.role;

  return new_id;
end;
$$;

create or replace function public.admin_reset_password(
  p_user_id uuid,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can reset passwords';
  end if;
  if p_user_id is null then
    raise exception 'User is required';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found';
  end if;

  update auth.users
  set
    encrypted_password = crypt(p_password, gen_salt('bf')),
    updated_at = now()
  where id = p_user_id;
end;
$$;

create or replace function public.admin_delete_login(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can delete logins';
  end if;
  if p_user_id is null then
    raise exception 'User is required';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own login';
  end if;

  delete from public.office_staff where user_id = p_user_id;
  delete from auth.identities where user_id = p_user_id;
  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_list_logins() from public;
revoke all on function public.admin_create_login(text, text, text, text, text, text, text) from public;
revoke all on function public.admin_reset_password(uuid, text) from public;
revoke all on function public.admin_delete_login(uuid) from public;

grant execute on function public.admin_list_logins() to authenticated;
grant execute on function public.admin_create_login(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;
grant execute on function public.admin_delete_login(uuid) to authenticated;
