-- Fix: "column reference \"table_id\" is ambiguous" in join_table.
--
-- join_table's own OUT parameters (`returns table (table_id uuid,
-- player_id uuid)`) are also plpgsql variables in scope for the whole
-- function body. One line referenced the bare column name `table_id`
-- in a WHERE clause instead of qualifying it:
--   select id into v_base_layer_id from layers where table_id = v_table_id and is_base;
-- Postgres's default plpgsql.variable_conflict = error setting refuses to
-- guess whether that means layers.table_id or the OUT parameter, and
-- raises this error on every call. create_table and whoami_for_code never
-- hit this: their bodies either use column-lists (INSERT/ON CONFLICT
-- targets are matched against the table's columns directly, never
-- ambiguous) or already qualify every reference.
--
-- Not a REQ-004 regression — this is a pre-existing bug in
-- 03_functions.sql that has silently blocked every player's first join to
-- a table in cloud mode. It went uncaught for the same reason the players
-- RLS recursion bug (20250101000018) did: every earlier attempt at a real
-- multi-seat cloud session failed even earlier (anonymous sign-in
-- disabled, then that recursion bug) before ever reaching a genuine
-- join_table call from a second player.
create or replace function join_table(
  p_code text,
  p_display_name text,
  p_color text
) returns table (table_id uuid, player_id uuid) as $$
declare
  v_table_id uuid;
  v_base_layer_id uuid;
  v_player_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in (even anonymously) to join a table';
  end if;

  select ic.table_id into v_table_id
    from invite_codes ic
    where ic.code = upper(trim(p_code)) and ic.revoked_at is null;

  if v_table_id is null then
    raise exception 'Invalid or expired invite code';
  end if;

  if not (select is_open from tables where id = v_table_id) then
    raise exception 'This table is currently closed to new joins';
  end if;

  select id into v_base_layer_id from layers where layers.table_id = v_table_id and is_base;

  insert into players (table_id, auth_user_id, name, color, current_layer_id)
    values (v_table_id, auth.uid(), p_display_name, p_color, v_base_layer_id)
    on conflict (table_id, auth_user_id)
    do update set connected = true, name = excluded.name, color = excluded.color
    -- current_layer_id is deliberately NOT reset here, so a returning
    -- player resumes on whichever layer they last used a door to reach,
    -- instead of being sent back to the base layer on every rejoin.
    returning id into v_player_id;
    -- capacity trigger only fires on INSERT, so a rejoin (the ON CONFLICT
    -- branch) never gets blocked by a table that filled up after they left.

  return query select v_table_id, v_player_id;
end;
$$ language plpgsql security definer;
