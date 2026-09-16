-- Hearthbound — 07_door_positions.sql
-- Independent per-side placement for bidirectional doors: a door is
-- visible from both its layer_id and its target_layer_id (see
-- src/components/GameView.jsx's entitiesVisibleOnLayer()), and can now sit
-- at a different square on each side. target_col/target_row are the door's
-- position when viewed from its target layer; col/row (already on the
-- table) remain its position on its home layer. Nullable and unenforced —
-- the client falls back to col/row on the target side until the host drags
-- the door there for the first time.

alter table entities add column if not exists target_col int;
alter table entities add column if not exists target_row int;
