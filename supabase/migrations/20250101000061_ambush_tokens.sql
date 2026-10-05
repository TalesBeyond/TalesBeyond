-- Hearthbound — 61_ambush_tokens.sql
-- Ambush tokens (src/data/ambush.js): a marker the DM places on the map that
-- holds a band of monsters. "Reveal the ambush" on its inspector puts every
-- monster it holds on the squares around it — as ordinary monster rows — and
-- deletes the marker (GameView.jsx's revealAmbush).
--
-- What it holds is a list of monster drafts with a count each, kept on the
-- row itself the way a chest's contents are:
--   [{ id, qty, name, imageUrl, color, maxHp, armorClass, size, ... }]
-- `imageUrl` in there is a reference (`icon:...` / `img:...`), never a
-- picture, the same rule image_url follows (55_no_stored_images.sql).
--
-- An ambush is the DM's own marker, so players never see it at all: like an
-- unrevealed trap (28_traps.sql) or a hidden token (59_hidden_tokens_locked_
-- doors.sql), the row is readable by the host only. The monsters reach
-- players as plain INSERTs when the ambush is revealed.
--
-- No change needed to enforce_entity_write_permissions(): a non-host's
-- UPDATE on an ambush falls through to its final "Only the DM can edit this
-- token" exception (and they can't read the row to begin with), and
-- INSERT/DELETE on `entities` are host-only policies already.

alter table entities drop constraint if exists entities_kind_check;
alter table entities add constraint entities_kind_check check (kind in ('hero','mob','door','chest','trap','ambush'));

alter table entities add column if not exists ambush_monsters jsonb not null default '[]'::jsonb;

drop policy if exists "members can read visible entities at their table" on entities;
create policy "members can read visible entities at their table"
  on entities for select
  using (
    table_id in (select table_id from players where auth_user_id = auth.uid())
    and (
      ((kind <> 'trap' or trap_revealed) and kind <> 'ambush' and not hidden)
      or table_id in (select table_id from players where auth_user_id = auth.uid() and is_host)
    )
  );
