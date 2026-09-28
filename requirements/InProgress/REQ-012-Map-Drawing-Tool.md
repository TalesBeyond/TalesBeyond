# REQ-012 — Map Drawing Tool

| Field | Value |
| ----- | ----- |
| ID | REQ-012 |
| Title | Map Drawing Tool |
| Status | InProgress |
| Phase | Map annotation |
| Tier | Enhancement |
| Area | Map / Realtime / cloud, guest and local modes / phone layout |
| Author | Blaxine |
| Created | 2026-09-27 |
| Last Updated | 2026-09-27 |

## Short Description

Gives the DM a **Draw** tool for marking up the map: a pencil, straight lines, circles and rectangles, a colour wheel with quick swatches, line thickness, an optional translucent fill, a Snap to grid switch, a select tool to move and resize shapes, a whole-shape eraser, undo/redo, and clears for one island or the whole map. Drawings sit on the island they were drawn on, like chalk on the floor: over the map art and grid, under every token, and never changing the island or its image. Every seated player sees them, and they are saved with the table in cloud, guest and local tables. Players can only look; each viewer can hide the drawings in their own browser. The tool has full parity on phones.

## Constraints

- **A table missing from the `supabase_realtime` publication kills the whole channel.** Supabase then drops every `postgres_changes` binding on `table:<id>` while still reporting SUBSCRIBED (`src/lib/realtime.js`, `supabase/migrations/20250101000050_realtime_publication.sql`). The `drawings` migration must add its table to the publication itself, guarded the same way.
- **Tokens do not block drawing presses, but islands do.** `handleTokenPointerDown` (`src/components/MapBoard.jsx`) returns early outside the Play tool without stopping propagation, so a press on a token reaches the stage handler. `handleIslandPointerDown` stops propagation and starts an island drag for every tool except Ruler and Pan, so it must also skip the Draw tool.
- **An island's own SVG already clips to the island.** Each island renders inside `.grid-wrap` with an SVG sized to the island (`grid-svg`), and tokens are siblings rendered after the islands. A drawing SVG placed inside `.grid-wrap` is cut off at the island's edge and sits under the tokens, with no extra clipping code.
- **Touch on phones and tablets arrives as pointer events on the map.** `.stage` has `touch-action: none` in every layout, and `GameView`'s touch listener only pans with one finger in the Play tool. In Draw, the first finger's pointer events start a stroke, so a second finger (a pinch) must cancel that stroke without committing it.
- **Right-drag pans and the wheel zooms in every tool on desktop.** `MapBoard`'s capture-phase listener on `.stage` swallows right-button presses before any tool handler sees them.
- **Guest broadcast and snapshots pass new actions and state slices through untouched.** `toGuestBroadcastAction` returns unknown actions as they are, and `toGuestSnapshot` spreads the full state (`src/components/GameView.jsx`). Only the audio slice is stripped there.
- **Local tables and guest autosave keep the whole state in `localStorage`**, which also holds embedded island images (`src/state/persistence.js`, `saveOrWarn`). Pencil strokes must be stored compactly, or a busy map can push a local table past the browser's quota.
- **`fetchTableSnapshot` reads optional tables forgivingly** (`src/lib/remoteApi.js`), so a project without the migration can still be joined. Drawings follow the same rule.
- **The repo has no test runner** (`package.json` has no test script and there are no test files). Verification is the Smoke Test below.

## Architectural decisions

