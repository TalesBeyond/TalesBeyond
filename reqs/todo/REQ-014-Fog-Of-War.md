# REQ-014 — Fog of War

| Field | Value |
| ----- | ----- |
| ID | REQ-014 |
| Title | Fog of War |
| SOLVE | — |
| Status | Todo |
| Phase | Gameplay |
| Tier | Feature |
| Area | Map / Tokens / visibility / cloud, guest and local mode |
| Author | Blaxine |
| Created | 2026-10-08 |
| Last Updated | 2026-10-08 |

> Source PRD: REQ-014-PRD-Fog-Of-War.md

## Short Description

Lets the DM cover parts of an island with rectangular fog chunks that players see as an opaque cover. Every monster, NPC, chest, door and trap standing wholly inside fog is kept off players' maps the same way a Hidden token is, heroes always show, and a chunk opens for the whole table either by the DM's hand or when a hero stands in it. A chunk whose "Reveals when entered" setting is off is held back: players cannot move onto it or arrive in it through a door. Works on cloud, guest and local tables; chunks are laid on desktop and managed on desktop and phone.

## User Stories

1. As a DM, I want to cover parts of a map — or all of it — with rectangular chunks of fog, so that players only see the areas they have explored
2. As a DM, I want a fogged chunk to hide the map beneath it and keep every monster, NPC, chest, door and trap inside it off my players' maps, so that an unexplored room gives nothing away
3. As a DM, I want to reveal a chunk for the whole table by clicking it during play, and to fog it again if I need to, so that I control when a room opens and can undo a mistake
4. As a player, I want a fogged chunk to open when my hero steps into it, so that exploring the map reveals it without waiting for the DM
5. As a DM, I want to turn off "reveals when entered" on a chunk, so that a room I am holding back stays shut to players — on foot or through a door — until I open it

## Constraints

