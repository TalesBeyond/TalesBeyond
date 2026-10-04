-- Hearthbound — 58_island_grid_lines.sql
-- A map can draw its grid heavier and in another colour (Mapping → World
-- maps → a map's Settings → Grid lines), for when the default faint ink is
-- lost over a background image. {strength: 'light' | 'strong' | 'bold',
-- color: '#rrggbb' | null}; null is the default (utils/grid.js gridLineStyle).

alter table islands add column if not exists grid_lines jsonb;
