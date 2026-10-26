-- Distrik Camong — membership & loyalty points schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`) on a fresh project.

create extension if not exists pgcrypto;

-- ============================================================================
-- TABLES
-- ============================================================================

create table public.point_rules (
  id uuid primary key default gen_random_uuid(),
  rupiah_per_point int not null default 1000 check (rupiah_per_point > 0),
  signup_bonus int not null default 0 check (signup_bonus >= 0),
  points_expiry_days int, -- null = never expires
  max_redemptions_per_day int check (max_redemptions_per_day is null or max_redemptions_per_day > 0), -- null = no daily limit
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  member_code text not null unique,
  name text not null,
  email text,
  phone text,
  role text not null default 'user' check (role in ('admin', 'user')),
  points_balance int not null default 0 check (points_balance >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  admin_id uuid references public.profiles (id) on delete set null,
  type text not null check (type in ('earn', 'redeem', 'adjust')),
  points int not null,
  amount_spent int,
  description text,
  created_at timestamptz not null default now()
);

create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  point_cost int not null check (point_cost > 0),
  stock int check (stock is null or stock >= 0), -- null = unlimited
  max_per_user int check (max_per_user is null or max_per_user > 0), -- null = no per-member limit
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reward_id uuid not null references public.rewards (id) on delete restrict,
  points_used int not null,
  redeem_code text not null unique,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz, -- pending redemptions auto-cancel + refund past this (2h from creation)
  rotating_token text, -- what the QR actually encodes; refreshed every 2min so a screenshot goes stale
  rotating_token_expires_at timestamptz
);

create index redemptions_rotating_token_idx on public.redemptions (rotating_token);

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  path text not null,
  icon text,
  "order" int not null default 0,
  parent_id uuid references public.menus (id) on delete cascade,
  role text not null default 'all' check (role in ('admin', 'user', 'all')),
  is_active boolean not null default true
);

create index point_transactions_user_id_idx on public.point_transactions (user_id);
create index point_transactions_created_at_idx on public.point_transactions (created_at desc);
create index redemptions_user_id_idx on public.redemptions (user_id);
create index redemptions_status_idx on public.redemptions (status);
create index profiles_member_code_idx on public.profiles (member_code);

-- ============================================================================
-- HELPERS
-- ============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create sequence public.member_code_seq;

create or replace function public.generate_member_code()
returns text
language sql
as $$
  select 'CMG-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.member_code_seq')::text, 6, '0');
$$;

-- Auto-create a profile (with a fresh member_code + any signup bonus) whenever
-- someone signs up through Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bonus int;
  v_user_id uuid;
begin
  select signup_bonus into v_bonus from public.point_rules limit 1;
  v_bonus := coalesce(v_bonus, 0);

  insert into public.profiles (id, member_code, name, email, phone, role, points_balance)
  values (
    new.id,
    public.generate_member_code(),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data ->> 'phone',
    'user',
    v_bonus
  )
  returning id into v_user_id;

  if v_bonus > 0 then
    insert into public.point_transactions (user_id, type, points, description)
    values (v_user_id, 'earn', v_bonus, 'Bonus pendaftaran member baru');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Non-admins may edit their own name/phone but never role, points_balance,
-- is_active or member_code — those only change through admin action or the
-- RPCs below.
create or replace function public.profiles_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null when the query runs outside a Supabase Auth session
  -- (SQL editor, direct psql, migrations) — that already requires full DB
  -- credentials, a higher trust level than the app's own RLS boundary.
  --
  -- The bypass flag is set by the trusted RPCs below (redeem_reward,
  -- admin_add_points, cancel_redemption) right before they touch a
  -- protected field themselves — those functions already validated the
  -- change, so the guard only needs to stop *unsanctioned* direct writes.
  if auth.uid() is null
     or public.is_admin()
     or coalesce(current_setting('app.bypass_profile_guard', true), 'false') = 'true' then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.points_balance is distinct from old.points_balance
     or new.is_active is distinct from old.is_active
     or new.member_code is distinct from old.member_code
     or new.email is distinct from old.email then
    raise exception 'not allowed to modify protected profile fields';
  end if;

  return new;
end;
$$;

create trigger trg_profiles_guard_update
  before update on public.profiles
  for each row execute function public.profiles_guard_update();

-- ============================================================================
-- RPCs — the only way points/stock/redemptions are ever mutated, so every
-- earn/redeem/confirm is atomic and validated server-side (doc §6, §10).
-- ============================================================================

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

-- A member can only have one pending pickup (order OR reward redemption)
-- at a time, regardless of how it was created — keeps the admin's
-- Penukaran/Pesanan queues simple (one thing per member to hand over). A
-- row past its own expires_at no longer counts, so a forgotten pending
-- row doesn't permanently lock a member out even if nobody scanned it.
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

-- Called by the member's device every ~2 minutes while a pending
-- redemption's QR is on screen, so a screenshot of it goes stale fast.
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

-- Lets an admin redeem a reward directly on behalf of a member who is
-- present in-store but doesn't have their phone/QR handy. Mirrors
-- redeem_reward()'s validation but marks the redemption 'completed'
-- immediately since the admin hands over the reward right then.
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

-- Lets an admin manually deduct points from a member with a required
-- reason, logged as an 'adjust' point_transactions row (shows up in both
-- the admin transaction log and the member's own Riwayat Poin).
create or replace function public.admin_deduct_points(p_member_code text, p_points int, p_reason text)
returns public.point_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_user_id uuid;
  v_balance int;
  v_tx public.point_transactions;
begin
  if not public.is_admin() then
    raise exception 'only admin can deduct points';
  end if;

  if p_points is null or p_points <= 0 then
    raise exception 'points to deduct must be positive';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required';
  end if;

  select id, points_balance into v_user_id, v_balance
  from public.profiles
  where member_code = p_member_code and is_active = true
  for update;

  if v_user_id is null then
    raise exception 'member not found or inactive';
  end if;

  if v_balance < p_points then
    raise exception 'member does not have enough points';
  end if;

  perform set_config('app.bypass_profile_guard', 'true', true);
  update public.profiles
  set points_balance = points_balance - p_points
  where id = v_user_id;

  insert into public.point_transactions (user_id, admin_id, type, points, description)
  values (v_user_id, v_admin_id, 'adjust', -p_points, trim(p_reason))
  returning * into v_tx;

  return v_tx;
end;
$$;

grant execute on function public.admin_add_points(text, int) to authenticated;
grant execute on function public.redeem_reward(uuid) to authenticated;
grant execute on function public.confirm_redemption(uuid) to authenticated;
grant execute on function public.cancel_redemption(uuid) to authenticated;
grant execute on function public.admin_redeem_reward(text, uuid) to authenticated;
grant execute on function public.admin_deduct_points(text, int, text) to authenticated;
grant execute on function public.refresh_redemption_token(uuid) to authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.point_rules enable row level security;
alter table public.point_transactions enable row level security;
alter table public.rewards enable row level security;
alter table public.redemptions enable row level security;
alter table public.menus enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "profiles_insert_admin" on public.profiles
  for insert with check (public.is_admin());

create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy "point_rules_select_all" on public.point_rules
  for select using (true);

create policy "point_rules_update_admin" on public.point_rules
  for update using (public.is_admin()) with check (public.is_admin());

create policy "point_transactions_select_own_or_admin" on public.point_transactions
  for select using (user_id = auth.uid() or public.is_admin());

create policy "rewards_select_active_or_admin" on public.rewards
  for select using (is_active = true or public.is_admin());

create policy "rewards_admin_write" on public.rewards
  for all using (public.is_admin()) with check (public.is_admin());

create policy "redemptions_select_own_or_admin" on public.redemptions
  for select using (user_id = auth.uid() or public.is_admin());

create policy "menus_select_visible_or_admin" on public.menus
  for select using (is_active = true or public.is_admin());

create policy "menus_admin_write" on public.menus
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- SEED DATA
-- ============================================================================

insert into public.point_rules (rupiah_per_point, signup_bonus, points_expiry_days)
values (1000, 10, null);

insert into public.menus (label, path, icon, "order", role, is_active) values
  ('Barcode Saya', '/barcode', 'QrCode', 1, 'user', true),
  ('Tukar Poin', '/rewards', 'Gift', 2, 'user', true),
  ('Riwayat Penukaran', '/rewards/history', 'History', 3, 'user', true),
  ('Profil', '/profile', 'User', 4, 'user', true),
  ('Dashboard', '/admin', 'LayoutDashboard', 1, 'admin', true),
  ('Scan Poin', '/admin/scan', 'ScanLine', 2, 'admin', true),
  ('Member', '/admin/members', 'Users', 3, 'admin', true),
  ('Penukaran', '/admin/redemptions', 'ClipboardList', 4, 'admin', true),
  ('Reward', '/admin/rewards', 'Gift', 5, 'admin', true),
  ('Menu', '/admin/menus', 'Menu', 6, 'admin', true),
  ('Aturan Poin', '/admin/point-rules', 'Percent', 7, 'admin', true),
  ('Riwayat Transaksi', '/admin/transactions', 'Receipt', 8, 'admin', true),
  ('Profil', '/profile', 'User', 9, 'admin', true);

-- ============================================================================
-- PRODUCT CATALOG + CART/CHECKOUT ORDERING (folded in from 0012)
-- ============================================================================
-- Members browse real products (rupiah prices, separate from the
-- points-reward catalog), optionally apply an admin-created promo
-- (one-time use per member), place an order, and show the resulting QR at
-- the register — payment still happens in person at the cashier. Reuses the
-- same 2h-expiry pattern as reward redemptions (the QR itself is static,
-- not rotating — just goes stale fast if not picked up). Confirming an
-- order also credits loyalty points on the paid total, same ratio as a
-- regular cashier scan.

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
  -- 'discount': percent/fixed-off (0 linked products = checkout coupon
  --   code, 1 = per-item promo, N = campaign shared by several products).
  -- 'bundle': 2+ linked products combined for bundle_price.
  -- 'bogo': buy bogo_buy_qty of bogo_buy_product_id, get bogo_get_qty of
  --   bogo_get_product_id free (can be the same product).
  kind text not null default 'discount' check (kind in ('discount', 'bundle', 'bogo')),
  discount_type text check (discount_type in ('percent', 'fixed')),
  discount_value int check (discount_value > 0), -- percent (1-100) or rupiah amount
  min_order_amount int check (min_order_amount is null or min_order_amount >= 0),
  max_uses_per_user int check (max_uses_per_user is null or max_uses_per_user > 0), -- null = unlimited; applies to every kind
  bundle_price int check (bundle_price is null or bundle_price >= 0),
  bogo_buy_product_id uuid references public.products (id) on delete cascade,
  bogo_buy_qty int not null default 1 check (bogo_buy_qty > 0),
  bogo_get_product_id uuid references public.products (id) on delete cascade,
  bogo_get_qty int not null default 1 check (bogo_get_qty > 0),
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  -- who the promo is visible/available to — see is_promo_eligible() below
  target_mode text not null default 'all'
    check (target_mode in ('all', 'percent', 'top_spenders', 'new_users', 'specific', 'random')),
  target_percent int check (target_percent is null or (target_percent >= 1 and target_percent <= 100)),
  target_count int check (target_count is null or target_count >= 1),
  target_new_user_days int check (target_new_user_days is null or target_new_user_days >= 1),
  created_at timestamptz not null default now(),
  constraint promos_kind_fields_check check (
    (kind = 'discount' and discount_type is not null and discount_value is not null)
    or (kind = 'bundle' and bundle_price is not null)
    or (kind = 'bogo' and bogo_buy_product_id is not null and bogo_get_product_id is not null)
  )
);

-- Links a promo to specific products instead of it being a checkout-wide
-- code: 0 rows = unchanged checkout coupon (picked by the member in the
-- cart); 1 row = a single-product flash-sale discount; N rows = a
-- campaign/bundle promo — one discount + one countdown shared across
-- several chosen products at once. Applied automatically server-side at
-- order time, no code needed, and shown on each linked product's card
-- with a countdown to ends_at.
create table public.promo_products (
  promo_id uuid not null references public.promos (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (promo_id, product_id)
);

create index promo_products_product_id_idx on public.promo_products (product_id);

-- Explicit member list for target_mode 'specific' (admin-picked) and
-- 'random' (same storage, just auto-populated with a random sample when
-- the promo is saved — picking fresh each page load would make
-- eligibility flicker, so it's rolled once and stored like 'specific').
create table public.promo_target_members (
  promo_id uuid not null references public.promos (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (promo_id, user_id)
);

-- Single source of truth for whether a member can see/use a promo.
-- SECURITY DEFINER because it needs to read across all members'
-- point_transactions/profiles (for 'top_spenders'/'new_users') regardless
-- of the calling member's own RLS — same pattern as is_admin() above.
-- Used both in RLS (promos/promo_products SELECT) and inside place_order.
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
alter table public.promo_products enable row level security;
alter table public.promo_target_members enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "products_select_active_or_admin" on public.products
  for select using (is_active = true or public.is_admin());
create policy "products_admin_write" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

create policy "promos_select_active_or_admin" on public.promos
  for select using (
    public.is_admin()
    or (is_active = true and public.is_promo_eligible(id, auth.uid()))
  );
create policy "promos_admin_write" on public.promos
  for all using (public.is_admin()) with check (public.is_admin());

create policy "promo_products_select_active_or_admin" on public.promo_products
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.promos p
      where p.id = promo_id and p.is_active = true and public.is_promo_eligible(p.id, auth.uid())
    )
  );
create policy "promo_products_admin_write" on public.promo_products
  for all using (public.is_admin()) with check (public.is_admin());

create policy "promo_target_members_admin_all" on public.promo_target_members
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
