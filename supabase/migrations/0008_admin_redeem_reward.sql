-- Lets an admin redeem a reward directly on behalf of a member who is
-- present in-store but doesn't have their phone/QR handy. Mirrors
-- redeem_reward()'s validation (stock, max_per_user, daily limit) but is
-- admin-gated and marks the redemption 'completed' immediately, since the
-- admin is handing over the reward right then rather than queuing a pickup.

create or replace function public.admin_redeem_reward(p_member_code text, p_reward_id uuid)
returns public.redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_user_id uuid;
  v_reward public.rewards;
  v_balance int;
  v_used_count int;
  v_daily_limit int;
  v_today_count int;
  v_code text;
  v_row public.redemptions;
begin
  if not public.is_admin() then
    raise exception 'only admin can redeem on behalf of a member';
  end if;

  select id into v_user_id
  from public.profiles
  where member_code = p_member_code and is_active = true
  for update;

  if v_user_id is null then
    raise exception 'member not found or inactive';
  end if;

  select * into v_reward from public.rewards where id = p_reward_id for update;
  if v_reward is null or v_reward.is_active = false then
    raise exception 'reward not available';
  end if;
  if v_reward.stock is not null and v_reward.stock <= 0 then
    raise exception 'reward out of stock';
  end if;

  if v_reward.max_per_user is not null then
    select count(*) into v_used_count
    from public.redemptions
    where user_id = v_user_id and reward_id = p_reward_id and status <> 'cancelled';

    if v_used_count >= v_reward.max_per_user then
      raise exception 'member has reached the redemption limit for this reward';
    end if;
  end if;

  select max_redemptions_per_day into v_daily_limit from public.point_rules limit 1;
  if v_daily_limit is not null then
    select count(*) into v_today_count
    from public.redemptions
    where user_id = v_user_id
      and status <> 'cancelled'
      and created_at >= date_trunc('day', now());

    if v_today_count >= v_daily_limit then
      raise exception 'member has reached today''s redemption limit';
    end if;
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

  insert into public.point_transactions (user_id, admin_id, type, points, description)
  values (v_user_id, v_admin_id, 'redeem', -v_reward.point_cost, 'Tukar reward (oleh admin): ' || v_reward.name);

  insert into public.redemptions (user_id, reward_id, points_used, redeem_code, status, completed_at)
  values (v_user_id, p_reward_id, v_reward.point_cost, v_code, 'completed', now())
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.admin_redeem_reward(text, uuid) to authenticated;
