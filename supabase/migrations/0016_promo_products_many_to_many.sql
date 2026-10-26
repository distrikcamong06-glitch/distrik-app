-- Generalizes the single product_id on promos into a many-to-many join
-- table, so one promo can target:
--   0 products -> unchanged: a checkout-wide coupon code picked in the cart
--   1 product  -> a single-product flash-sale discount (what product_id did)
--   N products -> a "campaign"/bundle promo: one discount + one countdown
--                 shared across several chosen products at once
-- All three are the same underlying promos row, just with a different
-- number of linked products — "campaign", "gabungan", etc. are all this.

create table public.promo_products (
  promo_id uuid not null references public.promos (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (promo_id, product_id)
);

create index promo_products_product_id_idx on public.promo_products (product_id);

alter table public.promo_products enable row level security;

create policy "promo_products_select_active_or_admin" on public.promo_products
  for select using (
    public.is_admin()
    or exists (select 1 from public.promos p where p.id = promo_id and p.is_active = true)
  );
create policy "promo_products_admin_write" on public.promo_products
  for all using (public.is_admin()) with check (public.is_admin());

-- backfill existing single-product promos into the join table
insert into public.promo_products (promo_id, product_id)
select id, product_id from public.promos where product_id is not null;

drop index if exists promos_product_id_idx;
alter table public.promos drop column product_id;

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
  v_product_promo public.promos;
  v_unit_price int;
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

    select p.* into v_product_promo
    from public.promos p
    join public.promo_products pp on pp.promo_id = p.id
    where pp.product_id = v_product.id
      and p.is_active = true
      and (p.starts_at is null or p.starts_at <= now())
      and (p.ends_at is null or p.ends_at >= now())
    order by p.created_at desc
    limit 1;

    v_unit_price := v_product.price;
    if v_product_promo is not null then
      if v_product_promo.discount_type = 'percent' then
        v_unit_price := v_product.price - floor((v_product.price * v_product_promo.discount_value) / 100);
      else
        v_unit_price := v_product.price - v_product_promo.discount_value;
      end if;
      if v_unit_price < 0 then
        v_unit_price := 0;
      end if;
    end if;

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (v_order.id, v_product.id, v_product.name, v_unit_price, v_item.quantity, v_unit_price * v_item.quantity);

    v_subtotal := v_subtotal + v_unit_price * v_item.quantity;
  end loop;

  if v_item_count = 0 then
    raise exception 'cart is empty';
  end if;

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
