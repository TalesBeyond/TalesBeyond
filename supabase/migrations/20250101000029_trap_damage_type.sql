-- Hearthbound — 29_trap_damage_type.sql
-- What kind of damage a trap deals (poison, electric, bludgeoning, ...),
-- stored as a plain key like the rest of a trap's mechanics
-- (28_traps.sql). 'none' is a trap with no typed damage. Kept as its own
-- migration rather than folded into 28 so it applies cleanly whether or
-- not 28 has already been run against a given project.

alter table entities add column if not exists trap_damage_type text not null default 'none';