- **Who writes:** the DM alone creates, changes and deletes drawings, in every mode. Players only read. Every write helper is host-gated (PITFALLS.md #1).
- **Anchor:** every drawing belongs to exactly one island. It is stored with that island's id, moves with the island, and is deleted when the island or its layer is deleted. A drawing never moves to another island.
- **Geometry units:** coordinates are in grid squares relative to the island's top-left corner (floats; `0,0` is the top-left corner, `1,1` is one square in). They are independent of zoom and of the island's cell size.
- **Drawing record:** `{ id, islandId, kind: 'pencil' | 'line' | 'circle' | 'rect', geometry, style }`.
  - `geometry` by kind: pencil `{ points: [[x, y], …] }`; line `{ from: [x, y], to: [x, y] }`; circle `{ center: [x, y], radius }`; rect `{ x, y, w, h }` (normalized, `w, h > 0`).
  - `style`: `{ color: '#rrggbb', width: <preset key>, fill: boolean }`. `fill` is only honoured for circles and rectangles.
- **Stacking:** within an island, drawings paint in creation order, the newest on top. Moving or resizing a shape keeps its place in that order.
- **Cloud storage:** a `drawings` table, one row per drawing: `id uuid`, `table_id` (denormalized, as on `islands`), `island_id` referencing `islands(id) on delete cascade`, `kind` (checked), `geometry jsonb`, `style jsonb`, `created_at`, `updated_at` (touch trigger). Members read; only the host inserts, updates and deletes. The table is in the `supabase_realtime` publication.
- **State slice:** `state.drawings` (keyed by id) and `state.drawingOrder` (creation order), peers of `customAssets`/`customAssetOrder`. They are hydrated by `fetchTableSnapshot`, carried whole in guest snapshots and in the local and exported saves, and backfilled empty for older saves.
- **Sync:** one write per finished action, sent when the pointer is released: a new shape is an insert, a move or resize is an update, and an erase or clear is a delete. Nothing is sent while dragging. Cloud tables go through the `drawings` table and its realtime rows; guest tables go through `broadcastGuestChange` on the existing guest channel; local tables save the state.
- **Cascade:** deleting an island or a layer removes its drawings from state (a reducer pass after the remove, like the audio cascade), and from the database through the foreign key.
- **Rendering:** one drawing SVG per island inside the island element, above the map art, grid and day/night tint, below every token, with `pointer-events: none`. Selection handles and the in-progress shape render in their own overlay.
- **Tool:** `draw` joins the `tool` values (`play | edit | pan | ruler | group`). While it is active, a press on the map always acts for the current drawing tool, even on a token. The sub-tools are pencil, line, circle, rectangle, select and eraser.
- **Geometry rules:**
  - A circle grows outward from where the press started (radius = drag distance). A line and a rectangle go from the press point to the release point.
  - With Snap to grid on, rectangle corners snap to grid corners. Line ends and circle centres snap to the nearest grid corner or square centre. A circle's radius snaps to whole squares, at least 1. The pencil never snaps.
  - A shape with zero length, radius or area is discarded.
- **Feet read-out:** while a line, circle or rectangle is drawn or resized, a label shows its size in feet using the layer's `feetPerSquare`: line length (the ruler's 5-10-5 rule via `feetDistance` when snapped, straight distance otherwise), circle radius, rectangle width × height. It hides on release.
- **Pencil storage:** points are simplified and rounded before the write, and a stroke is capped at a fixed point count.
- **Per-browser preferences** (colour, recent colours, thickness, fill, Snap, Hide drawings) live under a `hearthbound:` key through `src/state/persistence.js` and are never synced.
- **Undo/redo:** a session-only history of the DM's own drawing actions (draw, erase, move, resize, clear) in this browser. Each undo or redo is applied as an ordinary write. History is lost on reload, and an entry whose island no longer exists is skipped.
- **Island shell:** the island `.json` download and import (`downloadIslandAsFile`, `importIsland`) stay grid and background only, without drawings. Shrinking an island keeps its drawings; the part outside the new edge is clipped, and growing the island back shows it again.

## UI / UX Notes

- **Desktop entry:** a **Draw** card in the Tools menu (`Toolbar.jsx` `ToolMenu`), host only, next to Edit and Merge Islands, with its own `TOOL_ICONS`/`TOOL_LABELS` entry.
- **Drawing bar (desktop):** floats over the map while Draw is active and holds:
  - the six sub-tools (Pencil, Line, Circle, Rectangle, Select, Eraser);
  - a colour button showing the current colour;
  - the thickness presets (3–4);
  - a Fill toggle, active for Circle and Rectangle;
  - a Snap to grid toggle;
  - Undo and Redo;
  - a Clear menu with "Clear this island" and "Clear this map".
  It follows the existing HUD look in `src/styles.css` (the encounter bar and ruler read-out).
- **Colour popover:** a hue wheel with a brightness slider, a row of 8 preset swatches, and the last 5 colours used. Picking any of them sets the colour for the next shape, and for the selected shape if Select has one.
- **Clears:** each asks for confirmation, naming the count ("Clear 7 drawings from Ruined Hall?"). The active island is the one "Clear this island" means.
- **Select:**
  - Clicking a shape selects the topmost one under the pointer. Dragging its body moves it; it stays on its island and may hang over the edge, where it is clipped.
  - Line handles are its two ends; circle handles are the centre (move) and a radius handle on the rim; rectangle handles are its four corners.
  - A pencil stroke shows only a bounding box and can be moved but not reshaped.
  - Esc or clicking empty map clears the selection.
