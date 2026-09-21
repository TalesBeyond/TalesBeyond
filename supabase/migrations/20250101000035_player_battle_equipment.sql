-- Hearthbound — 35_player_battle_equipment.sql
-- Loosens the DM-only edit model from PITFALLS.md #1 / 16_dm_only_edits.sql:
-- a player can now use their own hero's Battle Equipment tab (change
-- weapon, add modifiers, roll attacks — including applying the resulting
-- damage to the target), Spells tab (spellcasting), and Bag tab (equipment,
-- currency). Everything else on a hero's sheet (level, abilities, saves,
-- skills) stays DM-only, and a player still can't touch a monster except to
-- apply attack damage to its HP.
--
-- Client-side, the same shape is enforced in GameView.jsx's
-- canUpdateEntity (isHeroOwnerSheetPatch / canDamageMob) — this migration
-- is what makes it a real security boundary in cloud mode rather than a UI
-- convention a player could bypass with a direct API call.

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

  if old.kind = 'hero' and old.owner_id = v_player_id then
    if new.name is distinct from old.name
      or new.image_url is distinct from old.image_url
      or new.color is distinct from old.color
      or new.size is distinct from old.size
      or new.hp is distinct from old.hp
      or new.max_hp is distinct from old.max_hp
      or new.armor_class is distinct from old.armor_class
      or new.owner_id is distinct from old.owner_id
      or new.layer_id is distinct from old.layer_id
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
      raise exception 'Only the DM can edit token information — players may only move their own hero and manage its Battle Equipment, Spells, and Bag';
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
      or new.chest_items is distinct from old.chest_items
    then
      raise exception 'Only the DM can edit chest contents or move it — players may only open or close a chest';
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
