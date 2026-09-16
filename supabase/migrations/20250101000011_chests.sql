-- Hearthbound — 11_chests.sql
-- Chest tokens: a lootable container the DM can open/close at any time and
-- whose contents (weapon/item-compendium picks or fully custom entries) can
-- only be edited while the Edit tool is selected client-side. Contents are
-- small and fully described client-side, so they're stored as one jsonb
-- array rather than a separate table.

alter table entities drop constraint if exists entities_kind_check;
alter table entities add constraint entities_kind_check check (kind in ('hero','mob','door','chest'));

alter table entities add column if not exists chest_size text check (chest_size in ('small','medium','large','xlarge'));
alter table entities add column if not exists opened boolean not null default false;
alter table entities add column if not exists chest_items jsonb not null default '[]';
