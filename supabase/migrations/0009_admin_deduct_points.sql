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

grant execute on function public.admin_deduct_points(text, int, text) to authenticated;
