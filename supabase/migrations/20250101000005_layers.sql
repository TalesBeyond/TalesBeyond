-- Hearthbound — 05_layers.sql
-- Replaces the old 1:1 `maps` table with a many-per-table `layers` table,
-- so a host can build multiple maps ("layers") linked together by door
-- tokens. Every table keeps exactly one permanent "base" layer (is_base),
-- which is where new players land and which can never be deleted.

create table if not exists layers (
  id                uuid primary key default gen_random_uuid(),
  table_id          uuid not null references tables(id) on delete cascade,
  name              text not null default 'Untitled Layer',
  cols              int not null default 20 check (cols between 4 and 60),
  rows              int not null default 15 check (rows between 4 and 60),
  cell_size         int not null default 42,
  feet_per_square   int not null default 5,
  background_url    text,
  is_base           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists layers_table_idx on layers (table_id);
create unique index if not exists one_base_layer_per_table on layers (table_id) where is_base;

drop trigger if exists trg_layers_touch on layers;
create trigger trg_layers_touch before update on layers
  for each row execute function touch_updated_at();

-- RLS: same "members read, host writes" shape 02_policies.sql already used
-- for the old "maps" table. Defined here (not in 02_policies.sql) because
-- this table doesn't exist yet at the point 02_policies.sql runs on a
-- fresh install.
alter table layers enable row level security;

drop policy if exists "members can read their table's layers" on layers;
create policy "members can read their table's layers"
  on layers for select
  using (table_id in (select table_id from players where auth_user_id = auth.uid()));

drop policy if exists "host can write layers" on layers;
create policy "host can write layers"
  on layers for all
  using (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host))
  with check (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

-- Migrate any existing single-map tables into the new layers table as
-- their base layer.
insert into layers (table_id, name, cols, rows, cell_size, feet_per_square, background_url, is_base)
  select table_id, name, cols, rows, cell_size, feet_per_square, background_url, true
  from maps
  on conflict do nothing;

-- entities: scope to a specific layer, and support a 'door' kind that
-- links to another layer.
alter table entities add column if not exists layer_id uuid references layers(id) on delete cascade;
update entities e set layer_id = l.id
  from layers l
  where l.table_id = e.table_id and l.is_base and e.layer_id is null;
alter table entities alter column layer_id set not null;
create index if not exists entities_layer_idx on entities (layer_id);

alter table entities add column if not exists target_layer_id uuid references layers(id) on delete set null;

alter table entities drop constraint if exists entities_kind_check;
alter table entities add constraint entities_kind_check check (kind in ('hero','mob','door'));

-- players: track which layer each player is currently viewing. Defaults
-- to each table's base layer for anyone seated before this migration.
alter table players add column if not exists current_layer_id uuid references layers(id) on delete set null;
update players p set current_layer_id = l.id
  from layers l
  where l.table_id = p.table_id and l.is_base and p.current_layer_id is null;

-- maps is fully retired in favor of layers.
drop table if exists maps;
