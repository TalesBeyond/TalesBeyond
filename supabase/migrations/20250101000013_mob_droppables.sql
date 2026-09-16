-- A DM-configurable loot list on mob tokens: each entry is the same shape
-- as a chest item (name/qty/cost/dice/modifier) plus a dropChance
-- percentage, rolled against a d20 in the UI. Same trust model as
-- dm_notes (12_dm_notes.sql) — the column round-trips for every client,
-- the UI is what keeps the Droppables section host-only.
alter table entities add column drop_items jsonb not null default '[]';
