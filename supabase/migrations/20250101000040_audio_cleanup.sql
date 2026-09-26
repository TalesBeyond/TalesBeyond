-- Hearthbound — 40_audio_cleanup.sql
-- REQ-009 Slice 4: deleting a layer, island or token removes the sound
-- attached to it. audio_tracks.target_id is text (it also holds the table id
-- for world music and, later, guest codes), so it cannot be a foreign key —
-- these triggers keep it honest instead, whichever client (or cascade) does
-- the delete.
--
-- Only the ROW is removed here. Deleting from storage.objects with SQL does
-- not free the backing file, so the client removes the Storage object through
-- the Storage API (src/lib/storageUpload.js removeAudioFiles) and
-- deleteTableStorage sweeps the whole table folder when a table is deleted.

create or replace function delete_audio_for_target() returns trigger as $$
declare
  kind text := tg_argv[0];
begin
  delete from audio_tracks
    where table_id = old.table_id and target_kind = kind and target_id = old.id::text;
  return old;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists layers_delete_audio on layers;
create trigger layers_delete_audio after delete on layers
  for each row execute function delete_audio_for_target('layer');

drop trigger if exists islands_delete_audio on islands;
create trigger islands_delete_audio after delete on islands
  for each row execute function delete_audio_for_target('island');

drop trigger if exists entities_delete_audio on entities;
create trigger entities_delete_audio after delete on entities
  for each row execute function delete_audio_for_target('entity');
