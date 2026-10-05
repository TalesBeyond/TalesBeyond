-- Hearthbound — 59_hidden_tokens_locked_doors.sql
-- Two things the DM can now keep from players (src/data/visibility.js):
--
--   hidden — a monster, chest or door the players can't see until the DM
--            shows it. Same privacy as an unrevealed trap (28_traps.sql): the
--            row is readable by the host only, so a player's queries and
--            Realtime subscription never receive it — not just a UI filter.
--   locked — a door the players can see but can't click or walk through
--            until the DM unlocks it.
--
-- Showing a hidden token is an ordinary UPDATE: the row becomes visible, so
-- Realtime delivers it and the client upserts it (src/lib/realtime.js).
-- Hiding one is an ordinary UPDATE too, but Realtime sends no event when a
-- row stops being visible to a subscriber, so the DM's client follows it
-- with a 'conceal' broadcast naming the token; each player's client then
-- checks whether it can still read that row and drops the token if not.
-- (A trap is hidden again by delete + re-insert instead — hideTrapRemote —
-- which would not do here: deleting a monster also deletes the sound
-- attached to it, 40_audio_cleanup.sql.)
--
-- Whether a locked door may be walked through is the client's call
-- (GameView.jsx's enterDoor), the same trust model 37_player_door_layer_
-- move.sql uses for where a hero may move. What this migration does enforce
-- is that only the DM can lock, unlock, hide or show anything.

alter table entities add column if not exists hidden boolean not null default false;
alter table entities add column if not exists locked boolean not null default false;

drop policy if exists "members can read visible entities at their table" on entities;
create policy "members can read visible entities at their table"
  on entities for select
  using (
    table_id in (select table_id from players where auth_user_id = auth.uid())
    and (
      ((kind <> 'trap' or trap_revealed) and not hidden)
      or table_id in (select table_id from players where auth_user_id = auth.uid() and is_host)
    )
  );

-- Rebuilt from 57_player_hero_hp.sql's version of this function (the
-- current one). The only change is the hidden/locked check right after the
-- host's early return.

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

  -- Hiding or showing a token and locking or unlocking a door are the DM's
  -- alone, whatever kind of token it is.
  if new.hidden is distinct from old.hidden or new.locked is distinct from old.locked then
    raise exception 'Only the DM can hide a token or lock a door';
  end if;

  if old.kind = 'hero' and old.owner_id = v_player_id then
    if new.name is distinct from old.name
      or new.image_url is distinct from old.image_url
      or new.color is distinct from old.color
      or new.size is distinct from old.size
      -- Their own hero's hit points: any whole number from 0 up to its
      -- maximum (GameView.jsx's isHeroOwnerLifePatch).
      or (new.hp is distinct from old.hp
          and (new.hp is null or new.hp < 0 or (coalesce(old.max_hp, 0) > 0 and new.hp > old.max_hp)))
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
      -- A hero's whole tabbed sheet lives in one jsonb column, so the only
      -- way to allow "just Battle Equipment/Spells/Bag" is to require every
      -- key except those tabs' own to be byte-for-byte unchanged.
      or (coalesce(new.sheet, '{}'::jsonb) - array['attacks', 'spellcasting', 'equipment', 'currency'])
        is distinct from (coalesce(old.sheet, '{}'::jsonb) - array['attacks', 'spellcasting', 'equipment', 'currency'])
    then
      raise exception 'Only the DM can edit token information — players may only move their own hero (including between layers via a door), change its hit points up to its maximum, and manage its Battle Equipment, Spells, and Bag';
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
