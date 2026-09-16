-- Hearthbound — 09_armor_class.sql
-- Armor class for mob tokens, so a hero's "Roll attack" (Battle Equipment
-- tab, RightPanel.jsx) has something to roll the d20 against. Nullable —
-- the client defaults a missing value to 10 (see mapDbEntity in
-- src/lib/mappers.js) rather than forcing a backfill.

alter table entities add column if not exists armor_class int;
