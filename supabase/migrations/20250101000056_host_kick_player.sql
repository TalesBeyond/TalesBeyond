-- Hearthbound — 56_host_kick_player.sql
-- The DM can kick a player: delete someone else's seat at a table they
-- host, freeing its slot. Until now the only DELETE policy on players was
-- the self-only one from 14 (leaving), so a host's delete of another row
-- matched nothing and was silently ignored.
--
-- The policy goes through a SECURITY DEFINER helper, like my_table_ids()
-- in 18: a policy on players that subqueries players directly recurses
-- (PITFALLS.md #13). It is additive: Postgres ORs permissive policies, so
-- a player can still delete their own seat. The host's own row is left
-- out, since a table needs its host's seat to stay readable to them.
--
-- A kicked player's heroes are un-assigned, not deleted
-- (entities.owner_id is `on delete set null`). Kicking is not a ban:
-- join_table seats them again if they still have the invitation code.

create or replace function my_hosted_table_ids() returns setof uuid as $$
  select table_id from players where auth_user_id = auth.uid() and is_host;
$$ language sql security definer stable;

drop policy if exists "the host can remove any seat at their table" on players;
create policy "the host can remove any seat at their table"
  on players for delete
  using (not is_host and table_id in (select my_hosted_table_ids()));
