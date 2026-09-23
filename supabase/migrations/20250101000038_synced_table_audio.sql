-- Hearthbound — 38_synced_table_audio.sql
-- REQ-009 Synced Table Audio, Slice 1 (world music in a cloud table).
--
-- audio_tracks: one row per sound attached to a target (the table's world
-- music now; layers/islands/tokens in later slices). Same trust model as
-- custom_assets — every seated member reads, only the host writes.
--
-- tables.audio_playback: one jsonb per table naming the single sound playing
-- right now, `{ nowPlaying: { trackId, anchorMs, offsetMs } | null, resume:
-- { [trackId]: offsetMs } }`. Clients derive the playback position from the
-- anchor locally, so the column only changes when the DM presses play/pause,
-- never per tick (same idea as tables.game_clock, 32_game_clock.sql). Writing
-- it is already host-only ("host can update their table", 02_policies.sql).
--
-- table-audio bucket: public-read (so <audio src> works with a plain URL),
-- host-only insert/delete scoped to a table the caller hosts, and a 10 MB
-- object limit + MP3/WAV allow-list enforced by the bucket itself.

create table if not exists audio_tracks (
  id            uuid primary key,
  table_id      uuid not null references tables(id) on delete cascade,
  target_kind   text not null check (target_kind in ('world', 'layer', 'island', 'entity')),
  target_id     text not null,
  name          text not null,
  url           text not null,
  storage_path  text not null,
  mime          text not null,
  size_bytes    bigint not null check (size_bytes >= 0),
  created_at    timestamptz not null default now(),
  unique (table_id, target_kind, target_id)
);
create index if not exists audio_tracks_table_idx on audio_tracks (table_id);

alter table audio_tracks enable row level security;

drop policy if exists "members can read audio tracks at their table" on audio_tracks;
create policy "members can read audio tracks at their table"
  on audio_tracks for select
  using (table_id in (select table_id from players where auth_user_id = auth.uid()));

drop policy if exists "host can insert audio tracks at their table" on audio_tracks;
create policy "host can insert audio tracks at their table"
  on audio_tracks for insert
  with check (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

drop policy if exists "host can update audio tracks at their table" on audio_tracks;
create policy "host can update audio tracks at their table"
  on audio_tracks for update
  using (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host))
  with check (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

drop policy if exists "host can delete audio tracks at their table" on audio_tracks;
create policy "host can delete audio tracks at their table"
  on audio_tracks for delete
  using (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

alter table tables add column if not exists audio_playback jsonb;

-- Storage bucket. Paths are `${tableId}/${randomFileName}`, so the policies
-- check the first path segment against a table the caller hosts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('table-audio', 'table-audio', true, 10485760,
          array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave'])
  on conflict (id) do update
    set file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can view table audio" on storage.objects;
create policy "public can view table audio"
  on storage.objects for select
  using (bucket_id = 'table-audio');

drop policy if exists "host can upload table audio" on storage.objects;
create policy "host can upload table audio"
  on storage.objects for insert
  with check (
    bucket_id = 'table-audio'
    and auth.uid() is not null
    and (storage.foldername(name))[1]::uuid in (
      select table_id from players where auth_user_id = auth.uid() and is_host
    )
  );

drop policy if exists "host can delete table audio" on storage.objects;
create policy "host can delete table audio"
  on storage.objects for delete
  using (
    bucket_id = 'table-audio'
    and (storage.foldername(name))[1]::uuid in (
      select table_id from players where auth_user_id = auth.uid() and is_host
    )
  );

-- Realtime (REQ-009 Q3): no earlier migration adds a table to the
-- supabase_realtime publication, so the existing ones were enabled from the
-- dashboard. Do it explicitly here — guarded so it is a no-op for a table
-- that is already published — so audio_tracks and the tables.audio_playback
-- column actually stream.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audio_tracks') then
      alter publication supabase_realtime add table public.audio_tracks;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tables') then
      alter publication supabase_realtime add table public.tables;
    end if;
  end if;
end $$;
