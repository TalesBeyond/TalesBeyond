-- Fix (attempt 2): "column reference \"table_id\" is ambiguous" in
-- join_table, still happening after 20250101000019.
--
-- 20250101000019 qualified the one bare `table_id` reference in a WHERE
-- clause, but missed a second one: `on conflict (table_id, auth_user_id)`.
-- Unlike a plain INSERT's target column list (a bare name list, never
-- ambiguous), ON CONFLICT's target list is parsed as a list of
-- expressions — so it *does* support things like `on conflict
-- (lower(email))` — which means it goes through the same ColumnRef
-- resolution as a WHERE clause, and hits the same plpgsql
-- variable-vs-column collision with the `table_id` OUT parameter.
-- Confirmed live: calling join_table directly still raised the identical
-- error (code 42702) even with 20250101000019 applied.
--
-- Fix: drop ON CONFLICT entirely in favor of an explicit "try UPDATE
-- first, INSERT if no row matched" — the same upsert semantics, using
-- only patterns already proven safe elsewhere in this schema (a qualified
-- WHERE clause, and a plain INSERT column list with no conflict target,
-- exactly like create_table's own players insert).
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

  -- Resume an existing seat under this auth_user_id if one exists, same
  -- rejoin semantics as the old ON CONFLICT DO UPDATE (current_layer_id is
  -- deliberately left untouched, so a returning player resumes on
  -- whichever layer they last used a door to reach).
  update players
    set connected = true, name = p_display_name, color = p_color
    where players.table_id = v_table_id and players.auth_user_id = auth.uid()
    returning id into v_player_id;

  if v_player_id is null then
    insert into players (table_id, auth_user_id, name, color, current_layer_id)
      values (v_table_id, auth.uid(), p_display_name, p_color, v_base_layer_id)
      returning id into v_player_id;
      -- capacity trigger only fires on INSERT, so a rejoin (the UPDATE
      -- branch above) never gets blocked by a table that filled up after
      -- they left.
  end if;

  return query select v_table_id, v_player_id;
end;
$$ language plpgsql security definer;
