-- Admin CRUD for login accounts (create / list / delete) from the Users page.
-- Run this once in the Supabase SQL editor. Safe to re-run.

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
revoke all on function public.admin_delete_login(uuid) from public;

grant execute on function public.admin_list_logins() to authenticated;
grant execute on function public.admin_create_login(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.admin_delete_login(uuid) to authenticated;