- **Eraser:** a round cursor. Dragging it removes every shape it touches (edge or fill), each one whole.
- **Keyboard (desktop, Draw active, focus not in a text field):** Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z and Ctrl+Y redo; Delete/Backspace removes the selected shape; Esc clears the selection.
- **Hide drawings:** a per-browser switch for everyone. On desktop it's a toggle card in the Tools menu (players see Play, Pan, Ruler and this toggle). On a phone it's in the player table menu (`PhonePlayerMenu`) and in the DM's table menu (`PhoneHostMenu`), next to Look & sound.
- **Phone:**
  - **Draw** is a button in the Edit mode bar (`PhoneEditBar`) beside the island settings and Group.
  - While drawing, a compact bar above the bottom nav holds the six sub-tools, a colour dot, Undo, Redo and Done.
  - The colour dot opens a Phone sheet ("Drawing style") with the colour picker, thickness, Fill, Snap to grid and the two clears.
  - One finger draws; two fingers pan and pinch. Handles and bar targets are at least 44 px.
- **Empty and error states:** a failed cloud write reports through the existing `reportError` path. The shape stays drawn locally and reappears or disappears correctly on the next resync.

## Acceptance Criteria

- [ ] **AC1 — DM-only tool.** The DM finds Draw in the desktop Tools menu and in the phone Edit bar. Players have no Draw entry anywhere, and the database rejects a player's insert, update or delete on `drawings`.
- [ ] **AC2 — Four drawing tools.** With Draw active, the DM can draw a pencil stroke, a straight line, a circle growing from its centre and a rectangle by dragging. Each appears when the pointer is released; a zero-size shape is not kept.
- [ ] **AC3 — Drawings stay on their island.** A drawing belongs to the island it starts on. It is cut off at that island's edge, moves when the island (or its group) is dragged, and disappears when the island or its layer is deleted, in every mode.
- [ ] **AC4 — Stacking and presses.** Drawings cover the map art, grid and day/night tint but never a token, door, chest or its labels. Outside Draw, clicking and dragging tokens and islands works exactly as before. In Draw, a press on a token draws.
- [ ] **AC5 — Cloud sync and saving.** In a cloud table, every seated player sees a finished drawing, move, resize, erase or clear within about a second. A player who refreshes or joins later sees the same drawings.
- [ ] **AC6 — Guest and local tables.** In a guest table, joined players see the DM's drawings live, and the DM's autosave, Export and resume keep them. In a local table they survive a reload and an Export/Import round-trip. A save file from before this feature opens with no drawings and no error.
- [ ] **AC7 — Style.** The DM can pick any colour from the hue wheel and brightness slider, one of 8 swatches, or one of their last 5 colours; choose one of the thickness presets; and turn on a translucent fill, in the stroke's colour, for circles and rectangles. Every drawing keeps the style it was drawn with, and the DM's choices are remembered in their browser.
- [ ] **AC8 — Snap to grid and feet.** A Snap to grid switch in the drawing bar makes lines, circles and rectangles snap as the geometry rules describe; switched off, they follow the pointer freely. The pencil never snaps. While drawing or resizing a line, circle or rectangle, a label shows its length, radius, or width × height in feet.
- [ ] **AC9 — Select, move, resize.** With Select, the DM can move any drawing within its island, drag a line's ends, drag a circle's radius, and drag a rectangle's corners. Pencil strokes can be moved but not reshaped. Players see the result on release.
- [ ] **AC10 — Whole-shape eraser.** Dragging the eraser removes every drawing it touches, each one entirely.
- [ ] **AC11 — Undo and redo.** Undo and redo (buttons and keyboard) step through the DM's draws, erases, moves, resizes and clears in this browser session, and every step reaches the players. After a reload the history is empty.
- [ ] **AC12 — Clears.** "Clear this island" and "Clear this map" each ask for confirmation, naming how many drawings go, then remove exactly those drawings for everyone. A clear can be undone within the session.
- [ ] **AC13 — Hide drawings.** Any player or the DM can hide all drawings in their own browser. The setting survives a refresh and changes nothing for anyone else.
- [ ] **AC14 — Phone parity.** On a phone, a DM enters Draw from the Edit bar and can use every tool, the style sheet, undo/redo and both clears. One finger draws; two fingers pan and pinch without leaving a stray stroke. Players on phones see the drawings and can hide them.
- [ ] **AC15 — Island export and shrinking.** An island downloaded as `.json` carries no drawings, and importing one adds none. Shrinking an island clips its drawings at the new edge; growing it back shows them again.

## Technical Notes

- **Migration:** a new file in `supabase/migrations/` after `20250101000051_temp_hp.sql`, mirrored by hand into `supabase/00_combined_all_migrations.sql`.
  - The table, index and RLS follow `20250101000036_custom_assets.sql` (member `select`, host `insert`/`delete` keyed on `players.is_host`), plus a host `update` policy.
  - The touch trigger follows `islands` (`20250101000010_islands.sql`, `touch_updated_at()`).
  - The publication block copies the guarded loop in `20250101000050_realtime_publication.sql` for `drawings`.
  - `supabase/README.md` lists migrations and needs the new one.
