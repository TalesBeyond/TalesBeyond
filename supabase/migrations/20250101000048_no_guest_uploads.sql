-- Hearthbound — no uploads from guest (anonymous) sessions.
--
-- Guest tables keep everything on the DM's own device: audio plays from a
-- local blob URL and must be re-picked after a reload. This makes the server
-- enforce the same rule for every browser without a real account: the
-- anonymous sessions every visitor gets (see lib/auth.js) can no longer
-- write any file to Storage, even by calling the API directly. Only
-- signed-in accounts (hosts) can upload, and only to a table they belong to.

drop policy if exists "members can upload token art for their table" on storage.objects;
create policy "members can upload token art for their table"
  on storage.objects for insert
  with check (
    bucket_id = 'token-art'
    and auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and (storage.foldername(name))[1]::uuid in (
      select table_id from players where auth_user_id = auth.uid()
    )
  );

drop policy if exists "members can upload backgrounds for their table" on storage.objects;
create policy "members can upload backgrounds for their table"
  on storage.objects for insert
  with check (
    bucket_id = 'map-backgrounds'
    and auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and (storage.foldername(name))[1]::uuid in (
      select table_id from players where auth_user_id = auth.uid()
    )
  );

drop policy if exists "host can upload table audio" on storage.objects;
create policy "host can upload table audio"
  on storage.objects for insert
  with check (
    bucket_id = 'table-audio'
    and auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and (storage.foldername(name))[1]::uuid in (
      select table_id from players where auth_user_id = auth.uid() and is_host
    )
  );
