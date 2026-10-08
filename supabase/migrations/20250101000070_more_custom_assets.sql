-- Hearthbound — 70_more_custom_assets.sql
-- Asset Storage (36_custom_assets.sql) takes three more kinds of a table's
-- own: food and drink, spells and potions (src/data/foods.js, spells.js,
-- potions.js), beside the monsters, weapons, items and tomes it already kept
-- (67_merchant_npcs.sql added the last). A 'food' or a 'potion' row whose
-- data.category is 'ingredient' is one of the table's own ingredients; the
-- others may carry a recipe, data.recipe: [{ "name", "qty" }].
--
-- Only the list of allowed types changes. Who reads and writes the table is
-- as it was: every seated member reads, only the host inserts and deletes.

alter table custom_assets drop constraint if exists custom_assets_asset_type_check;
alter table custom_assets add constraint custom_assets_asset_type_check
  check (asset_type in ('monster', 'weapon', 'item', 'tome', 'food', 'spell', 'potion'));