- **Reducer (`src/state/store.jsx`):**
  - Add `drawings: {}` and `drawingOrder: []` to `createEmptyGameState`.
  - Add an upsert case and a remove case that takes a list of ids.
  - The island/layer cascade mirrors `AUDIO_CASCADE_ACTIONS` + `reconcileAudio`, run from the wrapping `reducer` after `REMOVE_ISLAND` and `REMOVE_LAYER`: drop every drawing whose `islandId` no longer exists on any layer.
  - `src/state/migrate.js` (`migrateLegacyState`) backfills both keys, as it does for `customAssets` and `audio`.
- **Cloud read and write:**
  - `src/lib/mappers.js` gets a row mapper beside `mapDbCustomAsset`.
  - `src/lib/remoteApi.js` `fetchTableSnapshot` gets a forgiving `drawings` query, ordered by `created_at` (the `custom_assets` block is the model), and returns `drawings`/`drawingOrder` with the rest. Insert, update and delete-by-ids helpers go beside `addCustomAssetRemote`/`removeCustomAssetRemote`.
  - `src/lib/realtime.js` gets a `drawings` listener shaped like the `audio_tracks` one: INSERT and UPDATE map to the upsert, DELETE to remove by `payload.old.id`. The host's own echoes are harmless because the upsert is idempotent.
- **Host write path (`src/components/GameView.jsx`):**
  - New host-gated functions follow `addCustomAsset`/`removeCustomAsset` and `updateClock`: local `dispatch`, then the remote call when `isRemote`, `broadcastGuestChange` when `isGuestHost`, else `saveOrWarn`.
  - Clears compute the doomed ids from `state` (island: `islandId === activeIslandId`; map: `islandId` in `currentLayer.islandOrder`) and send one delete.
  - `activeIslandId` and `currentLayer` already exist there.
- **Map (`src/components/MapBoard.jsx`):**
  - Rendering: the drawing SVG goes in the island loop after the `island-daynight` tint, sized `w × h`, scaling square units by `island.cellSize * zoom`.
  - Pointer handling: `handleStagePointerDown` gains a Draw branch shaped like the Ruler branch (`getRelativePoint`, `findIslandAt`, window `pointermove`/`pointerup` listeners). The island is fixed at press time, and points convert to island squares with `(p - islandLeft) / cellSize`.
  - `handleIslandPointerDown` must return early for `draw`.
  - Ruler clearing on tool change (the existing `useEffect` on `tool`) is the model for dropping an in-progress shape or selection when the tool changes.
  - `RulerOverlay`'s label is the look for the feet read-out; `feetDistance` and `pixelToCell` are in `src/utils/grid.js`.
- **Touch:** `touchGestureRef` (GameView → MapBoard `gestureRef`) already exposes `pinch` while two fingers are down. The Draw branch cancels its stroke when a pinch starts or a second pointer goes down.
- **Tools menu:** `Toolbar.jsx` holds `TOOL_LABELS`, `TOOL_ICONS` and the `ToolCard` list inside `ToolMenu`; the host-only cards sit in the `isHost &&` fragment.
- **Phone:**
  - `PhoneEditBar` (`src/components/PhoneChrome.jsx`) takes `onSettings`/`onGroup`/`onDone` and gains a Draw action; `GameView` renders it where `tool` is `edit`/`group`.
  - `PhoneSheet` is the container for the style sheet.
  - `PhonePlayerMenu` and `PhoneHostMenu` (`src/components/PhoneHostScreens.jsx`) take the Hide drawings switch, in the same style as `PhoneSwitch` for Mute on this device.
- **Preferences:** `src/state/persistence.js`'s `loadLocalAudioVolumes`/`saveLocalAudioVolumes` are the model: a namespaced key, `try/catch`, defaults when storage is unavailable.
- **Colour:** `Landing.jsx`'s `ColorPicker` is swatches only and is not reused; the wheel is new.
- **Geometry helpers** (snapping, hit-testing a point against a polyline, ring, filled circle, rectangle edge and fill, and pencil simplification) are pure functions in a new module under `src/utils/`.
- No test files or runner exist, so no `T`-phase steps are included.

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| F | Foundation |
| P | Persistence |
| S | Service |
| U | UX |
| D | Docs |
| X | Cross-doc / cleanup |

### Slice 1 — Tracer: a pencil stroke on a cloud table

