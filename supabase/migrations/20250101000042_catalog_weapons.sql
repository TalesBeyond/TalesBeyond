-- Hearthbound — 42_catalog_weapons.sql
-- REQ-010 Default Catalog Assets, Slice 1 (weapons).
--
-- The Default catalog: game content every table shares, read by everyone
-- (including anonymous players and guest tables) and written only by the
-- admin script (scripts/catalog-admin.mjs) using the service-role key, which
-- bypasses RLS. There is deliberately no insert/update/delete policy for any
-- other role, so a browser client cannot change it.
--
-- Rows mirror the shape src/data/weapons.js already uses; `image_path` is a
-- path inside the public `catalog-images` bucket. The app falls back to the
-- code data when this table is empty or unreachable.

create table if not exists catalog_weapons (
  slug             text primary key,
  name             text not null,
  type             text not null check (type in ('melee', 'ranged')),
  number_of_dice   integer not null check (number_of_dice >= 1),
  dice_type        text not null check (dice_type in ('d4', 'd6', 'd8', 'd10', 'd12')),
  modifier         integer not null default 0,
  damage           numeric not null,
  cost             numeric not null check (cost >= 0),
  equipable_class  text[] not null default '{}',
  image_path       text,
  created_at       timestamptz not null default now()
);

alter table catalog_weapons enable row level security;

drop policy if exists "anyone can read catalog weapons" on catalog_weapons;
create policy "anyone can read catalog weapons"
  on catalog_weapons for select
  to anon, authenticated
  using (true);

-- Catalog pictures: one optimized WebP per entry, public-read, admin-write
-- only (no insert/delete policy on storage.objects for this bucket).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('catalog-images', 'catalog-images', true, 1048576, array['image/webp'])
  on conflict (id) do update
    set file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can view catalog images" on storage.objects;
create policy "public can view catalog images"
  on storage.objects for select
  using (bucket_id = 'catalog-images');
