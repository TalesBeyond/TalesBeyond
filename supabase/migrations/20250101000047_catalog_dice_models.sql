-- Hearthbound — 47_catalog_dice_models.sql
-- REQ-010 Default Catalog Assets, Slice 6 (3D dice bases).
--
-- Groundwork only: the tables and bucket a later 3D-dice feature will read.
-- Nothing in the app uses them yet.
--
-- catalog_dice_models: a 3D model (a .glb file) for one die type.
-- catalog_dice_skins: a texture image wrapped onto a model — either one
-- specific model (`model_slug`) or any model of a die type (`die_type`).
--
-- Same trust model as catalog_weapons (42): readable by everyone, writable
-- only through the service-role admin script. Models live in the public
-- `catalog-models` bucket; skin textures and model previews are WebP images in
-- the `catalog-images` bucket (1 MB each).

create table if not exists catalog_dice_models (
  slug                 text primary key,
  name                 text not null,
  die_type             text not null check (die_type in ('d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100')),
  model_path           text not null,
  preview_image_path   text,
  created_at           timestamptz not null default now()
);

create table if not exists catalog_dice_skins (
  slug          text primary key,
  name          text not null,
  texture_path  text not null,
  model_slug    text references catalog_dice_models (slug) on delete set null,
  die_type      text check (die_type in ('d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100')),
  created_at    timestamptz not null default now()
);

alter table catalog_dice_models enable row level security;
alter table catalog_dice_skins enable row level security;

drop policy if exists "anyone can read catalog dice models" on catalog_dice_models;
create policy "anyone can read catalog dice models"
  on catalog_dice_models for select
  to anon, authenticated
  using (true);

drop policy if exists "anyone can read catalog dice skins" on catalog_dice_skins;
create policy "anyone can read catalog dice skins"
  on catalog_dice_skins for select
  to anon, authenticated
  using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('catalog-models', 'catalog-models', true, 8388608,
          array['model/gltf-binary', 'application/octet-stream'])
  on conflict (id) do update
    set file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public can view catalog models" on storage.objects;
create policy "public can view catalog models"
  on storage.objects for select
  using (bucket_id = 'catalog-models');
