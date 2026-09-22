-- Hearthbound — 33_day_night_override.sql
-- A day/night phase the DM sets by hand, overriding the in-game clock's own
-- cycle (32_game_clock.sql) until they hand it back. One nullable value per
-- table: null = follow the clock, otherwise the phase to show. Kept as its
-- own column rather than inside game_clock so it works with no clock at all.
--
-- Writing it is already host-only ("host can update their table",
-- 02_policies.sql); every member can already read their table's row.

alter table tables add column if not exists day_night_override text;
alter table tables drop constraint if exists tables_day_night_override_check;
alter table tables add constraint tables_day_night_override_check
  check (day_night_override is null or day_night_override in ('dawn', 'day', 'dusk', 'night'));
