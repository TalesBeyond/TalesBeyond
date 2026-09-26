-- Hearthbound — 39_audio_volume_loop.sql
-- REQ-009 Slice 2: per-track synced base volume (0-1, DM-set) and loop flag.
-- Each player's own local volume never reaches the database — it lives in
-- that browser only (src/state/persistence.js).

alter table audio_tracks add column if not exists base_volume real not null default 1;
alter table audio_tracks drop constraint if exists audio_tracks_base_volume_check;
alter table audio_tracks add constraint audio_tracks_base_volume_check check (base_volume >= 0 and base_volume <= 1);

alter table audio_tracks add column if not exists loop boolean not null default true;
