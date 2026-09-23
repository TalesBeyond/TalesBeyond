# REQ-009 — Synced Table Audio

| Field | Value |
| ----- | ----- |
| ID | REQ-009 |
| Title | Synced Table Audio |
| Status | Todo |
| Phase | Table atmosphere |
| Tier | Enhancement |
| Area | Audio / Storage / Realtime / cloud mode |
| Author | Blaxine |
| Created | 2026-09-23 |
| Last Updated | 2026-09-23 |

## Short Description

Lets the DM attach MP3 or WAV audio to a table and play it live for every connected player. A table has one **World music** track; each layer, island, and hero or mob token can carry one file of its own. Only one sound plays at a time across the whole table. The DM plays, pauses, and (via layer switching) auto-starts sounds; every client hears the same audio at the same position, including a player who joins or reconnects mid-song. A **Music** button opens a modal listing every file in the session with its volume controls: the DM sets a synced base volume per file, and each player sets their own local volume. Audio exists in cloud tables and guest tables only; guest audio is temporary and expires.

## Constraints

- **Audio cannot ride the existing image path.** Images are downscaled and embedded as data URLs in state (`src/utils/image.js`, `src/state/persistence.js`) so they fit `localStorage`. A 3–10 MB MP3 cannot; audio needs Storage, so local demo mode has no audio.
- **`tables.game_clock` is the only precedent for a synced timestamp anchor, and it has no clock-skew correction.** `src/utils/gameClock.js` derives time from `Date.now()` on each client against an anchor another client wrote. Audio position inherits that: two devices whose clocks differ by N seconds hear the same track N seconds apart.
- **Nothing in the repo's migrations adds a table to the `supabase_realtime` publication** (no `alter publication` anywhere under `supabase/`), yet `src/lib/realtime.js` streams changes from `entities`, `layers`, `custom_assets`, and others. How existing tables are enabled is outside source control; a new audio table will not stream until enabled the same way.
- **Deleting rows from `storage.objects` with SQL does not free the backing file.** Purging expired guest audio has to go through the Storage API, which needs a service-role caller. `supabase/functions/` does not exist yet, so a scheduled purge is new infrastructure.
- **A guest DM has no Supabase session and no `tables` row.** `ensureAnonymousSession()` (`src/lib/auth.js`) is only called from the join and resume paths (`src/App.jsx:32`, `src/components/Landing.jsx:807`), and the table-scoped storage policy (`supabase/migrations/20250101000004_storage.sql`) authorizes uploads only against a real `players` row. Guest uploads need their own bucket and policy, and a per-table quota cannot be enforced server-side for them. The bucket's own size limit and MIME allow-list are the only server-enforced bounds.
- **`src/state/persistence.js` is the only module allowed to touch `localStorage`** (`SPEC.md` §5). Per-player local volumes go through it.
- **`fetchTableSnapshot` reads optional tables forgivingly** (`src/lib/remoteApi.js:150-170`): a query error yields empty data so a project missing a migration can still be joined. Audio follows the same rule.
- **Guest broadcast is pass-through by default.** `toGuestBroadcastAction` (`src/components/GameView.jsx:250-276`) returns any unrecognized action unchanged, and snapshots send the whole state, so new audio actions and the `audio` state slice reach guest players with no filter change.
- **Browsers block audio that starts without a user gesture, and `HTMLAudioElement.volume` is ignored on iOS Safari.** A player who resumes a table by page refresh has no gesture; iOS players' local volume sliders have no effect.
- **A guest DM's autosave (`persistLocally`) can outlive the audio it references.** A guest table resumed after the 6-hour expiry carries track records whose files are gone.

## Architectural decisions

