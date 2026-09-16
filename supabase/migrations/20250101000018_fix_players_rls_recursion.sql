-- Fix: "infinite recursion detected in policy for relation players".
--
-- The players SELECT policy (02_policies.sql) checked table membership by
-- querying players itself:
--   using (table_id in (select table_id from players as me where me.auth_user_id = auth.uid()))
-- Reading players re-invokes this same policy on its own inner read,
-- recursing forever. Every other policy that subqueries players for a
-- membership check (tables, invite_codes, layers, islands, entities,
-- entity_dm_data, storage.objects) is not itself recursive — they only
-- failed because reading players from inside them hit this one broken
-- policy. This wasn't caught earlier because every previous attempt at a
-- real cloud session failed even before reaching a players read (anonymous
-- sign-in disabled, then an email rate limit) — REQ-003's host sign-in was
-- the first path to actually get this far.
--
-- Fix, mirroring this schema's existing SECURITY DEFINER pattern
-- (03_functions.sql's create_table/join_table): a helper function that
-- reads players as its owner (postgres, which bypasses RLS on tables it
-- owns unless FORCE ROW LEVEL SECURITY is set, which this schema never
-- does) instead of as the calling role, so the inner read never
-- re-triggers the policy being evaluated.
create or replace function my_table_ids() returns setof uuid as $$
  select table_id from players where auth_user_id = auth.uid();
$$ language sql security definer stable;

drop policy if exists "members can read the roster of their table" on players;
create policy "members can read the roster of their table"
  on players for select
  using (table_id in (select my_table_ids()));
