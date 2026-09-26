-- Hearthbound — 50_realtime_publication.sql
-- Every table src/lib/realtime.js listens to must be in the
-- supabase_realtime publication, or Supabase rejects the subscription. And
-- it rejects the *whole* channel's postgres_changes, not just the missing
-- table: one unpublished table means a player's browser receives no token
-- moves, HP changes, joins or layer edits at all, while a refresh (which
-- reads the tables directly) still shows everything correctly.
--
-- Until now only 38_synced_table_audio.sql added tables to the publication
-- (audio_tracks and tables); the rest had been switched on by hand in the
-- dashboard, so a project built from these migrations alone — or one whose
-- publication was reset — silently lost live sync. This makes it explicit.
-- Guarded per table, so it's a no-op for any table already published.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'entities', 'entity_dm_data', 'players', 'layers', 'islands',
    'tables', 'custom_assets', 'audio_tracks', 'invite_codes'
  ] loop
    if to_regclass('public.' || t) is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