- **Audibility is per-client, playback state is table-wide.** One `audio_playback` value per table names the single sound currently playing; each client decides locally whether it is meant to hear it.
- **Playback shape:** `{ nowPlaying: { trackId, anchorMs, offsetMs } | null, resume: { [trackId]: offsetMs } }`. Position = `offsetMs + (Date.now() − anchorMs)`, wrapped by duration when the track loops. Starting a sound pauses the current one by writing its position into `resume` and clearing `nowPlaying`; resuming a track starts from its `resume` offset, else 0. Nothing is written per tick.
- **Storage of playback:** a nullable jsonb column on `tables`, written by the host under the existing host-only update policy, streamed to clients through the existing `tables` UPDATE subscription (same route as `game_clock`).
- **Track record:** `{ id, targetKind: 'world' | 'layer' | 'island' | 'entity', targetId, name, url, storagePath, mime, sizeBytes, loop, baseVolume }`. One track per target; replacing a file replaces the record. The world track's `targetId` is the table's own id.
- **Track storage (cloud):** an `audio_tracks` table keyed by `table_id`, member-read, host-only insert/update/delete (same trust model as `custom_assets`), unique per `(table_id, target_kind, target_id)`.
- **State slice:** `state.audio = { tracks, trackOrder, playback }`, a peer of `customAssets`, hydrated by `fetchTableSnapshot`, applied through reducer actions, carried in guest snapshots as-is.
- **Sync transport:** cloud mode uses the existing `table:<tableId>` channel; guest mode uses the existing `guest:<code>` channel with the DM's host-only `broadcastGuestChange`. No new channel is opened in either mode.
- **Storage buckets:** `table-audio` (cloud, public-read, host-only insert scoped to a table id the caller hosts) and a separate guest scratch bucket (insert by any authenticated session under a `<CODE>/` prefix). Both enforce a 10 MB object limit and an MP3/WAV MIME allow-list at the bucket.
- **Limits:** 10 MB per file; 50 MB per table (cloud: enforced in the database; guest: client-side only). Accepted types: MP3 and WAV.
- **Audibility rule** (evaluated by each client for the current `nowPlaying` track):

  | Track target | Audible to |
  | ------------ | ---------- |
  | world | everyone |
  | entity (hero/mob) | everyone |
  | layer | clients whose current layer is that layer (host: the layer being viewed; player: `players[me].currentLayerId`) |
  | island | clients whose current layer contains that island |

- **Auto-follow:** when the DM switches the layer they are viewing, the DM's client writes playback: if the new layer has a layer track, it becomes `nowPlaying` (interrupting whatever played); otherwise a `nowPlaying` layer or island track is paused. World and token sounds are never touched by a layer switch. Island audio never auto-starts.
- **Volume:** effective volume = `baseVolume` (synced, DM-set, on the track) × local volume (per player per track, this browser only), both 0–1.
- **Loop:** per-track boolean, default on for world/layer/island tracks and off for entity tracks.
- **Permissions:** the DM alone uploads, replaces, removes, plays, pauses, and edits base volume and loop. Players only listen and set local volume.
- **Playback engine:** one client-side audio element driven from state (exclusivity means at most one sound at a time); it re-derives position from the anchor on every state change, join, reconnect, and layer change.
- **Availability gate:** the Music button is present in every mode; in local demo mode and (until Slice 5) guest mode it is disabled with an explanation.

## UI / UX Notes

- **Music button** in the toolbar, visible to everyone. Opens the **Music modal**, which lists every track in the session with a source label (World music, layer name, island name, token name), a play/pause control (DM only), a loop toggle (DM only), and volume sliders.
- **Sliders:** the DM sees base and local sliders per track; players see only their local slider. World music is always listed first, even with no file (DM sees an upload control; players see an empty row).
- **Upload surfaces (DM only):** World music from the Music modal; layer and island audio from `MapSettingsPopover` (`src/components/Toolbar.jsx:723`), which already receives both `layer` and `island`; token audio from the hero and mob inspectors in `src/components/RightPanel.jsx`.
- **Now playing** is indicated in the modal; a paused-and-resumable track shows its resume position.
- **Autoplay block:** when the browser refuses to start audio, a small banner reads "Tap to enable sound"; one click starts the current track and dismisses it. The join click satisfies the gesture where it applies.
- **Errors:** a wrong file type or an oversize file shows an inline message naming the limit and the table's remaining quota. A track whose file can no longer be fetched (expired guest audio) shows "File expired — re-upload" to the DM and a muted row to players; it never throws.
- **Look:** follows `src/styles.css`'s existing hand-rolled system and the `ClockModal.jsx` modal pattern.

