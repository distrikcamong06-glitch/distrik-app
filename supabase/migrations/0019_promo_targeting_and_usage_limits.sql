-- Two additions to the promo system:
--
-- 1) Targeting: a promo can be restricted to a subset of members instead
--    of everyone. target_mode:
--      'all'          - everyone (default, unchanged behavior)
--      'percent'      - a stable ~target_percent% of all members, decided
--                       by hashing (promo_id, user_id) so the same people
--                       see it consistently rather than flickering
--      'top_spenders' - the target_count members with the highest total
--                       amount_spent (computed live, so it's always current)
--      'new_users'    - members who signed up in the last
--                       target_new_user_days days (computed live)
--      'specific'     - an admin-picked list of members
--      'random'       - target_count members picked at random once, when
--                       the promo is saved (stored the same way as
--                       'specific' — just auto-populated)
--    is_promo_eligible() is the single source of truth, used both in RLS
--    (so an ineligible member never even sees the promo/pricing) and
--    inside place_order (since SECURITY DEFINER functions bypass RLS).
--
-- 2) max_uses_per_user now applies to every promo kind, not just checkout
--    coupons — place_order skips applying a bundle/bogo/item/campaign
--    promo (falling back to normal pricing) once a member has hit its
--    cap, tracked via a promo_redemptions row per order it was applied
--    to. null = unlimited (column is now nullable).

alter table public.promos
  alter column max_uses_per_user drop not null,
  add column target_mode text not null default 'all'
    check (target_mode in ('all', 'percent', 'top_spenders', 'new_users', 'specific', 'random')),
  add column target_percent int check (target_percent is null or (target_percent >= 1 and target_percent <= 100)),
  add column target_count int check (target_count is null or target_count >= 1),
  add column target_new_user_days int check (target_new_user_days is null or target_new_user_days >= 1);

create table public.promo_target_members (
  promo_id uuid not null references public.promos (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (promo_id, user_id)
);

alter table public.promo_target_members enable row level security;

create policy "promo_target_members_admin_all" on public.promo_target_members
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.is_promo_eligible(p_promo_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_promo public.promos;
begin
  if p_user_id is null then
    return false;
  end if;

  select * into v_promo from public.promos where id = p_promo_id;
  if v_promo is null then
    return false;
  end if;

  if v_promo.target_mode = 'all' then
    return true;
  elsif v_promo.target_mode = 'percent' then
    return mod(abs(hashtext(v_promo.id::text || p_user_id::text)), 100) < coalesce(v_promo.target_percent, 0);
  elsif v_promo.target_mode in ('specific', 'random') then
    return exists (
      select 1 from public.promo_target_members
      where promo_id = v_promo.id and user_id = p_user_id
    );
  elsif v_promo.target_mode = 'top_spenders' then
    return exists (
      select 1 from (
        select user_id
        from public.point_transactions
        where type = 'earn' and amount_spent is not null
        group by user_id
        order by sum(amount_spent) desc
        limit coalesce(v_promo.target_count, 0)
      ) top
      where top.user_id = p_user_id
    );
  elsif v_promo.target_mode = 'new_users' then
    return exists (
      select 1 from public.profiles
      where id = p_user_id
        and created_at >= now() - make_interval(days => coalesce(v_promo.target_new_user_days, 30))
    );
  else
    return true;
  end if;
end;
$$;

drop policy if exists "promos_select_active_or_admin" on public.promos;
create policy "promos_select_active_or_admin" on public.promos
  for select using (
    public.is_admin()
    or (is_active = true and public.is_promo_eligible(id, auth.uid()))
  );

drop policy if exists "promo_products_select_active_or_admin" on public.promo_products;
create policy "promo_products_select_active_or_admin" on public.promo_products
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.promos p
      where p.id = promo_id and p.is_active = true and public.is_promo_eligible(p.id, auth.uid())
    )
  );

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
  v_discount_applied boolean;
  v_bogo_promo public.promos;
  v_buy_remaining int;
  v_get_remaining int;
  v_free_units int;
  v_get_name text;
  v_order_item record;
  v_use_count int;
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
    select p.id as promo_id, p.bundle_price, p.max_uses_per_user
    from public.promos p
    where p.kind = 'bundle'
      and p.is_active = true
      and (p.starts_at is null or p.starts_at <= now())
      and (p.ends_at is null or p.ends_at >= now())
      and public.is_promo_eligible(p.id, v_user_id)
  loop
    if v_bundle.max_uses_per_user is not null then
      select count(*) into v_use_count from public.promo_redemptions where promo_id = v_bundle.promo_id and user_id = v_user_id;
      if v_use_count >= v_bundle.max_uses_per_user then
        continue;
      end if;
    end if;

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

    insert into public.promo_redemptions (promo_id, user_id, order_id) values (v_bundle.promo_id, v_user_id, v_order.id);
  end loop;

  -- 2) buy-X-get-Y-free
  for v_bogo_promo in
    select * from public.promos p
    where p.kind = 'bogo'
      and p.is_active = true
      and (p.starts_at is null or p.starts_at <= now())
      and (p.ends_at is null or p.ends_at >= now())
      and public.is_promo_eligible(p.id, v_user_id)
  loop
    if v_bogo_promo.max_uses_per_user is not null then
      select count(*) into v_use_count from public.promo_redemptions where promo_id = v_bogo_promo.id and user_id = v_user_id;
      if v_use_count >= v_bogo_promo.max_uses_per_user then
        continue;
      end if;
    end if;

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

      insert into public.promo_redemptions (promo_id, user_id, order_id) values (v_bogo_promo.id, v_user_id, v_order.id);
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
      and public.is_promo_eligible(p.id, v_user_id)
    order by p.created_at desc
  loop
    if v_discount_promo.max_uses_per_user is not null then
      select count(*) into v_use_count from public.promo_redemptions where promo_id = v_discount_promo.id and user_id = v_user_id;
      if v_use_count >= v_discount_promo.max_uses_per_user then
        continue;
      end if;
    end if;

    v_discount_applied := false;

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
      v_discount_applied := true;
    end loop;

    if v_discount_applied then
      insert into public.promo_redemptions (promo_id, user_id, order_id) values (v_discount_promo.id, v_user_id, v_order.id);
    end if;
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
    if not public.is_promo_eligible(p_promo_id, v_user_id) then
      raise exception 'you are not eligible for this promo';
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
    if v_promo.max_uses_per_user is not null and v_promo_uses >= v_promo.max_uses_per_user then
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
