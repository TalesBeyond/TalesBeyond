-- Hearthbound — 60_chest_open_requests.sql
-- Opening a chest is now the DM's call. A player no longer opens one
-- directly: "Ask the DM to open it" (RightPanel.jsx's ChestOpenButton) puts
-- that player's id on the chest, the DM gets an Allow / Deny card
-- (RollFeed.jsx's ChestAsks), and the DM's client either opens the chest or
-- clears the ask (GameView.jsx's allowChestOpen / denyChestOpen).
--
-- The ask lives on the chest's own row rather than in a broadcast, so it
-- reaches the DM the way every other token change does, survives a refresh
-- on either side, and is still waiting if the DM was away when it was made.
-- It points at `players`, so a player who leaves or is kicked takes their
-- ask with them.
--
-- Until now 16/37's trigger let any seated player flip a chest's `opened`
-- and change its `chest_items`. Rebuilt from 59_hidden_tokens_locked_doors
-- .sql's version of the function (the current one); the changes are the
-- chest branch's three new lines and the guard just above the hero branch.
-- A non-host may now only:
--   - close a chest (never open one),
--   - set open_request_by to their own player id while nobody is asking and
--     the chest is shut, or clear it again while it is their own,
--   - change chest_items (loot) once the chest is open.

alter table entities add column if not exists open_request_by uuid references players(id) on delete set null;

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
      -- Opening it is the DM's call (GameView.jsx's allowChestOpen); a
      -- player may still close one.
      or (new.opened and not old.opened)
      -- What a player does instead: ask (their own id, while nobody else
      -- is asking and the chest is shut), or take their own ask back.
      -- The third case is the foreign key itself, clearing the ask of a
      -- player who just left (their seat is already gone by then).
      or (new.open_request_by is distinct from old.open_request_by
          and not coalesce(
            (old.open_request_by is null and new.open_request_by = v_player_id and not old.opened)
            or (old.open_request_by = v_player_id and new.open_request_by is null)
            or (new.open_request_by is null and not exists (select 1 from players where id = old.open_request_by)),
            false))
      -- Nothing comes out of a chest that isn't open.
      or (new.chest_items is distinct from old.chest_items and not old.opened)
    then
      raise exception 'Only the DM can open a chest, edit its contents or move it — players may only ask to open it, close it, or loot it once it is open';
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
