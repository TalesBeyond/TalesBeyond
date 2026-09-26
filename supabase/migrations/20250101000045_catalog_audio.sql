-- Hearthbound — 45_catalog_audio.sql
-- REQ-010 Default Catalog Assets, Slice 4 (songs).
--
-- Same trust model as catalog_weapons (42): readable by everyone, writable
-- only through the service-role admin script. A DM can attach a catalog song
-- to a table's audio; that writes an ordinary audio_tracks row whose `url` is
-- the public URL below, `storage_path` is empty and `size_bytes` is 0, so it
-- uses none of the table's 50 MB quota and is never purged with the table.

create table if not exists catalog_audio (
  slug        text primary key,
  name        text not null,
  audio_path  text not null,
  mime        text not null,
  size_bytes  bigint not null check (size_bytes >= 0),
  created_at  timestamptz not null default now()
);

alter table catalog_audio enable row level security;

drop policy if exists "anyone can read catalog audio" on catalog_audio;
create policy "anyone can read catalog audio"
  on catalog_audio for select
  to anon, authenticated
  using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('catalog-audio', 'catalog-audio', true, 10485760,
          array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave'])
  on conflict (id) do update
    set file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can view catalog audio" on storage.objects;
create policy "public can view catalog audio"
  on storage.objects for select
  using (bucket_id = 'catalog-audio');
