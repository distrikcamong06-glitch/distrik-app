-- Fixes profiles_guard_update() so it doesn't block admin-bootstrapping
-- queries run from the Supabase SQL editor / psql (which have no
-- Supabase Auth session, so auth.uid() is null there).
-- Only needed if you already ran 0001_init.sql before this fix — a fresh
-- project running 0001_init.sql today already has this included.

create or replace function public.profiles_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.points_balance is distinct from old.points_balance
     or new.is_active is distinct from old.is_active
     or new.member_code is distinct from old.member_code then
    raise exception 'not allowed to modify protected profile fields';
  end if;

  return new;
end;
$$;
