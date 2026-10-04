-- Hearthbound — 54_island_feet_per_square.sql
-- Each island has its own scale: how many feet one of its squares stands
-- for, set when the island is made (Mapping → Islands → New island) and
-- changeable in its settings. Null for islands from before this — they
-- follow their layer's feet_per_square (utils/grid.js islandFeet).

alter table islands add column if not exists feet_per_square int;
alter table islands drop constraint if exists islands_feet_per_square_check;
alter table islands add constraint islands_feet_per_square_check
  check (feet_per_square is null or feet_per_square between 1 and 100);
