-- Per-member redemption limit for rewards, separate from total stock.
-- null = no limit (default, unchanged behavior).

alter table public.rewards
  add column max_per_user int check (max_per_user is null or max_per_user > 0);

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
  v_used_count int;
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

  if v_reward.max_per_user is not null then
    select count(*) into v_used_count
    from public.redemptions
    where user_id = v_user_id and reward_id = p_reward_id and status <> 'cancelled';

    if v_used_count >= v_reward.max_per_user then
      raise exception 'you have reached the redemption limit for this reward';
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

  insert into public.point_transactions (user_id, type, points, description)
  values (v_user_id, 'redeem', -v_reward.point_cost, 'Tukar reward: ' || v_reward.name);

  insert into public.redemptions (user_id, reward_id, points_used, redeem_code, status)
  values (v_user_id, p_reward_id, v_reward.point_cost, v_code, 'pending')
  returning * into v_row;

  return v_row;
end;
$$;
