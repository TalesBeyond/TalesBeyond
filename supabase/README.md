# Hearthbound backend — Supabase setup

This folder implements SPEC.md §9, points 9.1–9.6: schema, RLS, auth
strategy, join/create RPCs, realtime, and storage — plus map layers, door
tokens (bidirectional, independently placed per side), hero/mob condition
states, full hero character sheets, mob armor class, freeform islands
(multiple independent grids per layer), lootable chest tokens, DM-private
notes on hero/mob tokens, a rollable loot list on mob tokens, and a
DM-only edit permission model. The sixteen migrations below live in
`supabase/migrations/` in Supabase CLI format, so they can be applied
either by linking this repo to a Supabase project via **GitHub
integration** (auto-deploys on push) or by hand in the SQL Editor.

## 1. Create a project

Create a free project at supabase.com. You'll need, from
**Project Settings → API**:
- **Project URL** (e.g. `https://xxxxxxxx.supabase.co`)
- **anon public key**

## 2. Apply the migrations

**Recommended — Supabase's GitHub integration:** in the Supabase
dashboard, go to **Project Settings → Integrations → GitHub**, connect
your GitHub account, and select this repo. Point it at the branch you
want to deploy from (typically `main`) with the Supabase directory set
to `supabase`. From then on, merging migration changes into that branch
runs `supabase db push` for you automatically, and PRs can get their own
preview branch/database. See
https://supabase.com/docs/guides/deployment/branching for details.

**Manual alternative — CLI:** `npx supabase login`, then
`npx supabase link --project-ref <your-project-ref>`, then
`npx supabase db push`.

**Manual alternative — SQL Editor:** open `00_combined_all_migrations.sql`
(generated from the numbered migrations below, in order) and paste its
entire contents into the Supabase dashboard's **SQL Editor** in one go,
then click Run. It's kept in sync manually, so regenerate it (or fall
back to running the files in `supabase/migrations/` individually, in
filename order) if that list ever changes.

The sixteen migrations, in order:

1. `..._schema.sql` — tables, columns, capacity trigger
2. `..._policies.sql` — Row Level Security so tables can only see their own data
3. `..._functions.sql` — `create_table`, `join_table`, `regenerate_invite_code`, `whoami_for_code`
4. `..._storage.sql` — image buckets + upload policies
5. `..._layers.sql` — multiple layers per table + door tokens (replaces the old single `maps` table)
6. `..._conditions.sql` — condition states (poisoned/stunned/prone/shocked/bleeding) on hero and mob tokens
7. `..._door_positions.sql` — independent per-side placement (`target_col`/`target_row`) for bidirectional doors
8. `..._character_sheets.sql` — full hero character sheets (abilities, saves/skills, attacks, equipment, currency, spellcasting) as one `jsonb` column
9. `..._armor_class.sql` — armor class on mob tokens, so a hero's rolled attacks have something to check against
10. `..._islands.sql` — freeform islands (multiple independent grids per layer, each with its own size/background/position), replacing the old one-grid-per-layer model
11. `..._chests.sql` — lootable chest tokens with a size-capped contents list (weapon/item-compendium picks or custom entries)
12. `..._dm_notes.sql` — a private free-text notes field on hero and mob tokens, for the DM only
13. `..._mob_droppables.sql` — a rollable loot list on mob tokens (chest-item-shaped entries plus a d20 drop chance), for the DM only
14. `..._entity_ordering_and_player_leave.sql` — a real `created_at` timestamp for reliable token stacking order, and a self-only DELETE policy on `players` so leaving a table actually frees the seat in cloud mode
15. `..._entity_dm_data_privacy.sql` — moves DM notes and mob droppables into their own host-only-readable `entity_dm_data` table, so that data is actually private (enforced by RLS + Realtime) rather than merely hidden in the UI
16. `..._dm_only_edits.sql` — the DM is the only one who can edit information; a player may only move their own hero, and open/close a chest, enforced by RLS + a field-level trigger (not just the UI)
17. `..._synced_table_audio.sql` — REQ-009 synced table audio: the `audio_tracks` table (members read, host writes), `tables.audio_playback`, the public-read `table-audio` bucket (host-only upload, 10 MB, MP3/WAV only) and realtime enablement for both
18. `..._audio_volume_loop.sql` — per-track synced base volume and loop flag
19. `..._audio_cleanup.sql` — triggers that delete a track's row when its layer, island or token is deleted (the Storage file is removed by the client)
20. `..._audio_quota.sql` — a database check rejecting more than 50 MB of audio per table