## Acceptance Criteria

- [ ] **AC1 — DM-only upload with validation.** The DM can attach an MP3 or WAV file up to 10 MB to the world, a layer, an island, or a hero/mob token; any other type or a larger file is rejected with an inline message. Players see no upload control anywhere, and the database rejects a non-host insert.
- [ ] **AC2 — Synced play and pause.** When the DM plays a track, every connected client that is meant to hear it starts it within about one second of each other; pausing stops it for all of them.
- [ ] **AC3 — Autoplay unlock.** A client whose browser blocks playback shows the "Tap to enable sound" banner; one click starts audio at the correct position and dismisses the banner.
- [ ] **AC4 — Late join, reconnect, DM reload.** A player who joins, or reconnects after a drop, seeks to the current position rather than starting from 0:00 or staying silent. A DM page refresh does not interrupt playback for anyone.
- [ ] **AC5 — Two-level volume.** The DM's base volume per track is synced to everyone; each player's local volume is stored only in their browser and survives a refresh; the audible level is the product of the two. The Music modal exposes both to the DM and only the local slider to players.
- [ ] **AC6 — Loop.** Each track has a loop toggle, defaulting on for world, layer, and island tracks and off for token tracks; a looping track wraps at its end for every client.
- [ ] **AC7 — Layer scoping and auto-follow.** A layer's audio is heard only by clients currently on that layer. When the DM switches to a layer that has audio, it starts; switching to a layer without audio pauses a playing layer or island sound but leaves world and token sounds alone.
- [ ] **AC8 — Island audio is manual.** An island's audio plays only when the DM presses play, and only clients on that island's layer hear it.
- [ ] **AC9 — Token audio.** A hero or mob token with a sound plays it for every client when the DM presses play, regardless of layer.
- [ ] **AC10 — One sound at a time.** Starting any sound pauses the one playing, at its position, for everyone; it does not resume by itself. Pressing play on the interrupted track later continues from where it stopped.
- [ ] **AC11 — Cleanup on delete.** Deleting a layer, island, or token removes its track record and file; deleting a table removes its audio files.
- [ ] **AC12 — Guest tables.** A guest DM can upload audio and players hear it synced, with nothing kept beyond 6 hours. A guest table whose audio has expired shows the expired state without errors.
- [ ] **AC13 — Local mode.** In local demo mode the Music button is disabled with an explanation and no audio code path runs.
- [ ] **AC14 — Table quota.** A cloud table cannot exceed 50 MB of audio in total; the database rejects the insert that would cross it, and the modal shows current usage.

## Technical Notes

