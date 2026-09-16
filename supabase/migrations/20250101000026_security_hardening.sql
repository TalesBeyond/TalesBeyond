-- Hearthbound — 26_security_hardening.sql
-- REQ-006 Slice 3: abuse throttling on the two unauthenticated-cost RPCs
-- flagged in SECURITY.md (#1 create_table spam, #3 invite-code brute-force).
-- Neither had any app-level protection before this — Supabase's
-- [auth.rate_limit] settings only govern its own auth endpoints, not these
-- RPC calls (see SECURITY.md and REQ-006's Constraints).
--
-- Both changes are CREATE OR REPLACE of existing 03_functions.sql
-- functions, so no schema/column change is needed — invite_codes.code is
-- already a plain, unconstrained `text` column, and existing 6-character
-- codes keep working until regenerated.

-- Invite codes: 6 -> 8 characters (32^8 ≈ 1.1 trillion combinations, up
-- from 32^6 ≈ 1.07 billion), raising the cost of guessing a code across
-- every identity at once, with no new table needed.
create or replace function generate_unique_code() returns text as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L
  candidate text;
  attempt int := 0;
begin
  loop
    candidate := '';
    for i in 1..8 loop
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

-- create_table: cap how many tables one auth identity can host at once,
-- bounding a spam script's footprint to a fixed number of rows instead of
-- unlimited. A real DM running several campaigns is nowhere near 20.
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

  if (select count(*) from tables where host_auth_id = auth.uid()) >= 20 then
    raise exception 'You''ve reached the limit of 20 hosted tables — remove or stop using an old one before creating another';
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
