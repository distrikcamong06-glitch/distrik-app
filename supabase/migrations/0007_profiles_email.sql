-- Adds profiles.email (synced from auth.users at signup), needed so the
-- admin Members page can trigger a "send password reset" email for a member
-- without needing the service-role key in the browser.

alter table public.profiles add column email text;

-- Backfill existing members.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bonus int;
  v_user_id uuid;
begin
  select signup_bonus into v_bonus from public.point_rules limit 1;
  v_bonus := coalesce(v_bonus, 0);

  insert into public.profiles (id, member_code, name, email, phone, role, points_balance)
  values (
    new.id,
    public.generate_member_code(),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'phone',
    'user',
    v_bonus
  )
  returning id into v_user_id;

  if v_bonus > 0 then
    insert into public.point_transactions (user_id, type, points, description)
    values (v_user_id, 'earn', v_bonus, 'Bonus pendaftaran member baru');
  end if;

  return new;
end;
$$;

create or replace function public.profiles_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or public.is_admin()
     or coalesce(current_setting('app.bypass_profile_guard', true), 'false') = 'true' then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.points_balance is distinct from old.points_balance
     or new.is_active is distinct from old.is_active
     or new.member_code is distinct from old.member_code
     or new.email is distinct from old.email then
    raise exception 'not allowed to modify protected profile fields';
  end if;

  return new;
end;
$$;