- `src/lib/realtime.js:97-132` — the `tables` UPDATE handler already dispatches `SET_CLOCK` and `SET_DAY_NIGHT_OVERRIDE` from `payload.new` guarded by `'game_clock' in payload.new`; the playback column follows that exact guard. The `custom_assets` listener (`realtime.js:134-140`) is the shape for a new `audio_tracks` listener (INSERT/UPDATE/DELETE).
- `src/lib/remoteApi.js:150-170` and `:215-228` — `fetchTableSnapshot` fetches optional data forgivingly and returns it beside `customAssets`; audio tracks and the playback value join that return. `updateTableClockRemote` (`:235`) is the model for the playback write; `addCustomAssetRemote`/`removeCustomAssetRemote` (`:358-367`) for track rows.
- `src/lib/mappers.js:196` — `mapDbCustomAsset` is the model for the track row mapper.
- `src/state/store.jsx` — `createEmptyGameState` (`:38`) holds `customAssets`/`customAssetOrder`; `SET_CLOCK` (`:295`) and the custom-asset cases (`:348-367`) are the reducer patterns. `REMOVE_LAYER` (`:108`), `REMOVE_ISLAND` (`:166`), and `REMOVE_ENTITY` are where cascade cleanup of tracks belongs. `src/state/migrate.js` (`migrateLegacyState`) backfills the `audio` slice for saved states that lack it.
- `src/components/GameView.jsx:1198-1206` — `updateClock` is the write pattern to mirror: local `dispatch`, then `updateTableClockRemote` when `isRemote`, then `broadcastGuestChange` when `isGuestHost`. `hostViewLayerId` (`:419`, set via `onSwitchLayer` at `:1711`) is local React state and the trigger for auto-follow; a player's layer is `state.players[me.id].currentLayerId` (`:420`). `doLeaveTable` is the single guest-host leave choke point.
- `src/components/Toolbar.jsx:97,427` — `onOpenClock` and its `ToolCard` are the pattern for opening a modal from the toolbar; `ClockModal.jsx` (mounted `GameView.jsx:1785`) is the modal pattern.
- `src/lib/storageUpload.js` — `uploadImage` is the upload/`getPublicUrl` shape; `deleteTableStorage` lists and removes per-table files across `TABLE_STORAGE_BUCKETS` and must learn the audio bucket. It runs before `deleteTableRemote` because the delete policy depends on the table row.
- `supabase/migrations/20250101000036_custom_assets.sql` — the host-only table-plus-RLS model for `audio_tracks`; `20250101000032_game_clock.sql` — the model for a nullable jsonb column on `tables`.
- `supabase/00_combined_all_migrations.sql` is kept in sync by hand with `supabase/migrations/`.
- `supabase/config.toml:114-117` sets a global storage `file_size_limit = "50MiB"`; the audio buckets set their own 10 MB limit.
- Hero and mob inspectors: `MobInspector` (`RightPanel.jsx:692`) and `HeroInspector` (`RightPanel.jsx:798`).
- The repo has no test files and no test runner (`package.json` has no test script). No `T`-phase steps are included; verification is the Smoke Test below.

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| F | Foundation |
| P | Persistence |
| S | Service |
| U | UX |
| D | Docs |
| X | Cross-doc / cleanup |

### Slice 1 — Tracer: world music in a cloud table

**Demoable when:** in a cloud-mode table, the DM uploads an MP3 as World music from the Music modal and presses play; a second browser that joined hears it, and pausing stops both; a browser that blocks autoplay shows the unlock banner; in local mode the Music button is disabled.
**Satisfies:** AC1 (world only), AC2, AC3, AC13

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S001 | P | Audio schema | Migration adding the `audio_tracks` table (member-read, host-only write, unique per target), the nullable `audio_playback` jsonb column on `tables`, and the `table-audio` bucket (public-read, host-only insert scoped to a hosted table id, 10 MB limit, MP3/WAV MIME allow-list). Enable both tables for realtime the way the project's existing tables are (Open Question Q3). Mirror into the combined migration file. | — | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql` |
| ✅ | S002 | F | State slice and reducer | Add `audio: { tracks, trackOrder, playback }` to `createEmptyGameState`; reducer cases for adding, updating, and removing a track and for setting playback; backfill the slice for older saved states. | — | `src/state/store.jsx`, `src/state/migrate.js` |
| ✅ | S003 | P | Snapshot, mapper, realtime | Map track rows; fetch tracks and playback forgivingly in `fetchTableSnapshot`; add the `audio_tracks` listener and the `audio_playback` guard on the `tables` UPDATE handler. | S001, S002 | `src/lib/mappers.js`, `src/lib/remoteApi.js`, `src/lib/realtime.js` |
| ✅ | S004 | S | Upload and write API | Client-side type/size validation; upload to `table-audio` under the table's id; insert/replace/remove a track row; write the playback value. | S001, S003 | `src/lib/storageUpload.js`, `src/lib/remoteApi.js` |
| ✅ | S005 | S | Playback engine | A client module driving one audio element from `state.audio`: derive position from the anchor, apply the audibility rule (world only in this slice), handle play rejection by exposing a "blocked" flag. Mounted in `GameView`. | S002 | `src/components/GameView.jsx`, new module under `src/lib/` |
| ✅ | S006 | U | Music button and modal (world) | Toolbar Music button for everyone; modal with the World music row: DM upload, play/pause; players see status. Disabled with an explanation in local and guest modes. Wire DM actions through the `updateClock` write pattern (dispatch, remote write). | S004, S005 | `src/components/Toolbar.jsx`, `src/components/GameView.jsx`, `src/styles.css`, new modal component |
| ✅ | S007 | U | Unlock banner | Show "Tap to enable sound" when the engine reports blocked playback; one click resumes and dismisses. | S005, S006 | `src/components/GameView.jsx`, `src/styles.css` |

