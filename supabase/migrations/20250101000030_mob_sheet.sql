-- Hearthbound — 30_mob_sheet.sql
-- Monsters get the same tabbed character sheet a hero has (abilities,
-- saves & skills, battle equipment, spells, bag), but only the DM ever
-- sees it. Heroes' sheets live on `entities.sheet`, which every seated
-- player can read — fine for a hero, wrong for an enemy's stats and spell
-- list. A monster's sheet goes into `entity_dm_data` instead, whose RLS
-- (15_entity_dm_data_privacy.sql) already makes it host-only for SELECT,
-- UPDATE and DELETE, so a player's queries and Realtime feed never
-- receive it. Nullable: a monster has no sheet until the DM first edits one.

alter table entity_dm_data add column if not exists mob_sheet jsonb;
