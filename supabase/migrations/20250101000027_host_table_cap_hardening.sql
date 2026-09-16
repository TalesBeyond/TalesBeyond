-- Hearthbound — 27_host_table_cap_hardening.sql
-- REQ-007: fixes two gaps a /code-review of 26_security_hardening.sql's
-- new 20-table host cap surfaced.
--
-- 1) The cap check (`select count(*) ... >= 20`) was a non-atomic
--    check-then-insert — concurrent create_table calls from the same
--    identity could each read a count under 20 before any of their
--    inserts committed, letting more than 20 through. Fixed by acquiring
--    a transaction-scoped advisory lock keyed on the caller's auth.uid()
--    before the count, so concurrent calls from the *same* identity
--    serialize instead of racing. A 32-bit hashtext collision could rarely
--    make two *different* hosts' calls wait on each other, but can never
--    let either miscount the other's tables, since the count itself still
--    filters by the correct host_auth_id.
-- 2) `tables.host_auth_id` had no index anywhere in the schema, so that
--    same count query was a full table scan on every create_table call.
create index if not exists tables_host_auth_id_idx on tables (host_auth_id);

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

  -- Serializes concurrent create_table calls from this same identity for
  -- the rest of this transaction; released automatically on commit/rollback.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text)::bigint);

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

-- Host-only: permanently delete one of the caller's own tables. Every
-- child row (layers, islands, entities, entity_dm_data, invite_codes,
-- players) cascades via existing `on delete cascade` FKs — see REQ-007's
-- Constraints — so this one delete is all the Postgres side needs.
-- Frees a slot against create_table's 20-table cap immediately.
create or replace function delete_table(p_table_id uuid) returns void as $$
begin
  if not exists (
    select 1 from tables where id = p_table_id and host_auth_id = auth.uid()
  ) then
    raise exception 'Only the host of this table may delete it';
  end if;

  delete from tables where id = p_table_id;
end;
$$ language plpgsql security definer;

-- Lets a host clean up their own table's uploaded images (token-art,
-- map-backgrounds) from the client via the Storage API. This policy's
-- check depends on the `tables` row still existing, so client code MUST
-- delete storage objects BEFORE calling delete_table, not after — once
-- the table row is gone, this policy's subquery can no longer find it and
-- would reject the storage deletion. Scoped to the caller's own tables
-- specifically (host_auth_id), not merely a table they're seated at, the
-- same way upload is scoped in 04_storage.sql.
create policy "host can delete storage for their own table"
  on storage.objects for delete
  using (
    (bucket_id = 'token-art' or bucket_id = 'map-backgrounds')
    and (storage.foldername(name))[1]::uuid in (
      select id from tables where host_auth_id = auth.uid()
    )
  );
