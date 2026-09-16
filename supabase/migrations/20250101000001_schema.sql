-- Hearthbound — 01_schema.sql
-- Corresponds to SPEC.md §9.1 (Postgres schema).
--
-- Note on host_id: SPEC.md's illustrative SQL has `tables.host_id` reference
-- `players.id` while `players.table_id` references `tables.id` — a circular
-- dependency that can't be created as written. This migration resolves it by
-- having `tables.host_auth_id` reference `auth.users(id)` directly (the
-- anonymous-auth identity, see 03_functions.sql), which is what's actually
-- known at the moment a table is created, before any player row exists.

create extension if not exists pgcrypto; -- gen_random_uuid()

create table if not exists tables (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default 'Untitled Table',
  host_auth_id  uuid not null references auth.users(id) on delete cascade,
  is_open       boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists invite_codes (
  code          text primary key,
  table_id      uuid not null references tables(id) on delete cascade,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);
create index if not exists invite_codes_active_idx on invite_codes (table_id) where revoked_at is null;

create table if not exists players (
  id            uuid primary key default gen_random_uuid(),
  table_id      uuid not null references tables(id) on delete cascade,
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  color         text not null,
  is_host       boolean not null default false,
  connected     boolean not null default true,
  joined_at     timestamptz not null default now(),
  unique (table_id, auth_user_id)
);
create index if not exists players_table_idx on players (table_id);

create table if not exists maps (
  table_id          uuid primary key references tables(id) on delete cascade,
  name              text not null default 'Untitled Map',
  cols              int not null default 20 check (cols between 4 and 60),
  rows              int not null default 15 check (rows between 4 and 60),
  cell_size         int not null default 42,
  feet_per_square   int not null default 5,
  background_url    text,
  updated_at        timestamptz not null default now()
);

create table if not exists entities (
  id            uuid primary key default gen_random_uuid(),
  table_id      uuid not null references tables(id) on delete cascade,
  kind          text not null check (kind in ('hero','mob')),
  name          text not null,
  image_url     text not null,
  color         text not null default '#8f3a20',
  col           int not null default 0,
  row           int not null default 0,
  size          int not null default 1 check (size between 1 and 4),
  hp            int not null default 10,
  max_hp        int not null default 10,
  owner_id      uuid references players(id) on delete set null,
  z_order       int not null default 0,
  updated_at    timestamptz not null default now()
);
create index if not exists entities_table_idx on entities (table_id);

-- Server-side capacity seatbelt: 1 host + 9 players = 10 max, enforced no
-- matter what the client sends.
create or replace function enforce_table_capacity() returns trigger as $$
begin
  if (select count(*) from players where table_id = new.table_id) >= 10 then
    raise exception 'Table is full (10/10 seats taken)';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_table_capacity on players;
create trigger trg_table_capacity
  before insert on players
  for each row execute function enforce_table_capacity();

-- Keep updated_at fresh on every row change, used for last-write-wins
-- conflict resolution on concurrent token moves (see SPEC.md §9.5).
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_entities_touch on entities;
create trigger trg_entities_touch before update on entities
  for each row execute function touch_updated_at();

drop trigger if exists trg_maps_touch on maps;
create trigger trg_maps_touch before update on maps
  for each row execute function touch_updated_at();
