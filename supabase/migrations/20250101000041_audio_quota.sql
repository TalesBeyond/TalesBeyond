-- Hearthbound — 41_audio_quota.sql
-- REQ-009 Slice 6: a table's audio may not exceed 50 MB in total.
--
-- Enforced in the database so a modified client cannot skip it. A row that
-- REPLACES the sound on the same target (same table, kind and target) is not
-- counted against itself, so swapping a 9 MB file for another 9 MB file never
-- trips the limit. Guest tables have no row to enforce this on — the client
-- checks it for them (REQ-009 Out of Scope: server-side guest quota).

create or replace function enforce_audio_quota() returns trigger as $$
declare
  used bigint;
begin
  select coalesce(sum(size_bytes), 0) into used
    from audio_tracks
    where table_id = new.table_id
      and not (target_kind = new.target_kind and target_id = new.target_id);
  if used + new.size_bytes > 52428800 then
    raise exception 'Audio quota exceeded: a table may hold at most 50 MB of audio'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists audio_tracks_quota on audio_tracks;
create trigger audio_tracks_quota
  before insert or update of size_bytes, table_id, target_kind, target_id on audio_tracks
  for each row execute function enforce_audio_quota();
