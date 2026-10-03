-- Hearthbound — 49_encounter.sql
-- The running encounter: the turn order Roll for Initiative produced, whose
-- turn it is, the round, and where the acting token stood when its turn
-- began (src/utils/encounter.js). One nullable jsonb per table, like
-- game_clock (32_game_clock.sql): null = no fight running.
--
-- Writing the column is already host-only ("host can update their table",
-- 02_policies.sql) and every member can already read their table's row, so
-- the DM starts, advances and ends encounters with a plain update.
--
-- A player may end their own hero's turn — the one write a non-host needs.
-- end_encounter_turn checks the caller owns the hero whose turn it is, and
-- that the proposed next state only moves the turn forward over the same
-- turn order (never reorders it, rewinds it, or skips a whole round). Which
-- participant comes next (skipping removed tokens) is the client's call,
-- the same trust model 37_player_door_layer_move.sql uses for moves.

alter table tables add column if not exists encounter jsonb;

create or replace function end_encounter_turn(p_table_id uuid, p_next jsonb) returns void as $$
declare
  v_current jsonb;
  v_is_host boolean;
  v_player_id uuid;
  v_actor_id text;
  v_round int;
  v_turn int;
  v_next_round int;
  v_next_turn int;
begin
  select is_host, id into v_is_host, v_player_id
    from players where table_id = p_table_id and auth_user_id = auth.uid();
  if v_player_id is null then
    raise exception 'Not a member of this table';
  end if;

  select encounter into v_current from tables where id = p_table_id for update;
  if v_current is null then
    raise exception 'No encounter is running';
  end if;

  if not v_is_host then
    v_turn := (v_current ->> 'turn')::int;
    v_actor_id := v_current -> 'order' -> v_turn ->> 'id';
    if not exists (
      select 1 from entities
      where id::text = v_actor_id and table_id = p_table_id and kind = 'hero' and owner_id = v_player_id
    ) then
      raise exception 'It is not your turn';
    end if;
  end if;

  if p_next -> 'order' is distinct from v_current -> 'order' then
    raise exception 'The turn order cannot be changed this way';
  end if;

  v_round := (v_current ->> 'round')::int;
  v_turn := (v_current ->> 'turn')::int;
  v_next_round := (p_next ->> 'round')::int;
  v_next_turn := (p_next ->> 'turn')::int;
  if v_next_turn < 0 or v_next_turn >= jsonb_array_length(v_current -> 'order')
    or not (
      (v_next_round = v_round and v_next_turn > v_turn)
      or (v_next_round = v_round + 1 and v_next_turn <= v_turn)
    )
  then
    raise exception 'A turn can only pass to the next participant';
  end if;

  update tables set encounter = p_next where id = p_table_id;
end;
$$ language plpgsql security definer set search_path = public;