- **Realtime sends nothing when a row stops being readable.** A token that becomes fogged stays on a cloud player's map until the DM's client names it in a `conceal` broadcast (`src/lib/realtime.js:47`, `sendConceal` `:212`). A row that becomes readable arrives as an `UPDATE` for a row the client has never held; `realtime.js:86` already upserts those for traps and every `canBeHidden` kind (`mob`, `npc`, `chest`, `door`).
- **Every token is painted in one layer above all islands** (`src/components/MapBoard.jsx:1158`). A cover drawn inside an island sits under every token, so any token that reaches a player's state is drawn on top of the fog. Token privacy rests on the token never arriving, not on paint order.
- **A guest DM's `MOVE_ENTITY` is forwarded unless the token was already hidden** (`toGuestBroadcastAction`, `src/components/GameView.jsx:358`), and a cloud `moveEntityRemote` leaves the row readable. A DM move into fog sent as a move followed by a flag update shows players the destination square first.
- **A door is one row with two sides**: its home square (`islandId`, `col`, `row`) and a second square on the target layer's base island (`targetCol`, `targetRow`), resolved per layer in `entitiesVisibleOnLayer` (`GameView.jsx:225`). One stored flag cannot describe both sides.
- **The current player read policy on `entities` is the one in `20250101000061_ambush_tokens.sql`; the current `enforce_entity_write_permissions()` is the one in `20250101000067_merchant_npcs.sql`.** Each migration that touches either rebuilds it whole from the previous version.
- **A table missing from the `supabase_realtime` publication breaks the whole table channel**, not just that table's events (`20250101000050_realtime_publication.sql`, repeated in `20250101000052_drawings.sql`).
- **Where a cloud player's hero may move is the client's call.** The hero-owner branch of the write trigger allows any `col`/`row`/`island_id`/`layer_id` on the player's own hero (`20250101000037_player_door_layer_move.sql` onward). On a guest table the DM's client validates the move (`applyValidatedIntent`, `GameView.jsx:1217`).
- **A dropped token is held at the drop square until synced state agrees or a timeout passes** (`holdDragAt`, `MapBoard.jsx:302`, called at `:361` before `onMoveEntity`). A move refused afterwards reads as "moved, then snapped back".
- **Map art reaches every browser.** An island's background is a CSS background on `.grid-wrap` (`MapBoard.jsx:1035`), resolved from a fingerprint every seat can fetch. The cover hides it on screen only.
- **"The DM is away" lasts at most 3 minutes 5 seconds on cloud and guest tables.** Once the host's Presence entry is gone past `HOST_ABSENCE_GRACE_MS`, every player's session ends after `HOST_ABSENCE_END_MS` (`GameView.jsx:148-152`, `handleHostPresenceChange` `:540`). On a guest table a player's move is only an intent and goes unanswered meanwhile. The PRD's open-ended away case exists only in local mode and inside that cloud window.
- **Phones already have the Draw tool** (`PhoneDrawBar`, `GameView.jsx:3629`). The Fog of war tool gets no phone bar.
- **`fog` is taken.** It is an Island condition key (`src/data/islandConditions.js:11`) and a phone icon name (`src/components/PhoneChrome.jsx:49`).
- **Optional tables are fetched forgivingly in `fetchTableSnapshot`** (`src/lib/remoteApi.js`, the `drawings` block at `:195`), so a project that has not run a migration still loads.
- **The repo has no test runner** (`package.json` has no test script; `PITFALLS.md` #9). Verification is the Smoke Test.

## Architectural decisions

- **Naming:** the feature is "Fog of war" everywhere in the UI; the rectangle is a "fog chunk". New identifiers spell out fog of war or fog chunk, never bare `fog`. The Fog island condition is untouched.
- **A fog chunk belongs to one island.** Its rectangle is in whole grid squares from the island's top-left corner (`x`, `y`, `w`, `h`), like a Drawing's geometry. It moves with its island and is deleted with it. Squares of a chunk that fall outside the island's current `cols`/`rows` are ignored; the stored rectangle is never rewritten when the island is resized.
- **Schema — `fog_chunks`:** `id uuid`, `table_id` and `island_id` (both `on delete cascade`), `x`, `y`, `w`, `h` integers with `w >= 1` and `h >= 1`, `revealed boolean not null default false`, `reveal_on_enter boolean not null default true`, `created_at`, `updated_at`. Every seated member reads; only the host inserts, updates or deletes. Added to the `supabase_realtime` publication.
- **Schema — `entities.fogged boolean not null default false`.** The player read policy gains `and not fogged`; the write trigger treats a change to `fogged` like a change to `hidden` (DM only).
- **Client state:** `fogChunks` keyed by id plus `fogChunkOrder` (creation order) on the table state, beside `drawings`/`drawingOrder`, carried in the Table snapshot, the guest snapshot, the local save and the table export.
- **A square is fogged while at least one unrevealed chunk covers it.**
- **A token is fogged when it is not a hero and every square it occupies is fogged.** For a door that means every square on both of its sides. A hero is never fogged.
- **`fogged` is derived data that only the DM's client writes**, in all three modes. `isHiddenFromPlayers` treats it as it treats `hidden`, so the cloud read policy, the guest broadcast filter and the local filter all apply to it unchanged.
- **Same-write rule:** any DM write that places a token, or changes its position, size, island or layer, carries the token's resulting `fogged` value in that same write. A DM move that changes `fogged` is sent as one entity update holding position and flag together, never as a move followed by a flag update.
- **Chunk changes restamp.** Laying, deleting, moving, resizing, revealing or re-fogging a chunk updates `fogged` on every token whose value changed, and on a cloud table sends `conceal` for each token that became fogged.
- **Reconcile:** when the DM's client first holds a table and after every resync, it corrects any token whose stored `fogged` disagrees with the chunks.
- **A door with one clear side stays readable**; each player client leaves out the side whose squares are all fogged.
- **Reveal and fog-again are table-wide.** There is no per-player fog state.
- **Reveals when entered is positional.** While the DM's client is connected, any unrevealed chunk with `reveal_on_enter` on that has a hero occupying at least one of its squares is revealed by the DM's client, whoever moved the hero and however long ago.
- **Occupied chunks start held back.** A chunk laid over a hero is created with `reveal_on_enter` off; "Fog again" on a chunk a hero stands in turns it off.
- **Held-back rule:** a player may not move their own hero to a destination where any square of the hero's footprint is covered by an unrevealed chunk with `reveal_on_enter` off. A hero already inside may move out onto squares no such chunk covers. The DM is never restricted.
- **Held-back enforcement** is the player's own client on cloud and local tables and the DM's client on a guest table. The database does not check it.
- **Selection:** a fog chunk and a token are never selected together. Where chunks overlap, a click picks the one with the smallest area under the pointer.
- **Laying chunks is desktop-only.** Revealing, re-fogging, the setting and delete work on phones.

## UI / UX Notes

- **Tool card.** "Fog of war", DM only, beside Draw in the Tools group (`src/components/Toolbar.jsx:818`). Its Mode bar ("Fog of war." / Done → Play) holds "Fog whole island", which covers the active island with one chunk.
- **Laying.** A drag on an island shows a draft rectangle that snaps to whole squares and is clipped to the island; releasing creates the chunk. A click on any chunk, fogged or revealed, selects it. A selected chunk can be dragged to move it and resized by its handles, in whole squares.
- **Players** see every fogged square as an opaque cover: no map art, grid, drawing, move-range highlight or day/night tint shows through. The island's outline, name and condition badges stay.
- **The DM** sees an unrevealed chunk as a tint with everything beneath still visible, and a revealed chunk as a dashed outline with a small corner tag. Tokens in fog wear the existing ghosted look (`.token.dm-hidden`, `src/styles.css:2433`).
- **Play tool, DM.** A click on an empty square of a fogged chunk selects that chunk. A revealed chunk is selected only through its corner tag. Clicks on explored ground behave as today.
- **Fog card.** With a chunk selected, the right panel (a Phone sheet on phones) shows: "Reveal" or "Fog again", the "Reveals when entered" switch, and "Delete". When a hero stands in the chunk, a Hint under the switch says the chunk stays shut only with the switch off, and "Fog again" turns it off.
- **Blocked move.** The hero stays where it was (it never lands on the square) and the log shows one line saying the area is not open yet. A door whose arrival square is held back shows the same line and no "Open the door?" prompt.
- **Phone.** No Fog of war tool. With no movable token selected, the DM's tap on a fogged chunk or a corner tag opens the fog card as a Phone sheet; with one selected, the tap moves the token as today.
- **Tutorial.** The Tools step gains a "Fog of war" line (`src/components/Tour.jsx:26`). No new step.

## Acceptance Criteria

- [ ] **AC1 — Lay a chunk.** With the Fog of war tool, dragging on an island creates a fog chunk covering every square the drag touched, clipped to that island. The tool exists only for the DM and only on the desktop layout.
- [ ] **AC2 — Stored and synced.** A chunk, its revealed state and its setting reach every seat without a reload and survive one, on a cloud table, a guest table and a local table, and are part of a table export.
- [ ] **AC3 — Players' cover.** A player sees an opaque cover over every fogged square; nothing of the map beneath shows, and the island's outline, name and condition badges remain.
- [ ] **AC4 — DM overlay.** The DM sees an unrevealed chunk as a tint with the map and tokens visible beneath, and a revealed chunk as a dashed outline with a corner tag.
- [ ] **AC5 — Reveal and fog again by hand.** In the Play tool the DM clicks a fogged chunk, presses Reveal in the right panel, and the cover is gone for the whole table. Through the corner tag the DM selects it again and "Fog again" restores the cover for everyone.
- [ ] **AC6 — Overlap.** A square covered by several chunks is clear only once every one of them is revealed. A click where chunks overlap selects the smallest.
- [ ] **AC7 — Tokens in fog do not exist for players.** A monster, NPC, chest, door or trap whose every square is fogged is on no player's map. On a cloud table a non-host query for that row returns nothing; on a guest table it is never broadcast and is absent from a joining player's snapshot.
- [ ] **AC8 — Heroes and partly fogged tokens show.** A hero is shown wherever it stands. A token with at least one clear square is shown. A door is shown on a side that has a clear square and not on a side that has none.
- [ ] **AC9 — Tokens follow the fog live.** Revealing a chunk puts its tokens on players' maps without a reload; re-fogging takes them off. A token the DM moves into fog, or places in fog, never appears at that square on a player's map. A token the DM moves out of fog appears.
- [ ] **AC10 — Only the DM changes fog.** On a cloud table a non-host cannot insert, update or delete a `fog_chunks` row or change `fogged` on any token.
- [ ] **AC11 — Reveals when entered.** With the setting on and the DM's browser connected, a chunk opens for the whole table when any hero occupies one of its squares: moved by its player, moved by the DM, or arriving through a door.
- [ ] **AC12 — Catch-up.** A hero who entered such a chunk while the DM's browser was not connected stays in the dark, and the chunk opens when the DM's browser next loads or resyncs the table.
- [ ] **AC13 — Occupied chunks.** A chunk laid over a hero is created with the setting off. "Fog again" on a chunk a hero stands in turns the setting off and the card says so. Turning the setting on for an unrevealed chunk a hero stands in opens it.
- [ ] **AC14 — Held-back chunks block players.** A player cannot move their own hero onto any square covered by an unrevealed chunk with the setting off, by drag, by phone tap or by a planned move; the hero does not land there and a log line says why. On a guest table the DM's client rejects the same move sent as an intent. A hero inside such a chunk can move out onto uncovered squares. The DM can move any token anywhere.
- [ ] **AC15 — Doors.** A player cannot go through a door whose arrival square is held back. Arriving through a door into a chunk with the setting on opens it.
- [ ] **AC16 — Fog whole island.** One action in the Fog of war tool covers the active island with a single chunk, following AC13.
- [ ] **AC17 — Edit a chunk.** In the Fog of war tool the DM can move, resize and delete a chunk; tokens appear and disappear for players according to the new shape.
- [ ] **AC18 — Phone.** A DM on the phone layout can reveal a chunk, fog it again, change its setting and delete it, and cannot lay one. A phone player sees the cover, the reveals and the blocked moves exactly as on desktop.
- [ ] **AC19 — Island lifecycle.** Chunks move with their island and are gone when it is deleted. After an island is made smaller, squares of a chunk outside it have no effect.
- [ ] **AC20 — Naming.** Every label reads "Fog of war"; the Fog island condition keeps its name, icon and behaviour.
- [ ] **AC21 — Reconcile.** After the DM's browser loads or resyncs a table, no token's `fogged` value disagrees with the chunks.

## Technical Notes

**Privacy path that already exists**

- `src/data/visibility.js` — `isHiddenFromPlayers` (`:24`) is the single predicate; `entitiesShownTo` (`:42`) filters a player's entity map. `HIDEABLE_KINDS` (`:16`) governs only the DM's "Hidden from players" control and does not gate `fogged`.
- `src/components/GameView.jsx` — `entitiesVisibleOnLayer` (`:225`) is the local-mode filter and the place a door's target side is resolved (`:242`); the per-side door rule lands here. `toGuestBroadcastAction` (`:337`) turns a hidden→shown update into `ADD_ENTITY`, shown→hidden into `REMOVE_ENTITY`, and drops updates to a still-hidden token; `toGuestSnapshot` (`:366`) leaves hidden tokens out. `canPlayerUpdateEntity` (`:1480`) refuses any patch on a hidden token and any patch naming `hidden` or `locked`; `fogged` joins that list. The encounter effect at `:790` already hands the turn back to a creature players cannot see.
- `src/lib/mappers.js` — `mapDbEntity` (`hidden` near `:107`), `mapClientEntityToDb` (`:129`), `mapClientEntityPatchToDb` (`:180`) map every entity column; `fogged` is added to all three.
- `src/lib/realtime.js` — `conceal` handler (`:47`) re-reads the row and drops the token only if it is truly unreadable; the entity `UPDATE` handler (`:86`) upserts for traps and hideable kinds.
- `GameView.jsx` `updateEntity` (`:1670`) — the existing hide path: `updateEntityRemote(id, patch).then(() => tableChannelRef.current?.sendConceal(id))` (`:1704-1710`).

**Entity write choke points on the DM's client** (where the same-write rule applies)

- `addEntity` (`GameView.jsx:1581`) — builds the entity, then `ADD_ENTITY` + `addEntityRemote` / `broadcastGuestChange` / `saveOrWarn`.
- `moveEntity` (`:1645`) — `MOVE_ENTITY` + `moveEntityRemote`; a door dragged from its target side is routed to `updateEntity` with `targetCol`/`targetRow` (`:1652`).
- `updateEntity` (`:1670`) — size and any other patch.
- `revealAmbush` (`:1732`) — dispatches `ADD_ENTITY` for each spawned monster and writes them itself, bypassing `addEntity`.
- `confirmEnterDoor` (`:2693`) — the DM's branch moves a token across layers through `moveEntity`.
- `stateRef` (`:927`) holds the current state for handlers that run outside a render.

**Chunk storage and sync — the Drawings path to mirror**

- `supabase/migrations/20250101000052_drawings.sql` — table, touch trigger, four RLS policies, publication block.
- `src/state/store.jsx` — initial state (`:158`), the island-removal helper that drops an island's drawings (`:81-90`), `SET_DRAWING` (`:484`), `REMOVE_DRAWINGS` (`:494`). `src/state/migrate.js:52-54` defaults the keys on an older save.
- `src/lib/mappers.js` `mapDbDrawing` (`:272`); `src/lib/remoteApi.js` `upsertDrawingRemote` / `removeDrawingsRemote` (`:290-296`) and the forgiving fetch in `fetchTableSnapshot`; `src/lib/realtime.js:176` for the live handler.
- `GameView.jsx` `writeDrawing` (`:1935`) — dispatch, then cloud write or guest broadcast. A guest player applies any broadcast action directly (`onStateChange`, `:1294`), and `toGuestBroadcastAction`'s default case forwards unknown action types.
- Next free migration number today is `20250101000068`; `supabase/00_combined_all_migrations.sql` is kept in step by hand and `supabase/README.md` lists each migration.

**Map rendering and input**

- `src/components/MapBoard.jsx` — each island renders at `:1011-1092`: move-range cells, grid SVG, `.island-daynight` tint, then `IslandDrawings` (`:1089`). The cover and the DM's overlay follow `IslandDrawings` inside the same `.grid-wrap`. `islandRects` and `toIslandSquares` (`:551`) convert a pointer to island squares; `pixelToCell` (`src/utils/grid.js:17`) gives a square.
- Tool dispatch: `handleStagePointerDown` (`:770`) branches on `tool`; `handleIslandPointerDown` (`:391`) returns early for `ruler`, `pan`, `draw`, `area`; `onIslandDragUp` (`:411`) is where a Play-tool click on an island resolves (`onTapCell` at `:429`); `handleStageClick` (`:807`) clears the token selection. The `tool` prop's values are listed at `:56`.
- Drop path: `:356-362` (`holdDragAt`, then `onMoveEntity`), door drops at `:340-353`, `canMoveEntity` checked at `:338`.
- `src/utils/drawing.js` `shapeGeometry` (`:94`) is the Draw tool's rectangle maths, in fractional squares with optional snap.

**Player movement and doors**

- `moveEntity` (`GameView.jsx:1645`) is the one function every player move reaches: desktop drag (`onMoveEntity`), phone tap and planned move (`handleTapCell` `:3265`, `commitMove` `:3257`), and door arrival (`confirmEnterDoor` `:2717-2720`). A guest player's branch sends an intent (`:1661`).
- `applyValidatedIntent` (`:1217`) — the `MOVE_ENTITY` branch (`:1220`) checks only hero ownership today.
- `enterDoor` (`:2662`) shows the locked-door log line with `emitFx({ type: 'log', … })`; `confirmEnterDoor` computes the arrival square with `arrivalCellNearDoor` (`:197`).
- A token's footprint is `size × size` squares from (`col`, `row`); `size` is 1–5 (`src/data/tokenSizes.js`). `cellsCoveredBy` (`src/data/ambush.js:48`) already expands tokens to squares.

**Lifecycle hooks on the DM's client**

- Cloud resync: `runResync` (`GameView.jsx:848`) dispatches `HYDRATE`. Guest: the DM's state is local and authoritative. The reconcile and the reveals-when-entered check both run from the DM's client after it holds the table and after each `HYDRATE`.
- Two host clients (desktop and phone) may both run them; every write involved is idempotent.

**UI surfaces**

- `src/components/Toolbar.jsx` — tool cards at `:791-833`, icons in `TOOL_ICONS` (`:198`).
- `GameView.jsx` — Mode bars at `:3678-3712`; `RightPanel` element at `:3500` (it receives `selectedEntity`); `MapBoard` props at `:3574-3615`; phone sheets from `:3901`; `selectedId` state at `:392`.
- `src/components/Hints.jsx` — `Hint` (`:87`), `ModeBar` (`:121`). `src/components/PhoneChrome.jsx` — `PhoneSheet` (`:173`), `PhoneSwitch` (`:633`).
- `src/styles.css` — `.island-daynight` (`:2340`), `.token.dm-hidden` (`:2433`).

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| P | Persistence |
| S | Service |
| U | UX |
| D | Docs |

### Slice 1 — Tracer: lay a chunk, see the cover, open it by hand

**Demoable when:** on a cloud table with two browsers, the DM picks Fog of war, drags a rectangle over part of an island, and the player's map shows an opaque cover there while the DM's shows a tint; the DM switches to Play, clicks the chunk, presses Reveal, and the player's cover is gone; a reload on either side shows the same state. The same works on a guest table and a local table. Tokens inside the fog are still visible to players at this point.
**Satisfies:** AC1, AC2, AC3, AC4 (tint and outline), AC5 (Reveal; Fog again while selected or from the tool), AC6, AC10 (chunks), AC19 · **Covers:** US1, US3

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S001 | P | `fog_chunks` table | Migration creating the table per *Architectural decisions*: touch trigger, member read policy, host insert/update/delete policies, publication block. Mirror into the combined file and list it in the README. | — | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql`, `supabase/README.md` |
| ✅ | S002 | S | Chunk state and sync | `fogChunks`/`fogChunkOrder` in the table state: initial state, older-save default, set and remove reducer cases, removal with an island. Row mapper, cloud upsert and delete, forgiving snapshot fetch, live Realtime handler. One DM-side write function that dispatches and then writes to the cloud, broadcasts to guests, or saves locally. | S001 | `src/state/store.jsx`, `src/state/migrate.js`, `src/lib/mappers.js`, `src/lib/remoteApi.js`, `src/lib/realtime.js`, `src/components/GameView.jsx` |
| ✅ | S003 | S | Fog geometry rules | Pure functions, no React: a drag's two corners to a whole-square rectangle clipped to the island; whether a square is fogged; the smallest chunk covering a square, optionally unrevealed only. Squares outside the island are ignored. | — | new module under `src/utils/` or `src/data/` |
| ✅ | S004 | U | Fog of war tool | DM-only tool card and Mode bar on desktop. On the map: drag shows a snapped draft and creates a chunk on release; a click selects the chunk under the pointer. Leaving the tool clears nothing. | S002, S003 | `src/components/Toolbar.jsx`, `src/components/GameView.jsx`, `src/components/MapBoard.jsx` |
| ✅ | S005 | U | Cover and overlay | Per island, after the drawings: an opaque cover over fogged squares for players; for the DM a tint per unrevealed chunk, a dashed outline per revealed one, and a highlight on the selected one. Both themes. | S002, S003 | `src/components/MapBoard.jsx`, `src/styles.css` |
| ✅ | S006 | U | Fog card and Play-tool selection | Chunk selection state, exclusive with token selection. In Play, the DM's click on an empty fogged square selects the smallest unrevealed chunk there. Right panel shows the fog card with Reveal / Fog again and Delete when a chunk is selected. | S004, S005 | `src/components/GameView.jsx`, `src/components/MapBoard.jsx`, `src/components/RightPanel.jsx` |

### Slice 2 — Tokens in fog do not exist for players

**Demoable when:** with a monster, a chest and a hero inside a fogged chunk, the player sees only the hero; a non-host query of `entities` in the Supabase SQL editor (or the player's network panel) does not return the monster or chest; Reveal makes both appear on the player's map without a reload and Fog again removes them; the DM drags a goblin from clear ground into fog and it vanishes from the player's map without ever showing at its new square; reloading the DM's browser after hand-editing a `fogged` value in the database corrects it.
**Satisfies:** AC7, AC8, AC9, AC10 (`fogged`), AC21 · **Covers:** US2

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S007 | P | `entities.fogged`, policy, trigger | Migration adding the column; rebuild the read policy from `…061_ambush_tokens.sql` with `and not fogged` in the player branch; rebuild `enforce_entity_write_permissions()` from `…067_merchant_npcs.sql` with `fogged` added to the DM-only guard beside `hidden` and `locked`. Mirror into the combined file and the README. | — | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql`, `supabase/README.md` |
| ✅ | S008 | S | `fogged` is a hidden state | Map the column in all three entity mappers. `isHiddenFromPlayers` returns true for a fogged token. `canPlayerUpdateEntity` refuses a patch naming `fogged`. | S007 | `src/lib/mappers.js`, `src/data/visibility.js`, `src/components/GameView.jsx` |
| ✅ | S009 | S | Fogged-token rule | Pure function beside S003: given a token, its island's chunks and (for a door) its target side's island and chunks, whether it is fogged; and which of a door's sides a player may see. Players' layer view leaves out a door side with no clear square. | S003, S008 | the S003 module, `src/components/GameView.jsx` |
| ✅ | S010 | S | Same-write stamping | Apply the same-write rule at `addEntity`, `moveEntity`, `updateEntity` (size, door target side) and `revealAmbush`. A DM move that changes `fogged` goes out as one entity update with position and flag. After a cloud write that set `fogged`, send `conceal` for that token. | S009 | `src/components/GameView.jsx` |
| ✅ | S011 | S | Restamp on chunk change | After a chunk is laid, deleted, revealed or re-fogged, update `fogged` on every token whose value changed, through the same update path as S010, with `conceal` for each newly fogged token on a cloud table. | S010, S006 | `src/components/GameView.jsx` |
| ✅ | S012 | S | Reconcile on load and resync | On the DM's client, once the table is held and after each `HYDRATE`, correct every token whose `fogged` disagrees with the chunks. Read state through `stateRef`. | S011 | `src/components/GameView.jsx` |

### Slice 3 — Reveals when entered

**Demoable when:** a player drags their hero onto a fogged chunk and it opens for both browsers, tokens included; the DM turns "Reveals when entered" off on another chunk and the same step leaves it shut; the DM lays a chunk over a standing hero and its switch starts off; a player walks into a chunk while the DM's tab is closed, nothing opens, and it opens when the DM's tab is reopened.
**Satisfies:** AC11, AC12, AC13 · **Covers:** US4

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S013 | U | Setting on the fog card | "Reveals when entered" switch on the fog card, writing `reveal_on_enter` through the S002 write function. | S006 | `src/components/RightPanel.jsx`, `src/components/GameView.jsx` |
| ✅ | S014 | S | Positional reveal on the DM's client | Pure function: the unrevealed chunks with the setting on that a hero occupies. On the DM's client, whenever heroes or chunks change and after each `HYDRATE`, reveal each such chunk through the same path as the Reveal button, so S011 restamps. | S011, S013 | the S003 module, `src/components/GameView.jsx` |
| ✅ | S015 | U | Occupied-chunk rule | Laying a chunk over a hero creates it with the setting off. "Fog again" on an occupied chunk also turns the setting off. A Hint on the card, shown while a hero stands in the chunk, explains it. | S014 | `src/components/GameView.jsx`, `src/components/RightPanel.jsx` |

### Slice 4 — Held-back chunks block players

**Demoable when:** with a chunk's switch off, a player's drag onto it leaves the hero where it was and logs one line; the same on a phone tap and a planned move; on a guest table a hand-sent `MOVE_ENTITY` intent into the chunk changes nothing; a door whose arrival square is inside it logs the line and opens no prompt; the DM drags that hero in, and the player can then walk it out but not deeper.
**Satisfies:** AC14, AC15 · **Covers:** US5

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S016 | S | Held-back rule in the move path | Pure function: whether a hero's destination footprint touches an unrevealed chunk with the setting off. `moveEntity` refuses such a move for a non-host and emits the log line. `applyValidatedIntent`'s `MOVE_ENTITY` branch applies the same check against the DM's state. | S013 | the S003 module, `src/components/GameView.jsx` |
|  | S017 | U | The hero never lands | The map knows a drop is refused before it holds the token at the drop square, so the token returns at once. `handleTapCell` and the planned-move confirm refuse the same destinations. | S016 | `src/components/MapBoard.jsx`, `src/components/GameView.jsx` |
|  | S018 | S | Doors | For a player, `enterDoor` and `confirmEnterDoor` refuse when the arrival square is held back, with the log line and no prompt. Arrival into a chunk with the setting on needs no code beyond S014. | S016 | `src/components/GameView.jsx` |

### Slice 5 — Whole island, editing, phone, docs

**Demoable when:** "Fog whole island" covers the active island in one click and a room chunk drawn on top stays fogged after the big one is revealed; the DM moves and resizes a chunk and a goblin on its edge appears and disappears for the player; a revealed chunk's corner tag re-fogs it from Play; on a phone the DM taps a fogged chunk and reveals it from a sheet, and no Fog of war tool is offered; the Tutorial's Tools step names Fog of war.
**Satisfies:** AC4 (corner tag), AC5 (from Play), AC16, AC17, AC18, AC20 · **Covers:** US1, US3

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S019 | U | Fog whole island | Mode-bar action creating one chunk the size of the active island, subject to S015. | S015 | `src/components/GameView.jsx` |
|  | S020 | U | Move and resize a chunk | In the Fog of war tool, drag the selected chunk or its handles, in whole squares, with a live preview; the result is written once on release and restamped (S011). Delete and Backspace remove the selected chunk. | S011 | `src/components/MapBoard.jsx`, `src/components/GameView.jsx` |
|  | S021 | U | Revealed-chunk corner tag | The tag on a revealed chunk's outline is the chunk's only click target in Play, for the DM. | S006 | `src/components/MapBoard.jsx`, `src/styles.css` |
|  | S022 | U | Phone fog sheet | On the phone layout the DM's tap on a fogged chunk or a tag, when it was not used as a token move, opens the fog card in a Phone sheet. No tool entry on phones. | S015, S021 | `src/components/GameView.jsx`, `src/components/PhoneChrome.jsx` |
|  | S023 | U | Tutorial and titles | Add the Fog of war line to the Tutorial's Tools step; check every new label against AC20. | S004 | `src/components/Tour.jsx`, `src/components/Toolbar.jsx` |
|  | S024 | D | Glossary and docs | Add to `reqs/GLOSSARY.md`: Fog of war, Fog chunk, Held-back chunk, Reveals when entered; extend the Hidden token and Door entries with the fogged case. Update `APP_OVERVIEW.md` §4 (new Fog of war section; Toolbar; Map board) and §6 (schema, Realtime), `SPEC.md` §9.1–9.2, `PITFALLS.md` #1's list of what only the DM can do, and `MOBILE_DESIGN.md` §2. | S018, S022 | `reqs/GLOSSARY.md`, `APP_OVERVIEW.md`, `SPEC.md`, `PITFALLS.md`, `MOBILE_DESIGN.md` |

### Dependency graph

```
Slice 1   S001 → S002 ─┬→ S004 ─┬→ S006
          S003 ────────┴→ S005 ─┘

Slice 2   S007 → S008 → S009 → S010 → S011 → S012
                 S003 ↗               S006 ↗

Slice 3   S006 → S013 ─┐
                 S011 ─┴→ S014 → S015

Slice 4   S013 → S016 ─┬→ S017
                       └→ S018

Slice 5   S015 → S019            S011 → S020
          S006 → S021 ─┐         S004 → S023
                 S015 ─┴→ S022 ─┐
                         S018 ──┴→ S024
```

## Dependencies

| REQ ID | Title | Reason |
| ------ | ----- | ------ |
| REQ-008 | Guest DM Sessions | The guest broadcast filter, snapshot and intent validation are the guest-table half of every privacy and movement rule here. |
| REQ-006 | Live Table Security Hardening | The new policies and the trigger change follow its RLS conventions. |
| REQ-013 | R2 Media Storage | No functional dependency; both plans add a migration, so whichever lands second takes the next number. |

Also depends on these migrations being applied: `20250101000059_hidden_tokens_locked_doors.sql` (the `hidden` column and the `conceal` flow), `20250101000061_ambush_tokens.sql` (current read policy) and `20250101000067_merchant_npcs.sql` (current write trigger).

## Out of Scope

- Database enforcement of where a player's hero may move.
- Withholding an island's background image from a browser whose player has not explored it.
- Undo and redo for fog chunk edits.
- Removing held-back squares from an encounter's highlighted move range; the move is refused on drop.
- Silencing an Audio track attached to a fogged token.
- Changes to rulers, area-of-effect templates or the Roll log over fogged squares.
- A limit on the number of chunks per island or table.
- Backfill: existing tables start with no chunks and every token `fogged = false`.
- Batching the token updates of one reveal into a single request.
- Automated tests.

## Open Questions

- [ ] **Q1 — Cover look.** Flat colour per theme, or a textured cover? Deferred until S005; decide with both themes on screen.
- [ ] **Q2 — Reveal write volume.** One update per token per reveal: is it fast enough for a room of 30 or more tokens? Deferred until the Slice 2 smoke test; measure with 30 monsters in one chunk on a cloud table.
- [x] **Q3 — Token privacy resolved.** A stored `fogged` flag written by the DM's client, treated like `hidden`. *(Blaxine)*
- [x] **Q4 — Chunk scope resolved.** A chunk belongs to one island; "Fog whole island" covers the active island. *(Blaxine)*
- [x] **Q5 — Authoring resolved.** Its own DM-only "Fog of war" tool. *(Blaxine)*
- [x] **Q6 — Play control resolved.** Click a fogged chunk → right panel; a revealed chunk through its corner tag. *(Blaxine)*
- [x] **Q7 — Auto-reveal resolved.** A chunk with the setting on opens whenever a hero stands in it; occupied chunks start held back. *(Blaxine)*
- [x] **Q8 — Slices resolved.** Five slices as listed. *(Blaxine)*

## Smoke Test

> Developer runs the app; the agent does not self-run.

Use `npm run dev:duo` (or two browser profiles) on a cloud table unless a step says otherwise.

1. As DM, pick Fog of war and drag a rectangle over a room. The player sees an opaque cover; the DM sees a tint. Reload both; nothing changes. *(AC1–AC4)*
2. In Play, click the chunk, press Reveal; the player's cover goes. Press Fog again; it returns. *(AC5)*
3. Lay a second chunk overlapping the first. Reveal one: the shared squares stay covered for the player. Reveal the other: they clear. *(AC6)*
4. Put a monster, an NPC, a chest, a trap, a door and a hero inside a fogged chunk, and a 2 × 2 monster half in. The player sees the hero and the 2 × 2 monster only. In the player's network panel, the `entities` response holds none of the others. *(AC7, AC8)*
5. Reveal: all appear for the player without a reload. Fog again: they go. Drag a goblin from clear ground into fog while watching the player's screen: it disappears without showing at the destination. Place a new monster inside fog: the player never sees it. *(AC9)*
6. As the player, from the browser console, try to update a `fog_chunks` row and to set `fogged` on a token through the Supabase client; both are refused. *(AC10)*
7. In the SQL editor set `fogged = false` on a token deep in fog; reload the DM's browser; the token is fogged again and gone from the player. *(AC21)*
8. As the player, drag the hero into a fogged chunk: it opens for both. As DM, drag a hero into another: it opens. *(AC11)*
9. Close the DM's tab, and within three minutes walk the hero into a fogged chunk: it stays covered. Reopen the DM's tab: it opens. *(AC12)*
10. Lay a chunk over a standing hero: its switch is off and it stays shut. Reveal it, then Fog again with the hero inside: the switch goes off and the card says why. Turn the switch on: it opens. *(AC13)*
11. With a chunk's switch off, as the player drag the hero onto it: the hero stays put and the log says the area is not open. Repeat by phone tap and by a planned move during an encounter. As DM drag the hero in; as the player walk it deeper (refused) and out (allowed). *(AC14)*
12. Place a door whose far side arrives inside a held-back chunk; as the player, click it: log line, no prompt. Turn the switch on and go through: the chunk opens on arrival. *(AC15)*
13. "Fog whole island", draw a room on top, reveal the big chunk: the room stays covered. Move and resize the room chunk past a goblin; the player sees it appear and disappear. Delete the chunk. *(AC16, AC17)*
14. Reveal a chunk, then re-fog it from Play through its corner tag. *(AC5)*
15. In phone emulation as DM: no Fog of war tool; tap a fogged chunk, reveal it from the sheet, re-fog it through the tag. As a phone player: cover, reveal and blocked move behave as on desktop. *(AC18)*
16. Drag an island with chunks in Edit: the fog moves with it. Shrink the island below a chunk's edge: no error, the rest still covers. Delete the island: its chunks are gone from `fog_chunks`. *(AC19)*
17. Repeat steps 1, 4, 5, 8 and 11 on a guest table and on a local table (local: reload the player tab to see changes). On the guest table, send a `MOVE_ENTITY` intent into a held-back chunk from the player's console; nothing moves. *(AC2, AC7, AC14)*
18. Set the Fog island condition on an island: badge and wording unchanged. Read every new label for "Fog of war". Replay the Tutorial. *(AC20)*

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| L | 30–40 | Two migrations (one rebuilding the entity read policy and write trigger), a new synced collection, and changes concentrated in `GameView.jsx` and `MapBoard.jsx`. Slice 2 carries the risk: the same-write rule has to hold at every DM entity write, and each of the three modes hides tokens by a different mechanism. Slices 3 and 4 are small once the pure rules exist. |

## Considered And Rejected

Nothing here is built. Each entry names the alternative, then why it lost.

- **The database works fog out from geometry.** A reveal would change no `entities` row, so Realtime tells players nothing and every client must refetch tokens on each fog change; and `isHiddenFromPlayers(entity)` has about fifteen call sites that would each need the table state for guest and local mode. The stored flag reuses the Hidden token path nearly unchanged.
- **Players' screens just hide tokens in fog.** Every monster in every unexplored room would be one devtools panel away on a cloud table, where Hidden tokens and Traps are already kept off the wire.
- **Chunks as a jsonb array on the island row.** The islands Realtime handler applies the whole row, including to the DM's own client (`realtime.js:140`), so the echo of an earlier write briefly restores the previous state of every chunk on the island; with one row per chunk an echo can only touch its own chunk. It would also put a read-modify-write on a shared array behind every reveal.
- **Chunks on the layer canvas, spanning islands.** Islands have their own cell sizes and can be dragged, so which squares a chunk covers would change whenever an island moves.
- **"Fog this map" for every island on the layer.** A DM who wants one island fogged would have to delete the rest; per-island is one click each and each island then opens on its own.
- **Fog as a sub-tool of Draw.** The style popover, Snap to grid, the Eraser and both Clear actions would each need a fog exception, and drawings have undo history and no gameplay effect.
- **Fog under Mapping → Islands.** That surface is a settings panel; dragging rectangles on the map from inside it has no precedent and it is far from the map mid-session.
- **Corner tag as the only click target.** The DM would have to aim at a small tag to open a room mid-session, and tags pile up where chunks share a corner.
- **A popover at the click.** A new pattern beside the right panel and the token ring, with no natural phone form.
- **Reveal only at the moment a hero moves in.** A move the DM's browser missed during a reconnect is missed for good, and a hero who entered while the DM was away stays in the dark after the DM returns.
- **Move-triggered reveal plus a catch-up on load.** Re-fogging an occupied room would hold until the DM reloads the page and then pop open.
- **A reactive pass as the only writer of `fogged`.** The position write reaches players before the flag does, so a monster dragged into fog shows at its destination for a moment. The reconcile is a safety net behind the same-write rule.
- **A DM move into fog as `MOVE_ENTITY` then a flag update.** Same leak, on guest tables too: `toGuestBroadcastAction` forwards the move while the token is still unhidden.
- **Fogging by delete and re-insert, as `hideTrapRemote` does.** Deleting a monster also deletes the sound attached to it (`20250101000059_hidden_tokens_locked_doors.sql`, header).
- **Fogging a door by its home side alone.** A door standing in the open on its target layer would vanish there.
- **Hiding tokens by painting the cover above them.** Heroes and partly fogged tokens must show, and a painted-over token is still in the player's state.
- **Enforcing held-back chunks in the write trigger.** The trigger would need each hero's footprint tested against chunk rows on every move; entering a held-back chunk reveals nothing, since its tokens stay unreadable and it does not open.
- **Token privacy inside the tracer slice.** A new table, a new column, a policy and trigger rebuild and the stamping would all land before anything is demoable.
- **Merging "Reveals when entered" with held-back blocking.** One review would span the move path, the door path and guest validation.

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-10-08 | Blaxine | Initial plan, from a `/create-req` interview (token privacy, chunk scope, authoring tool, Play-tool control, auto-reveal rule, slices) and a deep-dive into `visibility.js`, `GameView.jsx`, `MapBoard.jsx`, `realtime.js`, `remoteApi.js`, `mappers.js`, `store.jsx` and the drawings, hidden-token, ambush and merchant migrations. |
