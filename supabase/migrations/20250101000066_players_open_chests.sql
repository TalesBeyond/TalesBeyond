-- Hearthbound — 66_players_open_chests.sql
-- A player opens a chest themselves again: the "Ask the DM to open it" step
-- (60_chest_open_requests.sql) is gone from the app. What stops them now is
-- the lock (65_locked_chests.sql) — a chest opens for a player when, and
-- only when, the DM hasn't locked it. Everything else about a chest is as
-- before: only the DM moves it, renames it, edits what it holds or locks
-- it, and loot comes out only once it is open.
--
-- entities.open_request_by stays where it is (nothing reads it any more);
-- dropping a column is not worth a destructive migration.
--
-- Rebuilt from 65_locked_chests.sql's version of the function (the current
-- one); the only change is the "may a non-host open it" condition in the
-- chest branch.

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

  -- Only a chest carries an ask to be opened.
  if old.kind <> 'chest' and new.open_request_by is distinct from old.open_request_by then
    raise exception 'Only a chest can be asked to open';
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
      -- way to allow "just Battle Equipment/Spells/Bag/Skills" is to require
      -- every key except those tabs' own to be byte-for-byte unchanged.
      or (coalesce(new.sheet, '{}'::jsonb) - array['attacks', 'spellcasting', 'equipment', 'currency', 'savingThrows', 'skills', 'proficiencyBonus'])
        is distinct from (coalesce(old.sheet, '{}'::jsonb) - array['attacks', 'spellcasting', 'equipment', 'currency', 'savingThrows', 'skills', 'proficiencyBonus'])
    then
      raise exception 'Only the DM can edit token information — players may only move their own hero (including between layers via a door), change its hit points up to its maximum, and manage its Battle Equipment, Spells, Bag, and Skills';
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
      -- A player opens and closes a chest themselves (GameView.jsx's
      -- isChestTogglePatch) — unless the DM has locked it.
      or (new.opened and not old.opened and coalesce(old.locked, false))
      -- open_request_by is no longer used by the app (60_chest_open_requests
      -- .sql's "ask the DM to open it"); the old rule for it is kept as it
      -- was so a browser still running the previous version keeps working:
      -- ask (their own id, while nobody else is asking and the chest is shut
      -- and not locked), or take their own ask back.
      -- The third case is the foreign key itself, clearing the ask of a
      -- player who just left (their seat is already gone by then).
      or (new.open_request_by is distinct from old.open_request_by
          and not coalesce(
            (old.open_request_by is null and new.open_request_by = v_player_id and not old.opened and not coalesce(old.locked, false))
            or (old.open_request_by = v_player_id and new.open_request_by is null)
            or (new.open_request_by is null and not exists (select 1 from players where id = old.open_request_by)),
            false))
      -- Nothing comes out of a chest that isn't open.
      or (new.chest_items is distinct from old.chest_items and not old.opened)
    then
      raise exception 'Only the DM can open a locked chest, edit a chest''s contents or move it — players may only open one that isn''t locked, close it, or loot it once it is open';
    end if;
    return new;
  end if;

  -- A hit rolled from a hero's Battle Equipment tab applies its damage to
  -- the target monster's or NPC's hp (RightPanel.jsx's confirmAttack).
  -- Bounded to a plain decrease (never below 0, never above its current hp)
  -- so this stays "apply attack damage," not "edit a monster's hp." An NPC
  -- has no loot, so that clause never applies to one.
  if old.kind in ('mob', 'npc') then
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
      -- Loot (rolled by the DM's client when the monster reached 0 HP): a
      -- player may only take things out of it, and only once it is down.
      and (new.loot is not distinct from old.loot
           or (old.hp = 0
               and jsonb_typeof(old.loot) = 'array'
               and jsonb_typeof(new.loot) = 'array'
               and jsonb_array_length(new.loot) < jsonb_array_length(old.loot)))
      and new.hp is not null
      and new.hp >= 0
      and new.hp <= coalesce(old.hp, old.max_hp, 0)
    then
      return new;
    end if;
    raise exception 'Only the DM can edit this monster or NPC — players may only apply attack damage to its HP and take a monster''s loot once it is defeated';
  end if;

  raise exception 'Only the DM can edit this token';
end;
$$ language plpgsql;
