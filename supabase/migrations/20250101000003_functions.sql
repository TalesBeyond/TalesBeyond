-- Hearthbound — 03_functions.sql
-- Corresponds to SPEC.md §9.3 (auth strategy, enforced here) and §9.4
-- (join / create RPCs). All three are SECURITY DEFINER so they can see
-- across tables just long enough to validate a code or check capacity,
-- while everything else stays locked down by 02_policies.sql.

create or replace function generate_unique_code() returns text as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L
  candidate text;
  attempt int := 0;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from invite_codes where code = candidate);
    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'Could not generate a unique invite code, try again';
    end if;
  end loop;
  return candidate;
end;
$$ language plpgsql;

-- Creates a table, its map row, seats the caller as host, and issues the
-- table's first invite code — this is what fires "a new invitation code
-- every session the host opens" for the cloud-backed version.
create or replace function create_table(
  p_name text,
  p_cols int,
  p_rows int,
  p_display_name text,
  p_color text
) returns table (table_id uuid, code text, host_player_id uuid) as $$
declare
  v_table_id uuid;
  v_base_layer_id uuid;
  v_code text;
  v_player_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in (even anonymously) to host a table';
  end if;

  insert into tables (name, host_auth_id) values (p_name, auth.uid())
    returning id into v_table_id;

  insert into layers (table_id, name, is_base)
    values (v_table_id, p_name, true)
    returning id into v_base_layer_id;

  insert into islands (layer_id, table_id, name, cols, rows, is_base)
    values (v_base_layer_id, v_table_id, p_name, greatest(4, least(60, p_cols)), greatest(4, least(60, p_rows)), true);

  insert into players (table_id, auth_user_id, name, color, is_host, current_layer_id)
    values (v_table_id, auth.uid(), p_display_name, p_color, true, v_base_layer_id)
    returning id into v_player_id;

  v_code := generate_unique_code();
  insert into invite_codes (code, table_id) values (v_code, v_table_id);

  return query select v_table_id, v_code, v_player_id;
end;
$$ language plpgsql security definer;

-- Validates a code, checks the table is open, seats the caller (or resumes
-- their existing seat if they already have one — same auth_user_id
-- rejoining), all inside one transaction so capacity can't be raced.
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

  select id into v_base_layer_id from layers where table_id = v_table_id and is_base;

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

-- Host-only: revoke the current code and issue a fresh one. Old code stops
-- working immediately for anyone who hasn't already joined.
create or replace function regenerate_invite_code(p_table_id uuid) returns text as $$
declare
  v_code text;
begin
  if not exists (
    select 1 from players where table_id = p_table_id and auth_user_id = auth.uid() and is_host
  ) then
    raise exception 'Only the host may regenerate the invite code';
  end if;

  update invite_codes set revoked_at = now() where table_id = p_table_id and revoked_at is null;
  v_code := generate_unique_code();
  insert into invite_codes (code, table_id) values (v_code, p_table_id);
  return v_code;
end;
$$ language plpgsql security definer;

-- Convenience read: the caller's own table_id/player_id/host flag for a
-- given code, used to resume a session (e.g. after a page refresh) without
-- exposing invite_codes rows to someone who hasn't joined yet.
create or replace function whoami_for_code(p_code text) returns table (
  table_id uuid, player_id uuid, is_host boolean
) as $$
begin
  return query
    select p.table_id, p.id, p.is_host
    from players p
    join invite_codes ic on ic.table_id = p.table_id
    where p.auth_user_id = auth.uid()
      and ic.code = upper(trim(p_code));
end;
$$ language plpgsql security definer;
