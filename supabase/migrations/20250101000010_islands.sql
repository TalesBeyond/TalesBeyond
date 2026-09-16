-- Hearthbound — 10_islands.sql
-- A layer stops being one fixed-size grid and becomes a freeform canvas
-- that can hold any number of "islands" — independent grids (own size, own
-- background, own tokens) the host can add, resize, remove, and drag
-- around. Every layer keeps exactly one permanent "base" island (is_base),
-- the same convention `layers.is_base` already uses one level up.

create table if not exists islands (
  id                uuid primary key default gen_random_uuid(),
  layer_id          uuid not null references layers(id) on delete cascade,
  -- Denormalized (mirrors entities.table_id alongside entities.layer_id in
  -- 05_layers.sql) so RLS and the realtime filter can key off table_id
  -- directly without a join back through layers.
  table_id          uuid not null references tables(id) on delete cascade,
  name              text not null default 'Untitled Island',
  cols              int not null default 20 check (cols between 4 and 60),
  rows              int not null default 15 check (rows between 4 and 60),
  cell_size         int not null default 42,
  background_url    text,
  x                 int not null default 0,
  y                 int not null default 0,
  is_base           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists islands_layer_idx on islands (layer_id);
create index if not exists islands_table_idx on islands (table_id);
create unique index if not exists one_base_island_per_layer on islands (layer_id) where is_base;

drop trigger if exists trg_islands_touch on islands;
create trigger trg_islands_touch before update on islands
  for each row execute function touch_updated_at();

alter table islands enable row level security;

drop policy if exists "members can read their table's islands" on islands;
create policy "members can read their table's islands"
  on islands for select
  using (table_id in (select table_id from players where auth_user_id = auth.uid()));

drop policy if exists "host can write islands" on islands;
create policy "host can write islands"
  on islands for all
  using (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host))
  with check (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

-- Backfill: every existing layer becomes one base island, reusing that
-- layer's own grid fields.
insert into islands (layer_id, table_id, name, cols, rows, cell_size, background_url, x, y, is_base)
  select id, table_id, name, cols, rows, cell_size, background_url, 0, 0, true
  from layers
  on conflict do nothing;

-- Those grid fields now live on islands instead.
alter table layers drop column if exists cols;
alter table layers drop column if exists rows;
alter table layers drop column if exists cell_size;
alter table layers drop column if exists background_url;

-- entities: scope to a specific island within their layer.
alter table entities add column if not exists island_id uuid references islands(id) on delete cascade;
update entities e set island_id = i.id
  from islands i
  where i.layer_id = e.layer_id and i.is_base and e.island_id is null;
alter table entities alter column island_id set not null;
create index if not exists entities_island_idx on entities (island_id);
