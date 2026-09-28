-- Hearthbound — 52_drawings.sql
-- The DM's Draw tool (MapBoard.jsx): pencil strokes, lines, circles and
-- rectangles drawn on an island, like chalk on the floor — over the map art
-- and grid, under every token. One row per drawing.
--
-- A drawing belongs to the island it was drawn on (island_id): it moves
-- with the island and goes when the island does (on delete cascade, which
-- also covers a deleted layer). `geometry` is in grid squares from the
-- island's top-left corner, so zoom and cell size never change it:
--   pencil {points: [[x, y], ...]}, line {from: [x, y], to: [x, y]},
--   circle {center: [x, y], radius}, rect {x, y, w, h}
-- `style` is {color: '#rrggbb', width: <preset>, fill: boolean}.
--
-- Only the DM writes, same trust model as custom_assets (PITFALLS.md #1);
-- every seated member reads, since every drawing is for the whole table.

create table if not exists drawings (
  id            uuid primary key default gen_random_uuid(),
  table_id      uuid not null references tables(id) on delete cascade,
  island_id     uuid not null references islands(id) on delete cascade,
  kind          text not null check (kind in ('pencil', 'line', 'circle', 'rect')),
  geometry      jsonb not null,
  style         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists drawings_table_idx on drawings (table_id);
create index if not exists drawings_island_idx on drawings (island_id);

drop trigger if exists trg_drawings_touch on drawings;
create trigger trg_drawings_touch before update on drawings
  for each row execute function touch_updated_at();

alter table drawings enable row level security;

drop policy if exists "members can read drawings at their table" on drawings;
create policy "members can read drawings at their table"
  on drawings for select
  using (table_id in (select table_id from players where auth_user_id = auth.uid()));

drop policy if exists "host can insert drawings at their table" on drawings;
create policy "host can insert drawings at their table"
  on drawings for insert
  with check (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

drop policy if exists "host can update drawings at their table" on drawings;
create policy "host can update drawings at their table"
  on drawings for update
  using (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host))
  with check (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

drop policy if exists "host can delete drawings at their table" on drawings;
create policy "host can delete drawings at their table"
  on drawings for delete
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
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'drawings'
  ) then
    alter publication supabase_realtime add table public.drawings;
  end if;
end $$;
