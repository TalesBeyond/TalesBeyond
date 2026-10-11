-- Hearthbound — 71_moderation.sql
-- What the Terms of Use promise about unlawful and pornographic content,
-- backed by the database:
--
-- 1. A record of who accepted the terms, for which table, and when
--    (`terms_acceptances`). create_table and join_table now take the terms
--    version the caller ticked on the landing screen and refuse without one.
-- 2. A block list (`banned_users`): a blocked identity can neither host nor
--    join. An anonymous identity is only as durable as the browser's storage,
--    so this stops an account, not a determined person.
-- 3. Reports (`content_reports`): anyone seated at a table can report it from
--    the table menu (report_table). The report keeps the table's name, code
--    and host as they were, so it still reads after the table is gone.
-- 4. A log of what the operator did about it (`moderation_actions`).
--
-- None of the four tables has a policy: with row level security on, no
-- browser can read or write them. The functions below write them as their
-- owner, and the operator reads and acts on them with the service-role key
-- (scripts/moderation-admin.mjs, MODERATION.md).
--
-- Guest tables have no row here at all, so none of this reaches them.

create table if not exists terms_acceptances (
  auth_user_id   uuid not null references auth.users(id) on delete cascade,
  -- No foreign key: the record outlives the table and the seat.
  table_id       uuid not null,
  terms_version  text not null,
  accepted_at    timestamptz not null default now(),
  primary key (auth_user_id, table_id, terms_version)
);
alter table terms_acceptances enable row level security;

create table if not exists banned_users (
  auth_user_id  uuid primary key,
  reason        text,
  banned_at     timestamptz not null default now()
);
alter table banned_users enable row level security;

create table if not exists content_reports (
  id                uuid primary key default gen_random_uuid(),
  table_id          uuid not null,
  table_name        text,
  invite_code       text,
  host_auth_id      uuid,
  reporter_auth_id  uuid not null,
  reporter_name     text,
  reporter_is_host  boolean not null default false,
  reason            text not null check (reason in ('sexual', 'minor', 'harassment', 'illegal', 'other')),
  details           text,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  resolution        text
);
create index if not exists content_reports_open_idx on content_reports (created_at) where resolved_at is null;
create index if not exists content_reports_reporter_idx on content_reports (reporter_auth_id, created_at);
alter table content_reports enable row level security;

create table if not exists moderation_actions (
  id              uuid primary key default gen_random_uuid(),
  action          text not null,
  table_id        uuid,
  table_name      text,
  target_auth_id  uuid,
  reason          text,
  created_at      timestamptz not null default now()
);
alter table moderation_actions enable row level security;

-- Keeps the first time this identity accepted this version for this table.
-- Only for a table the caller is seated at, so it cannot be filled with
-- records for tables that are not theirs. Also called on its own by the
-- client when a returning host or player resumes a seat (Landing.jsx).
create or replace function record_terms_acceptance(p_table_id uuid, p_terms_version text) returns void as $$
  insert into terms_acceptances (auth_user_id, table_id, terms_version)
  select auth.uid(), p_table_id, left(trim(p_terms_version), 40)
  where auth.uid() is not null
    and trim(coalesce(p_terms_version, '')) <> ''
    and exists (select 1 from players p where p.table_id = p_table_id and p.auth_user_id = auth.uid())
  on conflict do nothing;
$$ language sql security definer;

-- create_table and join_table gain p_terms_version. The old signatures are
-- dropped first: `create or replace` with one more parameter would add a
-- second function beside the old one, and the old one would go on seating
-- people who accepted nothing. A browser still running the previous build
-- calls without the parameter, gets null, and is told to reload.
drop function if exists create_table(text, int, int, text, text);
drop function if exists join_table(text, text, text);

create or replace function create_table(
  p_name text,
  p_cols int,
  p_rows int,
  p_display_name text,
  p_color text,
  p_terms_version text default null
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

  if trim(coalesce(p_terms_version, '')) = '' then
    raise exception 'Reload the page and accept the Terms of Use to host a table';
  end if;

  if exists (select 1 from banned_users b where b.auth_user_id = auth.uid()) then
    raise exception 'This account has been blocked from hosting or joining tables';
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

  perform record_terms_acceptance(v_table_id, p_terms_version);

  return query select v_table_id, v_code, v_player_id;
end;
$$ language plpgsql security definer;

create or replace function join_table(
  p_code text,
  p_display_name text,
  p_color text,
  p_terms_version text default null
) returns table (table_id uuid, player_id uuid) as $$
declare
  v_table_id uuid;
  v_base_layer_id uuid;
  v_player_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in (even anonymously) to join a table';
  end if;

  if trim(coalesce(p_terms_version, '')) = '' then
    raise exception 'Reload the page and accept the Terms of Use to join a table';
  end if;

  if exists (select 1 from banned_users b where b.auth_user_id = auth.uid()) then
    raise exception 'This account has been blocked from hosting or joining tables';
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

  -- Resume an existing seat under this auth_user_id if one exists
  -- (current_layer_id is deliberately left untouched, so a returning player
  -- resumes on whichever layer they last used a door to reach).
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

  perform record_terms_acceptance(v_table_id, p_terms_version);

  return query select v_table_id, v_player_id;
end;
$$ language plpgsql security definer;

-- Anyone seated at a table can report it. Five a day per identity, so the
-- operator's list cannot be flooded from one browser.
create or replace function report_table(p_table_id uuid, p_reason text, p_details text) returns void as $$
declare
  v_name text;
  v_is_host boolean;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in (even anonymously) to report a table';
  end if;

  select p.name, p.is_host into v_name, v_is_host
    from players p
    where p.table_id = p_table_id and p.auth_user_id = auth.uid();

  if not found then
    raise exception 'Only someone seated at this table can report it';
  end if;

  if p_reason is null or p_reason not in ('sexual', 'minor', 'harassment', 'illegal', 'other') then
    raise exception 'Pick a reason for the report';
  end if;

  if (select count(*) from content_reports r
        where r.reporter_auth_id = auth.uid() and r.created_at > now() - interval '1 day') >= 5 then
    raise exception 'You have sent several reports today. Write to us by email if there is more to add.';
  end if;

  insert into content_reports (table_id, table_name, invite_code, host_auth_id, reporter_auth_id, reporter_name, reporter_is_host, reason, details)
    select
      t.id,
      t.name,
      (select ic.code from invite_codes ic where ic.table_id = t.id and ic.revoked_at is null limit 1),
      t.host_auth_id,
      auth.uid(),
      v_name,
      v_is_host,
      p_reason,
      nullif(left(trim(coalesce(p_details, '')), 2000), '')
    from tables t
    where t.id = p_table_id;
end;
$$ language plpgsql security definer;
