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
