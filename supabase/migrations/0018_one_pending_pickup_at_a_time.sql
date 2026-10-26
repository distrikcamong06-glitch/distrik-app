-- A member can only have one pending pickup (order OR reward redemption)
-- at a time, regardless of how it was created (regular checkout, a promo
-- bundle/campaign direct-buy, or tukar poin) — keeps the admin's
-- Penukaran/Pesanan queues simple (one thing per member to hand over).
-- An order/redemption that's past its own expires_at no longer counts,
-- so a forgotten pending row doesn't permanently lock a member out even
-- if nobody ever scanned/cancelled it.

create or replace function public.has_pending_pickup(p_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    exists (
      select 1 from public.orders
      where user_id = p_user_id and status = 'pending' and (expires_at is null or expires_at > now())
    )
    or exists (
      select 1 from public.redemptions
      where user_id = p_user_id and status = 'pending' and (expires_at is null or expires_at > now())
    );
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

  if public.has_pending_pickup(v_user_id) then
    raise exception 'you already have a pending order or redemption — pick it up before ordering again';
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
  v_bundle record;
  v_bundle_item record;
  v_bundle_min int;
  v_total_weight int;
  v_remainder int;
  v_alloc int;
  v_count int;
  v_idx int;
  v_discount_promo public.promos;
  v_discount_item record;
  v_unit_price int;
  v_bogo_promo public.promos;
  v_buy_remaining int;
  v_get_remaining int;
  v_free_units int;
  v_get_name text;
  v_order_item record;
begin
  if v_user_id is null then
    raise exception 'must be logged in';
  end if;

  if public.has_pending_pickup(v_user_id) then
    raise exception 'you already have a pending order or redemption — pick it up before ordering again';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty';
  end if;

  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10));
  v_token := upper(substr(md5(random()::text || clock_timestamp()::text || 'tok'), 1, 8));

  insert into public.orders (user_id, subtotal, discount_amount, total, order_code, status, expires_at, rotating_token, rotating_token_expires_at)
  values (v_user_id, 0, 0, 0, v_code, 'pending', now() + interval '2 hours', v_token, now() + interval '2 minutes')
  returning * into v_order;

  create temporary table tmp_cart (
    product_id uuid primary key,
    product_name text,
    price int,
    remaining int
  ) on commit drop;

  create temporary table tmp_order_items (
    product_id uuid,
    product_name text,
    unit_price int,
    quantity int
  ) on commit drop;

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

    insert into tmp_cart (product_id, product_name, price, remaining)
    values (v_product.id, v_product.name, v_product.price, v_item.quantity)
    on conflict (product_id) do update set remaining = tmp_cart.remaining + excluded.remaining;
  end loop;

  if v_item_count = 0 then
    raise exception 'cart is empty';
  end if;

  -- 1) bundles: every linked product must be present; consume the largest
  -- number of complete sets, splitting bundle_price across them by weight
  for v_bundle in
    select p.id as promo_id, p.bundle_price
    from public.promos p
    where p.kind = 'bundle'
      and p.is_active = true
      and (p.starts_at is null or p.starts_at <= now())
      and (p.ends_at is null or p.ends_at >= now())
  loop
    if exists (
      select 1 from public.promo_products pp
      where pp.promo_id = v_bundle.promo_id
        and not exists (select 1 from tmp_cart tc where tc.product_id = pp.product_id and tc.remaining > 0)
    ) then
      continue;
    end if;

    select min(tc.remaining), sum(tc.price), count(*)
      into v_bundle_min, v_total_weight, v_count
    from public.promo_products pp
    join tmp_cart tc on tc.product_id = pp.product_id
    where pp.promo_id = v_bundle.promo_id;

    if v_bundle_min is null or v_bundle_min <= 0 then
      continue;
    end if;

    v_remainder := v_bundle.bundle_price;
    v_idx := 0;

    for v_bundle_item in
      select tc.product_id, tc.product_name, tc.price
      from public.promo_products pp
      join tmp_cart tc on tc.product_id = pp.product_id
      where pp.promo_id = v_bundle.promo_id
      order by tc.price desc
    loop
      v_idx := v_idx + 1;
      if v_idx = v_count then
        v_alloc := v_remainder;
      else
        v_alloc := round(v_bundle.bundle_price::numeric * v_bundle_item.price / greatest(v_total_weight, 1));
        v_remainder := v_remainder - v_alloc;
      end if;

      insert into tmp_order_items (product_id, product_name, unit_price, quantity)
      values (v_bundle_item.product_id, v_bundle_item.product_name, v_alloc, v_bundle_min);

      update tmp_cart set remaining = remaining - v_bundle_min where product_id = v_bundle_item.product_id;
    end loop;
  end loop;

  -- 2) buy-X-get-Y-free
  for v_bogo_promo in
    select * from public.promos p
    where p.kind = 'bogo'
      and p.is_active = true
      and (p.starts_at is null or p.starts_at <= now())
      and (p.ends_at is null or p.ends_at >= now())
  loop
    select remaining into v_buy_remaining from tmp_cart where product_id = v_bogo_promo.bogo_buy_product_id;
    if v_buy_remaining is null or v_buy_remaining <= 0 then
      continue;
    end if;

    if v_bogo_promo.bogo_buy_product_id = v_bogo_promo.bogo_get_product_id then
      v_free_units := (v_buy_remaining / (v_bogo_promo.bogo_buy_qty + v_bogo_promo.bogo_get_qty)) * v_bogo_promo.bogo_get_qty;
    else
      select remaining into v_get_remaining from tmp_cart where product_id = v_bogo_promo.bogo_get_product_id;
      if v_get_remaining is null or v_get_remaining <= 0 then
        continue;
      end if;
      v_free_units := least((v_buy_remaining / v_bogo_promo.bogo_buy_qty) * v_bogo_promo.bogo_get_qty, v_get_remaining);
    end if;

    if v_free_units > 0 then
      select product_name into v_get_name from tmp_cart where product_id = v_bogo_promo.bogo_get_product_id;

      insert into tmp_order_items (product_id, product_name, unit_price, quantity)
      values (v_bogo_promo.bogo_get_product_id, v_get_name, 0, v_free_units);

      update tmp_cart set remaining = remaining - v_free_units where product_id = v_bogo_promo.bogo_get_product_id;
    end if;
  end loop;

  -- 3) per-item / campaign discounts (kind = 'discount' with linked products)
  for v_discount_promo in
    select p.* from public.promos p
    where p.kind = 'discount'
      and p.is_active = true
      and (p.starts_at is null or p.starts_at <= now())
      and (p.ends_at is null or p.ends_at >= now())
      and exists (select 1 from public.promo_products pp where pp.promo_id = p.id)
    order by p.created_at desc
  loop
    for v_discount_item in
      select tc.product_id, tc.product_name, tc.price, tc.remaining
      from public.promo_products pp
      join tmp_cart tc on tc.product_id = pp.product_id
      where pp.promo_id = v_discount_promo.id and tc.remaining > 0
    loop
      if v_discount_promo.discount_type = 'percent' then
        v_unit_price := v_discount_item.price - floor((v_discount_item.price * v_discount_promo.discount_value) / 100);
      else
        v_unit_price := v_discount_item.price - v_discount_promo.discount_value;
      end if;
      if v_unit_price < 0 then
        v_unit_price := 0;
      end if;

      insert into tmp_order_items (product_id, product_name, unit_price, quantity)
      values (v_discount_item.product_id, v_discount_item.product_name, v_unit_price, v_discount_item.remaining);

      update tmp_cart set remaining = 0 where product_id = v_discount_item.product_id;
    end loop;
  end loop;

  -- 4) whatever's left over has no applicable promo — normal price
  insert into tmp_order_items (product_id, product_name, unit_price, quantity)
  select product_id, product_name, price, remaining from tmp_cart where remaining > 0;

  for v_order_item in select * from tmp_order_items
  loop
    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (v_order.id, v_order_item.product_id, v_order_item.product_name, v_order_item.unit_price, v_order_item.quantity, v_order_item.unit_price * v_order_item.quantity);

    v_subtotal := v_subtotal + v_order_item.unit_price * v_order_item.quantity;
  end loop;

  if p_promo_id is not null then
    select * into v_promo from public.promos where id = p_promo_id for update;
    if v_promo is null or v_promo.is_active = false then
      raise exception 'promo not available';
    end if;
    if exists (select 1 from public.promo_products where promo_id = p_promo_id) then
      raise exception 'this promo applies automatically to its products and cannot be used as a checkout code';
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
