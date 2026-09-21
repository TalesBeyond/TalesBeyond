-- Hearthbound — 31_island_conditions.sql
-- Islands can carry condition states (fog, darkness, fire, unstable
-- footing, ...) the same way hero/monster tokens do (06_conditions.sql).
-- Stored as a plain text[] of catalog keys (src/data/islandConditions.js).
-- No CHECK on the values, unlike entities.conditions: that constraint had
-- to be loosened by hand every time its catalog grew, and this is a
-- purely informational marker with nothing to enforce.
--
-- Nothing to change on the RLS side: islands are already readable by every
-- seated member and writable by the host only (10_islands.sql), which is
-- exactly who should see and who may set an island's conditions.

alter table islands add column if not exists conditions text[] not null default '{}';
