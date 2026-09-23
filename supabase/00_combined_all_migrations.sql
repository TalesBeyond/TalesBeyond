-- Hearthbound — combined migration script
-- Generated for a one-paste manual setup in the Supabase SQL Editor, as a
-- fallback to applying supabase/migrations/ via the CLI or GitHub
-- integration (see supabase/README.md). Equivalent to running every file
-- in supabase/migrations/ in order. Safe to re-run (every statement is
-- idempotent).

-- ======================================================================
-- 01_schema.sql
-- ======================================================================
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

-- ======================================================================
-- 02_policies.sql
-- ======================================================================
-- Hearthbound — 02_policies.sql
-- Corresponds to SPEC.md §9.2 (Row Level Security).
--
-- Model: every table is scoped to "am I a player at this table?" via
-- auth.uid(). Joining/creating a table happens through SECURITY DEFINER
-- RPCs (03_functions.sql), not direct inserts, so an unauthenticated or
-- not-yet-joined visitor can never see another table's data.

alter table tables enable row level security;
alter table invite_codes enable row level security;
alter table players enable row level security;
alter table maps enable row level security;
alter table entities enable row level security;

-- ---------- tables ----------

create policy "members can read their table"
  on tables for select
  using (id in (select table_id from players where auth_user_id = auth.uid()));

create policy "host can update their table (open/close, rename)"
  on tables for update
  using (id in (select table_id from players where auth_user_id = auth.uid() and is_host));

-- ---------- invite_codes ----------

create policy "members can read invite codes for their table"
  on invite_codes for select
  using (table_id in (select table_id from players where auth_user_id = auth.uid()));

-- No direct insert/update policy: codes are only ever written by the
-- SECURITY DEFINER functions create_table / regenerate_invite_code, which
-- bypass RLS by design (that's what SECURITY DEFINER means here).

-- ---------- players ----------

create policy "members can read the roster of their table"
  on players for select
  using (table_id in (select table_id from players as me where me.auth_user_id = auth.uid()));

create policy "a player can update their own row (name/color/connected)"
  on players for update
  using (auth_user_id = auth.uid());

-- No direct insert policy: seat creation goes through join_table/create_table
-- so the capacity trigger and invite-code check are always enforced.

-- Note: the "maps" table (and its policies) is retired by 05_layers.sql,
-- which creates and secures its replacement, "layers", in the same file —
-- that table doesn't exist yet at this point for a fresh install, so its
-- RLS setup can't live here.
--
-- Also note: a player setting their own current_layer_id when they walk
-- through a door needs no new policy anywhere — the "a player can update
-- their own row" policy above has no column restriction and already
-- covers it.

-- ---------- entities ----------
-- Phase 1's trust model (any seated player can move/add/edit/remove any
-- token) carries over: all members can read and write entities. The
-- optional "lock hero tokens to owner" feature from SPEC.md §13 would
-- tighten the update policy to `owner_id = my player id or kind = 'mob'`.

create policy "members can read entities at their table"
  on entities for select
  using (table_id in (select table_id from players where auth_user_id = auth.uid()));

create policy "members can write entities at their table"
  on entities for all
  using (table_id in (select table_id from players where auth_user_id = auth.uid()))
  with check (table_id in (select table_id from players where auth_user_id = auth.uid()));

-- ======================================================================
-- 03_functions.sql
-- ======================================================================
-- Hearthbound — 03_functions.sql
-- Corresponds to SPEC.md §9.3 (auth strategy, enforced here) and §9.4
-- (join / create RPCs). All three are SECURITY DEFINER so they can see
-- across tables just long enough to validate a code or check capacity,
-- while everything else stays locked down by 02_policies.sql.

create or replace function generate_unique_code() returns text as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L
  candidate text;
  attempt int := 0;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from invite_codes where code = candidate);
    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'Could not generate a unique invite code, try again';
    end if;
  end loop;
  return candidate;
end;
$$ language plpgsql;

-- Creates a table, its map row, seats the caller as host, and issues the
-- table's first invite code — this is what fires "a new invitation code
-- every session the host opens" for the cloud-backed version.
create or replace function create_table(
  p_name text,
  p_cols int,
  p_rows int,
  p_display_name text,
  p_color text
) returns table (table_id uuid, code text, host_player_id uuid) as $$
declare
  v_table_id uuid;
  v_base_layer_id uuid;
  v_code text;
  v_player_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in (even anonymously) to host a table';
  end if;

  insert into tables (name, host_auth_id) values (p_name, auth.uid())
    returning id into v_table_id;

  insert into layers (table_id, name, is_base)
    values (v_table_id, p_name, true)
    returning id into v_base_layer_id;

  insert into islands (layer_id, table_id, name, cols, rows, is_base)
    values (v_base_layer_id, v_table_id, p_name, greatest(4, least(60, p_cols)), greatest(4, least(60, p_rows)), true);

  insert into players (table_id, auth_user_id, name, color, is_host, current_layer_id)
    values (v_table_id, auth.uid(), p_display_name, p_color, true, v_base_layer_id)
    returning id into v_player_id;

  v_code := generate_unique_code();
  insert into invite_codes (code, table_id) values (v_code, v_table_id);

  return query select v_table_id, v_code, v_player_id;
end;
$$ language plpgsql security definer;

-- Validates a code, checks the table is open, seats the caller (or resumes
-- their existing seat if they already have one — same auth_user_id
-- rejoining), all inside one transaction so capacity can't be raced.
create or replace function join_table(
  p_code text,
  p_display_name text,
  p_color text
) returns table (table_id uuid, player_id uuid) as $$
declare
  v_table_id uuid;
  v_base_layer_id uuid;
  v_player_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in (even anonymously) to join a table';
  end if;

  select ic.table_id into v_table_id
    from invite_codes ic
    where ic.code = upper(trim(p_code)) and ic.revoked_at is null;

  if v_table_id is null then
    raise exception 'Invalid or expired invite code';
  end if;

  if not (select is_open from tables where id = v_table_id) then
    raise exception 'This table is currently closed to new joins';
  end if;

  select id into v_base_layer_id from layers where table_id = v_table_id and is_base;

  insert into players (table_id, auth_user_id, name, color, current_layer_id)
    values (v_table_id, auth.uid(), p_display_name, p_color, v_base_layer_id)
    on conflict (table_id, auth_user_id)
    do update set connected = true, name = excluded.name, color = excluded.color
    -- current_layer_id is deliberately NOT reset here, so a returning
    -- player resumes on whichever layer they last used a door to reach,
    -- instead of being sent back to the base layer on every rejoin.
    returning id into v_player_id;
    -- capacity trigger only fires on INSERT, so a rejoin (the ON CONFLICT
    -- branch) never gets blocked by a table that filled up after they left.

  return query select v_table_id, v_player_id;
end;
$$ language plpgsql security definer;

-- Host-only: revoke the current code and issue a fresh one. Old code stops
-- working immediately for anyone who hasn't already joined.
create or replace function regenerate_invite_code(p_table_id uuid) returns text as $$
declare
  v_code text;
begin
  if not exists (
    select 1 from players where table_id = p_table_id and auth_user_id = auth.uid() and is_host
  ) then
    raise exception 'Only the host may regenerate the invite code';
  end if;

  update invite_codes set revoked_at = now() where table_id = p_table_id and revoked_at is null;
  v_code := generate_unique_code();
  insert into invite_codes (code, table_id) values (v_code, p_table_id);
  return v_code;
