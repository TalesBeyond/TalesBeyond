# REQ-002 — Island Merging And Import/Export

| Field | Value |
| ----- | ----- |
| ID | REQ-002 |
| Title | Island Merging And Import/Export |
| Status | Todo |
| Phase | Island authoring improvements |
| Tier | Core |
| Area | Map building / islands |
| Author | Blaxine |
| Created | 2026-09-08 |
| Last Updated | 2026-09-09 |

> Source PRD: REQ-002-PRD-Island-Merging-And-Import-Export.md

## Short Description

Two host-only island-authoring capabilities. First: dragging one island so it
overlaps another (past the app's existing edge-snap assist) offers to merge
them into one island that keeps both original islands' real shapes — each
becomes its own positioned "region" of the merged island, rather than being
collapsed into one filled rectangle — carrying over everything placed on
both. Second: any island's shell (grid + background + regions, no entities)
can be downloaded to a file and later re-imported as a brand-new island, in
local demo mode and cloud mode alike.

## User Stories

1. As a host building a map, I want overlapping islands to combine into one when I drag them together, so that I don't end up with two disconnected maps stacked in the same spot.
2. As a host merging two islands, I want to confirm the merge before it happens, so that an accidental drag doesn't cost me a map.
3. As a host, I want everything placed on the smaller island to carry over onto the surviving one when they merge, so that tokens, doors, and chests aren't lost in the process.
4. As a host, I want to save a map I've built to a file, so that I can reuse it later or share it with someone else.
5. As a host bringing a saved map back in, I want it added as a new map rather than replacing what I'm already working on, so that I don't lose anything currently in place.

## Constraints

- `pixelToCell` (`src/utils/grid.js:17-21`) already clamps a coordinate to `[0, cols-1]`/`[0, rows-1]` — reused as the safety-net clamp for every entity's recomputed position (on both islands) after the merged grid's bounding box and cell size are settled; in the normal case the union grid is sized to contain every entity's original world position exactly, so this clamp is a backstop, not the primary placement math. Entities are never region-aware — they place against the island's single overall `cols`/`rows`/`cellSize` exactly as before regions existed; only rendering and click/drop hit-testing care about regions.
- An island's `regions` (new, optional `jsonb` column) are small, fully described client-side, and owned entirely by their parent island — nothing else ever references a region by id, unlike islands themselves (`entities.island_id` points into that table). This matches the codebase's existing `jsonb`-for-small-owned-data precedent (`entities.sheet`, `entities.chest_items`, `entities.drop_items`) rather than a normalized child table with its own RLS policies and realtime subscription wiring.
- `snapIslandPosition` (`src/components/MapBoard.jsx:101-140`) already runs before the app repositions a dropped island, nudging it flush against a neighbor within 20px. A genuine overlap must be checked against the *post-snap* position — checking the raw drop position would pop a merge confirmation even when the user visually landed the island flush next to another with no overlap at all.
- The app has zero destructive-action confirmation UI anywhere today — `removeIsland`/`removeLayer` (`src/components/GameView.jsx:393-410`) execute instantly, and there is no use of `window.confirm` anywhere in `src/`. The merge confirmation is genuinely new UI, not a reuse of an existing pattern.
- `addIslandRemote` (`src/lib/remoteApi.js:176-179`) already exists and is used by `createIsland`'s cloud-mode branch (`GameView.jsx:384`). Importing an island in cloud mode needs no new remote-write logic — unlike the existing whole-table import (`GameView.jsx:475-496`), which is blocked in cloud mode today because it would have to replace every layer, island, and entity at once. Island import only adds one row and isn't affected by that limitation.
- A cloud-mode merge is multiple sequential Supabase writes (one `moveEntityRemote` per reparented entity, then one `removeIslandRemote`), not one atomic transaction — this matches the codebase's existing precedent for compound writes (`addLayerRemote`, `remoteApi.js:156-163`, inserts a layer row then a base-island row, un-transacted). There is no RPC in this schema that would make it atomic; a merge that fails partway is the same class of risk the codebase already accepts elsewhere.
- The repo has zero test files and no test runner configured anywhere (re-confirmed by search) — no `T`-phase steps; verification is the manual Smoke Test below.

## Architectural decisions

- Overlap detection lives in `MapBoard.jsx`'s existing island-drag-up handler, evaluated on the post-snap rectangle using each island's un-zoomed pixel footprint (`cols × cellSize`, `rows × cellSize`) — the same units `island.x`/`island.y` are already stored in.
- Which island is the "survivor" (its `id` and z-order win) is computed by the caller (`GameView.jsx`), not the reducer — the pixel-larger island wins, except the layer's base island always wins regardless of size. This mirrors the existing pattern where `createIsland` computes its own placement math rather than pushing it into the reducer.
- An island's own top-level `cols`/`rows`/`cellSize`/`x`/`y` stay exactly what they've always been — the *outer bounding box* used for every entity-placement, `pixelToCell`, ruler-distance, and `computeCanvasBounds` call, all completely unchanged by this feature. What's new is an optional `regions` array (`{ id, offsetX, offsetY, cols, rows, cellSize, backgroundImage }[]`, offsets un-zoomed pixels relative to the island's own `x`/`y`) used purely for rendering/hit-testing — which sub-rectangles of that bounding box are real (draw grid lines + that region's own background, count as "inside" the island for clicks/drops) versus void (render nothing, not part of the island). An island with no `regions` renders as one implicit region spanning its own flat rectangle — every existing/un-merged island, unaffected.
- Before any union/region math runs, `confirmMerge` calls `snapAbsorbedToClosestEdge(survivor, absorbed)`: picks whichever of the survivor's 4 edges the absorbed island's raw dropped position is closest to, snaps it flush against that edge, and aligns the perpendicular axis to the cell grid. Every downstream calculation (union bounds, region re-basing, entity world positions) uses this *snapped* position, not the raw one — otherwise a genuine overlap (which, unlike `snapIslandPosition`'s 20px assist, can land anywhere inside the other island) would leave the seam between the two regions at an arbitrary sub-cell offset, producing a messy crossed-border look where the two regions' independent borders don't line up. This is conceptually the same "closest edge" idea `snapIslandPosition` already uses for the pre-overlap drag assist, just unconditional (no 20px cap, since a confirmed merge always wants full alignment) and extended to also align the perpendicular axis to the cell grid.
- The perpendicular axis is *clamped* to the range that guarantees at least one shared cell with the survivor (`[1 - absorbedCells, survivorCells - 1]` in cell units), not just rounded to the nearest cell multiple. A plain round can tip a genuine-but-marginal overlap (less than half a cell — e.g. a corner drag that only barely crosses into the survivor) past the survivor's own edge, leaving the flush axis touching but the perpendicular axis with zero actual cell overlap — a "hairline" non-connection at a single point rather than a real merge. Clamping guarantees a real 1-cell connection even in the extreme case of a single square overlapping a single square, enabling corner-to-corner merges (not just the four full-edge-to-edge cases) and, over repeated merges, differently-shaped combined islands.
- `GameView.jsx`'s merge orchestration computes the union of both islands' world-pixel rectangles exactly as before (sizing `cols`/`rows` in the survivor's `cellSize`) for entity-placement purposes, but instead of rasterizing both backgrounds into one image, it takes each side's own region(s) (or an implied single region, for a not-yet-merged island) and re-bases their offsets onto the new shared origin — no image compositing, no `async`/`<img>` loading, and a merge of islands with different original `cellSize` no longer needs lossy rescaling since each region keeps its own. Entity repositioning is unchanged from the previous revision (every entity on *either* island recomputed via `pixelToCell` against the new origin — the survivor's own entities can shift cell index too, since the union's origin can sit up/left of where the survivor's own origin used to be).
- One reducer case, `MERGE_ISLANDS { layerId, survivorId, absorbedId, islandPatch, entityPositions }` (unchanged by this revision): applies the caller's precomputed `islandPatch` (now `x`, `y`, `cols`, `rows`, `regions` instead of `backgroundImage`) to `survivorId`, applies each `{ id, col, row }` in `entityPositions`, and removes `absorbedId`. The reducer does no geometry itself — `regions` is just another field it blindly spreads onto the survivor, the same as every other patch field.
- `MapBoard.jsx`'s rendering and click/drop hit-testing become region-aware: the per-island `<div>` in the render loop becomes one `<div>` per region (each still wired to the same whole-island drag/select handler), and `findIslandAt` (used for token drops, ruler points, door clicks) tests a point against each region individually instead of the island's outer bounding box, so a click/drop in the "void" gap between two merged regions correctly misses. Overlap detection during a drag (`findOverlappingIsland`, used to trigger the merge-confirm modal) deliberately stays bounding-box precision, not region precision — simpler, and a near-miss is still worth offering a merge confirm.
- The merge confirmation is a new custom modal matching `MapSettingsPopover`'s existing visual chrome, driven by new "pending merge" local state in `GameView.jsx`. `MapBoard` reports a detected overlap via a new `onIslandOverlap(draggedId, overlappedId)` callback in place of calling `onMoveIsland` for that drag; declining needs no extra code; since nothing is dispatched, the dragged island's stored `x`/`y` never changed and the drag's own visual-reset cleanup already puts it back.
- Cloud-mode sync for a confirmed merge reuses `updateIslandRemote` (once, for the survivor's own changed row), `moveEntityRemote` (once per repositioned entity, both islands), and `removeIslandRemote` (once for the absorbed island) exactly as they exist today — no new `remoteApi.js` functions for this.
- Export writes five fields — `name`, `cols`, `rows`, `cellSize`, `backgroundImage`, `regions` — no `id`, no position, no entities. `regions` is a later addition to the original four-field scope: without it, exporting a merged (multi-region) island would silently lose its real shape and carry a stale/meaningless top-level `backgroundImage`. Defaults to `[]` for a plain island, so the field is harmless for the common case.
- `createIsland` and `importIsland` share one `placeAndAddIsland(island)` helper (extracted from `createIsland`'s existing next-to-the-active-island placement logic) — both build an island object (`createInitialIsland` with either UI defaults or the imported file's `name`/`cols`/`rows`/`cellSize`/`backgroundImage`/`regions`) and hand it to the same placement-plus-dispatch-plus-conditional-remote-call code, so import gets the identical collision-avoiding placement and cloud-sync behavior as creating a plain island, with zero duplicated logic.

## UI / UX Notes

- "Download island" lives inside the existing Map settings popover (`MapSettingsPopover`, `Toolbar.jsx:306-382`), host-only, alongside the existing background-image upload control.
- "Import island" lives inside the existing Islands panel (`IslandManagerPopover`, `Toolbar.jsx:486-576`), next to "+ Add island", using a hidden file input that mirrors the whole-table import's existing `importRef`/`handleImportFile` pattern (`Toolbar.jsx:64,131-136`).
- The merge confirmation is a new on-canvas popover matching `MapSettingsPopover`'s chrome (dark background, gold border), naming both islands and stating the outcome ("Merge into <survivor>? Everything on <absorbed> will move onto it."), with Accept/Cancel actions.
- The pixel-larger-wins rule, the base-island exception, and entity clamping are silent behavior — nothing in the UI surfaces them beyond the merge's visible result. A merged island's regions render as separate bordered boxes (the existing per-island chrome, reused as-is per region) rather than one seamless traced outline — a deliberate scope cut, not a bug; see Considered And Rejected.
- Both features are host-only, matching every other island-editing control in the app; no player-facing UI changes at all.

## Acceptance Criteria

- [x] **AC1 — Overlap triggers the modal.** Dragging an island (Edit tool, host) so its post-snap rectangle overlaps another's opens the confirm modal naming both islands; a drag that only snaps flush, with no leftover overlap, behaves exactly as it does today. *Verified live 2026-09-09.*
- [x] **AC2 — Decline leaves everything untouched.** Dismissing the modal leaves both islands at their pre-drag positions and dispatches no state change. *Verified live 2026-09-09.*
- [x] **AC3 — Confirm merges correctly.** Confirming produces one island whose own `cols`/`rows`/`cellSize` still cover the union of both original footprints (entity placement is unaffected), but which *renders and hit-tests* as both islands' own real shapes (each its own region) rather than one filled rectangle — no grid lines, background, or click/drop response in the gap between them — every entity from both islands repositioned onto the new grid (clamped to its nearest valid cell if a translated position ever falls outside it), and the smaller island removed as a separate island. The absorbed island's region is snapped flush against whichever of the survivor's edges it's closest to, with the perpendicular axis aligned to the nearest whole cell, so the seam is always a clean cell-for-cell connection regardless of the raw pixel position it was dropped at. *Verified live 2026-09-09 — merged island rendered as exactly two separate bordered boxes at their real relative positions (confirmed via `getBoundingClientRect` on both `.grid-wrap` divs), the gap between them showed the dark canvas background rather than parchment, the absorbed entity landed at the exact hand-calculated cell, dragging a token into the void gap was correctly rejected (position unchanged), and merging a third island in produced 3 composed regions with no crash. `mapDbIsland`/`mapClientIslandPatchToDb`'s `regions` round-trip and null→`[]` fallback also confirmed directly. Edge-snap re-verified 2026-09-09 after a host screenshot showed a messy crossed-border seam from a deliberately unaligned drop — dropping an island well off-grid mid-overlap now snaps to a flush, cell-aligned seam (`offsetX`/`offsetY` both exact multiples of `cellSize`) instead.*
- [x] **AC4 — Base island always survives.** If either island is the layer's base island, the merge keeps that island's `id` (so it remains the layer's permanent base) and its `cellSize` governs the combined grid, regardless of which one is pixel-larger. *Verified live 2026-09-09.*
- [ ] **AC5 — Cloud mode mirrors local mode.** In cloud mode, a confirmed merge is reflected in Supabase (the survivor's row carries its new `x`/`y`/`cols`/`rows`/`regions`; the absorbed island's row is gone; every affected entity's row carries the survivor's island id and translated position), and a second connected client sees the result after its next update. *S005 implemented (2026-09-09) — `updateIslandRemote`/`moveEntityRemote`/`removeIslandRemote` call shapes verified against `remoteApi.js`'s actual signatures, and a local-mode merge confirmed the new `isRemote` branch doesn't fire or break anything when disconnected. Not yet verified live against a real hosted table (this environment has no Supabase credentials) — needs a manual check with two connected browser tabs.*
- [x] **AC6 — Export produces a shell-only file.** Exporting the active island downloads a JSON file containing exactly its name, cols, rows, cellSize, backgroundImage, and regions — no id, position, or entities. (`regions` added to the original 5-field scope so a merged, multi-region island's real shape survives the round trip instead of collapsing to its stale top-level `backgroundImage`; empty `[]` for a plain island, so old single-rectangle semantics are unaffected.) *Verified live 2026-09-09 — intercepted the download `Blob` via the real "Download island" button click and confirmed the exact JSON shape.*
- [x] **AC7 — Import adds a new island in local mode.** Uploading a previously exported file creates a brand-new island on the current layer at a non-overlapping default position, carrying the file's grid, background, and regions, without altering the island currently selected. *Verified live 2026-09-09 in local mode — a synthetic 2-region file imported correctly (rendered as its real two-box shape, `getRelativePoint` etc. unaffected), the previously-active island was untouched, and the whole-table export/import flow (`readJsonFromFile`'s other caller) was regression-checked and still works. Cloud mode reuses the exact same `addIslandRemote` call `createIsland` already made (no new remote-write code — see Constraints) but wasn't live-verified against a real hosted table (no Supabase credentials in this environment).*
- [x] **AC8 — Bad import is rejected cleanly.** Uploading a file missing or mistyping any required shell field shows an alert and creates no island. *Verified live 2026-09-09 — both a well-formed JSON file missing `cols` and a non-JSON garbage file were rejected with the correct alert message and no island created.*

## Technical Notes

- `src/state/store.jsx:126-137` (`ADD_ISLAND`), `:150-178` (`REMOVE_ISLAND`) — the patterns the new `MERGE_ISLANDS` case follows; its entity-reposition loop mirrors `REMOVE_LAYER`'s existing entities/entityOrder rebuild loop (`store.jsx:99-109`), but patches rather than drops entities.
- `src/components/MapBoard.jsx:101-140` (`snapIslandPosition`), `:224-245` (`onIslandDragUp`) — where the overlap check attaches, after snapping. `islandRects` (`MapBoard.jsx:42-51`) already computes each island's on-screen rectangle per render; the un-zoomed footprint needed for overlap math is `island.cols * island.cellSize` / `island.rows * island.cellSize` (stored `x`/`y` are already un-zoomed per the comment at `store.jsx:7-9`). Unchanged by the redesign — this, `snapIslandPosition`, and `findOverlappingIsland` all stay bounding-box precision; only the island render loop and `findIslandAt` became region-aware.
- `src/utils/grid.js:17-21` (`pixelToCell`) — reused as the per-entity clamp once the union grid/origin are known.
- `supabase/migrations/20250101000021_island_regions.sql` — `alter table islands add column if not exists regions jsonb not null default '[]'`, following the `jsonb`-for-small-owned-data precedent in `20250101000008_character_sheets.sql`/`20250101000011_chests.sql` rather than a normalized child table (see Constraints). No backfill needed — every existing island's `regions` defaults to `[]`, which already means "render as one flat rectangle."
- `src/lib/mappers.js:25-52` (`mapDbIsland`/`mapClientIslandPatchToDb`) — `regions` added to both, following the file's existing sparse-patch idiom (`if ('regions' in patch) db.regions = patch.regions;`).
- `src/components/GameView.jsx:371-403` (`createIsland`/`updateIsland`/`moveIsland`/`removeIsland`) — the dispatch-plus-conditional-remote-call pattern every new island-mutating function here follows; `createIsland` places a new island next to the layer's active island (not the rightmost edge across every island on the layer — a merge can make one island's own footprint large enough that anchoring off the layer-wide edge would place a new island far from wherever the host is actually working), reused by import.
- `src/components/GameView.jsx:612-635` — `MapBoard`'s prop wiring; `onMoveIsland={moveIsland}` is where the new `onIslandOverlap` callback is added alongside.
- `src/lib/remoteApi.js:176-188` (`addIslandRemote`/`updateIslandRemote`/`removeIslandRemote`), `:207-210` (`moveEntityRemote`) — reused as-is; no new `remoteApi.js` functions are needed for islands, only new call sites in `GameView.jsx`.
- `src/state/persistence.js:64-74` (`downloadSessionAsFile`), `:114-127` (`readSessionFromFile`) — existing whole-table download/upload primitives. New island-level export/import add sibling functions following the same Blob/FileReader pattern; `readSessionFromFile` is generalized into a plain `readJsonFromFile(file)` used by both the existing table-level import and this feature's island-level import.
- `src/components/GameView.jsx:471-496` (`exportTable`/`importTable`) — existing precedent for file-naming and validation-alert copy ("That file does not look like a Hearthbound table export.") to mirror for island-level messages.
- `src/components/Toolbar.jsx:201-222` (popover wiring), `:306-382` (`MapSettingsPopover` body), `:486-576` (`IslandManagerPopover` body) — exact insertion points for the new Download/Import controls.
- This feature adds one new column (`islands.regions`, migration `20250101000021_island_regions.sql`) and no new tables/RPCs — every write still goes through the existing `islands` row/`updateIslandRemote` function, just with one more field in the patch.

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| F | Foundation |
| S | Service |
| U | UX |
| D | Docs |

### Slice 1 — Merge islands on overlap, local mode

**Demoable when:** in local mode, dragging one island onto another (past the edge-snap distance) pops the confirm modal naming both islands; confirming produces one island that renders as both original islands' own shapes side by side (not one filled rectangle), every token/door/chest from both islands repositioned onto it, and the absorbed island gone; declining leaves both islands exactly where they were.
**Satisfies:** AC1, AC2, AC3, AC4 · **Covers:** US1, US2, US3

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S001 | F | Overlap detection | After `snapIslandPosition` resolves the drop position, compute the post-snap rectangle and check it against every other island's un-zoomed footprint; when one overlaps, call a new `onIslandOverlap(draggedId, overlappedId)` prop instead of `onMoveIsland`. | — | `src/components/MapBoard.jsx` |
| ✅ | S002 | F | `islands.regions` column + `MERGE_ISLANDS` reducer case | New migration adding `islands.regions jsonb not null default '[]'`, plus `mapDbIsland`/`mapClientIslandPatchToDb` support. `MERGE_ISLANDS` given `{ layerId, survivorId, absorbedId, islandPatch, entityPositions }` applies `islandPatch` (now including `regions`) to `survivorId`, patches every entry in `entityPositions` onto its entity, and removes `absorbedId` — a thin patch-applier with no geometry of its own. | — | `supabase/migrations/`, `src/lib/mappers.js`, `src/state/store.jsx` |
| ✅ | S003 | S | Merge orchestration | `confirmMerge` in `GameView.jsx`: on a pending merge, compute the union bounding box (survivor's `cellSize`, for entity placement only), re-base each side's own region(s) — or an implied single region, for a not-yet-merged island — onto the new shared origin and concatenate them, recompute every entity on either island against the new origin via `pixelToCell`, then dispatch S002's action. `onIslandOverlap` still just opens the pending-merge modal state. | S001, S002 | `src/components/GameView.jsx` |
| ✅ | S004 | U | Confirm modal + per-region rendering | On-canvas popover matching `MapSettingsPopover`'s chrome, naming both islands, with Accept/Cancel wired to S003. `MapBoard`'s island render loop and `findIslandAt` become region-aware (one bordered box per region; hit-testing checks each region instead of the outer bounding box), so a merged island visually traces its real shape. | S003 | `src/components/GameView.jsx`, `src/components/MapBoard.jsx`, `src/styles.css` |

### Slice 2 — Merge sync to cloud mode

**Demoable when:** the same drag-overlap-confirm flow against a hosted cloud table is reflected in a second connected browser tab after its next update.
**Satisfies:** AC5 · **Covers:** US1, US2, US3

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S005 | S | Remote merge writes | On confirm, when `isRemote`: `updateIslandRemote(survivorId, { x, y, cols, rows, regions })` (the survivor's own row now changes — its `x`/`y`/`cols`/`rows` grow to the union and it gains `regions` — unlike the original absorb-and-discard design this step was first scoped against, where the survivor's row never changed), `moveEntityRemote` for every entry in `entityPositions` (both islands' entities, not just the absorbed one), and `removeIslandRemote(absorbedId)`. Three sequential fire-and-forget writes, same non-transactional pattern as `addLayerRemote`. | S003 | `src/components/GameView.jsx` |

### Slice 3 — Export an island to a file

**Demoable when:** clicking "Download island" in Map settings for any island downloads a JSON file containing only its shell fields.
**Satisfies:** AC6 · **Covers:** US4

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S006 | F | `downloadIslandAsFile` | New function serializing `{ name, cols, rows, cellSize, backgroundImage, regions }` to a downloaded JSON file, named from the island's name. | — | `src/state/persistence.js` |
| ✅ | S007 | U | Download button | "Download island" button in `MapSettingsPopover`, host-only, calling S006. | S006 | `src/components/Toolbar.jsx` |

### Slice 4 — Import an island from a file

**Demoable when:** clicking "Import island" in the Islands panel and picking a previously exported file adds a new island at the default placement, in local mode and cloud mode alike.
**Satisfies:** AC7, AC8 · **Covers:** US5

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S008 | F | Generic file-JSON reader | Generalize `readSessionFromFile` into `readJsonFromFile(file)`, updating the existing whole-table import call site to use it. | — | `src/state/persistence.js`, `src/components/GameView.jsx` |
| ✅ | S009 | S | `importIsland` + shared placement helper | `createIsland`'s placement/dispatch/remote-sync logic extracted into `placeAndAddIsland(island)`. `importIsland` reads and validates the file's required shell fields (name/cols/rows/cellSize; alert and no-op on failure), filters malformed `regions` entries, builds the island via `createInitialIsland` with the file's fields, and hands it to `placeAndAddIsland`. | S008 | `src/components/GameView.jsx` |
| ✅ | S010 | U | Import button | "Import island" button and hidden file input in `IslandManagerPopover`, mirroring the existing whole-table `importRef`/`handleImportFile` pattern. | S009 | `src/components/Toolbar.jsx` |
| ✅ | S011 | D | Thesaurus update | Added "Merge", "Region", and "Island shell" to `THESAURUS.md`. | S004, S007, S010 | `THESAURUS.md` |

### Dependency graph

```
S001 → S003 → S004
S002 → S003
S003 → S005
S006 → S007
S008 → S009 → S010
S004, S007, S010 → S011
```

## Out of Scope

- Any change to `snapIslandPosition`'s existing edge-snap behavior — merge only observes its output, never alters when or how it snaps.
- A dedicated undo for a completed merge — no state-snapshotting machinery is added for this.
- Server-side/RPC atomicity for the cloud-mode merge writes — accepted as consistent with existing non-transactional compound writes elsewhere in this codebase.
- Reworking the existing whole-table `exportTable`/`importTable` flow — untouched beyond extracting the shared `readJsonFromFile` helper in S008.
- A Store placeable — a separate requirement entirely.
- A true non-rectangular/polygon island shape, or a seamless traced perimeter outline where two regions touch — regions are rectangles, each rendered with its own full border, so a merged island looks like two (or more) bordered boxes placed together rather than one shape with a single continuous edge.
- Manually editing a region's own position/size/background after a merge — `MapSettingsPopover` still only edits the island's overall name/grid/feet-per-square, unchanged.

## Smoke Test

> Developer runs the app; the agent does not self-run.

1. In local mode, create two islands on the same layer, place a hero, a door, and a chest on the smaller one (including one near a far corner), then drag it to overlap the larger island well past the edge-snap distance. Confirm the modal appears naming both islands. *(AC1)*
2. Decline the modal; confirm both islands are exactly where they were and nothing on the map changed. *(AC2)*
3. Repeat the drag and confirm; check the result renders as both original islands' own shapes side by side (their own borders, grid lines, and backgrounds, at their real relative positions) — not one filled rectangle, and no grid/background in the gap between them if they don't fully align — the smaller island is gone, and every entity from both islands now appears on the combined island — including the corner-placed one, which should land clamped to a valid edge cell rather than disappearing. Try clicking/dropping a token in the gap area and confirm it doesn't register as landing on the island. *(AC3)*
4. Repeat with the layer's base island as the pixel-smaller of the two; confirm the base island's `id` survives (still the layer's permanent base) and its `cellSize` governs the combined grid. *(AC4)*
5. Repeat the whole flow against a hosted cloud table with a second browser tab open on it; confirm the second tab reflects the merge after its next update. *(AC5)*
6. Open Map settings for any island and click "Download island"; open the downloaded JSON and confirm it contains only name/cols/rows/cellSize/backgroundImage/regions (empty `[]` for a plain island). Repeat for a merged (multi-region) island and confirm its `regions` entries are present. *(AC6)*
7. Open the Islands panel and import that same file, once in local mode and once against a cloud table; confirm a new island appears at a non-overlapping position carrying the file's grid/background/regions (a merged-island export should re-import as its real multi-box shape, not one flat rectangle), and the previously active island is untouched, in both cases. *(AC7)*
8. Try importing an unrelated JSON file (e.g. one missing `cols`); confirm an alert appears and no island is created. *(AC8)*

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| L | 14–18 | Four independently demoable slices touching the reducer, two existing popovers, new modal UI, and file I/O twice; no new schema or migrations, but more surface area than a typical M-sized plan in this repo. |

## Considered And Rejected

- **Detecting overlap on the raw drop position instead of after `snapIslandPosition`.** A near-miss the user clearly meant as "snap flush" would instead pop a merge confirmation, fighting an assist the app already has.
- **Ranking "larger" by cell count (`cols × rows`) instead of pixel footprint.** Two islands with very different `cellSize` could rank in a way that contradicts what actually looks bigger on screen, and pixel footprint is what overlap is already measured in.
- **Native `window.confirm()` for the merge prompt.** Resolves synchronously with no new state to manage, but looks like a browser dialog rather than the app's own chrome. This feature is a natural point to introduce the app's first real confirm modal rather than defer that gap further.
- **Rolling back a merge if any Supabase write in the sequence fails.** No RPC or transaction exists for a multi-row write in this schema, and building one is a bigger change than this feature warrants — the plan accepts the same eventual-consistency risk the codebase already accepts elsewhere (`addLayerRemote`).
- **Dropping or blocking entities that don't fit the survivor's grid after translation, instead of clamping.** Both were weighed during grilling; clamping was chosen so nothing is ever silently lost and no otherwise-valid merge is refused outright.
- **Adding an undo action for a completed merge.** The app has no undo/redo anywhere; adding one just for this feature would be a much larger change than the feature itself.
- **Absorb-and-discard (the survivor's own grid/background stay untouched; the smaller island's background is simply thrown away), the original design for this slice.** Replaced after host feedback clarified the intent: a merge should read as one island visually combining both original islands' shapes/backgrounds (like a square fusing with an L), not as one island quietly swallowing the other's tokens while discarding its map art.
- **Combined-canvas merge (a single union-sized rectangular grid with both backgrounds rasterized into one composited image), this slice's second design.** Still produced a filled rectangle — the "gap" between the two original footprints (inside the union bounding box but outside either original island) rendered as blank grid/parchment, which is exactly what the host's screenshots flagged as wrong. Replaced by the current regions model, where the gap simply isn't part of the island.
- **A generic polygon/shape-mask engine for islands, instead of a fixed array of rectangular regions.** Would let an island be an arbitrary non-rectangular outline, but touches grid rendering, `pixelToCell`, and ruler math throughout — a genuinely large rewrite for a case (an L/staircase union of a small number of rectangles) that a list of rectangular regions already covers, at a fraction of the risk.
- **A normalized `island_regions` child table (with its own RLS policies and realtime subscription), instead of a `jsonb` column on `islands`.** Considered because that's the exact pattern `islands` itself followed when it split out of `layers` — but that split was driven by `entities.island_id` needing to address an island independently; nothing needs to address a *region* independently (no FK, no per-row realtime consumer), so the lighter-weight `jsonb`-array precedent already used for `entities.sheet`/`chest_items`/`drop_items` fits better.
- **A seamless SVG-path/`clip-path` outline tracing the true perimeter of the merged shape (no visible seam where two regions touch), instead of each region keeping its own full border.** Would match the host's hand-drawn outline exactly, but requires computing a rectangle-union-to-polygon perimeter — real computational geometry for a comparatively small visual gain over "two bordered boxes placed together," which already conveys the real (non-rectangular, non-filled) shape.

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-09-08 | Blaxine | Initial plan. |
| 2026-09-09 | Blaxine | Slice 1 implemented and verified live (S001–S004, AC1–AC4) — drag-to-merge with confirm modal, local mode. |
| 2026-09-09 | Blaxine | Redesigned the merge outcome after host clarification: was absorb-and-discard (survivor's grid/background untouched, absorbed island's background thrown away); now a combined-canvas merge (union-sized grid, both backgrounds composited, entities from both islands repositioned). S002/S003 reworked, AC3/AC4 reworded and reopened; S001/S004 unaffected. |
| 2026-09-09 | Blaxine | Redesigned Slice 1 implemented and re-verified live (S001–S004, AC1–AC4) — union grid growth, entity retranslation, and the background compositor (offset placement, overlap z-order, parchment fallback fill, null-when-neither-has-a-background) all confirmed. |
| 2026-09-09 | Blaxine | Redesigned the merge outcome a second time after host screenshots showed the combined-canvas rectangle still wasn't right (filled a "gap" that should be void). Now a merged island keeps both originals as separate positioned regions (`islands.regions`, new `jsonb` column — migration `20250101000021_island_regions.sql`) instead of one rasterized grid; entities/ruler/`pixelToCell` stay entirely region-unaware. S002/S003/S004 reworked, AC3 reworded and reopened; S001 unaffected. Plan for this redesign went through `EnterPlanMode` given the scope (see `C:\Users\User\.claude\plans\snazzy-riding-wall.md`). |
| 2026-09-09 | Blaxine | Slice 2 (S005, cloud sync) implemented against the current regions-based merge: `updateIslandRemote` for the survivor's own changed row, `moveEntityRemote` per entity in `entityPositions`, `removeIslandRemote` for the absorbed island. Verified locally that the new `isRemote` branch is correctly inert offline; AC5 itself still needs a live check against a real hosted table (no Supabase credentials in this environment). |
| 2026-09-09 | Blaxine | Slices 3 & 4 (S006–S011) implemented: `downloadIslandAsFile`/`importIsland`, a shared `placeAndAddIsland` placement helper extracted from `createIsland`, `readSessionFromFile` generalized to `readJsonFromFile`, Download/Import controls in the Map settings and Islands popovers, THESAURUS.md updated. `regions` added to the export/import shape (beyond AC6's original 4-field scope) so a merged island's real shape round-trips instead of collapsing. Verified live in local mode: export shape, a 2-region import rendering correctly, the previously-active island staying untouched, both bad-file rejection paths (AC8), and a whole-table export/import regression check. Cloud-mode import (AC7's other half) reuses `createIsland`'s existing, unmodified `addIslandRemote` call — not independently live-verified (no Supabase credentials in this environment). |
| 2026-09-09 | Blaxine | Fixed the seam between two merged regions: a host screenshot showed a messy crossed-border look where the absorbed region's edges didn't line up with the survivor's, from using the raw (arbitrary sub-cell) dropped position. New `snapAbsorbedToClosestEdge` snaps it flush against the closest edge with the perpendicular axis cell-aligned before any union/region/entity math runs — a "1-to-1" cell connection regardless of where exactly the overlap was dropped. Verified live: a deliberately unaligned mid-overlap drop now produces a clean flush seam (`offsetX`/`offsetY` exact multiples of `cellSize`). AC3 re-verified. |
| 2026-09-10 | Blaxine | Guaranteed a real connection for corner-only overlaps: the perpendicular axis is now clamped to the range that keeps at least one shared cell with the survivor, instead of a plain nearest-cell round that could tip a marginal (sub-half-cell) overlap into a zero-width "hairline" touch. Verified with a direct unit-style test (both the clamped and — for contrast — an unclamped copy of the function) against a 1px corner overlap: unclamped produced `overlapY: 0` (disconnected); clamped produced `overlapY: 42` (one full cell), matching the un-clamped version's already-confirmed behavior for ordinary edge-to-edge overlaps. Enables corner-to-corner merges, not just the four full-edge cases. |
