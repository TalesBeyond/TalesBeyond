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
