-- Let anyone (including logged-out visitors on the public landing page) see
-- promos that target "semua orang" (target_mode = 'all'). Targeted promos
-- (percent/specific/random/top_spenders/new_users) stay governed by
-- is_promo_eligible() and are not broadcast publicly.

create policy "promos_select_public_all_target" on public.promos
  for select using (is_active = true and target_mode = 'all');

create policy "promo_products_select_public_all_target" on public.promo_products
  for select using (
    exists (
      select 1 from public.promos p
      where p.id = promo_id and p.is_active = true and p.target_mode = 'all'
    )
  );