**Demoable when:** in a cloud table the DM picks Draw from the Tools menu and drags a pencil stroke across an island, including over a token; a second browser seated as a player sees the stroke appear on release, under the token and cut off at the island's edge; both keep it after a refresh; a player has no Draw entry.
**Satisfies:** AC1 (desktop), AC4, AC5, AC3 (clipping)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S001 | P | Drawings schema | Migration: `drawings` table (columns per Architectural decisions, `island_id` cascading from `islands`), index on `table_id`, touch trigger, RLS (member select; host insert, update, delete), guarded add to `supabase_realtime`. Mirror into the combined file. | — | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql` |
| ✅ | S002 | F | State slice and reducer | `drawings` + `drawingOrder` in the empty state; upsert and remove-by-ids cases; drop drawings of removed islands after `REMOVE_ISLAND`/`REMOVE_LAYER`; backfill both keys for older saves. | — | `src/state/store.jsx`, `src/state/migrate.js` |
| ✅ | S003 | P | Snapshot, mapper, realtime | Row mapper; forgiving `drawings` fetch in `fetchTableSnapshot`, ordered by creation; realtime listener mapping INSERT/UPDATE to upsert and DELETE to remove. | S001, S002 | `src/lib/mappers.js`, `src/lib/remoteApi.js`, `src/lib/realtime.js` |
| ✅ | S004 | S | Write API and host write path | Remote insert, update and delete-by-ids; host-gated add/update/remove functions in `GameView` following the dispatch → remote / guest broadcast / local save pattern. | S003 | `src/lib/remoteApi.js`, `src/components/GameView.jsx` |
| ✅ | S005 | U | Drawing render layer | Per-island drawing SVG above the art, grid and tint, below tokens, `pointer-events: none`, scaling square units by cell size × zoom; renders pencil strokes. | S002 | `src/components/MapBoard.jsx`, `src/styles.css` |
| ✅ | S006 | U | Draw tool with the pencil | Host-only Draw card in the Tools menu (`draw` tool value, icon, label). In Draw, islands ignore presses; a stage press on an island starts a pencil stroke (even on a token), collects points in island squares, simplifies, rounds and caps them, and commits on release with a fixed default colour and width. Changing tool drops an unfinished stroke. | S004, S005 | `src/components/Toolbar.jsx`, `src/components/MapBoard.jsx`, `src/components/GameView.jsx`, new module under `src/utils/` |

### Slice 2 — Guest and local tables

**Demoable when:** a guest DM draws and a joined player sees it live; the DM refreshes, resumes, or exports and resumes, and the drawings are still there; a local table keeps its drawings across a reload and an Export/Import; an older export opens cleanly.
**Satisfies:** AC6

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S007 | S | Guest sync | Confirm drawing actions pass `toGuestBroadcastAction` and the slice rides `toGuestSnapshot`. Make sure a player's client never sends drawing actions, and the DM's intent handler ignores any it receives. Check guest autosave and file resume keep the slice. | S006 | `src/components/GameView.jsx`, `src/lib/guestRealtime.js` |
| ✅ | S008 | S | Local save and export | Local-mode writes save through `saveOrWarn`; the Export .bmp and Import round-trip carries the slice; `migrateLegacyState` backfills files that lack it. | S006 | `src/components/GameView.jsx`, `src/state/persistence.js`, `src/state/migrate.js` |

### Slice 3 — Shapes, Snap to grid and feet

**Demoable when:** from a drawing bar the DM draws lines, centre-out circles and rectangles; with Snap to grid on, they land on the grid; off, they follow the pointer; a feet label shows radius, length or width × height while dragging; the Snap choice survives a refresh.
**Satisfies:** AC2, AC8 (drawing)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S009 | U | Drawing bar (desktop) | Floating bar while Draw is active: Pencil, Line, Circle, Rectangle and a Snap to grid toggle; the sub-tool and Snap are kept as per-browser preferences. | S006 | `src/components/GameView.jsx`, `src/state/persistence.js`, `src/styles.css`, new component |
|  | S010 | S | Line, circle, rectangle | Drag to draw with a live preview in the overlay; circle from its centre, line and rectangle corner to corner; snapping per the geometry rules when Snap is on; rectangles normalized; zero-size shapes discarded; commit on release. | S009 | `src/components/MapBoard.jsx`, new module under `src/utils/` |
|  | S011 | U | Feet read-out | Ruler-style label during a line, circle or rectangle drag, using the layer's feet per square and `feetDistance` for snapped lines; hidden on release. | S010 | `src/components/MapBoard.jsx`, `src/styles.css` |

### Slice 4 — Style

**Demoable when:** the DM picks a colour from the wheel, a swatch or a recent colour, a thickness and Fill; new shapes use them, filled circles and rectangles are translucent in their stroke colour, and the choices survive a refresh.
**Satisfies:** AC7

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S012 | U | Colour picker | Colour button in the drawing bar opening a popover: hue wheel, brightness slider, 8 preset swatches, the last 5 colours used (per-browser preference). | S009 | new component, `src/state/persistence.js`, `src/styles.css` |
|  | S013 | U | Thickness and fill | 3–4 thickness presets and a Fill toggle (active for Circle and Rectangle); stored on each shape's `style`; rendered with a translucent fill; choices kept per browser. | S010, S012 | `src/components/MapBoard.jsx`, drawing bar component, `src/state/persistence.js` |

### Slice 5 — Select, move, resize and erase

**Demoable when:** the DM selects a circle and drags its rim to grow it while the feet label updates, moves a rectangle, drags a line's end, moves a pencil stroke, then erases two shapes in one drag; players see each change on release.
**Satisfies:** AC9, AC10, AC8 (resizing)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S014 | S | Hit-testing | Pure helpers: distance from a point to a polyline, a circle's rim, a rectangle's edges, and inside-fill tests; the topmost hit on an island in drawing order. | S010 | new module under `src/utils/` |
|  | S015 | U | Select, move, resize | Select sub-tool: click selects the topmost shape; handles per kind; body drag moves within its island; handle drags resize (snapping when on) with the feet label; pencil strokes move only; the colour, thickness and Fill controls restyle the selected shape; Esc, empty-map click and tool change deselect; Delete/Backspace removes it; commit as an update on release. | S011, S013, S014 | `src/components/MapBoard.jsx`, drawing bar component, `src/components/GameView.jsx` |
|  | S016 | U | Whole-shape eraser | Eraser sub-tool with a round cursor; every shape the drag touches is removed whole with a delete write. | S014 | `src/components/MapBoard.jsx`, drawing bar component |

### Slice 6 — Undo, clears, Hide drawings, island edges

**Demoable when:** the DM undoes and redoes a draw, a move, an erase and a clear with the keyboard and buttons while a player watches; clears the island and then the map after a confirm that names the count; a player hides drawings in their browser only; an island exported as `.json` has no drawings; shrinking and regrowing an island clips and restores them; deleting an island removes its drawings everywhere.
**Satisfies:** AC11, AC12, AC13, AC15, AC3 (moves and cascade)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S017 | S | Undo and redo | A session history of the DM's drawing actions with their inverses (insert ↔ delete, update ↔ previous values, clear ↔ re-insert); each step applied through the normal write path; entries whose island is gone are skipped; Undo/Redo buttons in the bar; Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y while Draw is active and focus isn't in a text field. | S015, S016 | `src/components/GameView.jsx`, drawing bar component |
|  | S018 | U | Clear this island / Clear this map | Clear menu in the bar; confirm naming the count and the island or map; one delete of those ids; recorded as one undo step. | S017 | drawing bar component, `src/components/GameView.jsx`, `src/lib/remoteApi.js` |
|  | S019 | U | Hide drawings | Per-browser switch for everyone: toggle card in the desktop Tools menu; the render layer hides when it's on. | S005 | `src/components/Toolbar.jsx`, `src/components/MapBoard.jsx`, `src/state/persistence.js` |
|  | S020 | S | Island edges and cascade | Verify drawings move with island and group drags; the island `.json` download and import carry no drawings; shrinking clips and growing restores; island and layer deletion clears drawings in cloud (foreign key + realtime), guest and local tables. | S008, S017 | `src/components/GameView.jsx`, `src/state/store.jsx` |

### Slice 7 — Phone

**Demoable when:** at 375 × 812 the DM taps Edit → Draw, draws with one finger, pans and pinches with two without leaving a mark, changes colour, thickness and Fill from the style sheet, selects and resizes a circle with 44 px handles, undoes, clears the island, and taps Done; a phone player sees the drawings and hides them from the table menu.
**Satisfies:** AC14, AC1 (phone), AC13 (phone)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S021 | U | Phone Draw entry, bar and style sheet | Draw button in `PhoneEditBar`; a compact drawing bar above the bottom nav (sub-tools, colour dot, Undo, Redo, Done); a "Drawing style" Phone sheet with the colour picker, thickness, Fill, Snap to grid and both clears; Hide drawings in `PhonePlayerMenu` and `PhoneHostMenu`. | S018, S019 | `src/components/PhoneChrome.jsx`, `src/components/PhoneHostScreens.jsx`, `src/components/GameView.jsx`, `src/styles.css` |
|  | S022 | S | Touch drawing | One-finger pointer input draws in Draw; a second pointer or a pinch cancels the unfinished stroke or drag without a write; two-finger pan and pinch unchanged; handles and hit radius sized for touch. | S021 | `src/components/MapBoard.jsx`, `src/components/GameView.jsx` |

### Slice 8 — Docs and thesaurus

**Demoable when:** the docs describe the Draw tool, its storage and its phone entry, and the thesaurus defines its terms.
**Satisfies:** —

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S023 | D | Docs | Describe the Draw tool and the `drawings` slice in `APP_OVERVIEW.md` and `SPEC.md` (client data shape, schema, realtime); add the phone entry to `MOBILE_DESIGN.md`; add the migration to `supabase/README.md`. | S022 | `APP_OVERVIEW.md`, `SPEC.md`, `MOBILE_DESIGN.md`, `supabase/README.md` |
|  | S024 | X | Thesaurus | Add Draw tool, Drawing, Drawing bar, Snap to grid, Hide drawings and Clear drawings to `THESAURUS.md`. | S023 | `THESAURUS.md` |

### Dependency graph

```
S001 ─┐
S002 ─┴→ S003 → S004 ─┐
S002 → S005 ──────────┴→ S006 → S007
                             ↘ S008
