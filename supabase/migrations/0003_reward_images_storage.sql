-- Storage bucket for reward images, uploaded by admins via the Rewards admin page.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rewards',
  'rewards',
  true,
  5242880, -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "rewards_bucket_public_read" on storage.objects
  for select using (bucket_id = 'rewards');

create policy "rewards_bucket_admin_insert" on storage.objects
  for insert with check (bucket_id = 'rewards' and public.is_admin());

create policy "rewards_bucket_admin_update" on storage.objects
  for update using (bucket_id = 'rewards' and public.is_admin())
  with check (bucket_id = 'rewards' and public.is_admin());

create policy "rewards_bucket_admin_delete" on storage.objects
  for delete using (bucket_id = 'rewards' and public.is_admin());
