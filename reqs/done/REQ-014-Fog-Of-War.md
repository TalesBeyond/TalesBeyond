# REQ-014 — Fog of War

| Field | Value |
| ----- | ----- |
| ID | REQ-014 |
| Title | Fog of War |
| SOLVE | — |
| Status | Done (awaiting Smoke Test) |
| Phase | Gameplay |
| Tier | Feature |
| Area | Map / Tokens / visibility / cloud, guest and local mode |
| Author | Blaxine |
| Created | 2026-10-08 |
| Last Updated | 2026-10-14 |

> Source PRD: REQ-014-PRD-Fog-Of-War.md

## Short Description

Lets the DM cover parts of an island with rectangular fog chunks that players see as an opaque cover. Every monster, NPC, chest, door, trap, bulletin board, portal and cover standing wholly inside fog is kept off players' maps the same way a Hidden token is, heroes always show, and a chunk opens for the whole table either by the DM's hand or when a hero stands in it. A chunk whose "Reveals when entered" setting is off is held back: players cannot move onto it or arrive in it through a door. Works on cloud, guest and local tables; chunks are laid on desktop and managed on desktop and phone.

## User Stories

1. As a DM, I want to cover parts of a map — or all of it — with rectangular chunks of fog, so that players only see the areas they have explored
2. As a DM, I want a fogged chunk to hide the map beneath it and keep every monster, NPC, chest, door and trap inside it off my players' maps, so that an unexplored room gives nothing away
3. As a DM, I want to reveal a chunk for the whole table by clicking it during play, and to fog it again if I need to, so that I control when a room opens and can undo a mistake
4. As a player, I want a fogged chunk to open when my hero steps into it, so that exploring the map reveals it without waiting for the DM
5. As a DM, I want to turn off "reveals when entered" on a chunk, so that a room I am holding back stays shut to players — on foot or through a door — until I open it

## Constraints

> Line numbers in this section and in *Technical Notes* were refreshed on 2026-10-14, after all five slices and the portal follow-up landed.