### Slice 2 — Mixer: volume, loop, catch-up

**Demoable when:** the DM moves a track's base slider and every player's loudness changes; a player's own slider affects only them and survives a refresh; a player who joins or reconnects mid-song lands at the current position; the DM refreshing the page does not interrupt the song; a looping track wraps.
**Satisfies:** AC4, AC5, AC6

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S008 | P | Base volume and loop fields | Add `base_volume` and `loop` to the track row, mapper, reducer patch, and write API; loop defaults by target kind. | S004 | `supabase/migrations/`, `src/lib/mappers.js`, `src/lib/remoteApi.js`, `src/state/store.jsx` |
| ✅ | S009 | S | Local volume storage | Per-table, per-track local volume read/write helpers in the persistence boundary, tolerant of unavailable storage. | — | `src/state/persistence.js` |
| ✅ | S010 | S | Engine: volume, loop, catch-up | Apply base × local to the audio element; honor loop and wrap the derived position; re-derive on join, `HYDRATE`, and reconnect resync so late joiners and reconnecters seek correctly. | S005, S008, S009 | new module under `src/lib/`, `src/components/GameView.jsx` |
| ✅ | S011 | U | Modal mixer controls | Per-track base slider (DM), local slider (everyone), loop toggle (DM) in the Music modal. | S006, S008, S010 | new modal component, `src/styles.css` |

### Slice 3 — Layer and island audio

**Demoable when:** the DM attaches audio to a layer and to an island from map settings; both appear in the Music modal; playing the layer's sound is heard only by players on that layer; switching the DM's view to that layer auto-starts it; starting the island's sound pauses the layer's at its position and pressing play on the layer resumes it from there.
**Satisfies:** AC7, AC8, AC10, AC1 (layer, island)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S012 | U | Layer and island upload UI | Upload/replace/remove control and loop toggle for the layer and island in the map settings popover (host only). | S004, S008 | `src/components/Toolbar.jsx` |
|  | S013 | S | Exclusive play and resume offsets | The DM's play action writes the interrupted track's position into `resume` and sets the new `nowPlaying`; pause does the same; play on a track starts from its `resume` offset. | S010 | `src/components/GameView.jsx`, `src/state/store.jsx` |
|  | S014 | S | Layer/island audibility | Extend the engine's audibility rule with the current-layer checks for layer and island tracks. | S010 | new module under `src/lib/` |
|  | S015 | S | Auto-follow on layer switch | When the DM's viewed layer changes, write playback per the auto-follow rule. | S013, S014 | `src/components/GameView.jsx` |
|  | S016 | U | Modal source labels | List layer and island tracks in the Music modal with their source names, grouped, with now-playing and resume-position indication. | S011, S012 | new modal component |

### Slice 4 — Token audio and cleanup

**Demoable when:** the DM attaches a sound to a hero or mob and plays it for the whole table; deleting that token, its island, its layer, or the table removes the records and files.
**Satisfies:** AC9, AC11, AC1 (tokens)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S017 | U | Token upload UI | Sound section (host only) in the hero and mob inspectors: upload/replace/remove, loop toggle, play/pause. | S013, S016 | `src/components/RightPanel.jsx` |
|  | S018 | S | Cascade in the reducer | Removing a layer, island, or entity also removes the tracks targeting it (and clears `nowPlaying`/`resume` entries that reference them). | S002 | `src/state/store.jsx` |
|  | S019 | P | Database and file cleanup | Remove a target's `audio_tracks` rows and Storage objects when the DM deletes a layer, island, or token; extend `deleteTableStorage` to the audio bucket; clean up when a track is replaced. | S018 | `supabase/migrations/`, `src/lib/storageUpload.js`, `src/lib/remoteApi.js`, `src/components/GameView.jsx` |

### Slice 5 — Guest tables