S006 → S009 → S010 → S011 ─────────┐
       S009 → S012 → S013 ─────────┤
              S010 → S014 → S015 ←─┘
                     S014 → S016
S015, S016 → S017 → S018
S005 → S019
S008, S017 → S020
S018, S019 → S021 → S022 → S023 → S024
```

## Dependencies

| REQ ID | Title | Reason |
| ------ | ----- | ------ |
| REQ-008 | Guest DM Sessions | Slice 2 rides its guest channel, `broadcastGuestChange`, guest snapshots, autosave and file resume. |
| REQ-011 | Phone Release | Slice 7 builds on its phone layout, `PhoneEditBar`, Phone sheets, table menus and touch gestures. |
| REQ-006 | Live Table Security Hardening | The `drawings` RLS follows its host-only write conventions. |
| REQ-001 | Connection Recovery | Players who drop and reconnect pick up missed drawings through its resync (`fetchTableSnapshot` + `HYDRATE`). |

## Out of Scope

- Live preview of an unfinished stroke or drag for players.
- Text labels, arrows with heads, polygons, cones and other shapes beyond the four.
- Partial (rubbing) erasing and reshaping pencil strokes.
- Moving a drawing from one island to another.
- Drawings inside the island `.json` export.
- Per-drawing visibility or DM-only drawings.
- Undo history that survives a reload or is shared between devices.
- Automated tests; the repo has no runner.

## Open Questions

- [ ] **Q1 — Pencil precision and cap.** What simplification tolerance and point cap keep strokes smooth without bloating a local save? Deferred until S006 lands; measure a long stroke's saved size and pick values that keep it under about 4 KB.
- [ ] **Q2 — Realtime DELETE filtering.** `drawings` deletes rely on the same `table_id` filter as `entities` deletes. Confirm at S003 that a player receives the DELETE for another player's table only; if deletes arrive unfiltered, ignore ids the client doesn't hold (the remove case already does).
- [x] **Q3 — Who draws resolved.** The DM alone draws; every seated player sees; each viewer can hide drawings locally. *(Blaxine)*
- [x] **Q4 — Anchor resolved.** A drawing belongs to the island it starts on, moves with it, is clipped at its edge and dies with it. *(Blaxine)*
- [x] **Q5 — Grow resolved.** Shapes are sized by dragging while drawing and can be selected, moved and resized afterwards; pencil strokes move only. *(Blaxine)*
- [x] **Q6 — Snapping resolved.** A Snap to grid button in the drawing bar switches between snapped and free shapes; circles grow from the centre with a feet read-out. *(Blaxine)*
- [x] **Q7 — Sync timing resolved.** Players see a drawing, move or resize when the DM releases; no live stroke preview. *(Blaxine)*
- [x] **Q8 — Island edges resolved.** Island `.json` exports carry no drawings; shrinking an island clips its drawings without deleting them. *(Blaxine)*

## Smoke Test

> Developer runs the app; the agent does not self-run.

1. In a cloud table as DM, open Tools → Draw and drag a pencil stroke from one island across its edge and over a monster. From a second browser seated as a player, confirm the stroke appears on release, under the monster, cut off at the edge, and survives both browsers refreshing. Confirm the player's Tools menu has no Draw. *(AC1, AC3, AC4, AC5)*
2. Switch to Play and confirm tokens and islands select and drag as before. *(AC4)*
3. Draw a line, a circle and a rectangle with Snap to grid on and off; watch the feet label while dragging; confirm a click without a drag leaves nothing. *(AC2, AC8)*
4. Pick a wheel colour, a swatch and a recent colour, a thick line and Fill; refresh and confirm the choices are remembered and every shape kept its own style. *(AC7)*
5. With Select, grow a circle from its rim, move a rectangle, drag a line's end, and move a pencil stroke; with Eraser, sweep across two shapes. Confirm the player sees each result. *(AC9, AC10)*
6. Undo and redo each of those with Ctrl+Z / Ctrl+Shift+Z and the buttons; clear the island, then the map, checking the counts in the confirms, and undo a clear. Refresh and confirm Undo has nothing to undo. *(AC11, AC12)*
7. As the player, turn on Hide drawings, refresh, and confirm it stays hidden for them only. *(AC13)*
8. Drag the island and its group; shrink it in map settings and grow it back; download it as `.json` and import it into another map; delete it. Confirm drawings follow, clip and return, don't travel in the file, and vanish for everyone on delete. *(AC3, AC15)*
9. Repeat steps 1, 5 and 8 on a guest table with a joined player; refresh the guest DM, then Export and resume from the file. Repeat step 1 on a local table and do an Export/Import round-trip; open an export made before this feature. *(AC6)*
10. On a phone (or 375 × 812), as DM: Edit → Draw, draw with one finger, pan and pinch with two, restyle from the sheet, resize a circle, undo, clear, Done. As a phone player, see the drawings and hide them from the table menu. *(AC14)*
11. Try a player's insert on `drawings` from the browser console with the Supabase client and confirm RLS rejects it. *(AC1)*

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| XL | 35–50 | A migration with RLS and realtime, a new state slice across cloud, guest and local modes, a drawing and selection engine with hit-testing and snapping, a colour wheel, undo/redo, and a phone surface with touch conflicts. Select/resize (Slice 5) and undo (Slice 6) carry the most risk. |

## Considered And Rejected

Nothing here is built. Each entry names the alternative, then why it lost.

- **Everyone draws, all see.** Needs per-player ownership and a rule for who erases whose strokes; the DM chose sole authorship.
- **Private per-browser drawings.** No sync or storage, but nothing can be shown to the table, which is the point.
- **DM toggle for player drawing.** A per-table setting and its UI for a capability nobody else gets.
- **One sheet over the whole map.** Drawing in the gaps between islands would work, but dragging an island leaves its arrows pointing at nothing.
- **Map-wide with an optional pin to an island.** Two coordinate systems and a pin UI for the same outcome.
- **Size only while drawing.** A misplaced spell area could only be erased and redrawn.
- **Resize without move.** Moving is the first thing people try on a selected shape.
- **Rubbing eraser.** Splitting vector shapes into fragments stops a cut rectangle being a rectangle, ending its resize handles, and makes every rub a write.
- **Raster canvas per island.** Pixels can't be selected, moved or resized, and a bitmap per island is far heavier to store and sync than a few shape rows.
- **Colour only, fixed width.** Spell areas become bare rings and thin lines vanish when zoomed out.
- **A separate opacity slider.** One more control on a phone sheet for a gain a fixed translucent fill already covers.
- **Session-only drawings.** A refresh mid-fight would lose the fireball template.
- **A temporary/pinned split.** Two kinds of drawing to explain and store.
- **Per-drawing DM-only visibility.** Needs row-level filtering on cloud tables and broadcast filtering on guest ones so hidden notes can't be read in dev tools; DM secrets stay in DM notes.
- **One switch hiding all drawings from players.** The synced data would still reach players, so it's a spoiler to anyone who inspects it.
- **Drawings above tokens.** A filled circle would hide who stands in it, and clicks outside Draw would have to pass through it.
- **Tokens win presses in Draw.** Circles couldn't be centred on a creature, the most common spell-area case.
- **Hold a key to draw.** Invisible, and it doesn't exist on phones and tablets.
- **Phone view-only or basic tools only.** Both break the phone DM's full-parity promise from REQ-011.
- **No undo, or undo without redo.** A mis-dragged resize or an accidental clear couldn't be recovered.
- **Clear only the active island, or only the whole map.** One takes a click per island; the other can't clean a single room.
- **Wheel only.** Every colour change is a precise drag, slow mid-fight and fiddly on a phone.
- **Swatches only.** Drops the colour wheel the DM asked for.
- **Snap always on, or Alt to go free.** The DM asked for a visible switch between snapped and free shapes.
- **Corner-to-corner (oval) circles.** Spell areas are centred on a point; a bounding-box circle hides its centre and radius.
- **A JSON list of drawings on each island row, or on the table row.** Every stroke would rewrite the whole list, or every drawing on every map, and two quick edits could overwrite each other.
- **A sixth phone nav button, or Draw sharing the Ruler slot.** Six targets shrink to about 60 px on a 375 px phone; sharing the slot makes the per-turn ruler two taps.
- **Live stroke preview.** Needs a second, unsaved broadcast path at about 10 messages a second beside the final write.
- **Drawings in the island `.json` export.** Changes the island-shell format for a reuse case nobody has asked for.
- **Deleting shapes that fall outside a shrunk island.** A shrink followed by a regrow in map settings would silently lose drawings.

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-09-27 | Blaxine | Initial plan, following a `/grill-me` interview that resolved scope and behaviour and a `/create-req` deep-dive that grounded it in the code. |
