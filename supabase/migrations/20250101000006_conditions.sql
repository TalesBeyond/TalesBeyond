-- Hearthbound — 06_conditions.sql
-- Adds condition-state tracking to entities (hero and mob tokens only —
-- doors never carry conditions). Host-only editing is enforced client-side
-- today (see src/components/RightPanel.jsx); the existing "members can
-- write entities at their table" policy from 02_policies.sql already covers
-- reads/writes of this new column, so no RLS changes are needed here.

alter table entities add column if not exists conditions text[] not null default '{}';

-- Keep the stored values limited to the known catalog (src/data/conditions.js)
-- so a bad client write can't silently drift ahead of what the UI knows how
-- to render. Widen this list (and the client catalog) together if the set
-- of conditions grows.
alter table entities drop constraint if exists entities_conditions_check;
alter table entities add constraint entities_conditions_check check (
  conditions <@ array['poisoned','stunned','prone','shocked','bleeding']::text[]
);
