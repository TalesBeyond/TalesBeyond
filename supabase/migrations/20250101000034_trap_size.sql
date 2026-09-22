-- Hearthbound — 34_trap_size.sql
-- A trap can cover anything from a single tile up to a 5x5 area
-- (src/data/traps.js). Every other token still tops out at 4x4, which is
-- what entities.size's original check (01_schema.sql) enforced for all
-- kinds — so the limit is widened for traps only, rather than for
-- everything. Dropped-and-re-added so it re-runs cleanly.

alter table entities drop constraint if exists entities_size_check;
alter table entities add constraint entities_size_check
  check (size between 1 and 4 or (kind = 'trap' and size = 5));
