-- Hearthbound — 51_temp_hp.sql
-- Temporary hit points on hero and mob tokens: the blue layer on the life
-- bar (MapBoard.jsx, CreatureCard.jsx). Damage spends them before real hit
-- points (RightPanel.jsx's resolveAttack); they don't stack and don't heal.
-- A plain column on `entities` rather than a sheet key so players see a
-- monster's temporary HP too (a mob's sheet is DM-only).
--
-- The DM sets it. The existing write-permission trigger
-- (enforce_entity_write_permissions, last rebuilt in 37_player_door_layer_
-- move.sql) doesn't list this column, which is what lets a player's attack
-- spend a monster's temporary HP along with its HP; the client-side
-- validators (GameView.jsx's canDamageMob) only accept it going down.

alter table entities add column if not exists temp_hp integer not null default 0;
alter table entities drop constraint if exists entities_temp_hp_check;
alter table entities add constraint entities_temp_hp_check check (temp_hp >= 0);
