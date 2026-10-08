-- Hearthbound — 68_fog_chunks.sql
-- Fog of war (src/utils/fogOfWar.js, MapBoard.jsx): rectangles of fog the DM
-- lays over an island. Players see an opaque cover over every square that at
-- least one unrevealed chunk covers; the DM sees a tint. One row per chunk.
--
-- A fog chunk belongs to the island it was laid on (island_id): it moves
-- with the island and goes when the island does (on delete cascade, which
-- also covers a deleted layer). Its rectangle (x, y, w, h) is in whole grid
-- squares from the island's top-left corner. Squares that fall outside the
-- island's current cols/rows are ignored by the app; the stored rectangle is
-- never rewritten when the island is resized.
--
-- `revealed`: the DM opened it (or a hero stood in it) — it no longer covers
-- anything, for the whole table. `reveal_on_enter`: with it on, the DM's
-- client reveals the chunk when a hero stands in it; with it off the chunk
-- is held back, and players' clients refuse to move a hero onto it.
--
-- Only the DM writes, same trust model as drawings (52_drawings.sql,
-- PITFALLS.md #1); every seated member reads, since the cover is for the
-- whole table. This is "Fog of war", not the Fog island condition
-- (31_island_conditions.sql), which is untouched.

create table if not exists fog_chunks (
  id               uuid primary key default gen_random_uuid(),
  table_id         uuid not null references tables(id) on delete cascade,
  island_id        uuid not null references islands(id) on delete cascade,
  x                integer not null,
  y                integer not null,
  w                integer not null check (w >= 1),
  h                integer not null check (h >= 1),
  revealed         boolean not null default false,
  reveal_on_enter  boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists fog_chunks_table_idx on fog_chunks (table_id);
create index if not exists fog_chunks_island_idx on fog_chunks (island_id);

drop trigger if exists trg_fog_chunks_touch on fog_chunks;
create trigger trg_fog_chunks_touch before update on fog_chunks
  for each row execute function touch_updated_at();

alter table fog_chunks enable row level security;

drop policy if exists "members can read fog chunks at their table" on fog_chunks;
create policy "members can read fog chunks at their table"
  on fog_chunks for select
  using (table_id in (select table_id from players where auth_user_id = auth.uid()));

drop policy if exists "host can insert fog chunks at their table" on fog_chunks;
create policy "host can insert fog chunks at their table"
  on fog_chunks for insert
  with check (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

drop policy if exists "host can update fog chunks at their table" on fog_chunks;
create policy "host can update fog chunks at their table"
  on fog_chunks for update
  using (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host))
  with check (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

drop policy if exists "host can delete fog chunks at their table" on fog_chunks;
create policy "host can delete fog chunks at their table"
  on fog_chunks for delete
  using (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

-- Live updates: a table missing from the publication breaks the whole
-- realtime channel, not just this table (see 50_realtime_publication.sql).
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fog_chunks'
  ) then
    alter publication supabase_realtime add table public.fog_chunks;
  end if;
end $$;