## 3. Enable anonymous sign-in

`supabase/config.toml` already sets `enable_anonymous_sign_ins = true`,
which the GitHub integration/CLI will push to your remote project's auth
config. If you set the project up by hand instead, flip it on yourself:
**Authentication → Providers → Anonymous sign-ins → Enable.** Hearthbound
never asks for an email or password — every browser gets a durable
anonymous identity on first visit (SPEC.md §9.3), which is what
`auth.uid()` refers to throughout the SQL above.

## 4. Configure the front end

Copy `.env.example` to `.env` in the project root and fill in the two
values from step 1:

```
VITE_SUPABASE_PROJECT_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Restart `npm run dev`. The app auto-detects these variables
(`src/lib/supabaseClient.js`) and switches from local-only Phase 1 mode
into cloud mode: hosting/joining calls `create_table` / `join_table`,
every token move/edit writes straight to Postgres, and a Realtime
subscription (`src/lib/realtime.js`) keeps every connected browser in
sync. Leave `.env` absent or empty to keep running in local-only mode —
nothing else about the app changes.

## What isn't wired up yet

- **Image uploads** currently still embed images as base64 data URLs in
  Phase 1 mode. In cloud mode, `src/lib/storageUpload.js` is implemented
  and ready (resizes client-side, uploads to the buckets above, returns a
  public URL) — hook it up in `TokenSidebar.jsx` / the map-background
  uploader by swapping `FileReader.readAsDataURL` for `uploadImage(...)`
  when `isSupabaseConfigured` is true.
- **Kicking a player** and the rest of SPEC.md §13's roadmap (beyond the
  DM-only edit permissions added in `16_dm_only_edits.sql`, which supersede
  §13's originally-proposed "lock hero tokens to their owner" with
  something stricter) are not part of these first six points and aren't
  implemented.
- **Detecting a closed tab.** Clicking Leave properly frees a player's seat
  in cloud mode (see 14_entity_ordering_and_player_leave.sql), but just
  closing the tab or losing connection does not — unlike local mode, which
  can synchronously write to localStorage from a `beforeunload`/`pagehide`
  handler, cloud mode would need a reliable server-side presence signal
  (e.g. Supabase Realtime Presence) to detect that, which isn't wired up.

## Default catalog (REQ-010)

The game content every table shares — weapons, items, monsters, songs and dice
images — lives in read-only `catalog_*` tables and public `catalog-*` storage
buckets. Everyone (including anonymous players and guest tables) can read it;
nothing in the app can write it. Only the **admin script** can, using the
project's service-role key, which bypasses RLS.

The app always starts from the data built into `src/data/`, and swaps in a
catalog list once Supabase returns rows for it (`src/lib/catalog.js`). With no
Supabase, or an empty or unreachable catalog table, nothing changes.

### Loading the catalog

1. Apply the migrations (`catalog_*` tables and the `catalog-images` bucket).
2. Put the service-role key in `.env` as `SUPABASE_SERVICE_ROLE_KEY` (Project
   Settings → API Keys → secret key). It must **not** be prefixed `VITE_`, or
   Vite would bundle it into the app.
3. Export each picture as one optimized WebP (about 256 px for items and
   monsters, under 1 MB) and drop it in `catalog-assets/<kind>/<slug>.webp`
   (git-ignored). `<slug>` is the entry's name in lower case with runs of other
   characters turned into `-`; a weapon's +1/+2 versions use the base weapon's
   file (`weapons/longsword.webp`).
4. Run `npm run catalog:seed`. Options: `-- --assets <dir>`, `-- --only weapons`,
   `-- --dry-run`. It is safe to run again: rows are upserted, files
   overwritten, and an entry with no local file keeps the picture it has.

| Table | Bucket | Path in bucket |
| ----- | ------ | -------------- |
| `catalog_weapons` | `catalog-images` | `weapons/<slug>.webp` |
