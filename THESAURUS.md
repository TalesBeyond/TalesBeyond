# Hearthbound — Thesaurus

The project's ubiquitous-language reference: the terms the code, the docs
(`README.md`, `APP_OVERVIEW.md`, `SPEC.md`), and requirement plans under
`requirements/` all use for the same concepts. Use these terms exactly
when writing a REQ plan or touching the code they describe. A term a new
feature introduces gets added here as an implementation step in that
feature's own plan — this seed only records terms that already exist.

| Term | Definition | Notes |
| ---- | ---------- | ----- |
| Base island | The permanent, undeletable first island in an island's `islandOrder` — where new players land on that layer. | `src/state/store.jsx` |
| Base layer | The permanent, undeletable first layer in `layerOrder[0]` — every table has one. | `src/state/store.jsx` |
| Bag | A hero's inventory: freeform gear/other-items lists plus bronze/silver/gold currency. | `src/components/RightPanel.jsx` |
| Chest | A lootable container entity kind with a size tier, an opened/closed state, and item contents. | `src/data/chests.js`, `supabase/11_chests.sql` |
| Cloud mode | The mode the app runs in when `VITE_SUPABASE_PROJECT_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` are set — actions go over the network through Supabase, live-synced via Realtime. | `src/lib/supabaseClient.js` |
| Compendium | A searchable catalog of weapons or items a host can buy/give directly into a hero's Bag. | `src/data/weapons.js`, `src/data/items.js` |
| Conditions | The fixed catalog of visual/informational status badges (Poisoned, Stunned, Prone, Shocked, Bleeding) toggleable on hero and mob tokens. | `src/data/conditions.js` |
| Connection grace period | The 1.5s window after a realtime channel drops during which the app stays silent, in case it's just a blip — only a drop that outlasts it surfaces the "Reconnecting…" scrim. | `src/components/GameView.jsx` |
| DM code | A guest table's private `session.hostKey`, shown only to its DM — required, alongside its exported file, to resume as host (checked as a hash, never stored in the file itself). | `src/state/store.jsx`, `src/components/Landing.jsx` (`GuestResumeForm`) |
| DM notes | Private, host-only free text on a hero or mob entity, never visible to other players. | `supabase/15_entity_dm_data_privacy.sql` |
| Door | A bidirectional portal entity kind linking two layers, with independently placed positions on each side. | `supabase/05_layers.sql`, `supabase/07_door_positions.sql` |
| Droppables | A mob's potential loot list, each item with a rollable drop-chance percentage. | `src/data/droppables.js`, `src/components/DroppablesEditor.jsx` |
| Entity | Any placeable thing on the map — a hero, mob, door, or chest — keyed by id, carrying a `layerId`/`islandId` and kind-specific fields. | `src/state/store.jsx` |
| Guest channel | The Supabase Realtime Broadcast channel (`guest:<code>`) a guest table's live sync runs on in place of `postgres_changes` — carries `state_change`, `intent`, `player_join`, and `state_request`/`state_snapshot` messages. | `src/lib/guestRealtime.js` |
| Guest table | A table its DM opened with no account and no row in any Supabase table — live sync runs over a Guest channel with the DM's own browser as the sole source of truth; never written to Postgres. | `src/components/Landing.jsx` (`GuestHostForm`), `src/components/GameView.jsx` |
| Host | The one player per table with `isHost: true` — the DM, who can edit everything. | `src/state/store.jsx` |
| Host account | A host's permanent email/password Supabase identity (cloud mode) — lets them sign in from any device and see/resume every table they've created, unlike the anonymous session it replaced. | `src/lib/auth.js` (`signUpHost`/`signInHost`), `src/components/Landing.jsx` |
| Host key | A second, private code shown only to the host, usable in local mode to re-seat someone as host of a table saved in that browser. | `src/components/Landing.jsx` |
| Hero | An entity kind representing a player character, carrying a full 5e character sheet and an `ownerId`. | `supabase/08_character_sheets.sql` |
| Intent | A guest player's proposed action (e.g. a token move), sent over the Guest channel for the DM to validate and apply rather than dispatched locally — only the DM's browser is authoritative. | `src/lib/guestRealtime.js`, `src/components/GameView.jsx` |
| Invite code | The short code players use to join a table; can be regenerated (invalidating the old one) by the host. | `supabase/03_functions.sql` |
| Island | A freeform grid within a layer — its own size, cell size, and background image, positioned relative to other islands. Always its own independent rectangle — never combined with another island's shape. | `supabase/10_islands.sql` |
| Island group | A set of 2+ islands on the same layer bundled by the host via "Merge Islands" — moved together via an invisible bounding box and shown under one shared title instead of each member's own label; each island keeps its own grid, background, and size. | `layer.islandGroups`, `src/components/MapBoard.jsx` |
| Island shell | An island's grid + background only — no id, position, or entities — the shape downloaded/uploaded when exporting or importing a single island (distinct from a whole table snapshot). | `src/state/persistence.js` (`downloadIslandAsFile`/`importIsland`) |
| Layer | A separate map/level within a table, holding any number of islands and linked to other layers by doors. | `supabase/05_layers.sql` |
| Local demo mode | The mode the app runs in by default — the whole table lives in `localStorage`, no server involved. | `src/state/persistence.js` |
| Merge | The host action (via the "Merge Islands" button) of selecting islands on the map to bundle into one island group — see Island group. | `src/components/GameView.jsx` |
| Mob | An entity kind representing a monster/NPC, with armor class, conditions, and droppables. | `supabase/09_armor_class.sql` |
| Player | A seat at a table (`Player { id, name, color, isHost, connected, joinedAt, currentLayerId }`); up to 9 non-host players plus 1 host per table. | `src/state/store.jsx` |
| Resync | Re-fetching a full table snapshot and re-hydrating state after a dropped realtime connection recovers, so nothing that happened while disconnected is missed. | `src/components/GameView.jsx` (reuses `fetchTableSnapshot` + `HYDRATE`) |
| Table | The top-level shared object a host creates and players join — one map/session, tracked by `session.tableId`/`session.code`. | `supabase/01_schema.sql` |
| Table snapshot | The full `{ session, layers, layerOrder, entities, entityOrder, players }` shape fetched to hydrate the reducer on join or resume. | `src/lib/remoteApi.js`'s `fetchTableSnapshot` |
