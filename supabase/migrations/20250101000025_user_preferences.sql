-- Hearthbound — 25_user_preferences.sql
-- Server-side home for per-user app preferences — one jsonb blob per user
-- rather than a dedicated column per setting, since the set of preferences
-- (palette today, preferred islands, whatever else later) is expected to
-- keep growing and none of it needs to be queried/joined on individually.
-- Keyed off auth.users, not `players`: a preference is per-person, tied to
-- the browser's auth identity (anonymous or host, see auth.js) — not a
-- per-table-seat setting the way `players` rows are.
--
-- Example row's `preferences`:
--   { "palette": 2, "preferredIslands": ["a", "b", "c"] }
--
-- `palette` is a plain integer inside the blob (no db-level enum type),
-- numbered to match the Palettes menu (src/state/theme.js):
--   1 = classic, 2 = dark, 3 = eddie, 4 = syfy
create table if not exists user_preferences (
  auth_user_id  uuid primary key references auth.users(id) on delete cascade,
  preferences   jsonb not null default '{}',
  updated_at    timestamptz not null default now(),
  constraint user_preferences_is_object check (jsonb_typeof(preferences) = 'object'),
  constraint user_preferences_palette_range check (
    not (preferences ? 'palette') or (preferences->>'palette')::int between 1 and 4
  )
);

drop trigger if exists trg_user_preferences_touch on user_preferences;
create trigger trg_user_preferences_touch before update on user_preferences
  for each row execute function touch_updated_at();

alter table user_preferences enable row level security;

create policy "a user can read their own preferences"
  on user_preferences for select
  using (auth_user_id = auth.uid());

create policy "a user can upsert their own preferences"
  on user_preferences for insert
  with check (auth_user_id = auth.uid());

create policy "a user can update their own preferences"
  on user_preferences for update
  using (auth_user_id = auth.uid());
