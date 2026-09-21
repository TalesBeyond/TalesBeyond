-- Hearthbound — 36_custom_assets.sql
-- "Asset Storage": a DM-only button (Toolbar.jsx) for authoring custom
-- monsters, weapons, and items and dropping them into this table's
-- Weapons/Item Compendiums and monster token list, alongside (never instead
-- of) the app's built-in default catalogs (src/data/weapons.js, items.js,
-- defaultTokens.js DEFAULT_MOBS — those stay hardcoded and unaffected).
--
-- Each row is one custom entry. `data` holds the whole entry in the same
-- shape its catalog counterpart already uses — {type, name, numberOfDice,
-- diceType, modifier, damage, cost, equipableClass} for a weapon,
-- {category, name, cost, weight, description} for an item, {name, color,
-- icon, imageUrl} for a monster — so the client can render/filter/sort a
-- custom entry with the exact same code path as a built-in one, just
-- concatenated onto the same list. See mappers.js's mapDbCustomAsset.
--
-- Host-only to add or remove, same trust model as placing/removing a token
-- (PITFALLS.md #1 / 16_dm_only_edits.sql) — read is open to the whole table
-- since a row here carries no more sensitive information than an entities
-- row already world-readable to every seated member.

create table if not exists custom_assets (
  id            uuid primary key default gen_random_uuid(),
  table_id      uuid not null references tables(id) on delete cascade,
  asset_type    text not null check (asset_type in ('monster', 'weapon', 'item')),
  data          jsonb not null,
  created_at    timestamptz not null default now()
);
create index if not exists custom_assets_table_idx on custom_assets (table_id);

alter table custom_assets enable row level security;

drop policy if exists "members can read custom assets at their table" on custom_assets;
create policy "members can read custom assets at their table"
  on custom_assets for select
  using (table_id in (select table_id from players where auth_user_id = auth.uid()));

drop policy if exists "host can insert custom assets at their table" on custom_assets;
create policy "host can insert custom assets at their table"
  on custom_assets for insert
  with check (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

drop policy if exists "host can delete custom assets at their table" on custom_assets;
create policy "host can delete custom assets at their table"
  on custom_assets for delete
  using (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));
