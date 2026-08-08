-- Fixes profiles_guard_update() blocking redeem_reward() (and friends) from
-- updating the caller's own points_balance. auth.uid() correctly stays the
-- calling user's id inside SECURITY DEFINER functions (that's not the bug —
-- SECURITY DEFINER only elevates Postgres-level privileges, not auth
-- identity), so a non-admin redeeming their own points tripped the guard's
-- "only admins may touch points_balance" check.
--
-- Fix: the trusted RPCs set a transaction-local flag right before they touch
-- a protected field themselves (they've already validated the change), and
-- the guard trusts that flag in addition to auth.uid() is null / is_admin().
-- Only needed if you already ran 0001_init.sql before this fix.

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
     or new.member_code is distinct from old.member_code then
    raise exception 'not allowed to modify protected profile fields';
  end if;

  return new;
end;
$$;

create or replace function public.admin_add_points(p_member_code text, p_amount_spent int)
returns public.point_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_user_id uuid;
  v_ratio int;
  v_points int;
  v_tx public.point_transactions;
begin
  if not public.is_admin() then
    raise exception 'only admin can add points';
  end if;

  if p_amount_spent is null or p_amount_spent <= 0 then
    raise exception 'amount_spent must be positive';
  end if;

  select id into v_user_id
  from public.profiles
  where member_code = p_member_code and is_active = true
  for update;

  if v_user_id is null then
    raise exception 'member not found or inactive';
  end if;

  select rupiah_per_point into v_ratio from public.point_rules limit 1;
  v_ratio := greatest(coalesce(v_ratio, 1000), 1);
  v_points := floor(p_amount_spent::numeric / v_ratio)::int;

  if v_points <= 0 then
    raise exception 'amount too small to earn any points';
  end if;

  perform set_config('app.bypass_profile_guard', 'true', true);
  update public.profiles
  set points_balance = points_balance + v_points
  where id = v_user_id;

  insert into public.point_transactions (user_id, admin_id, type, points, amount_spent, description)
  values (v_user_id, v_admin_id, 'earn', v_points, p_amount_spent, 'Belanja di toko')
  returning * into v_tx;

  return v_tx;
end;
$$;

create or replace function public.redeem_reward(p_reward_id uuid)
returns public.redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reward public.rewards;
  v_balance int;
  v_code text;
  v_row public.redemptions;
begin
  if v_user_id is null then
    raise exception 'must be logged in';
  end if;

  select * into v_reward from public.rewards where id = p_reward_id for update;
  if v_reward is null or v_reward.is_active = false then
    raise exception 'reward not available';
  end if;
  if v_reward.stock is not null and v_reward.stock <= 0 then
    raise exception 'reward out of stock';
  end if;

  select points_balance into v_balance from public.profiles where id = v_user_id for update;
  if v_balance is null or v_balance < v_reward.point_cost then
    raise exception 'insufficient points balance';
  end if;

  perform set_config('app.bypass_profile_guard', 'true', true);
  update public.profiles
  set points_balance = points_balance - v_reward.point_cost
  where id = v_user_id;

  if v_reward.stock is not null then
    update public.rewards set stock = stock - 1 where id = p_reward_id;
  end if;

  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));

  insert into public.point_transactions (user_id, type, points, description)
  values (v_user_id, 'redeem', -v_reward.point_cost, 'Tukar reward: ' || v_reward.name);

  insert into public.redemptions (user_id, reward_id, points_used, redeem_code, status)
  values (v_user_id, p_reward_id, v_reward.point_cost, v_code, 'pending')
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.cancel_redemption(p_redemption_id uuid)
returns public.redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.redemptions;
begin
  if not public.is_admin() then
    raise exception 'only admin can cancel a redemption';
  end if;

  update public.redemptions r
  set status = 'cancelled'
  where r.id = p_redemption_id and r.status = 'pending'
  returning * into v_row;

  if v_row is null then
    raise exception 'redemption not found or already processed';
  end if;

  -- refund the points and the stock slot
  perform set_config('app.bypass_profile_guard', 'true', true);
  update public.profiles set points_balance = points_balance + v_row.points_used where id = v_row.user_id;
  update public.rewards set stock = stock + 1 where id = v_row.reward_id and stock is not null;

  insert into public.point_transactions (user_id, type, points, description)
  values (v_row.user_id, 'adjust', v_row.points_used, 'Pembatalan penukaran reward');

  return v_row;
end;
$$;
