-- Admin-manageable content for the public landing page: promotional cards
-- and gallery images. Publicly readable (the landing page has no auth),
-- writable by admins only.

create table public.landing_items (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('promo', 'gallery')),
  title text,
  description text,
  image_url text not null,
  link_url text,
  "order" int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index landing_items_section_idx on public.landing_items (section, "order");

alter table public.landing_items enable row level security;

create policy "landing_items_select_active_or_admin" on public.landing_items
  for select using (is_active = true or public.is_admin());

create policy "landing_items_admin_write" on public.landing_items
  for all using (public.is_admin()) with check (public.is_admin());

-- Storage bucket for landing page images (promo banners, gallery photos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'landing',
  'landing',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "landing_bucket_public_read" on storage.objects
  for select using (bucket_id = 'landing');

create policy "landing_bucket_admin_insert" on storage.objects
  for insert with check (bucket_id = 'landing' and public.is_admin());

create policy "landing_bucket_admin_update" on storage.objects
  for update using (bucket_id = 'landing' and public.is_admin())
  with check (bucket_id = 'landing' and public.is_admin());

create policy "landing_bucket_admin_delete" on storage.objects
  for delete using (bucket_id = 'landing' and public.is_admin());