**Demoable when:** a guest DM uploads audio and plays it; a player who joined by invite code hears it synced; the file disappears from the bucket after 6 hours and the table shows the expired state rather than erroring.
**Satisfies:** AC12

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S020 | P | Guest scratch bucket | Migration adding the guest bucket: authenticated insert under a `<CODE>/` prefix, public-read, 10 MB limit, MP3/WAV allow-list, owner-scoped delete. | — | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql` |
|  | S021 | S | Guest upload path | Ensure an anonymous Supabase session before a guest upload; upload to the guest bucket; keep track records and playback in state only, broadcast with `broadcastGuestChange`; client-side 50 MB quota check. Enable the Music button for guest tables. | S020, S010 | `src/lib/auth.js`, `src/lib/storageUpload.js`, `src/components/GameView.jsx`, `src/components/Toolbar.jsx` |
|  | S022 | S | Expired-file handling | When a track's file fails to load, mark it expired in the modal and skip it in the engine without throwing; covers guest resume from autosave. | S021 | new module under `src/lib/`, new modal component |
|  | S023 | P | Scheduled purge | A service-role scheduled job that removes guest-bucket objects older than 6 hours through the Storage API (Open Question Q4). | S020 | new `supabase/functions/` entry, `supabase/migrations/` |
|  | S024 | S | Best-effort delete on leave | On a guest host's deliberate leave, delete that table's uploaded files from the guest bucket. | S021 | `src/components/GameView.jsx` |

### Slice 6 — Limits and hardening

**Demoable when:** uploading past 50 MB of total audio to one cloud table is rejected by the database and the modal shows current usage; a renamed non-audio file is rejected by the bucket.
**Satisfies:** AC14, AC1 (server side)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S025 | P | Table quota enforcement | Database check rejecting an `audio_tracks` insert or size-increasing update that would push a table past 50 MB. | S001 | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql` |
|  | S026 | U | Usage meter and errors | Show used/limit in the modal and surface the quota and type errors from S025 and the bucket. | S025, S011 | new modal component |
|  | S027 | X | Docs and thesaurus | Add the audio terms to `THESAURUS.md` (Audio track, World music, Now playing, Resume position, Base volume, Local volume, Sound unlock); update `supabase/README.md`'s migration list and `SPEC.md` where it describes storage. | S026 | `THESAURUS.md`, `supabase/README.md`, `SPEC.md` |

### Dependency graph

```
S001 ─┬→ S003 → S004 → S006 → S007
S002 ─┘         S005 ↗
S004 → S008 → S010 → S011 → S016 → S017
S009 ────────↗       S013 → S015
                     S014 ↗
S004,S008 → S012 → S016
S002 → S018 → S019
S020 → S021 → S022, S024
S020 → S023
S001 → S025 → S026 → S027
```

## Dependencies

| REQ ID | Title | Reason |
| ------ | ----- | ------ |
| REQ-008 | Guest DM Sessions | Slice 5 rides its `guest:<code>` channel, `broadcastGuestChange`, and guest snapshots. |
| REQ-001 | Connection Recovery | Late-join and reconnect catch-up (AC4) relies on its resync path re-hydrating state. |
| REQ-006 | Live Table Security Hardening | New RLS and Storage policies should follow its hardening conventions. |

## Out of Scope

- Server-side per-table quota for guest tables.
- Transcoding, trimming, or converting large WAV files.
- Waveform display, duration probing beyond what the audio element reports, crossfades, and Web Audio gain nodes.
- Audio on doors, chests, and traps.
- Players uploading or controlling audio, including on tokens they own.
- Any audio in local demo mode.
- Island audio auto-starting.
- Playlists, queues, and shuffle.
- Automated tests; the repo has no runner and end-to-end suites are owned elsewhere.

## Open Questions

- [ ] **Q1 — Island auto-follow.** Should an island's audio ever start by itself? Deferred until the app has a per-player "active island" signal or the DM asks for it.
- [ ] **Q2 — Clock skew.** Does device clock skew push real players out of sync by an audible amount? Deferred until the first cross-device test in Slice 2; if skew exceeds about one second, add a server-time offset estimate to the engine.
- [ ] **Q3 — Realtime enablement.** How are existing tables enabled for realtime, given no migration adds them to the publication? Resolve at S001 by checking the project's dashboard settings before assuming a new table streams.
- [ ] **Q4 — Purge mechanism.** Is a scheduled Edge Function (pg_cron + pg_net + service role) available on the project's Supabase plan? Resolve at S023; if not, choose an external scheduler before starting the slice.
- [x] **Q5 — Guest retention resolved.** Guest audio expires after 6 hours, purged on a schedule plus best-effort delete on leave. *(Blaxine)*
- [x] **Q6 — Who hears what resolved.** One table-wide now-playing sound; layer and island audio is heard only on that layer; the DM's viewed layer drives auto-follow. *(Blaxine)*

