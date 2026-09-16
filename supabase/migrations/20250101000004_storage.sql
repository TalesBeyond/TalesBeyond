-- Hearthbound — 04_storage.sql
-- Corresponds to SPEC.md §9.6 (Storage for uploaded images).
--
-- Two buckets: one for token portraits, one for map background images.
-- Both are public-read (so <img src> works with a plain URL, same as the
-- data: URLs Phase 1 uses) but only signed-in members may upload, and only
-- into a folder named after a table they actually belong to — enforced by
-- requiring the upload path to start with the table's id.

insert into storage.buckets (id, name, public)
  values ('token-art', 'token-art', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('map-backgrounds', 'map-backgrounds', true)
  on conflict (id) do nothing;

-- Anyone can read (public buckets already allow this, these policies are
-- what let supabase-js's storage.list()/getPublicUrl() work consistently).
create policy "public can view token art"
  on storage.objects for select
  using (bucket_id = 'token-art');

create policy "public can view map backgrounds"
  on storage.objects for select
  using (bucket_id = 'map-backgrounds');

-- Uploads must be authenticated and scoped to a table the uploader is
-- actually seated at. Client code (src/lib/storageUpload.js) uploads to
-- `${tableId}/${randomFileName}`, so this checks the path's first segment.
create policy "members can upload token art for their table"
  on storage.objects for insert
  with check (
    bucket_id = 'token-art'
    and auth.uid() is not null
    and (storage.foldername(name))[1]::uuid in (
      select table_id from players where auth_user_id = auth.uid()
    )
  );

create policy "members can upload backgrounds for their table"
  on storage.objects for insert
  with check (
    bucket_id = 'map-backgrounds'
    and auth.uid() is not null
    and (storage.foldername(name))[1]::uuid in (
      select table_id from players where auth_user_id = auth.uid()
    )
  );
