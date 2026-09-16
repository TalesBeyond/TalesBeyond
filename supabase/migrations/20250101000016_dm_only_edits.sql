-- Hearthbound — 16_dm_only_edits.sql
-- Tightens the trust model from PITFALLS.md #1: the DM is now the only one
-- who can edit information. A player may only:
--   1. move their own hero token (col/row/island_id),
--   2. open/close a chest (opened + the icon that comes with it), and
--   3. update their own player row (name/color/current_layer_id — walking
--      through a door), already covered by 02_policies.sql and unchanged.
-- Everything else — placing/removing tokens, editing any stats, sheet,
-- conditions, chest contents, dm data, layers, islands, importing a table
-- — is host-only. Layers/islands were already host-only from
-- 05_layers.sql/10_islands.sql; this migration only needs to tighten
-- `entities`.
--
-- RLS alone can't express "this column may change on this row but not
-- that one," so row visibility stays broad (every member can still SELECT,
-- unchanged) while a BEFORE UPDATE trigger enforces the field-level limits
-- a plain USING/WITH CHECK clause can't. Client-side, the exact same rule
-- is enforced in GameView.jsx's canMoveEntity/canUpdateEntity — this
-- migration is what makes it a real security boundary in cloud mode
-- instead of a UI convention a player could bypass with a direct API call.

drop policy if exists "members can write entities at their table" on entities;

create policy "host can insert entities at their table"
  on entities for insert
  with check (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

create policy "members can attempt to update entities at their table"
  on entities for update
  using (table_id in (select table_id from players where auth_user_id = auth.uid()))
  with check (table_id in (select table_id from players where auth_user_id = auth.uid()));

create policy "host can delete entities at their table"
  on entities for delete
  using (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));

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
      or new.sheet is distinct from old.sheet
      or new.chest_size is distinct from old.chest_size
      or new.opened is distinct from old.opened
      or new.chest_items is distinct from old.chest_items
    then
      raise exception 'Only the DM can edit token information — players may only move their own hero';
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

  raise exception 'Only the DM can edit this token';
end;
$$ language plpgsql;

drop trigger if exists trg_entities_permissions on entities;
create trigger trg_entities_permissions before update on entities
  for each row execute function enforce_entity_write_permissions();

-- entity_dm_data (15_entity_dm_data_privacy.sql) allowed any member to
-- INSERT a starter row, since placing a monster used to be open to
-- everyone. Placing is host-only now, so tighten this too for consistency
-- — nothing in the app still relies on a non-host inserting here.
drop policy if exists "members can create dm-data rows for entities at their table" on entity_dm_data;
create policy "only the host can create dm-data rows for entities at their table"
  on entity_dm_data for insert
  with check (table_id in (select table_id from players where auth_user_id = auth.uid() and is_host));
