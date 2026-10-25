-- Product catalog + cart/checkout ordering system. Members browse real
-- products (rupiah prices, separate from the points-reward catalog),
-- optionally apply an admin-created promo (one-time use per member), place
-- an order, and show the resulting QR at the register — payment still
-- happens in person at the cashier. Reuses the same anti-screenshot
-- rotating-QR + 24h-expiry pattern already built for reward redemptions.
-- Confirming an order also credits loyalty points on the paid total, same
-- ratio as a regular cashier scan.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  price int not null check (price > 0), -- rupiah
  stock int check (stock is null or stock >= 0), -- null = unlimited
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.promos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value int not null check (discount_value > 0), -- percent (1-100) or rupiah amount
  min_order_amount int check (min_order_amount is null or min_order_amount >= 0),
  max_uses_per_user int not null default 1 check (max_uses_per_user > 0),
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subtotal int not null,
  discount_amount int not null default 0,
  total int not null,
  promo_id uuid references public.promos (id) on delete set null,
  order_code text not null unique,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  rotating_token text,
  rotating_token_expires_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text not null,
  unit_price int not null,
  quantity int not null check (quantity > 0),
  subtotal int not null
);

create table public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references public.promos (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now()
);

create index orders_rotating_token_idx on public.orders (rotating_token);
create index order_items_order_id_idx on public.order_items (order_id);

alter table public.products enable row level security;
alter table public.promos enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "products_select_active_or_admin" on public.products
  for select using (is_active = true or public.is_admin());
create policy "products_admin_write" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

create policy "promos_select_active_or_admin" on public.promos
  for select using (is_active = true or public.is_admin());
create policy "promos_admin_write" on public.promos
  for all using (public.is_admin()) with check (public.is_admin());

create policy "promo_redemptions_select_own_or_admin" on public.promo_redemptions
  for select using (user_id = auth.uid() or public.is_admin());

create policy "orders_select_own_or_admin" on public.orders
  for select using (user_id = auth.uid() or public.is_admin());

create policy "order_items_select_own_or_admin" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and (o.user_id = auth.uid() or public.is_admin())
    )
  );

-- Storage buckets for product photos and promo images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('products', 'products', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('promos', 'promos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "products_bucket_public_read" on storage.objects
  for select using (bucket_id = 'products');
create policy "products_bucket_admin_insert" on storage.objects
  for insert with check (bucket_id = 'products' and public.is_admin());
create policy "products_bucket_admin_update" on storage.objects
  for update using (bucket_id = 'products' and public.is_admin()) with check (bucket_id = 'products' and public.is_admin());
create policy "products_bucket_admin_delete" on storage.objects
  for delete using (bucket_id = 'products' and public.is_admin());

create policy "promos_bucket_public_read" on storage.objects
  for select using (bucket_id = 'promos');
create policy "promos_bucket_admin_insert" on storage.objects
  for insert with check (bucket_id = 'promos' and public.is_admin());
create policy "promos_bucket_admin_update" on storage.objects
  for update using (bucket_id = 'promos' and public.is_admin()) with check (bucket_id = 'promos' and public.is_admin());
create policy "promos_bucket_admin_delete" on storage.objects
  for delete using (bucket_id = 'promos' and public.is_admin());

-- ============================================================================
-- RPCs
-- ============================================================================

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
  values (v_user_id, 0, 0, 0, v_code, 'pending', now() + interval '24 hours', v_token, now() + interval '2 minutes')
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

create or replace function public.refresh_order_token(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.orders;
  v_new_token text;
begin
  if v_user_id is null then
    raise exception 'must be logged in';
  end if;

  select * into v_row from public.orders where id = p_order_id for update;
  if v_row is null or v_row.user_id <> v_user_id then
    raise exception 'order not found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'order is not pending';
  end if;
  if v_row.expires_at is not null and now() > v_row.expires_at then
    raise exception 'order has expired';
  end if;

  v_new_token := upper(substr(md5(random()::text || clock_timestamp()::text || 'tok'), 1, 8));

  update public.orders
  set rotating_token = v_new_token, rotating_token_expires_at = now() + interval '2 minutes'
  where id = p_order_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.restock_order_items(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.products p
  set stock = p.stock + oi.quantity
  from public.order_items oi
  where oi.order_id = p_order_id and oi.product_id = p.id and p.stock is not null;
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
    raise exception 'this order expired 24 hours after it was placed — it was auto-cancelled and stock was restored';
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

create or replace function public.cancel_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.orders;
begin
  if not public.is_admin() then
    raise exception 'only admin can cancel an order';
  end if;

  update public.orders set status = 'cancelled' where id = p_order_id and status = 'pending' returning * into v_row;
  if v_row is null then
    raise exception 'order not found or already processed';
  end if;

  perform public.restock_order_items(p_order_id);
  delete from public.promo_redemptions where order_id = p_order_id;

  return v_row;
end;
$$;

grant execute on function public.place_order(jsonb, uuid) to authenticated;
grant execute on function public.refresh_order_token(uuid) to authenticated;
grant execute on function public.confirm_order(uuid) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
