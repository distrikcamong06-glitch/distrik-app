-- Barcode no longer rotates on the frontend (member just shows a static
-- code to the cashier), so the 2-minute rotation window stopped mattering
-- for anti-screenshot purposes. Shorten the pending-redemption/order
-- window from 24h down to 2h instead, so a stale screenshot still goes
-- bad quickly. rotating_token/rotating_token_expires_at columns and the
-- refresh_redemption_token/refresh_order_token RPCs are left in place
-- (harmless, just unused by the client now).

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
     now() + interval '2 hours', v_token, now() + interval '2 minutes')
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.place_order(p_items jsonb, p_promo_id uuid default null)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item record;
  v_product public.products;
  v_subtotal int := 0;
  v_discount int := 0;
  v_total int;
  v_promo public.promos;
  v_promo_uses int;
  v_code text;
  v_token text;
  v_order public.orders;
  v_item_count int := 0;
begin
  if v_user_id is null then
    raise exception 'must be logged in';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty';
  end if;

  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
  v_token := upper(substr(md5(random()::text || clock_timestamp()::text || 'tok'), 1, 8));

  insert into public.orders (user_id, subtotal, discount_amount, total, order_code, status, expires_at, rotating_token, rotating_token_expires_at)
  values (v_user_id, 0, 0, 0, v_code, 'pending', now() + interval '2 hours', v_token, now() + interval '2 minutes')
  returning * into v_order;

  for v_item in select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity int)
  loop
    v_item_count := v_item_count + 1;

    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'invalid quantity';
    end if;

    select * into v_product from public.products where id = v_item.product_id for update;
    if v_product is null or v_product.is_active = false then
      raise exception 'product not available';
    end if;
    if v_product.stock is not null and v_product.stock < v_item.quantity then
      raise exception 'not enough stock for %', v_product.name;
    end if;

    if v_product.stock is not null then
      update public.products set stock = stock - v_item.quantity where id = v_product.id;
    end if;

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (v_order.id, v_product.id, v_product.name, v_product.price, v_item.quantity, v_product.price * v_item.quantity);

    v_subtotal := v_subtotal + v_product.price * v_item.quantity;
  end loop;

  if v_item_count = 0 then
    raise exception 'cart is empty';
  end if;

  if p_promo_id is not null then
    select * into v_promo from public.promos where id = p_promo_id for update;
    if v_promo is null or v_promo.is_active = false then
      raise exception 'promo not available';
    end if;
    if v_promo.starts_at is not null and now() < v_promo.starts_at then
      raise exception 'promo not started yet';
    end if;
    if v_promo.ends_at is not null and now() > v_promo.ends_at then
      raise exception 'promo has ended';
    end if;
    if v_promo.min_order_amount is not null and v_subtotal < v_promo.min_order_amount then
      raise exception 'order does not meet the minimum amount for this promo';
    end if;

    select count(*) into v_promo_uses from public.promo_redemptions where promo_id = p_promo_id and user_id = v_user_id;
    if v_promo_uses >= v_promo.max_uses_per_user then
      raise exception 'you have already used this promo';
    end if;

    if v_promo.discount_type = 'percent' then
      v_discount := (v_subtotal * v_promo.discount_value) / 100;
    else
      v_discount := v_promo.discount_value;
    end if;
    if v_discount > v_subtotal then
      v_discount := v_subtotal;
    end if;

    insert into public.promo_redemptions (promo_id, user_id, order_id) values (p_promo_id, v_user_id, v_order.id);
  end if;

  v_total := v_subtotal - v_discount;

  update public.orders
  set subtotal = v_subtotal, discount_amount = v_discount, total = v_total, promo_id = p_promo_id
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

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
    values (v_row.user_id, 'adjust', v_row.points_used, 'Penukaran reward kedaluwarsa (2 jam), poin dikembalikan otomatis');

    raise exception 'this redemption expired 2 hours after it was created — it was auto-cancelled and the points were refunded to the member';
  end if;

  update public.redemptions
  set status = 'completed', completed_at = now()
  where id = p_redemption_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.confirm_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.orders;
  v_ratio int;
  v_points int;
begin
  if not public.is_admin() then
    raise exception 'only admin can confirm an order';
  end if;

  select * into v_row from public.orders where id = p_order_id and status = 'pending' for update;
  if v_row is null then
    raise exception 'order not found or already processed';
  end if;

  if v_row.expires_at is not null and now() > v_row.expires_at then
    perform public.restock_order_items(p_order_id);
    update public.orders set status = 'cancelled' where id = p_order_id;
    delete from public.promo_redemptions where order_id = p_order_id;
    raise exception 'this order expired 2 hours after it was placed — it was auto-cancelled and stock was restored';
  end if;

  update public.orders set status = 'completed', completed_at = now() where id = p_order_id;

  select rupiah_per_point into v_ratio from public.point_rules limit 1;
  v_ratio := greatest(coalesce(v_ratio, 1000), 1);
  v_points := floor(v_row.total::numeric / v_ratio)::int;

  if v_points > 0 then
    perform set_config('app.bypass_profile_guard', 'true', true);
    update public.profiles set points_balance = points_balance + v_points where id = v_row.user_id;

    insert into public.point_transactions (user_id, admin_id, type, points, amount_spent, description)
    values (v_row.user_id, auth.uid(), 'earn', v_points, v_row.total, 'Pesanan online #' || v_row.order_code);
  end if;

  select * into v_row from public.orders where id = p_order_id;
  return v_row;
end;
$$;
