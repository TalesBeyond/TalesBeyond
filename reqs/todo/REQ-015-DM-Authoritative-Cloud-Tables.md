# REQ-015 — DM-Authoritative Cloud Tables

| Field | Value |
| ----- | ----- |
| ID | REQ-015 |
| Title | DM-Authoritative Cloud Tables |
| SOLVE | — |
| Status | Todo |
| Phase | Infrastructure |
| Tier | Core |
| Area | Live sync / persistence / Realtime security / cloud mode |
| Author | Blaxine |
| Created | 2026-10-14 |
| Last Updated | 2026-10-14 |

## Short Description

On a cloud table the DM's browser becomes the live authority, as it already is on a Guest table. The DM's browser reads the table from Postgres once when it opens it. Every change reaches the players over Realtime Broadcast, and a player's own changes go to the DM's browser as Intents that it validates. Game state reaches Postgres only through a save: one atomic RPC carrying everything changed since the last save, run by hand, by autosave (30 s after the last change, at least every 2 minutes) and on the way out. Between saves the DM's browser keeps a crash copy that it recovers on its own. Seats, invite codes, terms, reports, custom assets and the open/closed switch still write straight to the database.

Alongside the sync change:
- Cloud channels become private and split by topic, so only the DM's browser can send state and each seat can only speak for itself.
- Players lose direct write access to game tables.
- Opening the table on a second DM device hands authority to the newest one.
- Bulletin boards, portals and covers are saved like every other token.

## Constraints

- **Broadcast delivers at most once and never replays.** A message sent while a subscriber is disconnected, or dropped in transit, is gone. Nothing in Supabase tells the receiver it missed one.
- **Broadcast caps each message's size.** The cap is 256 KB on the Free plan (the comment at `src/lib/imageExchange.js:12`). Guest snapshots are sent whole today (`sendStateSnapshot`, `src/lib/guestRealtime.js:111`), and so are join acks (`:105`).
- **Realtime Authorization is checked when a client joins a channel, per topic, not per message.** It needs `config: { private: true }` on the channel, the user's access token on the Realtime socket (`supabase.realtime.setAuth`), and RLS policies on `realtime.messages` using `realtime.topic()`. A guest Intent's `senderId` is whatever the sender claims (`sendIntent`, `guestRealtime.js:102`).
- **Guest channels (`guest:<code>`) must stay public.** A guest DM has no Supabase session and no `tables` row (REQ-013 Constraints). The project-wide "private channels only" Realtime setting therefore cannot be switched on.
- **Order on reload is `created_at` order.** That holds for `entities`, `layers`, `islands`, `drawings` and `fog_chunks` (`fetchTableSnapshot`, `src/lib/remoteApi.js:166`; `20250101000014_entity_ordering_and_player_leave.sql`). Rows inserted in one transaction all get the same `now()`.
- **DM-only fields live in a host-only table.** `dmNotes`, `droppables` and `mobSheet` are in `entity_dm_data` (`20250101000015_entity_dm_data_privacy.sql`), split from the rest by `DM_DATA_KEYS` (`remoteApi.js:35`).
- **The 50 MB audio quota is a trigger on `audio_tracks` insert** (`20250101000041_audio_quota.sql`). The file itself is uploaded to Storage first (`uploadAudio`, `src/lib/storageUpload.js:77`).
- **Deleting an entity, island or layer also deletes its audio track** (`delete_audio_for_target`).
- **Pictures are never stored in Supabase** (`src/lib/storedImages.js` header, `20250101000055_no_stored_images.sql`). Any browser that holds a picture's bytes answers another browser's `img_want` (`imageExchange.js`), and players answer each other.
- **Players are sent away 3 minutes 5 seconds after the DM's Presence entry disappears** (`HOST_ABSENCE_GRACE_MS` + `HOST_ABSENCE_END_MS`, `src/components/GameView.jsx:172-176`; `handleHostPresenceChange` `:599`).
- **`20250101000072_bulletin_boards.sql` is written but "NOT IN USE YET".** It adds `bulletin` to `entities_kind_check`; its comment says applying it changes nothing the app relies on. `portal` and `cover` are in no kind check, and boards, portals and covers have no columns for their own fields.
- **The current entity write trigger is the one in `20250101000069_fogged_tokens.sql`.** `end_encounter_turn` is in `20250101000049_encounter.sql` and lets the acting hero's owner end a turn. The highest migration is `…072`.
- **The repo has no test runner** (`package.json` has no test script). Verification is the Smoke Test.

## Architectural decisions

**Authority**
- On a cloud table, the DM's browser that holds the table is the **Authority**. It is the only client that applies actions to shared state. Cloud players run the same engine as guest players (Intents in, `state_change` and snapshots out), with the same broadcast filter (`toGuestBroadcastAction`) and snapshot filter (`toGuestSnapshot`). Local tables keep their own engine, and Guest tables keep theirs except where shared code moves.

**Loading the table**
- The Authority reads the table from Postgres once, when it opens it (`fetchTableSnapshot` plus `tables.saved_version`).
- A player's browser reads no game state from Postgres. On every channel connect it asks the Authority for a snapshot, and it shows "Waiting for the DM" until one arrives. Join and resume still go through `join_table` and the `players` row.

