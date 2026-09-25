-- Hearthbound — 46_catalog_dice_images.sql
-- REQ-010 Default Catalog Assets, Slice 5 (dice images).
--
-- One picture per die type, shown on the Dice modal's tiles. Same trust model
-- as catalog_weapons (42): readable by everyone, writable only through the
-- service-role admin script. `image_path` is a path inside the public
-- `catalog-images` bucket (dice/<die type>.webp).

create table if not exists catalog_dice_images (
  slug        text primary key,
  name        text not null,
  die_type    text not null unique check (die_type in ('d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100')),
  image_path  text,
  created_at  timestamptz not null default now()
);

alter table catalog_dice_images enable row level security;

drop policy if exists "anyone can read catalog dice images" on catalog_dice_images;
create policy "anyone can read catalog dice images"
  on catalog_dice_images for select
  to anon, authenticated
  using (true);
