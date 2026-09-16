-- Hearthbound — 24_drop_island_regions_and_mask.sql
-- Reverts REQ-002 (21_island_regions.sql) and REQ-005 (22_island_mask.sql):
-- an island is back to being its own independent rectangle only —
-- id, name, cols, rows, cell_size, background_url, x, y. Combining islands
-- is now island grouping (23_island_groups.sql), which never touches an
-- island's own row, so nothing needs to migrate out of these columns
-- before they're dropped — no table in this dev environment has ever been
-- live-verified with real merged-island data.
alter table islands drop column if exists regions;
alter table islands drop column if exists mask;