end;
$$ language plpgsql security definer;

-- Convenience read: the caller's own table_id/player_id/host flag for a
-- given code, used to resume a session (e.g. after a page refresh) without
-- exposing invite_codes rows to someone who hasn't joined yet.
create or replace function whoami_for_code(p_code text) returns table (
  table_id uuid, player_id uuid, is_host boolean
) as $$
begin
  return query
    select p.table_id, p.id, p.is_host
    from players p
    join invite_codes ic on ic.table_id = p.table_id
    where p.auth_user_id = auth.uid()
      and ic.code = upper(trim(p_code));
end;
$$ language plpgsql security definer;

-- ======================================================================
-- 04_storage.sql
-- ======================================================================
-- Hearthbound — 04_storage.sql
-- Corresponds to SPEC.md §9.6 (Storage for uploaded images).
--
-- Two buckets: one for token portraits, one for map background images.
-- Both are public-read (so <img src> works with a plain URL, same as the
-- data: URLs Phase 1 uses) but only signed-in members may upload, and only
-- into a folder named after a table they actually belong to — enforced by
-- requiring the upload path to start with the table's id.

insert into storage.buckets (id, name, public)
  values ('token-art', 'token-art', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('map-backgrounds', 'map-backgrounds', true)
  on conflict (id) do nothing;

-- Anyone can read (public buckets already allow this, these policies are
-- what let supabase-js's storage.list()/getPublicUrl() work consistently).
create policy "public can view token art"
  on storage.objects for select
  using (bucket_id = 'token-art');

create policy "public can view map backgrounds"
  on storage.objects for select
  using (bucket_id = 'map-backgrounds');

-- Uploads must be authenticated and scoped to a table the uploader is
-- actually seated at. Client code (src/lib/storageUpload.js) uploads to
-- `${tableId}/${randomFileName}`, so this checks the path's first segment.
create policy "members can upload token art for their table"
  on storage.objects for insert
  with check (
    bucket_id = 'token-art'
    and auth.uid() is not null
    and (storage.foldername(name))[1]::uuid in (
      select table_id from players where auth_user_id = auth.uid()
    )
  );

create policy "members can upload backgrounds for their table"
  on storage.objects for insert
  with check (
    bucket_id = 'map-backgrounds'
    and auth.uid() is not null
    and (storage.foldername(name))[1]::uuid in (
      select table_id from players where auth_user_id = auth.uid()
    )
  );

-- ======================================================================
-- 05_layers.sql
-- ======================================================================
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

-- ======================================================================
-- 06_conditions.sql
-- ======================================================================
-- Hearthbound — 06_conditions.sql
-- Adds condition-state tracking to entities (hero and mob tokens only —
-- doors never carry conditions). Host-only editing is enforced client-side
-- today (see src/components/RightPanel.jsx); the existing "members can
-- write entities at their table" policy from 02_policies.sql already covers
-- reads/writes of this new column, so no RLS changes are needed here.

alter table entities add column if not exists conditions text[] not null default '{}';

-- Keep the stored values limited to the known catalog (src/data/conditions.js)
-- so a bad client write can't silently drift ahead of what the UI knows how
-- to render. Widen this list (and the client catalog) together if the set
-- of conditions grows.
alter table entities drop constraint if exists entities_conditions_check;
alter table entities add constraint entities_conditions_check check (
  conditions <@ array['poisoned','stunned','prone','shocked','bleeding']::text[]
);

-- ======================================================================
-- 07_door_positions.sql
-- ======================================================================
-- Hearthbound — 07_door_positions.sql
-- Independent per-side placement for bidirectional doors: a door is
-- visible from both its layer_id and its target_layer_id (see
-- src/components/GameView.jsx's entitiesVisibleOnLayer()), and can now sit
-- at a different square on each side. target_col/target_row are the door's
-- position when viewed from its target layer; col/row (already on the
-- table) remain its position on its home layer. Nullable and unenforced —
-- the client falls back to col/row on the target side until the host drags
-- the door there for the first time.

alter table entities add column if not exists target_col int;
alter table entities add column if not exists target_row int;

-- ======================================================================
-- 08_character_sheets.sql
-- ======================================================================
-- Hearthbound — 08_character_sheets.sql
-- Hero tokens carry a full D&D 5e-flavored character sheet (level, AC,
-- initiative, speed, death saves, ability scores, saving throws, skills,
-- attacks, equipment, currency, spellcasting) — see src/data/characterSheet.js
-- for the exact shape and src/components/RightPanel.jsx for where it's
-- edited (tabs: Overview, Abilities, Saves & Skills, Attacks, Spells, Bag).
--
-- Stored as one jsonb blob rather than normalized columns/tables: the
-- shape is still evolving, is only ever read/written whole by the client,
-- and is never filtered or queried by individual sub-field server-side.
-- Nullable (no default) rather than defaulting to '{}' — the client's own
-- `entity.sheet || defaultCharacterSheet()` fallback expects a missing
-- sheet to be null/absent, not an empty object (which is truthy in JS and
-- would otherwise skip the fallback and break on missing sub-fields).

alter table entities add column if not exists sheet jsonb;

-- ======================================================================
-- 09_armor_class.sql
-- ======================================================================
-- Hearthbound — 09_armor_class.sql
-- Armor class for mob tokens, so a hero's "Roll attack" (Battle Equipment
-- tab, RightPanel.jsx) has something to roll the d20 against. Nullable —
-- the client defaults a missing value to 10 (see mapDbEntity in
-- src/lib/mappers.js) rather than forcing a backfill.

alter table entities add column if not exists armor_class int;

-- ======================================================================
-- 10_islands.sql
-- ======================================================================
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

-- ======================================================================
-- 11_chests.sql
-- ======================================================================
-- Hearthbound — 11_chests.sql
-- Chest tokens: a lootable container the DM can open/close at any time and
-- whose contents (weapon/item-compendium picks or fully custom entries) can
-- only be edited while the Edit tool is selected client-side. Contents are
-- small and fully described client-side, so they're stored as one jsonb
-- array rather than a separate table.

alter table entities drop constraint if exists entities_kind_check;
alter table entities add constraint entities_kind_check check (kind in ('hero','mob','door','chest'));

alter table entities add column if not exists chest_size text check (chest_size in ('small','medium','large','xlarge'));
alter table entities add column if not exists opened boolean not null default false;
alter table entities add column if not exists chest_items jsonb not null default '[]';

-- ======================================================================
-- 12_dm_notes.sql
-- ======================================================================
-- DM-only personal notes on hero and mob tokens: a free-text field the
-- host can jot private notes into. It round-trips through this column like
-- every other entity field; the UI is what keeps it host-only (RightPanel.jsx
-- never renders it for a non-host viewer), matching this schema's existing
-- table-wide "members read" trust model rather than adding field-level RLS.
alter table entities add column dm_notes text not null default '';

-- ======================================================================
-- 13_mob_droppables.sql
-- ======================================================================
-- A DM-configurable loot list on mob tokens: each entry is the same shape
-- as a chest item (name/qty/cost/dice/modifier) plus a dropChance
-- percentage, rolled against a d20 in the UI. Same trust model as
-- dm_notes (12_dm_notes.sql) — the column round-trips for every client,
-- the UI is what keeps the Droppables section host-only.
alter table entities add column drop_items jsonb not null default '[]';

-- ======================================================================
-- 14_entity_ordering_and_player_leave.sql
-- ======================================================================
-- Hearthbound — 14_entity_ordering_and_player_leave.sql
-- Two completeness fixes found while auditing the schema against a full
-- login → playthrough → logout pass in cloud mode:
--
-- 1. Token stacking/render order (src/components/MapBoard.jsx renders in
--    entityOrder, which local mode persists as a plain insertion-order
--    array) had no reliable cloud equivalent: entities.z_order is declared
--    in 01_schema.sql but never actually written by the client (see
--    mapClientEntityToDb in src/lib/mappers.js) — every row's z_order is
--    always 0, so fetchTableSnapshot's `sort((a,b) => a.z_order - b.z_order)`
--    was really just relying on whatever order Postgres happened to
--    return rows in. A real created_at timestamp gives an explicit,
--    reliable ordering that survives a page refresh.
--
-- 2. Leaving a table (GameView.jsx's leaveTable) only ever marked a
--    player disconnected in cloud mode — see the removed comment there —
--    because no DELETE policy existed on players, so the seat was never
--    actually freed. Since enforce_table_capacity() (01_schema.sql) counts
--    *all* player rows regardless of `connected`, a long cloud session
--    with people joining and leaving could silently fill up a table's 10
--    seats forever. A self-only DELETE policy lets a player free their own
--    seat on Leave, exactly like local mode already does.

alter table entities add column if not exists created_at timestamptz not null default now();
update entities set created_at = updated_at; -- best-effort backfill for pre-existing rows — the closest timestamp on hand
create index if not exists entities_table_created_idx on entities (table_id, created_at);

drop policy if exists "a player can delete their own seat (leave table)" on players;
create policy "a player can delete their own seat (leave table)"
  on players for delete
  using (auth_user_id = auth.uid());

-- ======================================================================
-- 15_entity_dm_data_privacy.sql
-- ======================================================================
-- Hearthbound — 15_entity_dm_data_privacy.sql
-- DM notes (12_dm_notes.sql) and mob droppables (13_mob_droppables.sql)
-- were only ever UI-hidden from non-host players — the columns lived on
-- `entities`, whose SELECT policy (02_policies.sql) lets every seated
-- member read every column of every row, and Realtime's postgres_changes
-- broadcasts full rows under that same policy. A curious player opening
-- devtools (or just the network tab) could read a mob's future loot or a
-- DM's private note about their own character before it was meant to be
-- seen.
--
-- Moves both fields into their own table with host-only SELECT/UPDATE/
-- DELETE — a non-host's query against this table returns zero rows, and
-- Realtime enforces that same RLS for postgres_changes, so the secret
-- data never reaches a non-host client at all, not just hidden in the UI.
-- INSERT stays open to any member (matching entities' own trust model —
-- see 02_policies.sql's note on Phase 1's cooperative-table design, and
-- SPEC.md §2): placing a monster seeds its starter loot table before it's
-- "secret" — once placed, only the host can ever read or change it again.

create table if not exists entity_dm_data (
  entity_id     uuid primary key references entities(id) on delete cascade,
  table_id      uuid not null references tables(id) on delete cascade,
  dm_notes      text not null default '',
  drop_items    jsonb not null default '[]',
  updated_at    timestamptz not null default now()
);
create index if not exists entity_dm_data_table_idx on entity_dm_data (table_id);

drop trigger if exists trg_entity_dm_data_touch on entity_dm_data;
create trigger trg_entity_dm_data_touch before update on entity_dm_data
  for each row execute function touch_updated_at();

alter table entity_dm_data enable row level security;

drop policy if exists "members can create dm-data rows for entities at their table" on entity_dm_data;
create policy "members can create dm-data rows for entities at their table"
  on entity_dm_data for insert
  with check (table_id in (select table_id from players where auth_user_id = auth.uid()));

drop policy if exists "only the host can read their table's dm-data" on entity_dm_data;
create policy "only the host can read their table's dm-data"
  on entity_dm_data for select
  using (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

drop policy if exists "only the host can update their table's dm-data" on entity_dm_data;
create policy "only the host can update their table's dm-data"
  on entity_dm_data for update
  using (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host))
  with check (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

drop policy if exists "only the host can delete their table's dm-data" on entity_dm_data;
create policy "only the host can delete their table's dm-data"
  on entity_dm_data for delete
  using (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

-- Backfill existing rows, then drop the old (world-readable) columns.
insert into entity_dm_data (entity_id, table_id, dm_notes, drop_items)
  select id, table_id, coalesce(dm_notes, ''), coalesce(drop_items, '[]'::jsonb)
  from entities
  where kind in ('hero','mob')
  on conflict do nothing;

alter table entities drop column if exists dm_notes;
alter table entities drop column if exists drop_items;

-- ======================================================================
-- 16_dm_only_edits.sql
-- ======================================================================
-- Hearthbound — 16_dm_only_edits.sql
-- Tightens the trust model from PITFALLS.md #1: the DM is now the only one
-- who can edit information. A player may only:
--   1. move their own hero token (col/row/island_id),
--   2. open/close a chest (opened + the icon that comes with it), and
--   3. update their own player row (name/color/current_layer_id — walking
--      through a door), already covered by 02_policies.sql and unchanged.
-- Everything else — placing/removing tokens, editing any stats, sheet,
-- conditions, chest contents, dm data, layers, islands, importing a table
-- — is host-only. Layers/islands were already host-only from
-- 05_layers.sql/10_islands.sql; this migration only needs to tighten
-- `entities`.
--
-- RLS alone can't express "this column may change on this row but not
-- that one," so row visibility stays broad (every member can still SELECT,
-- unchanged) while a BEFORE UPDATE trigger enforces the field-level limits
-- a plain USING/WITH CHECK clause can't. Client-side, the exact same rule
-- is enforced in GameView.jsx's canMoveEntity/canUpdateEntity — this
-- migration is what makes it a real security boundary in cloud mode
-- instead of a UI convention a player could bypass with a direct API call.

drop policy if exists "members can write entities at their table" on entities;

create policy "host can insert entities at their table"
  on entities for insert
  with check (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

create policy "members can attempt to update entities at their table"
  on entities for update
  using (table_id in (select table_id from players where auth_user_id = auth.uid()))
  with check (table_id in (select table_id from players where auth_user_id = auth.uid()));

create policy "host can delete entities at their table"
  on entities for delete
  using (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

create or replace function enforce_entity_write_permissions() returns trigger as $$
declare
  v_is_host boolean;
  v_player_id uuid;
begin
  select is_host, id into v_is_host, v_player_id
    from players where table_id = new.table_id and auth_user_id = auth.uid();

  if v_is_host then
    return new;
  end if;

  if old.kind = 'hero' and old.owner_id = v_player_id then
    if new.name is distinct from old.name
      or new.image_url is distinct from old.image_url
      or new.color is distinct from old.color
      or new.size is distinct from old.size
      or new.hp is distinct from old.hp
      or new.max_hp is distinct from old.max_hp
      or new.armor_class is distinct from old.armor_class
      or new.owner_id is distinct from old.owner_id
      or new.layer_id is distinct from old.layer_id
      or new.target_layer_id is distinct from old.target_layer_id
      or new.target_col is distinct from old.target_col
      or new.target_row is distinct from old.target_row
      or new.conditions is distinct from old.conditions
      or new.sheet is distinct from old.sheet
      or new.chest_size is distinct from old.chest_size
      or new.opened is distinct from old.opened
      or new.chest_items is distinct from old.chest_items
    then
      raise exception 'Only the DM can edit token information — players may only move their own hero';
    end if;
    return new;
  end if;

  if old.kind = 'chest' then
    if new.name is distinct from old.name
      or new.color is distinct from old.color
      or new.col is distinct from old.col
      or new.row is distinct from old.row
      or new.size is distinct from old.size
      or new.island_id is distinct from old.island_id
      or new.chest_size is distinct from old.chest_size
      or new.chest_items is distinct from old.chest_items
    then
      raise exception 'Only the DM can edit chest contents or move it — players may only open or close a chest';
    end if;
    return new;
  end if;

  raise exception 'Only the DM can edit this token';
end;
$$ language plpgsql;

drop trigger if exists trg_entities_permissions on entities;
create trigger trg_entities_permissions before update on entities
  for each row execute function enforce_entity_write_permissions();

-- entity_dm_data (15_entity_dm_data_privacy.sql) allowed any member to
-- INSERT a starter row, since placing a monster used to be open to
-- everyone. Placing is host-only now, so tighten this too for consistency
-- — nothing in the app still relies on a non-host inserting here.
drop policy if exists "members can create dm-data rows for entities at their table" on entity_dm_data;
create policy "only the host can create dm-data rows for entities at their table"
  on entity_dm_data for insert
  with check (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));


-- ======================================================================
-- 18_fix_players_rls_recursion.sql
-- ======================================================================
-- Fix: "infinite recursion detected in policy for relation players".
--
-- The players SELECT policy (02_policies.sql) checked table membership by
-- querying players itself:
--   using (table_id in (select table_id from players as me where me.auth_user_id = auth.uid()))
-- Reading players re-invokes this same policy on its own inner read,
-- recursing forever. Every other policy that subqueries players for a
-- membership check (tables, invite_codes, layers, islands, entities,
-- entity_dm_data, storage.objects) is not itself recursive — they only
-- failed because reading players from inside them hit this one broken
-- policy. This wasn't caught earlier because every previous attempt at a
-- real cloud session failed even before reaching a players read (anonymous
-- sign-in disabled, then an email rate limit) — REQ-003's host sign-in was
-- the first path to actually get this far.
--
-- Fix, mirroring this schema's existing SECURITY DEFINER pattern
-- (03_functions.sql's create_table/join_table): a helper function that
-- reads players as its owner (postgres, which bypasses RLS on tables it
-- owns unless FORCE ROW LEVEL SECURITY is set, which this schema never
-- does) instead of as the calling role, so the inner read never
-- re-triggers the policy being evaluated.
create or replace function my_table_ids() returns setof uuid as $$
  select table_id from players where auth_user_id = auth.uid();
$$ language sql security definer stable;

drop policy if exists "members can read the roster of their table" on players;
create policy "members can read the roster of their table"
  on players for select
  using (table_id in (select my_table_ids()));


-- ======================================================================
-- 19_fix_join_table_ambiguous_column.sql
-- ======================================================================
-- Fix: "column reference \"table_id\" is ambiguous" in join_table.
--
-- join_table's own OUT parameters (`returns table (table_id uuid,
-- player_id uuid)`) are also plpgsql variables in scope for the whole
-- function body. One line referenced the bare column name `table_id`
-- in a WHERE clause instead of qualifying it:
--   select id into v_base_layer_id from layers where table_id = v_table_id and is_base;
-- Postgres's default plpgsql.variable_conflict = error setting refuses to
-- guess whether that means layers.table_id or the OUT parameter, and
-- raises this error on every call. create_table and whoami_for_code never
-- hit this: their bodies either use column-lists (INSERT/ON CONFLICT
-- targets are matched against the table's columns directly, never
-- ambiguous) or already qualify every reference.
--
-- Not a REQ-004 regression — this is a pre-existing bug in
-- 03_functions.sql that has silently blocked every player's first join to
-- a table in cloud mode. It went uncaught for the same reason the players
-- RLS recursion bug (18) did: every earlier attempt at a real multi-seat
-- cloud session failed even earlier (anonymous sign-in disabled, then
-- that recursion bug) before ever reaching a genuine join_table call from
-- a second player.
create or replace function join_table(
  p_code text,
  p_display_name text,
  p_color text
) returns table (table_id uuid, player_id uuid) as $$
declare
  v_table_id uuid;
  v_base_layer_id uuid;
  v_player_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in (even anonymously) to join a table';
  end if;

  select ic.table_id into v_table_id
    from invite_codes ic
    where ic.code = upper(trim(p_code)) and ic.revoked_at is null;

  if v_table_id is null then
    raise exception 'Invalid or expired invite code';
  end if;

  if not (select is_open from tables where id = v_table_id) then
    raise exception 'This table is currently closed to new joins';
  end if;

  select id into v_base_layer_id from layers where layers.table_id = v_table_id and is_base;

  insert into players (table_id, auth_user_id, name, color, current_layer_id)
    values (v_table_id, auth.uid(), p_display_name, p_color, v_base_layer_id)
    on conflict (table_id, auth_user_id)
    do update set connected = true, name = excluded.name, color = excluded.color
    -- current_layer_id is deliberately NOT reset here, so a returning
    -- player resumes on whichever layer they last used a door to reach,
    -- instead of being sent back to the base layer on every rejoin.
    returning id into v_player_id;
    -- capacity trigger only fires on INSERT, so a rejoin (the ON CONFLICT
    -- branch) never gets blocked by a table that filled up after they left.

  return query select v_table_id, v_player_id;
end;
$$ language plpgsql security definer;


-- ======================================================================
-- 20_fix_join_table_on_conflict_ambiguous.sql
-- ======================================================================
-- Fix (attempt 2): "column reference \"table_id\" is ambiguous" in
-- join_table, still happening after 19.
--
-- 19 qualified the one bare `table_id` reference in a WHERE clause, but
-- missed a second one: `on conflict (table_id, auth_user_id)`. Unlike a
-- plain INSERT's target column list (a bare name list, never ambiguous),
-- ON CONFLICT's target list is parsed as a list of expressions — so it
-- *does* support things like `on conflict (lower(email))` — which means
-- it goes through the same ColumnRef resolution as a WHERE clause, and
-- hits the same plpgsql variable-vs-column collision with the `table_id`
-- OUT parameter. Confirmed live: calling join_table directly still raised
-- the identical error (code 42702) even with 19 applied.
--
-- Fix: drop ON CONFLICT entirely in favor of an explicit "try UPDATE
-- first, INSERT if no row matched" — the same upsert semantics, using
-- only patterns already proven safe elsewhere in this schema (a qualified
-- WHERE clause, and a plain INSERT column list with no conflict target,
-- exactly like create_table's own players insert).
create or replace function join_table(
  p_code text,
  p_display_name text,
  p_color text
) returns table (table_id uuid, player_id uuid) as $$
declare
  v_table_id uuid;
  v_base_layer_id uuid;
  v_player_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in (even anonymously) to join a table';
  end if;

  select ic.table_id into v_table_id
    from invite_codes ic
    where ic.code = upper(trim(p_code)) and ic.revoked_at is null;

  if v_table_id is null then
    raise exception 'Invalid or expired invite code';
  end if;

  if not (select is_open from tables where id = v_table_id) then
    raise exception 'This table is currently closed to new joins';
  end if;

  select id into v_base_layer_id from layers where layers.table_id = v_table_id and is_base;

  -- Resume an existing seat under this auth_user_id if one exists, same
  -- rejoin semantics as the old ON CONFLICT DO UPDATE (current_layer_id is
  -- deliberately left untouched, so a returning player resumes on
  -- whichever layer they last used a door to reach).
  update players
    set connected = true, name = p_display_name, color = p_color
    where players.table_id = v_table_id and players.auth_user_id = auth.uid()
    returning id into v_player_id;

  if v_player_id is null then
    insert into players (table_id, auth_user_id, name, color, current_layer_id)
      values (v_table_id, auth.uid(), p_display_name, p_color, v_base_layer_id)
      returning id into v_player_id;
      -- capacity trigger only fires on INSERT, so a rejoin (the UPDATE
      -- branch above) never gets blocked by a table that filled up after
      -- they left.
  end if;

  return query select v_table_id, v_player_id;
end;
$$ language plpgsql security definer;

-- ======================================================================
-- 21_island_regions.sql
-- ======================================================================
-- Hearthbound — 21_island_regions.sql
-- Merging two islands (REQ-002) needs the result to visually keep both
-- original islands' rectangular footprints, not collapse into one filled
-- bounding-box grid. `regions` describes the sub-rectangles (own offset,
-- size, cell size, background) that make up an island's real shape; an
-- island with no regions renders as one flat rectangle exactly as before,
-- so every existing island stays valid unchanged. Regions are small,
-- fully described client-side, and owned entirely by their parent
-- island — nothing else ever references a region by id, unlike islands
-- themselves (entities.island_id points into that table) — so this
-- follows the same jsonb-array precedent as chest_items/drop_items
-- (11_chests.sql, 13_mob_droppables.sql) rather than a normalized child
-- table.
alter table islands add column if not exists regions jsonb not null default '[]';

-- ======================================================================
-- 22_island_mask.sql
-- ======================================================================
-- Hearthbound — 22_island_mask.sql
-- Mask-based island merging (REQ-005) replaces the regions-based merge
-- outcome (REQ-002, 21_island_regions.sql) for every merge performed after
-- this ships. Instead of keeping both source islands as separate rectangular
-- regions, a merge now produces one flat island plus a `mask` — a rows x
-- cols array of booleans marking which cells of its bounding grid are
-- actually part of the traced union shape; everything else is a void cell
-- (no grid lines, not clickable, can't host a token). Null (the default)
-- means "no mask" — a plain island, or a legacy regions-based merged island,
-- renders exactly as it does today. Unlike `regions`, this has no `[]`
-- empty-default convention: null and "no mask" are the same state, so there
-- is no meaningful empty non-null value to default to.
alter table islands add column if not exists mask jsonb null default null;

-- ======================================================================
-- 23_island_groups.sql
-- ======================================================================
-- Hearthbound — 23_island_groups.sql
-- Both prior island-merge designs (regions, 21_island_regions.sql; mask,
-- 22_island_mask.sql) combined two islands' *shapes* into one grid. That
-- approach is retired in favor of island grouping: the host bundles 2+
-- otherwise-untouched islands into a group that moves as a unit and shows
-- one shared title, via an invisible bounding box rather than a combined
-- shape. A group's membership is small, fully described client-side, and
-- owned entirely by its layer — nothing else ever references a group by
-- id — so it lives as one jsonb map keyed by group id on `layers`, the
-- same shape the reducer already uses for `islands`/`entities`, rather
-- than a normalized child table.
alter table layers add column if not exists island_groups jsonb not null default '{}';

-- ======================================================================
-- 24_drop_island_regions_and_mask.sql
-- ======================================================================
-- Hearthbound — 24_drop_island_regions_and_mask.sql
-- Reverts REQ-002 (21_island_regions.sql) and REQ-005 (22_island_mask.sql):
-- an island is back to being its own independent rectangle only —
-- id, name, cols, rows, cell_size, background_url, x, y. Combining islands
-- is now island grouping (23_island_groups.sql), which never touches an
-- island's own row, so nothing needs to migrate out of these columns
-- before they're dropped — no table in this dev environment has ever been
-- live-verified with real merged-island data.
alter table islands drop column if exists regions;
alter table islands drop column if exists mask;

-- ======================================================================
-- 25_user_preferences.sql
-- ======================================================================
-- Hearthbound — 25_user_preferences.sql
-- Server-side home for per-user app preferences — one jsonb blob per user
-- rather than a dedicated column per setting, since the set of preferences
-- (palette today, preferred islands, whatever else later) is expected to
-- keep growing and none of it needs to be queried/joined on individually.
-- Keyed off auth.users, not `players`: a preference is per-person, tied to
-- the browser's auth identity (anonymous or host, see auth.js) — not a
-- per-table-seat setting the way `players` rows are.
--
-- Example row's `preferences`:
--   { "palette": 2, "preferredIslands": ["a", "b", "c"] }
--
-- `palette` is a plain integer inside the blob (no db-level enum type),
-- numbered to match the Palettes menu (src/state/theme.js):
--   1 = classic, 2 = dark, 3 = eddie, 4 = syfy
create table if not exists user_preferences (
  auth_user_id  uuid primary key references auth.users(id) on delete cascade,
  preferences   jsonb not null default '{}',
  updated_at    timestamptz not null default now(),
  constraint user_preferences_is_object check (jsonb_typeof(preferences) = 'object'),
  constraint user_preferences_palette_range check (
    not (preferences ? 'palette') or (preferences->>'palette')::int between 1 and 4
  )
);

drop trigger if exists trg_user_preferences_touch on user_preferences;
create trigger trg_user_preferences_touch before update on user_preferences
  for each row execute function touch_updated_at();

alter table user_preferences enable row level security;

create policy "a user can read their own preferences"
  on user_preferences for select
  using (auth_user_id = auth.uid());

create policy "a user can upsert their own preferences"
  on user_preferences for insert
  with check (auth_user_id = auth.uid());

create policy "a user can update their own preferences"
  on user_preferences for update
  using (auth_user_id = auth.uid());

-- ======================================================================
-- 26_security_hardening.sql
-- ======================================================================
-- Hearthbound — 26_security_hardening.sql
-- REQ-006 Slice 3: abuse throttling on the two unauthenticated-cost RPCs
-- flagged in SECURITY.md (#1 create_table spam, #3 invite-code brute-force).
-- Neither had any app-level protection before this — Supabase's
-- [auth.rate_limit] settings only govern its own auth endpoints, not these
-- RPC calls (see SECURITY.md and REQ-006's Constraints).
--
-- Both changes are CREATE OR REPLACE of existing 03_functions.sql
-- functions, so no schema/column change is needed — invite_codes.code is
-- already a plain, unconstrained `text` column, and existing 6-character
-- codes keep working until regenerated.

-- Invite codes: 6 -> 8 characters (32^8 ≈ 1.1 trillion combinations, up
-- from 32^6 ≈ 1.07 billion), raising the cost of guessing a code across
-- every identity at once, with no new table needed.
create or replace function generate_unique_code() returns text as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L
  candidate text;
  attempt int := 0;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from invite_codes where code = candidate);
    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'Could not generate a unique invite code, try again';
    end if;
  end loop;
  return candidate;
end;
$$ language plpgsql;

-- create_table: cap how many tables one auth identity can host at once,
-- bounding a spam script's footprint to a fixed number of rows instead of
-- unlimited. A real DM running several campaigns is nowhere near 20.
create or replace function create_table(
  p_name text,
  p_cols int,
  p_rows int,
  p_display_name text,
  p_color text
) returns table (table_id uuid, code text, host_player_id uuid) as $$
declare
  v_table_id uuid;
  v_base_layer_id uuid;
  v_code text;
  v_player_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in (even anonymously) to host a table';
  end if;

  if (select count(*) from tables where host_auth_id = auth.uid()) >= 20 then
    raise exception 'You''ve reached the limit of 20 hosted tables — remove or stop using an old one before creating another';
  end if;

  insert into tables (name, host_auth_id) values (p_name, auth.uid())
    returning id into v_table_id;

  insert into layers (table_id, name, is_base)
    values (v_table_id, p_name, true)
    returning id into v_base_layer_id;

  insert into islands (layer_id, table_id, name, cols, rows, is_base)
    values (v_base_layer_id, v_table_id, p_name, greatest(4, least(60, p_cols)), greatest(4, least(60, p_rows)), true);

  insert into players (table_id, auth_user_id, name, color, is_host, current_layer_id)
    values (v_table_id, auth.uid(), p_display_name, p_color, true, v_base_layer_id)
    returning id into v_player_id;

  v_code := generate_unique_code();
  insert into invite_codes (code, table_id) values (v_code, v_table_id);

  return query select v_table_id, v_code, v_player_id;
end;
$$ language plpgsql security definer;

-- ======================================================================
-- 27_host_table_cap_hardening.sql
-- ======================================================================
-- Hearthbound — 27_host_table_cap_hardening.sql
-- REQ-007: fixes two gaps a /code-review of 26_security_hardening.sql's
-- new 20-table host cap surfaced.
--
-- 1) The cap check (`select count(*) ... >= 20`) was a non-atomic
--    check-then-insert — concurrent create_table calls from the same
--    identity could each read a count under 20 before any of their
--    inserts committed, letting more than 20 through. Fixed by acquiring
--    a transaction-scoped advisory lock keyed on the caller's auth.uid()
--    before the count, so concurrent calls from the *same* identity
--    serialize instead of racing. A 32-bit hashtext collision could rarely
--    make two *different* hosts' calls wait on each other, but can never
--    let either miscount the other's tables, since the count itself still
--    filters by the correct host_auth_id.
-- 2) `tables.host_auth_id` had no index anywhere in the schema, so that
--    same count query was a full table scan on every create_table call.
create index if not exists tables_host_auth_id_idx on tables (host_auth_id);

create or replace function create_table(
  p_name text,
  p_cols int,
  p_rows int,
  p_display_name text,
  p_color text
) returns table (table_id uuid, code text, host_player_id uuid) as $$
declare
  v_table_id uuid;
  v_base_layer_id uuid;
  v_code text;
  v_player_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in (even anonymously) to host a table';
  end if;

  -- Serializes concurrent create_table calls from this same identity for
  -- the rest of this transaction; released automatically on commit/rollback.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text)::bigint);

  if (select count(*) from tables where host_auth_id = auth.uid()) >= 20 then
    raise exception 'You''ve reached the limit of 20 hosted tables — remove or stop using an old one before creating another';
  end if;

  insert into tables (name, host_auth_id) values (p_name, auth.uid())
    returning id into v_table_id;

  insert into layers (table_id, name, is_base)
    values (v_table_id, p_name, true)
    returning id into v_base_layer_id;

  insert into islands (layer_id, table_id, name, cols, rows, is_base)
    values (v_base_layer_id, v_table_id, p_name, greatest(4, least(60, p_cols)), greatest(4, least(60, p_rows)), true);

  insert into players (table_id, auth_user_id, name, color, is_host, current_layer_id)
    values (v_table_id, auth.uid(), p_display_name, p_color, true, v_base_layer_id)
    returning id into v_player_id;

  v_code := generate_unique_code();
  insert into invite_codes (code, table_id) values (v_code, v_table_id);

  return query select v_table_id, v_code, v_player_id;
end;
$$ language plpgsql security definer;

-- Host-only: permanently delete one of the caller's own tables. Every
-- child row (layers, islands, entities, entity_dm_data, invite_codes,
-- players) cascades via existing `on delete cascade` FKs — see REQ-007's
-- Constraints — so this one delete is all the Postgres side needs.
-- Frees a slot against create_table's 20-table cap immediately.
create or replace function delete_table(p_table_id uuid) returns void as $$
begin
  if not exists (
    select 1 from tables where id = p_table_id and host_auth_id = auth.uid()
  ) then
    raise exception 'Only the host of this table may delete it';
  end if;

  delete from tables where id = p_table_id;
end;
$$ language plpgsql security definer;

-- Lets a host clean up their own table's uploaded images (token-art,
-- map-backgrounds) from the client via the Storage API. This policy's
-- check depends on the `tables` row still existing, so client code MUST
-- delete storage objects BEFORE calling delete_table, not after — once
-- the table row is gone, this policy's subquery can no longer find it and
-- would reject the storage deletion. Scoped to the caller's own tables
-- specifically (host_auth_id), not merely a table they're seated at, the
-- same way upload is scoped in 04_storage.sql.
create policy "host can delete storage for their own table"
  on storage.objects for delete
  using (
    (bucket_id = 'token-art' or bucket_id = 'map-backgrounds')
    and (storage.foldername(name))[1]::uuid in (
      select id from tables where host_auth_id = auth.uid()
    )
  );

-- ======================================================================
-- 28_traps.sql
-- ======================================================================
-- Hearthbound — 28_traps.sql
-- Trap tokens: a hidden hazard the DM places on the map. Its mechanics
-- (description, save number, fail number, dice to roll, damage) live on the
-- entity row itself, like a chest's contents do.
--
-- The point of a trap is that players don't know it's there, so hiding it
-- in the UI alone would repeat the mistake 15_entity_dm_data_privacy.sql
-- was written to fix: `entities`' SELECT policy let every seated member
-- read every row, and Realtime broadcasts full rows under that same
-- policy, so an unrevealed trap's position and numbers would be one
-- devtools tab away. Instead, this migration narrows that SELECT policy —
-- an unrevealed trap is readable by the host only. A player's queries and
-- Realtime subscription simply never see the row until the DM reveals it,
-- at which point Realtime delivers it as an UPDATE the client upserts.
--
-- Hiding a trap again after revealing it can't be signalled the same way
-- (Realtime sends no event when a row becomes invisible to a subscriber),
-- so the host's client deletes and re-inserts the row instead — see
-- hideTrapRemote in src/lib/remoteApi.js.

alter table entities drop constraint if exists entities_kind_check;
alter table entities add constraint entities_kind_check check (kind in ('hero','mob','door','chest','trap'));

alter table entities add column if not exists trap_description text not null default '';
alter table entities add column if not exists trap_save integer;
alter table entities add column if not exists trap_fail integer;
alter table entities add column if not exists trap_dice text not null default '';
alter table entities add column if not exists trap_damage text not null default '';
alter table entities add column if not exists trap_revealed boolean not null default false;

drop policy if exists "members can read entities at their table" on entities;
drop policy if exists "members can read visible entities at their table" on entities;
create policy "members can read visible entities at their table"
  on entities for select
  using (
    table_id in (select table_id from players where auth_user_id = auth.uid())
    and (
      kind <> 'trap'
      or trap_revealed
      or table_id in (select table_id from players where auth_user_id = auth.uid() and is_host)
    )
  );

-- No change needed to enforce_entity_write_permissions() (16_dm_only_edits):
-- a non-host's UPDATE on a trap already falls through to its final
-- "Only the DM can edit this token" exception, and INSERT/DELETE on
-- `entities` are host-only policies already.

-- ======================================================================
-- 29_trap_damage_type.sql
-- ======================================================================
-- Hearthbound — 29_trap_damage_type.sql
-- What kind of damage a trap deals (poison, electric, bludgeoning, ...),
-- stored as a plain key like the rest of a trap's mechanics
-- (28_traps.sql). 'none' is a trap with no typed damage. Kept as its own
-- migration rather than folded into 28 so it applies cleanly whether or
-- not 28 has already been run against a given project.

alter table entities add column if not exists trap_damage_type text not null default 'none';

-- ======================================================================
-- 30_mob_sheet.sql
-- ======================================================================
-- Hearthbound — 30_mob_sheet.sql
-- Monsters get the same tabbed character sheet a hero has (abilities,
-- saves & skills, battle equipment, spells, bag), but only the DM ever
-- sees it. Heroes' sheets live on `entities.sheet`, which every seated
-- player can read — fine for a hero, wrong for an enemy's stats and spell
-- list. A monster's sheet goes into `entity_dm_data` instead, whose RLS
-- (15_entity_dm_data_privacy.sql) already makes it host-only for SELECT,
-- UPDATE and DELETE, so a player's queries and Realtime feed never
-- receive it. Nullable: a monster has no sheet until the DM first edits one.

alter table entity_dm_data add column if not exists mob_sheet jsonb;

-- ======================================================================
-- 31_island_conditions.sql
-- ======================================================================
-- Hearthbound — 31_island_conditions.sql
-- Islands can carry condition states (fog, darkness, fire, unstable
-- footing, ...) the same way hero/monster tokens do (06_conditions.sql).
-- Stored as a plain text[] of catalog keys (src/data/islandConditions.js).
-- No CHECK on the values, unlike entities.conditions: that constraint had
-- to be loosened by hand every time its catalog grew, and this is a
-- purely informational marker with nothing to enforce.
--
-- Nothing to change on the RLS side: islands are already readable by every
-- seated member and writable by the host only (10_islands.sql), which is
-- exactly who should see and who may set an island's conditions.

alter table islands add column if not exists conditions text[] not null default '{}';

-- ======================================================================
-- 32_game_clock.sql
-- ======================================================================
-- Hearthbound — 32_game_clock.sql
-- The table's in-game clock, and each island's day/night setting.
--
-- tables.game_clock: one jsonb per table holding the clock's anchor (base
-- in-game time, the real timestamp it was set at, the tick speed, running
-- flag, and the day/night cycle's sunrise/sunset) — see src/utils/gameClock.js.
-- Clients derive the current time from that locally, so the row only changes
-- when the DM edits the clock, never per tick. Null = no clock. Writing it is
-- already host-only ("host can update their table", 02_policies.sql), and
-- every member can already read their table's row.
--
-- islands.day_night: whether an island follows the table's clock ('cycle'),
-- or stays always 'day' / always 'night' regardless of it. Islands are
-- already readable by members and writable by the host only (10_islands.sql).

alter table tables add column if not exists game_clock jsonb;

alter table islands add column if not exists day_night text not null default 'cycle';
alter table islands drop constraint if exists islands_day_night_check;
alter table islands add constraint islands_day_night_check check (day_night in ('cycle', 'day', 'night'));

-- ======================================================================
-- 33_day_night_override.sql
-- ======================================================================
-- Hearthbound — 33_day_night_override.sql
-- A day/night phase the DM sets by hand, overriding the in-game clock's own
-- cycle (32_game_clock.sql) until they hand it back. One nullable value per
-- table: null = follow the clock, otherwise the phase to show. Kept as its
-- own column rather than inside game_clock so it works with no clock at all.
--
-- Writing it is already host-only ("host can update their table",
-- 02_policies.sql); every member can already read their table's row.

alter table tables add column if not exists day_night_override text;
alter table tables drop constraint if exists tables_day_night_override_check;
alter table tables add constraint tables_day_night_override_check
  check (day_night_override is null or day_night_override in ('dawn', 'day', 'dusk', 'night'));

-- ======================================================================
-- 34_trap_size.sql
-- ======================================================================
-- Hearthbound — 34_trap_size.sql
-- A trap can cover anything from a single tile up to a 5x5 area
-- (src/data/traps.js). Every other token still tops out at 4x4, which is
-- what entities.size's original check (01_schema.sql) enforced for all
-- kinds — so the limit is widened for traps only, rather than for
-- everything. Dropped-and-re-added so it re-runs cleanly.

alter table entities drop constraint if exists entities_size_check;
alter table entities add constraint entities_size_check
  check (size between 1 and 4 or (kind = 'trap' and size = 5));

-- ======================================================================
-- 35_player_battle_equipment.sql
-- ======================================================================
-- Hearthbound — 35_player_battle_equipment.sql
-- Loosens the DM-only edit model from PITFALLS.md #1 / 16_dm_only_edits.sql:
-- a player can now use their own hero's Battle Equipment tab (change
-- weapon, add modifiers, roll attacks — including applying the resulting
-- damage to the target), Spells tab (spellcasting), and Bag tab (equipment,
-- currency). Everything else on a hero's sheet (level, abilities, saves,
-- skills) stays DM-only, and a player still can't touch a monster except to
-- apply attack damage to its HP.
--
-- Client-side, the same shape is enforced in GameView.jsx's
-- canUpdateEntity (isHeroOwnerSheetPatch / canDamageMob) — this migration
-- is what makes it a real security boundary in cloud mode rather than a UI
-- convention a player could bypass with a direct API call.
--
-- (Superseded by 37_player_door_layer_move.sql below, which rebuilds this
-- same function to also allow a hero's layer_id to change and a chest's
-- chest_items to shrink by one stack — kept here so the trigger's history
-- in this file matches the numbered migrations on disk.)

create or replace function enforce_entity_write_permissions() returns trigger as $$
declare
  v_is_host boolean;
  v_player_id uuid;
begin
  select is_host, id into v_is_host, v_player_id
    from players where table_id = new.table_id and auth_user_id = auth.uid();

  if v_is_host then
    return new;
  end if;

  if old.kind = 'hero' and old.owner_id = v_player_id then
    if new.name is distinct from old.name
      or new.image_url is distinct from old.image_url
      or new.color is distinct from old.color
      or new.size is distinct from old.size
      or new.hp is distinct from old.hp
      or new.max_hp is distinct from old.max_hp
      or new.armor_class is distinct from old.armor_class
      or new.owner_id is distinct from old.owner_id
      or new.layer_id is distinct from old.layer_id
      or new.target_layer_id is distinct from old.target_layer_id
      or new.target_col is distinct from old.target_col
      or new.target_row is distinct from old.target_row
      or new.conditions is distinct from old.conditions
      or new.chest_size is distinct from old.chest_size
      or new.opened is distinct from old.opened
      or new.chest_items is distinct from old.chest_items
      -- A hero's whole tabbed sheet lives in one jsonb column, so the only
      -- way to allow "just Battle Equipment/Spells/Bag" is to require every
      -- key except those tabs' own to be byte-for-byte unchanged.
      or (coalesce(new.sheet, '{}'::jsonb) - array['attacks', 'spellcasting', 'equipment', 'currency'])
        is distinct from (coalesce(old.sheet, '{}'::jsonb) - array['attacks', 'spellcasting', 'equipment', 'currency'])
    then
      raise exception 'Only the DM can edit token information — players may only move their own hero and manage its Battle Equipment, Spells, and Bag';
    end if;
    return new;
  end if;

  if old.kind = 'chest' then
    if new.name is distinct from old.name
      or new.color is distinct from old.color
      or new.col is distinct from old.col
      or new.row is distinct from old.row
      or new.size is distinct from old.size
      or new.island_id is distinct from old.island_id
      or new.chest_size is distinct from old.chest_size
      or new.chest_items is distinct from old.chest_items
    then
      raise exception 'Only the DM can edit chest contents or move it — players may only open or close a chest';
    end if;
    return new;
  end if;

  -- A hit rolled from a hero's Battle Equipment tab applies its damage to
  -- the target mob's hp (RightPanel.jsx's confirmAttack). Bounded to a
  -- plain decrease (never below 0, never above the mob's current hp) so
  -- this stays "apply attack damage," not "edit a monster's hp."
  if old.kind = 'mob' then
    if new.name is not distinct from old.name
      and new.image_url is not distinct from old.image_url
      and new.color is not distinct from old.color
      and new.col is not distinct from old.col
      and new.row is not distinct from old.row
      and new.size is not distinct from old.size
      and new.max_hp is not distinct from old.max_hp
      and new.armor_class is not distinct from old.armor_class
      and new.owner_id is not distinct from old.owner_id
      and new.layer_id is not distinct from old.layer_id
      and new.island_id is not distinct from old.island_id
      and new.conditions is not distinct from old.conditions
      and new.drop_items is not distinct from old.drop_items
      and new.hp is not null
      and new.hp >= 0
      and new.hp <= coalesce(old.hp, old.max_hp, 0)
    then
      return new;
    end if;
    raise exception 'Only the DM can edit this monster — players may only apply attack damage to its HP';
  end if;

  raise exception 'Only the DM can edit this token';
end;
$$ language plpgsql;

-- ======================================================================
-- 36_custom_assets.sql
-- ======================================================================
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

-- ======================================================================
-- 37_player_door_layer_move.sql
-- ======================================================================
-- Hearthbound — 37_player_door_layer_move.sql
-- Walking through a door (GameView.jsx's confirmEnterDoor) now actually
-- relocates the player's own hero to the door's other side — one square
-- clear of the door, not standing on it — instead of only switching which
-- layer that player is *viewing* while their token stays behind. That move
-- sets the hero's layer_id (in addition to the col/row/island_id a player
-- could already change), which the trigger above explicitly blocked for a
-- non-host. Same trust model col/row/island_id already had: the trigger
-- only enforces "you may only move your own hero," not "to a legal
-- destination" — GameView.jsx's arrivalCellNearDoor is what keeps a
-- legitimate client's move sane, same as it already did for col/row/island_id.
--
-- Also closes a gap from the chest "Take" feature (RightPanel.jsx's
-- ChestInspector): a player looting an opened chest patches its
-- `chest_items` (removing the one item they took) via GameView.jsx's
-- isTakeChestItemPatch, which was likewise still blocked above for a
-- non-host. Loosened on the same trust basis: the client-side validator is
-- what limits it to removing exactly one whole stack.

create or replace function enforce_entity_write_permissions() returns trigger as $$
declare
  v_is_host boolean;
  v_player_id uuid;
begin
  select is_host, id into v_is_host, v_player_id
    from players where table_id = new.table_id and auth_user_id = auth.uid();

  if v_is_host then
    return new;
  end if;

  if old.kind = 'hero' and old.owner_id = v_player_id then
    if new.name is distinct from old.name
      or new.image_url is distinct from old.image_url
      or new.color is distinct from old.color
      or new.size is distinct from old.size
      or new.hp is distinct from old.hp
      or new.max_hp is distinct from old.max_hp
      or new.armor_class is distinct from old.armor_class
      or new.owner_id is distinct from old.owner_id
      or new.target_layer_id is distinct from old.target_layer_id
      or new.target_col is distinct from old.target_col
      or new.target_row is distinct from old.target_row
      or new.conditions is distinct from old.conditions
      or new.chest_size is distinct from old.chest_size
      or new.opened is distinct from old.opened
      or new.chest_items is distinct from old.chest_items
      or (coalesce(new.sheet, '{}'::jsonb) - array['attacks', 'spellcasting', 'equipment', 'currency'])
        is distinct from (coalesce(old.sheet, '{}'::jsonb) - array['attacks', 'spellcasting', 'equipment', 'currency'])
    then
      raise exception 'Only the DM can edit token information — players may only move their own hero (including between layers via a door) and manage its Battle Equipment, Spells, and Bag';
    end if;
    return new;
  end if;

  if old.kind = 'chest' then
    if new.name is distinct from old.name
      or new.color is distinct from old.color
      or new.col is distinct from old.col
      or new.row is distinct from old.row
      or new.size is distinct from old.size
      or new.island_id is distinct from old.island_id
      or new.chest_size is distinct from old.chest_size
    then
      raise exception 'Only the DM can edit chest contents or move it — players may only open, close, or loot a chest';
    end if;
    return new;
  end if;

  if old.kind = 'mob' then
    if new.name is not distinct from old.name
      and new.image_url is not distinct from old.image_url
      and new.color is not distinct from old.color
      and new.col is not distinct from old.col
      and new.row is not distinct from old.row
      and new.size is not distinct from old.size
      and new.max_hp is not distinct from old.max_hp
      and new.armor_class is not distinct from old.armor_class
      and new.owner_id is not distinct from old.owner_id
      and new.layer_id is not distinct from old.layer_id
      and new.island_id is not distinct from old.island_id
      and new.conditions is not distinct from old.conditions
      and new.drop_items is not distinct from old.drop_items
      and new.hp is not null
      and new.hp >= 0
      and new.hp <= coalesce(old.hp, old.max_hp, 0)
    then
      return new;
    end if;
    raise exception 'Only the DM can edit this monster — players may only apply attack damage to its HP';
  end if;

  raise exception 'Only the DM can edit this token';
end;
$$ language plpgsql;
