-- One-time backfill: mirror the current reward-redemption catalog into the
-- new Rupiah-priced products table — same name, description, and photo
-- (reuses the exact same image_url, no re-upload needed), same stock and
-- active/inactive status. Price = point_cost converted to rupiah at the
-- conversion ratio currently set in Aturan Poin.
--
-- Not part of core schema (0001) — this depends on whatever is in
-- `rewards` at the moment you run it, so it only makes sense to run once,
-- now, against your live data. Safe to re-run: skips any reward that
-- already has a matching product by name.

insert into public.products (name, description, image_url, price, stock, is_active)
select
  r.name,
  r.description,
  r.image_url,
  r.point_cost * greatest(coalesce((select rupiah_per_point from public.point_rules limit 1), 1000), 1),
  r.stock,
  r.is_active
from public.rewards r
where not exists (
  select 1 from public.products p where p.name = r.name
);
