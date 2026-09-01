-- Anti-fraud for the redemption QR: a screenshot of a static QR stays
-- valid forever, so instead the QR encodes a short-lived rotating_token
-- (refreshed by the member's own device every 2 minutes via
-- refresh_redemption_token) rather than the permanent redeem_code.
-- The whole redemption also expires 24h after creation if never redeemed
-- in-store — confirm_redemption auto-cancels and refunds points/stock in
-- that case instead of completing it.

alter table public.redemptions
  add column expires_at timestamptz,
  add column rotating_token text,
  add column rotating_token_expires_at timestamptz;

create index redemptions_rotating_token_idx on public.redemptions (rotating_token);

-- Backfill so pre-existing pending redemptions don't error out with a
-- null expires_at the next time confirm_redemption runs on them.
update public.redemptions
set expires_at = created_at + interval '24 hours'
where expires_at is null and status = 'pending';

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
  v_daily_limit int;
  v_today_count int;
  v_code text;
  v_token text;
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

  select max_redemptions_per_day into v_daily_limit from public.point_rules limit 1;
  if v_daily_limit is not null then
    select count(*) into v_today_count
    from public.redemptions
    where user_id = v_user_id
      and status <> 'cancelled'
      and created_at >= date_trunc('day', now());

    if v_today_count >= v_daily_limit then
      raise exception 'you have reached today''s redemption limit';
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
  v_token := upper(substr(md5(random()::text || clock_timestamp()::text || 'tok'), 1, 8));

  insert into public.point_transactions (user_id, type, points, description)
  values (v_user_id, 'redeem', -v_reward.point_cost, 'Tukar reward: ' || v_reward.name);

  insert into public.redemptions
    (user_id, reward_id, points_used, redeem_code, status, expires_at, rotating_token, rotating_token_expires_at)
  values
    (v_user_id, p_reward_id, v_reward.point_cost, v_code, 'pending',
     now() + interval '24 hours', v_token, now() + interval '2 minutes')
  returning * into v_row;

  return v_row;
end;
$$;

-- Called by the member's device every ~2 minutes while a pending
-- redemption's QR is on screen. Only the owning member can rotate their
-- own token, and only while the redemption is still pending and unexpired.
create or replace function public.refresh_redemption_token(p_redemption_id uuid)
returns public.redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.redemptions;
  v_new_token text;
begin
  if v_user_id is null then
    raise exception 'must be logged in';
  end if;

  select * into v_row from public.redemptions where id = p_redemption_id for update;
  if v_row is null or v_row.user_id <> v_user_id then
    raise exception 'redemption not found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'redemption is not pending';
  end if;
  if v_row.expires_at is not null and now() > v_row.expires_at then
    raise exception 'redemption has expired';
  end if;

  v_new_token := upper(substr(md5(random()::text || clock_timestamp()::text || 'tok'), 1, 8));

  update public.redemptions
  set rotating_token = v_new_token, rotating_token_expires_at = now() + interval '2 minutes'
  where id = p_redemption_id
  returning * into v_row;

  return v_row;
end;
$$;

-- Confirming now also enforces the 24h window: a stale pending
-- redemption gets auto-cancelled with points/stock refunded instead of
-- being completed.
create or replace function public.confirm_redemption(p_redemption_id uuid)
returns public.redemptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.redemptions;
begin
  if not public.is_admin() then
    raise exception 'only admin can confirm a redemption';
  end if;

  select * into v_row from public.redemptions where id = p_redemption_id and status = 'pending' for update;
  if v_row is null then
    raise exception 'redemption not found or already processed';
  end if;

  if v_row.expires_at is not null and now() > v_row.expires_at then
    perform set_config('app.bypass_profile_guard', 'true', true);
    update public.profiles set points_balance = points_balance + v_row.points_used where id = v_row.user_id;
    update public.rewards set stock = stock + 1 where id = v_row.reward_id and stock is not null;
    update public.redemptions set status = 'cancelled' where id = p_redemption_id;

    insert into public.point_transactions (user_id, type, points, description)
    values (v_row.user_id, 'adjust', v_row.points_used, 'Penukaran reward kedaluwarsa (24 jam), poin dikembalikan otomatis');

    raise exception 'this redemption expired 24 hours after it was created — it was auto-cancelled and the points were refunded to the member';
  end if;

  update public.redemptions
  set status = 'completed', completed_at = now()
  where id = p_redemption_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.refresh_redemption_token(uuid) to authenticated;
