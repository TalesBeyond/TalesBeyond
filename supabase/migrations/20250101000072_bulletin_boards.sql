-- Hearthbound — 72_bulletin_boards.sql
-- NOT IN USE YET. The app keeps bulletin boards out of the database for now:
-- on a cloud table the DM's browser holds them and announces them to players
-- over the table's channel (src/lib/boardSync.js). This migration is kept for
-- the day boards are stored here instead; what follows describes that design.
-- Applying it before then changes nothing the app relies on.
--
-- Bulletin boards (src/data/bulletins.js): a token the DM pins notices to —
-- news, rumours, quests — for the party to read. What is pinned is kept on
-- the row itself, the way a chest's contents are:
--   [{ id, title, text }]
--
-- Everyone at the table can see a board (unless the DM hides it — `hidden`
-- and the SELECT policy from 59_hidden_tokens_locked_doors.sql, as rebuilt by
-- 69_fogged_tokens.sql, already cover every kind). That a player reads it
-- only while their hero stands next to it is a rule of the table, checked by
-- the client; the bulletins are not kept from a player's client.
--
-- No change needed to enforce_entity_write_permissions(): a non-host's
-- UPDATE on a board falls through to its final "Only the DM can edit this
-- token" exception, and INSERT/DELETE on `entities` are host-only policies
-- already.

alter table entities drop constraint if exists entities_kind_check;
alter table entities add constraint entities_kind_check check (kind in ('hero','mob','npc','door','chest','trap','ambush','bulletin'));

alter table entities add column if not exists bulletins jsonb not null default '[]'::jsonb;
