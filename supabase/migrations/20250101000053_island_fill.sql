-- Hearthbound — 53_island_fill.sql
-- The Draw tool's Fill (MapBoard.jsx): a drawing of kind 'fill' paints its
-- whole island one colour, under the grid. It has no geometry ({}); its
-- style is {color: '#rrggbb', opacity: 0-1}. One per island in practice —
-- filling again recolours it.

alter table drawings drop constraint if exists drawings_kind_check;
alter table drawings add constraint drawings_kind_check
  check (kind in ('pencil', 'line', 'circle', 'rect', 'fill'));
