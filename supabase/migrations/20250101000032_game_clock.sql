-- Hearthbound — 32_game_clock.sql
-- The table's in-game clock, and each island's day/night setting.
--
-- tables.game_clock: one jsonb per table holding the clock's anchor (base
-- in-game time, the real timestamp it was set at, the tick speed, running
-- flag, and the day/night cycle's sunrise/sunset) — see src/utils/gameClock.js.
-- Clients derive the current time from that locally, so the row only changes
-- when the DM edits the clock, never per tick. Null = no clock. Writing it is
-- already host-only ("host can update their table", 02_policies.sql), and
-- every member can already read their table's row.
--
-- islands.day_night: whether an island follows the table's clock ('cycle'),
-- or stays always 'day' / always 'night' regardless of it. Islands are
-- already readable by members and writable by the host only (10_islands.sql).

alter table tables add column if not exists game_clock jsonb;

alter table islands add column if not exists day_night text not null default 'cycle';
alter table islands drop constraint if exists islands_day_night_check;
alter table islands add constraint islands_day_night_check check (day_night in ('cycle', 'day', 'night'));