**Channels**
- Every cloud channel is private. There are three topics per table:
  - `table:<tableId>:dm` — the **DM channel**. Every seated member receives; only the host sends. It carries `state_change`, snapshot parts, and the Authority hand-off messages. The host's devices track Presence on it.
  - `table:<tableId>:seat:<playerId>` — the **Seat channel**. Only the user whose `players.auth_user_id` owns that seat sends; only the host receives. It carries `intent` and `state_request`. The sender is the topic's seat. No `senderId` in a payload is read.
  - `table:<tableId>` — the **Table channel**. Every seated member sends and receives. It carries only `roll`, `area`, `hero` and the image exchange (`img_want`/`img_chunk`).
- Guest channels are unchanged.

**Delivery**
- Every `state_change` on the DM channel carries an `epoch` (the Authority's start time) and a `seq` that rises by one per message.
- A player who sees a gap in `seq`, or a new `epoch`, sends `state_request`.
- The Authority answers with a snapshot stamped with its current `epoch`/`seq`. The snapshot travels as numbered parts of at most 96 KB of JSON each, sent at least 150 ms apart.
- After its own channel reconnects, the Authority sends a snapshot to everyone.

**Saving**
- **Save RPC:** `save_table_state(p_table_id uuid, p_base_version bigint, p_changes jsonb) returns jsonb`. It is `security definer`.
  - It refuses a caller who is not the table's host.
  - It refuses with a distinct error when `p_base_version` is not the table's `saved_version`.
  - It applies every upsert and delete in `p_changes` in one transaction, gives inserted rows `created_at` in payload order, sets `saved_version = saved_version + 1` and `saved_at = now()`, and returns `{ version, rejectedAudio }`.
  - Audio-track rows are applied last, each inside its own savepoint. A rejected one is skipped and listed in `rejectedAudio`.
- **Schema:** `tables.saved_version bigint not null default 0` and `tables.saved_at timestamptz`.
- **What a save carries:** the difference between the Authority's state and its **Saved baseline** (the state as last read from or written to Postgres). That covers rows of `layers`, `islands`, `entities`, `entity_dm_data`, `drawings`, `fog_chunks` and `audio_tracks`; `players.current_layer_id`; and `tables.game_clock`, `day_night_override`, `encounter` and `audio_playback`. A save with no difference sends nothing.
- **Written straight to the database, outside the save:** create table, `join_table`, leave, kick, delete table, regenerate invite code, `tables.is_open`, terms acceptance, reports, `custom_assets`, and audio files (to Storage). The Authority announces each of these over the DM channel as the matching reducer action.
- **When a save runs:**
  - Configurations → Save.
  - 30 s after the last change.
  - At least every 2 minutes while changes keep coming.
  - On Leave (awaited).
  - When the tab becomes hidden.
  - When handing over to another DM device.
  - A failed save is retried on the next trigger, and the status shows it.

**Crash guard**
- The Authority keeps an **Unsaved copy** of the table in IndexedDB. It is written debounced on every change and holds `{ tableId, baseVersion, state, savedBaseline }`.
- On open, if this browser's Unsaved copy has a `baseVersion` equal to the database's `saved_version` and differs from its baseline, the copy is loaded instead of the fetched state and saved at once. Otherwise the copy is dropped.

**Two DM devices**
- Each host device tracks Presence on the DM channel with `{ isHost: true, deviceId, since }`. The device with the latest `since` is the Authority.
- A device that sees a newer host entry saves, sends `released` with its new `saved_version`, and turns read-only. The new device waits up to 5 s for `released`, then reads the table again when the version has moved.
- A device whose save is refused as stale turns read-only the same way.

**Change data capture**
- Only the Authority subscribes to `postgres_changes`, on `players` only (filtered by `table_id`).
- Every other table leaves the `supabase_realtime` publication.

**Grants**
- Non-hosts may not insert, update or delete `entities`, `entity_dm_data`, `layers`, `islands`, `drawings` or `fog_chunks`, or update `tables`.
- `end_encounter_turn` refuses non-hosts.
- Players keep reading what RLS lets them read today, deleting their own seat, and the seat RPCs.

**Boards, portals and covers**
- They are `entities` rows of kind `bulletin`, `portal` and `cover`.
- Fields only they use (`bulletins`, `linkId`, `coverLevel` and the cover template) go in one `entities.extra jsonb` column, read and written by the entity mappers.

**Naming**
- New UI text says "Saved", "Unsaved changes", "Saving…", "Waiting for the DM", "Running on another device" and "Take over here".
- New glossary terms are Authority, DM channel, Seat channel, Table channel, Save (cloud), Saved baseline, Saved version, Unsaved copy and Takeover.

## UI / UX Notes

- **Save status, cloud DM.** Where the 15:00 autosave countdown is today (Toolbar's Saved/countdown stack, `TableHud`'s `strip-saved`, the phone DM menu's "autosaves in"), a cloud DM sees one of these: "Saved just now" / "Saved 3 min ago", "Unsaved changes", "Saving…", or "Save failed — retrying". The tooltip says the table saves itself 30 s after the last change. Local and guest tables keep the countdown.
- **Configurations → Save** on a cloud table runs a save and shows "Saving…" until it finishes.
- **Waiting for the DM.** A player whose snapshot hasn't arrived sees the map area covered by a quiet "Waiting for the DM…" panel. The existing host-absence banner and its 3-minute countdown apply unchanged.
- **Recovered.** After the crash guard loads an Unsaved copy, the DM sees one log line: "Recovered unsaved changes from this browser".
- **Running on another device.** A DM device that lost authority shows a full-screen notice: "This table is running on another device", with a "Take over here" button and Leave. Nothing behind it can be edited.
- **Audio over quota** is refused before upload with the message `MusicModal` shows today. An audio row the save rejects shows "Could not save the sound <name> — it was removed" and drops the track.

## Acceptance Criteria

- [ ] **AC1 — Live without database writes.** On a cloud table, the DM's and players' changes to game state reach every seat within about a second, and no row of a game table changes until a save runs.
- [ ] **AC2 — Player changes are Intents.** A player's move, own-hero edit, chest toggle, loot take, monster damage, door or portal layer change, and end of turn are applied only once the DM's browser accepts them, with the same rules as `canMoveEntity`/`canPlayerUpdateEntity`/`applyValidatedIntent`. A refused one changes nothing on any screen.
- [ ] **AC3 — One read at the start.** The DM's browser reads game state from Postgres only when it opens the table. Players' browsers never read game state from Postgres.
- [ ] **AC4 — Waiting for the DM.** A player who opens or reloads a cloud table while the DM's browser is away sees "Waiting for the DM" and gets the table as soon as the DM arrives. The host-absence end still applies.
- [ ] **AC5 — Atomic diff save.** One save writes every change since the last save in one transaction and raises `saved_version` by one. A save with no changes writes nothing. After a reload the stacking order of tokens, drawings, fog chunks, layers and islands is what it was.
- [ ] **AC6 — The whole table survives.** After a save and a reload of the DM's browser, these are as they were: layers, islands, island groups, every token kind with its DM-only data, drawings, fog chunks, clock, day/night override, encounter, audio playback and each player's current layer.
- [ ] **AC7 — Direct writes stay direct.** Creating, joining, leaving, kicking and deleting a table, regenerating the code, opening/closing the table, accepting terms, reporting, and adding/removing custom assets reach the database at once and every seat live.
- [ ] **AC8 — Audio quota at upload.** An audio file that would take the table over 50 MB, counting unsaved tracks, is refused before upload. An audio row rejected at save time doesn't stop the rest of the save, and the DM is told.
- [ ] **AC9 — Autosave and status.** A cloud table saves itself 30 s after the last change, at least every 2 minutes during continuous play, on Leave and when the DM's tab is hidden. The DM sees the save status in place of the countdown, and a failed save retries and says so.
- [ ] **AC10 — Crash recovery.** The DM's browser is killed with unsaved changes. When the DM opens the table again in that browser, the changes are back, saved, and a log line says so. A copy older than the database's saved version is discarded.
- [ ] **AC11 — Newest DM device takes over.** Opening the table on a second DM device makes it the Authority, with no change lost when the first device is alive. The first shows "Running on another device" with "Take over here". A stale device's save is refused.
- [ ] **AC12 — Converges after loss.** A player who misses DM messages (their own drop, the DM's drop, or a lost message) ends up holding the DM's state again without reloading. A table with 300 tokens and 50 drawings reaches a joining player intact.
- [ ] **AC13 — Private, split channels.** A signed-in user not seated at a table can't join any of its topics. A player can't send on the DM channel or on another seat's channel. Rolls, areas of effect, hero offers and pictures still pass between all seats.
- [ ] **AC14 — Players can't write game tables.** A player's direct insert, update or delete on `entities`, `entity_dm_data`, `layers`, `islands`, `drawings` or `fog_chunks`, update on `tables`, or call to `end_encounter_turn` is refused.
- [ ] **AC15 — Privacy holds.** Hidden, fogged and unrevealed tokens, ambushes, and DM-only fields never travel to players on any channel, in a change or a snapshot.
- [ ] **AC16 — Boards, portals and covers are saved.** They survive a save and a reload on another device. Any held in a DM's browser from before this change are saved the first time that browser opens the table.
- [ ] **AC17 — Guest and local unchanged.** Guest and local tables behave exactly as before.
- [ ] **AC18 — Publication trimmed.** `players` is the only table in `supabase_realtime`.

## Technical Notes

**Cloud sync today (to be replaced)**

- `src/lib/realtime.js` — `subscribeToTable` (`:42`) opens one public channel `table:${tableId}` (`:43`).
  - On it: `postgres_changes` for entities, entity_dm_data, players, layers, islands, tables, custom_assets, audio_tracks, drawings, fog_chunks and invite_codes.
  - Broadcasts `roll`/`area`/`hero`/`boards`/`entity`/`conceal`, attached at `:45-66`.
  - Host Presence (`:68`, `track` at `:223`) and image exchange (`:66`).
  - Send helpers at `:232-237`.
- `src/lib/fastSync.js` — `createEntityGuard`/`createEntityOutbox`: previews ahead of the database with a 10 s confirm window. Used in `GameView.jsx` at `:931`, `:1011`, `:1092-1093`, `:1197`.
- `src/lib/boardSync.js` — `OFF_DATABASE_KINDS` (`bulletin`, `portal`, `cover`), `boardToWire`/`boardFromWire`, `boardsIn`, `withBoardsKept`.
  - GameView's board announce and receive (`:1297-1360`) and `saveTableBoards` (`:1354`).
  - `App.jsx` `withHostBoards` (`:18`).
- Resync after a drop: `runResync` (`GameView.jsx:934-958`, `fetchTableSnapshot` then `HYDRATE` via `withBoardsKept`). Status handling is at `:960-990`, with `RECONNECT_GRACE_MS`/`RESYNC_BACKOFF_MS` at `:162-163`.
- `remoteApi.js` `hideTrapRemote` (`:475-483`) deletes and re-inserts the row. That, and the `conceal` broadcast in `updateEntity` (`GameView.jsx:2238-2246`), exist only because `postgres_changes` sends nothing when a row stops being readable. Both retire with player CDC.

**The engine to reuse (Guest tables)**

- `GameView.jsx`:
  - `toGuestBroadcastAction` (`:388`), `withoutDmOnlyKeys`/`DM_ONLY_KEYS` (`:368-375`), `toGuestSnapshot` (`:421`).
  - The guest effect (`:1576-1690`): `applyAndBroadcast`, `applyValidatedIntent` (MOVE_ENTITY, UPDATE_ENTITY, PATCH_PLAYER, REMOVE_PLAYER, END_TURN), `handlePlayerJoin`, `handleStateRequest`, and the player's `state_request` on `SUBSCRIBED`.
  - `broadcastGuestChange` (`:1701`).
  - Host Presence handling (`handleHostPresenceChange`, `:599`), which also re-asks for state when the host appears.
- The engine's roles are spelled `isGuest && !isGuestHost` (player) and `isGuestHost` (Authority) in `moveEntity` (`:2150`), `updateEntity` (`:2190`) and every other mutation. Cloud joins them as `isRemote && !isHost` / `isRemote && isHost`. Flags are defined at `:530-541`.
- `src/lib/guestRealtime.js` — message vocabulary and send helpers (`:51-125`). `requestGuestJoin` (`:131`) is guest-only; cloud join stays `join_table`.

**Write paths that become state-only on the Authority**

- About 41 `*Remote(` call sites in `GameView.jsx`. Each is the `if (isRemote) …Remote(…)` branch after a `dispatch`.
  - **Stay:** `setTableOpenRemote` (`toggleOpen`, `:3626`), `regenerateInviteCodeRemote`, `removePlayerRemote`, `addCustomAssetRemote`/`removeCustomAssetRemote`, `reportTableRemote`, `acceptTermsRemote` and `deleteTableRemote`.
  - **Go:** everything for layers, islands, entities, drawings, fog chunks, clock, day/night, encounter (`endEncounterTurnRemote` `:2426`), audio playback and tracks, and `setPlayerCurrentLayerRemote` (`:3501`).
- Mappers that already turn client shapes into rows are in `src/lib/mappers.js`: `mapClientEntityToDb` (`:132`), `mapClientEntityPatchToDb` (`:227`), `mapClientEntityDmDataPatchToDb` (`:280`), `mapClientLayerPatchToDb` (`:24`), `mapClientIslandPatchToDb` (`:54`), `drawingToDb` (`:331`), `fogChunkToDb` (`:357`) and `audioTrackToDb` (`:371`). Layer and island inserts add `id`/`table_id`/`layer_id`/`is_base` (`remoteApi.js` `addLayerRemote` `:386`, `addIslandRemote` `:406`).
- `saveNow` (`GameView.jsx:3633`) only relabels on cloud today. The autosave interval is at `:3659-3672`, and `AUTOSAVE_INTERVAL_SECONDS` at `:182`.

**Loading**

- `fetchTableSnapshot` (`remoteApi.js:166-319`) is the Authority's one read. `saved_version` is added to its `tables` query.
- Cloud entry points that call it:
  - `App.jsx` resume (`:62`).
  - `Landing.jsx` host resume (`:385`) and create (`:654`).
  - The join path.
- On the player branches, each becomes "enter with the seat, then wait for the DM's snapshot". `HYDRATE` is in `src/state/store.jsx:194`.
- The store's localStorage autosave runs only when `persistLocally` (`store.jsx:587-598`). The Unsaved copy is separate from it.
- IndexedDB precedent: `src/lib/imageCache.js` (`:27-37`).

**Database**

- Membership helpers `my_table_ids()` (`20250101000018_fix_players_rls_recursion.sql:22`) and `my_hosted_table_ids()` (`20250101000056_host_kick_player.sql:17`) back every new policy. `players.auth_user_id` is at `01_schema.sql:32`.
- Player write policies to rebuild host-only:
  - `entities` "members can attempt to update…" (`20250101000016_dm_only_edits.sql:28`).
  - `layers`/`islands` `for all` (`05_layers.sql:40`, `10_islands.sql:43`).
  - `drawings` (`52_drawings.sql:48`).
  - `tables` update (`02_policies.sql:22`).
- The player branches of `enforce_entity_write_permissions()` (latest in `…069_fogged_tokens.sql`) become dead. The function is rebuilt whole from that version.
- Publication: `20250101000050_realtime_publication.sql` adds tables. Later migrations add `drawings`/`fog_chunks`. The new migration removes all but `players`.
- Each migration is mirrored in `supabase/00_combined_all_migrations.sql` and listed in `supabase/README.md`. The next number is `20250101000073`.

**Supabase-js** is `2.115.0` (`package.json:17`), which supports private channels and `realtime.setAuth`.

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| P | Persistence (migrations, RPCs) |
| S | Service (sync engine, save, channels) |
| U | UX |
| D | Docs |

### Slice 1 — Tracer: tokens live through the DM, saved by Save

**Demoable when:** on a cloud table with two browsers, the DM drags a goblin and the player sees it move, while the `entities` row in the Supabase table editor is unchanged. The player drags their own hero and the DM's browser applies it. The DM presses Configurations → Save and the row changes. The DM reloads and the goblin is where it was saved. The player reloads and gets the table from the DM. Layers, drawings and everything else still write directly for now.
**Satisfies:** AC1 (tokens), AC2 (token Intents), AC5 (tokens), AC15, AC17

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S001 | P | Saved version + save RPC (tokens) | Migration: `tables.saved_version`, `tables.saved_at`. `save_table_state` per *Architectural decisions*, handling `entities` and `entity_dm_data` upserts and deletes, host check, stale-version error, `created_at` in payload order. Mirror into the combined file and README. | — | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql`, `supabase/README.md` |
|  | S002 | S | Saved baseline and token diff | Pure module: given the Saved baseline and the current state, the entity and DM-data upserts and deletes in RPC payload shape, built with the existing mappers and skipping `OFF_DATABASE_KINDS`. A client call for the RPC in `remoteApi.js`. `fetchTableSnapshot` returns `saved_version`. | S001 | `src/lib/remoteApi.js`, `src/lib/mappers.js`, new module under `src/lib/` |
|  | S003 | S | Cloud Authority engine (tokens) | On a cloud table the host's token mutations dispatch and send `state_change` (filtered by `toGuestBroadcastAction`) on the table's channel, with no per-action entity write. Players' token mutations become Intents, validated by the reused `applyValidatedIntent`. Players answer `state_request`/snapshot like guest players. Players stop applying `entities`/`entity_dm_data` `postgres_changes`. The entity guard and outbox are off for cloud. | S002 | `src/components/GameView.jsx`, `src/lib/realtime.js` |
|  | S004 | U | Save really saves | `saveNow` on a cloud table runs the save with the Saved baseline and `saved_version`, moves the baseline on success, and labels the result. | S003 | `src/components/GameView.jsx` |

### Slice 2 — Whole table through the save

**Demoable when:** the DM changes a layer, an island, an island group, drawings, fog, the clock, the day/night override and an encounter; a player walks through a door. The table editor shows none of it until Save. After Save and a DM reload everything is back. Players' browsers open no `postgres_changes` listener, and `pg_publication_tables` lists only `players`.
**Satisfies:** AC5, AC6, AC7, AC18 · AC2 (all Intents)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S005 | P | Save RPC: the rest of the table | Extend `save_table_state` to `layers`, `islands`, `drawings`, `fog_chunks`, `players.current_layer_id` and the `tables` game columns. Deletes are applied children first. Migration removing every table but `players` from `supabase_realtime`. | S001 | `supabase/migrations/`, combined file, README |
|  | S006 | S | Diff for the rest of the table | Extend the S002 module to every collection and column S005 accepts. | S002, S005 | the S002 module, `src/lib/mappers.js` |
|  | S007 | S | Authority for every action | Every game-state mutation on a cloud table goes through the Authority engine. Remove each game-state `*Remote` branch (layers, islands, groups, drawings, fog, clock, day/night, encounter, playback, current layer). Player door/portal layer changes and end of turn go as Intents. Keep the direct writes listed in *Architectural decisions*, each followed by its `state_change`. | S004, S006 | `src/components/GameView.jsx` |
|  | S008 | S | Channel and CDC cleanup | `subscribeToTable` keeps only the `players` listener, for the Authority only. It adds `ADD_PLAYER`/`REMOVE_PLAYER` with a `state_change`. Remove `fastSync.js` use, `conceal`, the `entity` and `boards` broadcasts, and `runResync`'s database read on cloud. Boards travel as ordinary entity changes and snapshots; `saveTableBoards` keeps them across reloads until Slice 10. | S007 | `src/lib/realtime.js`, `src/components/GameView.jsx`, `src/lib/fastSync.js`, `src/lib/boardSync.js`, `src/lib/remoteApi.js` |

### Slice 3 — Audio through the save

**Demoable when:** the DM attaches a track, plays it and reloads after Save; the track and its playback position are back. A file that would pass 50 MB is refused before any upload. A hand-forced oversize row at save time is dropped with a message while the rest of the save lands.
**Satisfies:** AC8 · AC6 (audio)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S009 | P | Audio in the save RPC + quota read | `save_table_state` applies `audio_tracks` rows last, each in a savepoint, filling `rejectedAudio`. A read-only `security definer` RPC returns a table's stored audio bytes for its host. | S005 | `supabase/migrations/`, combined file, README |
|  | S010 | S | Audio on the Authority | Attaching audio uploads the file, then only dispatches and sends; the row goes in the next save. Before upload, refuse when stored bytes plus unsaved tracks plus the file pass `AUDIO_TABLE_QUOTA_BYTES`. A rejected row from a save removes the track from state with the message in *UI / UX Notes*. | S009, S007 | `src/components/GameView.jsx`, `src/lib/storageUpload.js`, `src/lib/remoteApi.js` |

### Slice 4 — Reliable delivery

**Demoable when:**
- A player reloads with the DM away and sees "Waiting for the DM", then the table once the DM opens it.
- With the player's network cut for 20 s while the DM moves tokens, the player catches up on reconnect.
- The DM's own connection drops and recovers, and every player catches up.
- A 300-token, 50-drawing table reaches a new player.
- A dropped `state_change` (forced from the console) triggers a snapshot request.

**Satisfies:** AC3, AC4, AC12

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S011 | S | Sequence and epoch | The Authority stamps every `state_change` with `epoch`/`seq`. Snapshots carry them. A player who sees a gap or a new epoch sends `state_request`. After its own reconnect the Authority sends everyone a snapshot. | S008 | `src/components/GameView.jsx`, `src/lib/realtime.js` |
|  | S012 | S | Snapshot in parts | Snapshots split into numbered parts of at most 96 KB of JSON, at least 150 ms apart. Reassembled by id; an incomplete one is dropped after 20 s and asked for again. | S011 | `src/lib/realtime.js` |
|  | S013 | U | Players never read the database | Cloud player join, resume and reload enter with their seat only and wait for the snapshot behind "Waiting for the DM". Remove the player-side `fetchTableSnapshot` calls. | S012 | `src/App.jsx`, `src/components/Landing.jsx`, `src/components/GameView.jsx`, `src/styles.css` |

### Slice 5 — Autosave and save status

**Demoable when:**
- After one change the status reads "Unsaved changes", then "Saving…", then "Saved just now" about 30 s later.
- Continuous dragging still saves within 2 minutes.
- Leave and switching tabs save.
- With the network cut, the status shows "Save failed — retrying" and the save lands once it returns.

**Satisfies:** AC9

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S014 | S | Save scheduler | Cloud Authority only: idle 30 s, ceiling 2 min, Leave (awaited before leaving), `visibilitychange` to hidden. One save in flight at a time; changes made during a save wait for the next. Retry on the next trigger after a failure. Local and guest keep the 15-minute countdown. | S007 | `src/components/GameView.jsx` |
|  | S015 | U | Save status | Replace the cloud DM's countdown with the status from *UI / UX Notes* on desktop, the table HUD strip and phones. | S014 | `src/components/Toolbar.jsx`, `src/components/TableHud.jsx`, `src/components/PhoneHostScreens.jsx`, `src/components/GameView.jsx` |

### Slice 6 — Crash guard

**Demoable when:** the DM makes changes and kills the browser process before the autosave. On reopen the changes are back and saved, and the log says "Recovered unsaved changes from this browser". Saving from another device first, then reopening the first browser, discards its copy.
**Satisfies:** AC10

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S016 | S | Unsaved copy | Debounced write of `{ tableId, baseVersion, state, savedBaseline }` to IndexedDB on every change while the Authority holds unsaved changes; cleared after a save that leaves none. Tolerates IndexedDB being unavailable. | S014 | new module under `src/state/` or `src/lib/` |
|  | S017 | S | Recover on open | On every Authority open path, after the database read, apply the rule in *Architectural decisions*, save, and log the line. | S016 | `src/App.jsx`, `src/components/Landing.jsx`, `src/components/GameView.jsx` |

### Slice 7 — Two DM devices

**Demoable when:**
- The DM opens the table on a laptop, makes changes, and opens it on a phone. The phone has the changes and is in charge, and the laptop shows "Running on another device".
- "Take over here" on the laptop moves it back.
- With the laptop's network cut, the phone takes over after 5 s from the last save. The laptop's later save is refused and it turns read-only.

**Satisfies:** AC11

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S018 | S | Host device Presence and hand-off | Host Presence carries `deviceId`/`since`. The newest is the Authority. The older saves and sends `released`; the newer waits up to 5 s and re-reads if the version moved. The stale-version error turns a device read-only. Players treat any host entry as "DM present". | S014 | `src/components/GameView.jsx`, `src/lib/realtime.js` |
|  | S019 | U | Running on another device | The read-only notice with "Take over here" (re-tracks with a new `since`) and Leave, desktop and phone. | S018 | `src/components/GameView.jsx`, `src/styles.css` |

### Slice 8 — Private channels on three topics

**Demoable when:**
- From the console, a user seated at another table can't subscribe to this table's topics.
- A seated player's send on the DM channel and on another seat's channel is refused.
- The DM receives each player's Intents on their Seat channel.
- Rolls, areas, hero offers and pictures still reach everyone.

**Satisfies:** AC13

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S020 | P | `realtime.messages` policies | Migration: select and insert policies per topic shape as in *Architectural decisions*. Topics are parsed with `split_part(realtime.topic(), ':', n)` and compared as text against `my_table_ids()`/`my_hosted_table_ids()` and `players.auth_user_id`. Combined file and README. | — | `supabase/migrations/`, combined file, README |
|  | S021 | S | Three private channels | Cloud tables open the DM, Seat and Table channels with `private: true` after `setAuth`. Messages move per *Architectural decisions*; the image exchange attaches to the Table channel. The Authority joins every seat's channel and joins or leaves on `players` changes. `senderId` comes from the topic. | S020, S011 | `src/lib/realtime.js`, `src/lib/imageExchange.js`, `src/components/GameView.jsx` |

### Slice 9 — Players can't write game tables

**Demoable when:** from the player's console, an update to their own hero's row, an insert into `drawings` and a call to `end_encounter_turn` are each refused. Every player action in the app still works through Intents.
**Satisfies:** AC14

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S022 | P | Host-only game writes | Migration: rebuild the write policies listed in *Technical Notes* host-only. Rebuild `enforce_entity_write_permissions()` from `…069` without the player branches, and `end_encounter_turn` host-only. Combined file and README. | S007 | `supabase/migrations/`, combined file, README |

### Slice 10 — Boards, portals and covers saved; docs

**Demoable when:**
- The DM pins a bulletin, lays a portal pair and a cover, saves, and opens the table on another browser; all three are there.
- A browser holding boards from before this change opens the table and its boards are saved.
- Hidden boards stay off a player's network panel.

**Satisfies:** AC16

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S023 | P | Board kinds and `extra` | Migration superseding `…072`: kind check with `bulletin`, `portal` and `cover`, and `entities.extra jsonb`. Mark `…072` superseded in the README. Combined file. | S005 | `supabase/migrations/`, combined file, README |
|  | S024 | S | Boards are ordinary tokens | Mappers read and write the board fields through `extra`. The diff stops skipping `OFF_DATABASE_KINDS`. On the Authority's open, boards in `loadTableBoards` that the table lacks are added (as `withBoardsKept` does) and saved; then that key is cleared. Remove the remaining off-database branches and `saveTableBoards` for cloud. | S023, S006 | `src/lib/mappers.js`, `src/lib/boardSync.js`, `src/components/GameView.jsx`, `src/App.jsx`, `src/state/persistence.js` |
|  | S025 | D | Glossary and docs | Add the terms under *Naming* to `reqs/GLOSSARY.md`. Update Cloud mode, Resync, Bulletin board, Portal, Cover and Intent. In `APP_OVERVIEW.md`, rewrite cloud mode in §1, plus §6 (schema, Realtime) and the permissions section. Rewrite `REALTIME_ROADMAP.md` §0–§2 to the new model. Update `PITFALLS.md` #1/#5/#7 and `supabase/README.md`'s Realtime notes. | S013, S015, S017, S019, S021, S022, S024 | `reqs/GLOSSARY.md`, `APP_OVERVIEW.md`, `REALTIME_ROADMAP.md`, `PITFALLS.md`, `supabase/README.md` |

### Dependency graph

```
Slice 1   S001 → S002 → S003 → S004

Slice 2   S001 → S005 → S006 ← S002
                        S006 + S004 → S007 → S008

Slice 3   S005 → S009 ─┐
          S007 ────────┴→ S010

Slice 4   S008 → S011 → S012 → S013

Slice 5   S007 → S014 → S015
Slice 6   S014 → S016 → S017
Slice 7   S014 → S018 → S019

Slice 8   S020 ─┐
          S011 ─┴→ S021

Slice 9   S007 → S022

Slice 10  S005 → S023 ─┐
          S006 ────────┴→ S024

          S013, S015, S017, S019, S021, S022, S024 → S025
```

Slices 5, 6 and 7 can be built in either order once Slice 2 lands. Slices 8 and 9 can go in after Slice 4.

## Dependencies

| REQ ID | Title | Reason |
| ------ | ----- | ------ |
| REQ-008 | Guest DM Sessions | Its engine (Intents, broadcast filter, snapshots, host Presence) becomes the cloud engine. |
| REQ-001 | Connection Recovery | Its cloud resync from the database is replaced by snapshots from the DM. The grace period and the "Reconnecting…" scrim stay. |
| REQ-006 | Live Table Security Hardening | The new policies follow its RLS conventions and membership helpers. |
| REQ-014 | Fog of War | `fogged` privacy now rests on the broadcast filter for cloud players. The `conceal` path it added retires. |
| REQ-013 | R2 Media Storage | No functional dependency. Both change audio uploads and add migrations, so whichever lands second rebases its audio steps and takes the next migration number. |

Supersedes: `20250101000072_bulletin_boards.sql` (never applied by the app) is replaced by S023.

## Out of Scope

- Private channels or any sender checks for Guest tables.
- Cloud Import of a `.json` table.
- Cleaning up audio files uploaded to Storage whose rows were never saved.
- Revoking players' read access to game tables, or their update policy on their own `players` row.
- Moving custom assets or the open/closed switch into the save.
- Showing players a save status.
- Any change to local tables.
- Automated tests.

## Open Questions

- [ ] **Q1 — Public subscribers on a private topic.** Guest tables keep the project's public channels allowed. Can a client that joins `table:<id>:dm` with `private: false` receive what the DM sends on the private channel of the same name? Deferred until the start of Slice 8. Test it with two consoles before S021. If it can, the cloud topics get a prefix that guest codes can never produce, plus a server-side check.
- [ ] **Q2 — Snapshot size in practice.** Is 96 KB per part at 150 ms fast enough for a table the size of the busiest real one? Deferred until the Slice 4 smoke test. Measure the join time for the 300-token table.
- [x] **Q3 — Player load source resolved.** From the DM over the channel; players never read game state from Postgres. *(Blaxine)*
- [x] **Q4 — Channel trust resolved.** Private channels split into DM, Seat and Table topics. *(Blaxine)*
- [x] **Q5 — Save shape resolved.** A diff in one atomic RPC with a saved version. *(Blaxine)*
- [x] **Q6 — Autosave resolved.** 30 s idle, 2 min ceiling, Leave, tab hidden, hand-off. *(Blaxine)*
- [x] **Q7 — Crash guard resolved.** Auto-recover from an IndexedDB copy in the same browser. *(Blaxine)*
- [x] **Q8 — Two devices resolved.** The newest takes over. *(Blaxine)*
- [x] **Q9 — Direct writes resolved.** Custom assets and open/closed stay direct; audio rows go through the save with a quota check at upload. *(Blaxine)*
- [x] **Q10 — Grants and CDC resolved.** Player writes revoked; only the DM listens to `players`. *(Blaxine)*
- [x] **Q11 — Boards resolved.** Saved as `entities` rows with an `extra` column. *(Blaxine)*
- [x] **Q12 — Slices resolved.** Ten slices as listed. *(Blaxine)*

## Smoke Test

> Developer runs the app; the agent does not self-run.

Use `npm run dev:duo` on a cloud table: one DM browser and one player browser, with the Supabase table editor open.

1. The DM drags a goblin and edits its HP. The player sees both at once, and the `entities` row is unchanged. Configurations → Save: the row changes and `saved_version` rises by one. Save again with no change: nothing is written. *(AC1, AC5)*
2. As the player, move your hero, take loot, open a chest, damage a monster, walk through a door and end your turn: each works. With the DM's browser paused in devtools, the same actions do nothing until it resumes. *(AC2)*
3. Change a layer, an island, a group, drawings, fog, the clock, day/night and the encounter; add a token in fog and a hidden trap. Save, then reload the DM. Everything is back, in the same stacking order. In the player's network panel, no hidden or fogged token or DM note appears in any message. *(AC6, AC15)*
4. Kick a player, regenerate the code, close the table, add a custom asset: each shows in the table editor at once and on the player's screen. *(AC7)*
5. Attach audio until 50 MB: the next file is refused before uploading. Play a track, save, reload: the track and playback are back. *(AC8)*
6. Close the DM's tab and reload the player: "Waiting for the DM", then the table once the DM reopens. *(AC4, AC3)*
7. Cut the player's network for 20 s while the DM moves tokens; restore it: the player catches up. Do the same to the DM's network. Open a 300-token, 50-drawing table as a new player. *(AC12)*
8. Make one change and watch the status: Unsaved changes → Saving… → Saved just now, about 30 s later. Drag continuously for 3 minutes: at least one save lands. Switch tabs: it saves. Cut the network: "Save failed — retrying", then it saves. *(AC9)*
9. Make changes, then end the DM's browser process from the task manager. Reopen: the changes are back, with the "Recovered" line. *(AC10)*
10. Open the table as DM on a second browser: it takes over with the latest changes, and the first shows "Running on another device". Take over back. Cut the first one's network, take over on the second, restore: the first's save is refused. *(AC11)*
11. From the player's console: subscribing to another table's topics fails; sending on the DM channel and on another seat's channel fails; an update to `entities`, an insert into `drawings` and `end_encounter_turn` are refused. Rolls, areas, hero offers and new pictures still reach the DM. *(AC13, AC14)*
12. Pin a bulletin, lay a portal pair and a cover, save, open on a second browser: all there. In a browser that had boards from before this change, open the table: they are saved. *(AC16)*
13. Run `select tablename from pg_publication_tables where pubname = 'supabase_realtime'`: only `players`. *(AC18)*
14. Host a guest table and a local table and repeat steps 1–3 in the way each mode allows: nothing has changed. *(AC17)*

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| XL | 70–90 | Five migrations (the save RPC grows across three of them), a rewiring of every cloud write path in `GameView.jsx`, a new channel layout with server-side policies, and three persistence safety nets (autosave, crash guard, device hand-off). Slices 1–2 carry the risk: every mutation's cloud branch changes, and the save RPC has to keep order and DM-only data exactly. |

## Considered And Rejected

Nothing here is built. Each entry names the alternative, then why it lost.

- **Players load from the database, then catch up from the DM.** Two load paths. A player sees a stale board for a moment on every reload, and a stale read can briefly undo a move the DM already made.
- **Players load from the database only.** Everything since the last save disappears for a player who reloads mid-session. That's the silent drift REQ-001 removed.
- **One private channel with per-seat secrets in each Intent.** Any seated member could still send a fake `state_change` that every other player applies verbatim.
- **One private channel, trust seated members.** Weaker than today, where Postgres checks every player write against `enforce_entity_write_permissions()`.
- **Relaying rolls, areas, hero offers and pictures through the DM.** Every roll takes two hops, and only the DM's browser could answer `img_want`, so players stop filling in pictures for each other.
- **Full-state replace on each save.** Every save resends the whole table. Delete and re-insert resets `created_at` order and cascades away audio rows (`delete_audio_for_target`).
- **Replaying the existing `*Remote()` calls on save.** Not atomic: a save cut off partway leaves the table half-written.
- **Keeping the 15-minute autosave.** Up to 15 minutes would hang on the crash guard alone, which only exists in one browser.
- **Saving on every change, debounced 2–5 s.** Write volume near today's, which removes the point of the change.
- **Asking the DM to recover or discard.** A prompt at the moment the DM is trying to get back into play, for an answer that is nearly always "recover".
- **No local copy.** A crash loses up to 2 minutes of play.
- **First DM device holds authority; the second asks.** Moving to the phone mid-session would need a tap on a device that may already be in a bag.
- **A second DM device as a read-only viewer.** Switching devices waits out the first one's Presence timeout (~30 s).
- **Audio rows written at upload, outside the save.** A track attached and removed before a save would leave a row for the save to delete, and audio would be the only table content with two write paths.
- **An over-quota audio row failing the whole save.** Autosave would fail again on every trigger, with maps and tokens unsaved, until the DM removes a track.
- **Leaving players' write grants in place.** A crafted client could write a row the DM's diff never touches, and it would come back on the next load.
- **No `postgres_changes` at all; the joiner announces itself.** A hello sent before the Authority listens is lost, and leave and kick need the same handshake.
- **Keeping every `postgres_changes` listener as a safety net.** Each save echoes back to every client as a burst of row events that the engine has to ignore.
- **Boards as a host-only jsonb blob per table.** It keeps boards a special case with their own load, merge and ordering. As rows, the entities read policy already hides a hidden board.
- **Trusting Broadcast delivery without sequence numbers.** Broadcast is at most once. A lost `state_change` with no disconnect leaves a player wrong until the next snapshot, which may never come.
- **A tracer that switches the live path but keeps per-action writes.** It proves the channel half and leaves the save RPC, the riskiest part, for later.

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-10-14 | Blaxine | Initial plan, from a `/create-req` interview covering player load source, channel trust, save shape, autosave, crash guard, two DM devices, direct writes, audio quota, grants, CDC, board storage and slices. Deep-dive into `GameView.jsx` (cloud and guest engines, write paths, save), `realtime.js`, `guestRealtime.js`, `fastSync.js`, `boardSync.js`, `imageExchange.js`, `remoteApi.js`, `mappers.js`, `store.jsx`, `persistence.js`, `App.jsx`, `Landing.jsx`, and the schema, privacy, dm-only-edits, encounter, audio-quota, publication, kick and bulletin-board migrations. |