- **Realtime sends nothing when a row stops being readable.** A token that becomes fogged stays on a cloud player's map until the DM's client names it in a `conceal` broadcast (`src/lib/realtime.js:60`, `sendConceal` `:235`). A row that becomes readable arrives as an `UPDATE` for a row the client has never held; the entity handler (`realtime.js:87`) already upserts those for traps and every `canBeHidden` kind.
- **Bulletin boards, portals and covers have no database row** (`OFF_DATABASE_KINDS`, `src/lib/boardSync.js:32`; added after this plan was written). On a cloud table the DM's browser announces them over the table's channel (`announceBoards`, `GameView.jsx:1333`, and `announceEntityChange` `:1211`) and leaves out any that `isHiddenFromPlayers`; RLS plays no part. On guest and local tables they go through the same filters as every other token. So `fogged` hides them the same way, as long as the DM's client stamps it.
- **A portal is two tokens, one per end, linked by `linkId`** (`src/data/portals.js`, `portalPartner` `:36`). A player uses one only if their browser holds *both* ends (`enterPortal`, `GameView.jsx:3447`); an end they don't hold makes it "lead nowhere yet". Fogging each end on its own footprint would make every portal into fog a dead end for players.
- **Every token is painted in one layer above all islands** (`src/components/MapBoard.jsx:1368`). A cover drawn inside an island sits under every token, so any token that reaches a player's state is drawn on top of the fog. Token privacy rests on the token never arriving, not on paint order.
- **A guest DM's `MOVE_ENTITY` is forwarded unless the token was already hidden** (`toGuestBroadcastAction`, `src/components/GameView.jsx:393`), and a cloud `moveEntityRemote` leaves the row readable. A DM move into fog sent as a move followed by a flag update shows players the destination square first.
- **A door is one row with two sides**: its home square (`islandId`, `col`, `row`) and a second square on the target layer's base island (`targetCol`, `targetRow`), resolved per layer in `entitiesVisibleOnLayer` (`GameView.jsx:272`). One stored flag cannot describe both sides.
- **The current player read policy on `entities` is the one in `20250101000061_ambush_tokens.sql`; the current `enforce_entity_write_permissions()` is the one in `20250101000067_merchant_npcs.sql`.** Each migration that touches either rebuilds it whole from the previous version.
- **A table missing from the `supabase_realtime` publication breaks the whole table channel**, not just that table's events (`20250101000050_realtime_publication.sql`, repeated in `20250101000052_drawings.sql`).
- **Where a cloud player's hero may move is the client's call.** The hero-owner branch of the write trigger allows any `col`/`row`/`island_id`/`layer_id` on the player's own hero (`20250101000037_player_door_layer_move.sql` onward). On a guest table the DM's client validates the move (`applyValidatedIntent`, `GameView.jsx:1617`).
- **A dropped token is held at the drop square until synced state agrees or a timeout passes** (`holdDragAt`, `MapBoard.jsx:333`, called at `:380` and `:408` around `onMoveEntity`). A move refused afterwards reads as "moved, then snapped back".
- **Map art reaches every browser.** An island's background is a CSS background on `.grid-wrap` (`MapBoard.jsx:1228`), resolved from a fingerprint every seat can fetch. The cover hides it on screen only.
- **"The DM is away" lasts at most 3 minutes 5 seconds on cloud and guest tables.** Once the host's Presence entry is gone past `HOST_ABSENCE_GRACE_MS`, every player's session ends after `HOST_ABSENCE_END_MS` (`GameView.jsx:174-178`, `handleHostPresenceChange` `:623`). On a guest table a player's move is only an intent and goes unanswered meanwhile. The PRD's open-ended away case exists only in local mode and inside that cloud window.
- **Phones already have the Draw tool** (`PhoneDrawBar`, `GameView.jsx:4550`). The Fog of war tool gets no phone bar.
- **`fog` is taken.** It is an Island condition key (`src/data/islandConditions.js:11`) and a phone icon name (`src/components/PhoneChrome.jsx:49`).
- **Optional tables are fetched forgivingly in `fetchTableSnapshot`** (`src/lib/remoteApi.js`, the `drawings` block at `:268` and the `fog_chunks` one at `:279`), so a project that has not run a migration still loads.
- **The repo has no test runner** (`package.json` has no test script; `PITFALLS.md` #9). Verification is the Smoke Test.

## Architectural decisions

- **Naming:** the feature is "Fog of war" everywhere in the UI; the rectangle is a "fog chunk". New identifiers spell out fog of war or fog chunk, never bare `fog`. The Fog island condition is untouched.
- **A fog chunk belongs to one island.** Its rectangle is in whole grid squares from the island's top-left corner (`x`, `y`, `w`, `h`), like a Drawing's geometry. It moves with its island and is deleted with it. Squares of a chunk that fall outside the island's current `cols`/`rows` are ignored; the stored rectangle is never rewritten when the island is resized.
- **Schema — `fog_chunks`:** `id uuid`, `table_id` and `island_id` (both `on delete cascade`), `x`, `y`, `w`, `h` integers with `w >= 1` and `h >= 1`, `revealed boolean not null default false`, `reveal_on_enter boolean not null default true`, `created_at`, `updated_at`. Every seated member reads; only the host inserts, updates or deletes. Added to the `supabase_realtime` publication.
- **Schema — `entities.fogged boolean not null default false`.** The player read policy gains `and not fogged`; the write trigger treats a change to `fogged` like a change to `hidden` (DM only).
- **Client state:** `fogChunks` keyed by id plus `fogChunkOrder` (creation order) on the table state, beside `drawings`/`drawingOrder`, carried in the Table snapshot, the guest snapshot, the local save and the table export.
- **A square is fogged while at least one unrevealed chunk covers it.**
- **A token is fogged when it is not a hero and every square it occupies is fogged.** For a door that means every square on both of its sides. For a portal end it means every square of both ends; an end whose partner is missing or hidden by the DM goes by its own squares alone. A hero is never fogged. Bulletin boards and covers follow the plain rule.
- **`fogged` is derived data that only the DM's client writes**, in all three modes. `isHiddenFromPlayers` treats it as it treats `hidden`, so the cloud read policy, the guest broadcast filter and the local filter all apply to it unchanged.
- **Same-write rule:** any DM write that places a token, or changes its position, size, island or layer, carries the token's resulting `fogged` value in that same write. A DM move that changes `fogged` is sent as one entity update holding position and flag together, never as a move followed by a flag update.
- **Chunk changes restamp.** Laying, deleting, moving, resizing, revealing or re-fogging a chunk updates `fogged` on every token whose value changed, and on a cloud table sends `conceal` for each token that became fogged.
- **Reconcile:** when the DM's client first holds a table and after every resync, it corrects any token whose stored `fogged` disagrees with the chunks.
- **A door with one clear side stays readable**; each player client leaves out the side whose squares are all fogged.
- **A portal pair with one clear end stays readable, both ends** (`portalPartnerIn`/`isPortalEndFogged`, `src/utils/fogOfWar.js`). Each player client leaves out the end whose squares are all fogged, but still holds it, so the portal can be used from the clear end and its arrival is tested like a door's. Moving, linking, hiding or removing either end restamps both (`portalFogKey`, `GameView.jsx:2778`, and `linkId` among the same-write placement keys). As with a door's far side, a player's browser therefore knows where the fogged end stands.
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
- [ ] **AC7 — Tokens in fog do not exist for players.** A monster, NPC, chest, door, trap, bulletin board, cover, or portal pair whose every square is fogged is on no player's map. On a cloud table a non-host query for that row returns nothing, and a bulletin board, portal or cover (which has no row) is never announced on the table's channel; on a guest table it is never broadcast and is absent from a joining player's snapshot.
- [ ] **AC8 — Heroes and partly fogged tokens show.** A hero is shown wherever it stands. A token with at least one clear square is shown. A door is shown on a side that has a clear square and not on a side that has none; a portal is shown at an end that has a clear square and not at an end that has none.
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
- [ ] **AC22 — Portals into fog.** With a portal's near end clear and its far end in fog, a player can step through it. Arriving in a chunk with the setting on opens it; arriving in a held-back chunk is refused with the log line and no prompt (like AC15). The far end isn't drawn on the player's map until its chunk opens. When the DM moves the near end into fog too, both ends leave every player's map; moving it out brings them back.

## Technical Notes

> Refreshed on 2026-10-14 against the built feature. Where the plan pointed at a place to change, this now names what was built there.

**Where the feature lives**

- `src/utils/fogOfWar.js` — every pure rule: `clippedFogChunk` (`:16`), `fogChunkRectFromDrag` (`:29`), `isSquareFogged` (`:55`), `smallestFogChunkAt` (`:62`), `isFootprintFogged` (`:96`), the door sides (`doorTargetSide` `:117`, `isDoorHomeSideFogged`, `isDoorTargetSideFogged`), the portal ends (`portalPartnerIn`, `isPortalEndFogged`), `isEntityFogged`, `isFogChunkOccupied`, `fogChunksToRevealOnEnter`, `isHeldBackDestination`, and the chunk-editing maths (`fogChunkRectFromEdit`, `fogChunkGrabAt`).
- `src/components/FogOfWarLayer.jsx` — `IslandFogOfWar`, the players' cover and the DM's tint, outline and corner tag, rendered per island at `MapBoard.jsx:1285`.
- `src/components/RightPanel.jsx` — `FogChunkCard` (`:358`), with the "Reveals when entered" switch (`:387`) and the occupied-chunk Hint (`:405`).
- Migrations `20250101000068_fog_chunks.sql` and `20250101000069_fogged_tokens.sql`. The next free number is `20250101000073`.

**Privacy path**

- `src/data/visibility.js` — `isHiddenFromPlayers` (`:35`) is the single predicate and includes `isFogged` (`:29`); `entitiesShownTo` (`:54`) filters a player's entity map. `HIDEABLE_KINDS` (`:18`) governs only the DM's "Hidden from players" control and does not gate `fogged`.
- `src/components/GameView.jsx` — `entitiesVisibleOnLayer` (`:272`) is the local-mode filter and where a door's target side is resolved; it also leaves out a door side or portal end whose own squares are fogged. `toGuestBroadcastAction` (`:393`) turns a hidden→shown update into `ADD_ENTITY`, shown→hidden into `REMOVE_ENTITY`, and drops updates to a still-hidden token; `toGuestSnapshot` (`:426`) leaves hidden tokens out. `canPlayerUpdateEntity` (`:1884`) refuses any patch on a hidden token and any patch naming `hidden`, `locked` or `fogged`. The encounter effect around `:880` hands the turn back when it lands on a creature players cannot see.
- Cloud tables also announce every token change over the table's channel before the database write lands: `announceEntityChange` (`:1211`) runs each change through `toGuestBroadcastAction` first. Bulletin boards, portals and covers go out only this way, plus `announceBoards` (`:1333`).
- `src/lib/mappers.js` — `mapDbEntity` (`:81`, `fogged` at `:110`), `mapClientEntityToDb` (`:132`, `:164`), `mapClientEntityPatchToDb` (`:227`, `:251`).
- `src/lib/realtime.js` — the `conceal` handler (`:60`) re-reads the row and drops the token only if it is truly unreadable; the entity handler (`:87`) upserts for traps and hideable kinds; `sendConceal` (`:235`).
- `GameView.jsx` `updateEntity` (`:2214`) — the hide path, `updateEntityRemote(id, patch).then(() => tableChannelRef.current?.sendConceal(id))` (`:2268`), now also taken when `fogged` turns on.

**Same-write rule and restamping on the DM's client**

- `withFoggedStamp` (`GameView.jsx:2002`) adds the resulting `fogged` to any DM patch that changes a token's place (`FOG_PLACEMENT_KEYS`, including `linkId`). `addEntity` (`:2014`) stamps a token placed in fog from its first write; `moveEntity` (`:2174`) sends a move that changes `fogged` as one `updateEntity`; `revealAmbush` (`:2301`) stamps each spawned monster.
- The restamp and reconcile effect (just after `portalFogKey`, `:2778`) corrects every token whose `fogged` disagrees with the chunks, whenever layers, chunks or any portal end's position, link or hidden state change, and after each `HYDRATE`.
- `stateRef` (`:1061`) holds the current state for handlers that run outside a render.

**Chunk storage and sync**

- `src/state/store.jsx` — initial `fogChunks`/`fogChunkOrder` (`:176`), `reconcileFogChunks` (`:94`, drops chunks whose island is gone, after every reducer step), `SET_FOG_CHUNK` (`:528`), `REMOVE_FOG_CHUNKS` (`:538`). `src/state/migrate.js:56` defaults the keys on an older save.
- `src/lib/mappers.js` `mapDbFogChunk` (`:344`), `fogChunkToDb` (`:357`); `src/lib/remoteApi.js` `upsertFogChunkRemote` / `removeFogChunksRemote` (`:389-395`) and the forgiving fetch (`:279`); `src/lib/realtime.js:198` for the live handler.
- `GameView.jsx` — `writeFogChunk` (`:2673`), `deleteFogChunk` (`:2680`), `setFogChunkRevealed` (`:2703`), `setFogChunkRevealOnEnter` (`:2748`), and the reveals-when-entered effect (`:2762`). A guest player applies any broadcast action directly (`onStateChange`, `:1697`).

**Map rendering and input**

- `src/components/MapBoard.jsx` — per island, inside `.grid-wrap` (`:1228`): the `.island-daynight` tint (`:1280`), `IslandDrawings` (`:1282`), then `IslandFogOfWar` (`:1285`). Tokens are drawn afterwards in one layer above all islands (`:1368`). `toIslandSquares` (`:623`) converts a pointer to island squares; `pixelToCell` (`src/utils/grid.js:17`).
- Tool dispatch: `handleIslandPointerDown` (`:447`) returns early for `ruler`, `pan`, `draw`, `area`, `fogofwar`; `onIslandDragUp` (`:467`) resolves a Play-tool click (`onTapCell` at `:489`, the DM's chunk pick at `:499`); `handleStagePointerDown` (`:953`) starts the Fog of war drag (`startFogOfWar` `:861`); `handleStageClick` (`:994`). The `tool` prop's values are listed at `:64`.
- Drop path: `holdDragAt` (`:333`), called at `:380` and `:408`; at `:404` a refused move (`onMoveEntity` returning `false`) leaves the token where it was.

**Player movement, doors and portals**

- `moveEntity` (`GameView.jsx:2174`) is the one function every player move reaches: desktop drag, phone tap and planned move (`handleTapCell` `:4133`, `commitMove` `:4126`), and door and portal arrival. It refuses a held-back destination first (`refusedAsHeldBack` `:2161`, `isHeldBackMove` `:264`, log line `HELD_BACK_LOG`).
- `applyValidatedIntent` (`:1617`) — the `MOVE_ENTITY` branch (`:1620`) applies the same held-back check for a guest table's DM; a cloud table's announced moves are checked in `receiveEntityMessage` too.
- Doors: `enterDoor` (`:3405`), `doorArrivalHeldBack` (`:3514`), `confirmEnterDoor` (`:3540`), arrival square from `arrivalCellNearDoor` (`:223`).
- Portals: `enterPortal` (`:3447`), `portalArrivalHeldBack` (`:3482`), `confirmEnterPortal` (`:3490`); `portalPartner` (`src/data/portals.js:36`) looks the other end up among the entities the player holds.
- A token's footprint is `size × size` squares from (`col`, `row`); `size` is 1–5 (`src/data/tokenSizes.js`).

**Lifecycle hooks on the DM's client**

- Cloud resync: `runResync` (`GameView.jsx:958`) dispatches `HYDRATE`. Guest: the DM's state is local and authoritative. The reconcile and the reveals-when-entered check both run from the DM's client after it holds the table and after each `HYDRATE`.
- Two host clients (desktop and phone) may both run them; every write involved is idempotent.

**UI surfaces**

- `src/components/Toolbar.jsx` — the Fog of war icon (`:124`), `TOOL_ICONS` (`:216`), the tool's hint (`:234`) and its card (`:867`).
- `GameView.jsx` — the Fog of war Mode bar with "Fog whole island" (`:4643`); `RightPanel` (`:4405`); `MapBoard` (`:4484`); the phone fog sheet (`:4986`); `selectedId` (`:455`).
- `src/components/Hints.jsx` — `Hint` (`:87`), `ModeBar` (`:121`). `src/components/PhoneChrome.jsx` — `PhoneSheet` (`:173`), `PhoneSwitch` (`:634`). `src/components/Tour.jsx:35` — the Tools step's Fog of war line.
- `src/styles.css` — `.island-daynight` (`:2344`), `.fog-of-war-*` (`:2355-2407`), `.token.dm-hidden` (`:2588`).

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
| ✅ | S016 | S | Held-back rule in the move path | Pure function: whether a hero's destination footprint touches an unrevealed chunk with the setting off. `moveEntity` refuses such a move for a non-host and emits the log line. `applyValidatedIntent`'s `MOVE_ENTITY` branch applies the same check against the DM's state. | S013 | the S003 module, `src/components/GameView.jsx` |
| ✅ | S017 | U | The hero never lands | The map knows a drop is refused before it holds the token at the drop square, so the token returns at once. `handleTapCell` and the planned-move confirm refuse the same destinations. | S016 | `src/components/MapBoard.jsx`, `src/components/GameView.jsx` |
| ✅ | S018 | S | Doors | For a player, `enterDoor` and `confirmEnterDoor` refuse when the arrival square is held back, with the log line and no prompt. Arrival into a chunk with the setting on needs no code beyond S014. | S016 | `src/components/GameView.jsx` |

### Slice 5 — Whole island, editing, phone, docs

**Demoable when:** "Fog whole island" covers the active island in one click and a room chunk drawn on top stays fogged after the big one is revealed; the DM moves and resizes a chunk and a goblin on its edge appears and disappears for the player; a revealed chunk's corner tag re-fogs it from Play; on a phone the DM taps a fogged chunk and reveals it from a sheet, and no Fog of war tool is offered; the Tutorial's Tools step names Fog of war.
**Satisfies:** AC4 (corner tag), AC5 (from Play), AC16, AC17, AC18, AC20 · **Covers:** US1, US3

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S019 | U | Fog whole island | Mode-bar action creating one chunk the size of the active island, subject to S015. | S015 | `src/components/GameView.jsx` |
| ✅ | S020 | U | Move and resize a chunk | In the Fog of war tool, drag the selected chunk or its handles, in whole squares, with a live preview; the result is written once on release and restamped (S011). Delete and Backspace remove the selected chunk. | S011 | `src/components/MapBoard.jsx`, `src/components/GameView.jsx` |
| ✅ | S021 | U | Revealed-chunk corner tag | The tag on a revealed chunk's outline is the chunk's only click target in Play, for the DM. | S006 | `src/components/MapBoard.jsx`, `src/styles.css` |
| ✅ | S022 | U | Phone fog sheet | On the phone layout the DM's tap on a fogged chunk or a tag, when it was not used as a token move, opens the fog card in a Phone sheet. No tool entry on phones. | S015, S021 | `src/components/GameView.jsx`, `src/components/PhoneChrome.jsx` |
| ✅ | S023 | U | Tutorial and titles | Add the Fog of war line to the Tutorial's Tools step; check every new label against AC20. | S004 | `src/components/Tour.jsx`, `src/components/Toolbar.jsx` |
| ✅ | S024 | D | Glossary and docs | Add to `reqs/GLOSSARY.md`: Fog of war, Fog chunk, Held-back chunk, Reveals when entered; extend the Hidden token and Door entries with the fogged case. Update `APP_OVERVIEW.md` §4 (new Fog of war section; Toolbar; Map board) and §6 (schema, Realtime), `SPEC.md` §9.1–9.2, `PITFALLS.md` #1's list of what only the DM can do, and `MOBILE_DESIGN.md` §2. | S018, S022 | `reqs/GLOSSARY.md`, `APP_OVERVIEW.md`, `SPEC.md`, `PITFALLS.md`, `MOBILE_DESIGN.md` |

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
| REQ-015 | DM-Authoritative Cloud Tables | Lands after this one and changes how fog reaches players on a cloud table. Every table except `players` leaves the `supabase_realtime` publication, so fog chunks stop arriving through `realtime.js`'s `fog_chunks` handler and must travel in the DM's snapshot and channel messages. Players stop reading the database, so `fogged` tokens are kept from them by the DM's own filter (`toGuestBroadcastAction`, as on a guest table) rather than by RLS, and `conceal` loses its purpose. Non-hosts lose write grants on `fog_chunks` and `entities`, which AC10 relies on today through RLS. REQ-015 must keep AC7, AC9, AC10 and AC22 true through that change. |

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

- [x] **Q1 — Cover look resolved.** A textured cover: pale drifting mist, the same in both themes, as one cover per island cut to the fogged chunks so the texture never breaks at a chunk's edge. *(Blaxine)*
- [x] **Q2 — Reveal write volume.** *Closed (Blaxine, 2026-10-14): deferred to the Smoke Test.* One update per token per reveal: is it fast enough for a room of 30 or more tokens? Measure with 30 monsters in one chunk on a cloud table when the Smoke Test runs. If it is slow, the fix is batching one reveal's token updates into a single request (listed under Out of Scope).
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
4. Put a monster, an NPC, a chest, a trap, a door, a bulletin board, a cover and a hero inside a fogged chunk, and a 2 × 2 monster half in. The player sees the hero and the 2 × 2 monster only. In the player's network panel, the `entities` response holds none of the others, and no table-channel message carries the bulletin board or the cover. *(AC7, AC8)*
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
19. Place a portal pair with end A in the clear and end B inside a fogged chunk whose switch is on. The player's map shows A but not B. As the player, go through A: the hero arrives beside B and the chunk opens for both. Fog it again, turn its switch off, and try again: "That area is not open yet", no move. As DM, drag A into fog too: both ends leave the player's map; drag it out: both come back, B still not drawn. Repeat the first part on a guest table. *(AC22, AC8)*

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
| 2026-10-14 | Claude | Review against the built feature. Portals, bulletin boards and covers (added after this plan) are now covered: Constraints, a token rule for portal pairs like a door's (built in `868a7cd`: a portal into fog had been a dead end for players), AC7/AC8 extended, new AC22 and Smoke Test step 19. Added REQ-015 under Dependencies. Refreshed every line number in Constraints and Technical Notes, which now names what was built. |
| 2026-10-14 | Blaxine / Claude | Closed. Status set to Done (awaiting Smoke Test); the ACs stay unticked until it runs, and the encounter turn-order check is left for that pass too. Q2 closed as deferred to the Smoke Test. Moved with its PRD to `reqs/done/`. |
