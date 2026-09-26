-- Hearthbound — 44_catalog_monsters.sql
-- REQ-010 Default Catalog Assets, Slice 3 (monsters).
--
-- Same trust model as catalog_weapons (42): readable by everyone, writable
-- only through the service-role admin script. Rows mirror src/data/monsters.js;
-- `slug` is the monster's key there, `abilities` is { str, dex, con, int, wis,
-- cha }, and `image_path` is a path inside the public `catalog-images` bucket.

create table if not exists catalog_monsters (
  slug         text primary key,
  name         text not null,
  kind         text not null,
  cr           text not null,
  hp           integer not null check (hp >= 0),
  ac           integer not null check (ac >= 0),
  speed        integer not null check (speed >= 0),
  abilities    jsonb not null,
  size         integer not null default 1 check (size >= 1),
  icon         text not null,
  color        text not null,
  attack       text not null default '',
  description  text not null default '',
  image_path   text,
  created_at   timestamptz not null default now()
);

alter table catalog_monsters enable row level security;

drop policy if exists "anyone can read catalog monsters" on catalog_monsters;
create policy "anyone can read catalog monsters"
  on catalog_monsters for select
  to anon, authenticated
  using (true);
