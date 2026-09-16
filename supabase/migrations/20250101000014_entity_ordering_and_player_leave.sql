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
