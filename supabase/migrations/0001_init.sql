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
  completed_at timestamptz
);

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

  insert into public.profiles (id, member_code, name, phone, role, points_balance)
  values (
    new.id,
    public.generate_member_code(),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
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
     or new.member_code is distinct from old.member_code then
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

  insert into public.point_transactions (user_id, type, points, description)
  values (v_user_id, 'redeem', -v_reward.point_cost, 'Tukar reward: ' || v_reward.name);

  insert into public.redemptions (user_id, reward_id, points_used, redeem_code, status)
  values (v_user_id, p_reward_id, v_reward.point_cost, v_code, 'pending')
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

  update public.redemptions
  set status = 'completed', completed_at = now()
  where id = p_redemption_id and status = 'pending'
  returning * into v_row;

  if v_row is null then
    raise exception 'redemption not found or already processed';
  end if;

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

grant execute on function public.admin_add_points(text, int) to authenticated;
grant execute on function public.redeem_reward(uuid) to authenticated;
grant execute on function public.confirm_redemption(uuid) to authenticated;
grant execute on function public.cancel_redemption(uuid) to authenticated;

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
