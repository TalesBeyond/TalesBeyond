-- Hearthbound — 02_policies.sql
-- Corresponds to SPEC.md §9.2 (Row Level Security).
--
-- Model: every table is scoped to "am I a player at this table?" via
-- auth.uid(). Joining/creating a table happens through SECURITY DEFINER
-- RPCs (03_functions.sql), not direct inserts, so an unauthenticated or
-- not-yet-joined visitor can never see another table's data.

alter table tables enable row level security;
alter table invite_codes enable row level security;
alter table players enable row level security;
alter table maps enable row level security;
alter table entities enable row level security;

-- ---------- tables ----------

create policy "members can read their table"
  on tables for select
  using (id in (select table_id from players where auth_user_id = auth.uid()));

create policy "host can update their table (open/close, rename)"
  on tables for update
  using (id in (select table_id from players where auth_user_id = auth.uid() and is_host));

-- ---------- invite_codes ----------

create policy "members can read invite codes for their table"
  on invite_codes for select
  using (table_id in (select table_id from players where auth_user_id = auth.uid()));

-- No direct insert/update policy: codes are only ever written by the
-- SECURITY DEFINER functions create_table / regenerate_invite_code, which
-- bypass RLS by design (that's what SECURITY DEFINER means here).

-- ---------- players ----------

create policy "members can read the roster of their table"
  on players for select
  using (table_id in (select table_id from players as me where me.auth_user_id = auth.uid()));

create policy "a player can update their own row (name/color/connected)"
  on players for update
  using (auth_user_id = auth.uid());

-- No direct insert policy: seat creation goes through join_table/create_table
-- so the capacity trigger and invite-code check are always enforced.

-- Note: the "maps" table (and its policies) is retired by 05_layers.sql,
-- which creates and secures its replacement, "layers", in the same file —
-- that table doesn't exist yet at this point for a fresh install, so its
-- RLS setup can't live here.
--
-- Also note: a player setting their own current_layer_id when they walk
-- through a door needs no new policy anywhere — the "a player can update
-- their own row" policy above has no column restriction and already
-- covers it.

-- ---------- entities ----------
-- Phase 1's trust model (any seated player can move/add/edit/remove any
-- token) carries over: all members can read and write entities. The
-- optional "lock hero tokens to owner" feature from SPEC.md §13 would
-- tighten the update policy to `owner_id = my player id or kind = 'mob'`.

create policy "members can read entities at their table"
  on entities for select
  using (table_id in (select table_id from players where auth_user_id = auth.uid()));

create policy "members can write entities at their table"
  on entities for all
  using (table_id in (select table_id from players where auth_user_id = auth.uid()))
  with check (table_id in (select table_id from players where auth_user_id = auth.uid()));