## Smoke Test

> Developer runs the app; the agent does not self-run.

1. In a cloud table as DM, open Music, upload an MP3 as World music (also try a 12 MB file and a `.txt` renamed `.mp3`; both must be rejected). Press play. *(AC1, AC2)*
2. From a second browser that joined by invite code, confirm the audio plays, that pausing stops it, and that a fresh tab that hasn't been clicked shows "Tap to enable sound". *(AC2, AC3)*
3. Join a third browser mid-song and drop then restore one player's network; confirm both land at the current position. Refresh the DM's page and confirm playback never stops. *(AC4)*
4. Move the DM's base slider and a player's local slider; confirm the base change reaches everyone and the local change only the player, and that the local level survives a refresh. Toggle loop off and let a short track finish. *(AC5, AC6)*
5. Attach audio to a layer and an island; put one player on that layer and one elsewhere. Confirm only the first hears the layer sound, that switching the DM to that layer starts it, and that playing the island sound pauses the layer sound at its position until the DM presses play on it. *(AC7, AC8, AC10)*
6. Attach a sound to a mob, play it, then delete the mob, then its island and layer; confirm rows and files are gone from the dashboard. *(AC9, AC11)*
7. Start a guest table, upload audio, confirm a joined player hears it, then check the guest bucket after 6 hours. Resume the table after expiry and confirm the expired state shows without errors. *(AC12)*
8. Without Supabase configured, confirm the Music button is disabled with an explanation. *(AC13)*
9. Upload audio to a table until the next file would pass 50 MB; confirm the rejection and the usage display. *(AC14)*

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| XL | 40–55 | Touches every layer: two migrations, two buckets, a realtime table and column, a new reducer slice, a playback engine, three UI surfaces (modal, map settings, inspectors), guest transport, and a new scheduled-purge job with no existing infrastructure. Slice 5's purge is the least certain part. |

## Considered And Rejected

- **File System Access API or IndexedDB for local mode.** A file handle needs a user click to re-grant on every return and works only in Chromium; IndexedDB blobs work everywhere but add a second storage path to a mode that has no sync. Local mode has no audio instead.
- **Streaming guest audio over the broadcast channel or peer to peer.** A 10 MB file exceeds practical Realtime message sizes and dies when the DM reloads or a player joins late; temporary Storage with expiry replaces it.
- **Guest audio played only on the DM's machine.** Nothing stored or sent, but it breaks "everyone hears it".
- **Two channels (music plus token overlay) or non-exclusive mixing.** Would let a roar play over the tavern; the DM chose strict one-at-a-time.
- **Auto-resume of an interrupted sound.** Needs a resume stack synced across clients and surviving layer switches and reconnects; interrupted sounds stay paused with a saved position instead.
- **One now-playing slot per layer.** Would give split parties their own music, but multiplies playback state and turns "exclusive" into a per-layer rule; the DM's layer drives the single slot instead.
- **World music as a master fader.** A multiplier with no file, which contradicts a track the DM uploads; World music is a track.
- **Island audio that follows tokens.** Needs an active-island-per-player signal the app doesn't have.
- **Player-owned token uploads.** Adds broadcast permission checks for little value; the DM controls all audio.
- **Purging guest audio with SQL against `storage.objects`.** Removes the row but not the backing file, so storage would keep growing.
- **An unbounded guest bucket with no scheduled purge.** Leaves crashed or abandoned sessions' files forever, contradicting "nothing will be saved".

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-09-23 | Blaxine | Initial plan, following a `/grill-me` interview that resolved scope and behavior and a `/create-req` deep-dive that grounded it in the code. |
