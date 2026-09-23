-- Hearthbound — 42_guest_audio_bucket.sql
-- REQ-009 Slice 5: scratch storage for guest tables' audio.
--
-- A guest DM has no `tables` row and no `players` row, so the table-scoped
-- policies of 38_synced_table_audio.sql cannot authorize them. This bucket
-- lets any signed-in (anonymous) session upload under a `<INVITE CODE>/`
-- prefix, and lets only the uploader delete their own files. Nothing here can
-- enforce a per-table quota — the 10 MB object limit and MP3/WAV allow-list
-- are the only server-side bounds. Files are purged after 6 hours by the
-- purge-guest-audio Edge Function (see 43_guest_audio_purge.sql).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('guest-audio', 'guest-audio', true, 10485760,
          array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave'])
  on conflict (id) do update
    set file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can view guest audio" on storage.objects;
create policy "public can view guest audio"
  on storage.objects for select
  using (bucket_id = 'guest-audio');

drop policy if exists "guests can upload audio under their code" on storage.objects;
create policy "guests can upload audio under their code"
  on storage.objects for insert
  with check (
    bucket_id = 'guest-audio'
    and auth.uid() is not null
    and name ~ '^[A-Za-z0-9]+/[^/]+$'
  );

-- Owner-scoped delete. Newer Storage versions record the uploader in
-- owner_id (text); older ones in owner (uuid) — use whichever exists.
do $$
begin
  drop policy if exists "guests can delete their own audio" on storage.objects;
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner_id') then
    create policy "guests can delete their own audio"
      on storage.objects for delete
      using (bucket_id = 'guest-audio' and owner_id = auth.uid()::text);
  else
    create policy "guests can delete their own audio"
      on storage.objects for delete
      using (bucket_id = 'guest-audio' and owner = auth.uid());
  end if;
end $$;
