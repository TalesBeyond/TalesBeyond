-- Hearthbound — 43_catalog_items.sql
-- REQ-010 Default Catalog Assets, Slice 2 (items).
--
-- Same trust model as catalog_weapons (42): readable by everyone, writable
-- only through the service-role admin script. Rows mirror src/data/items.js;
-- `image_path` is a path inside the public `catalog-images` bucket.

create table if not exists catalog_items (
  slug         text primary key,
  name         text not null,
  category     text not null,
  cost         numeric not null check (cost >= 0),
  weight       numeric not null check (weight >= 0),
  description  text not null default '',
  image_path   text,
  created_at   timestamptz not null default now()
);

alter table catalog_items enable row level security;

drop policy if exists "anyone can read catalog items" on catalog_items;
create policy "anyone can read catalog items"
  on catalog_items for select
  to anon, authenticated
  using (true);
