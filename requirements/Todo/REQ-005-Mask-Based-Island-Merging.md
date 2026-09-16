# REQ-005 — Mask-Based Island Merging

| Field | Value |
| ----- | ----- |
| ID | REQ-005 |
| Title | Mask-Based Island Merging |
| Status | Todo |
| Phase | Island authoring improvements |
| Tier | Core |
| Area | Map building / islands |
| Author | Blaxine |
| Created | 2026-09-10 |
| Last Updated | 2026-09-10 |

## Short Description

Redesigns how two overlapping islands combine when a host confirms a merge.
Today's merge (REQ-002) keeps both source islands as separate rectangular
`regions` layered inside one bounding box. This redesign instead computes a
single per-cell playable mask tracing the real union shape of both islands,
composites their background art into one image, and produces one flat island
— no `regions` array — whose cells outside the mask are void: no grid lines,
not clickable, can't host a token. Existing regions-based merged islands are
unaffected and keep rendering exactly as they do today; only merges performed
after this ships produce the new mask-based shape.

## Constraints

- `MERGE_ISLANDS` (`src/state/store.jsx:184-210`) already applies its
  caller-supplied `islandPatch` to the survivor with a blind spread and does
  no geometry of its own — it needs **no changes**. `mask` simply replaces
  `regions` as a field in that patch.
- Background images are already stored as inline data URLs, not uploaded
  files (`resizeImageToDataUrl`, called from `Toolbar.jsx:126`) — compositing
  two of them needs no storage/upload step, just a canvas draw and
  `toDataURL()`.
- `src/utils/image.js` already contains the exact canvas-compositing
  precedent this feature needs (`resizeImageToCanvas`/`resizeImageToDataUrl`):
  `new Image()` loaded via `onload`/`onerror`, drawn onto a
  `canvas.getContext('2d')`. The new compositor is a sibling function in that
  same file, reusing its load/error pattern for the abort-on-failure case.
- `reportError` (`GameView.jsx:1073`) only `console.error`s — it's the
  silent surface used for background cloud-sync failures, not a user-facing
  one. A compositing failure that aborts the merge in the foreground should
  use `alert(...)` instead, matching the existing bad-import-file precedent
  (`GameView.jsx:561`), not `reportError`.
- `mapDbIsland`/`mapClientIslandPatchToDb` (`src/lib/mappers.js:30-55`) already
  store `backgroundImage` under the DB column `background_url` despite it
  always holding a data URL, never a real URL — the composited image is
  written the same way; no schema surprise there.
- `BACKGROUND_IMAGE_MAX_DIM = 1600` (`Toolbar.jsx:8`) already caps every
  uploaded background image to avoid bloating `localStorage`/a Supabase row —
  the composited canvas should respect the same cap, since a large union
  grid could otherwise produce an oversized data URL.
- `findIslandAt` (`MapBoard.jsx:107-123`) already tests each region's own
  rectangle rather than the island's outer bounding box for hit-testing — the
  new mask branch extends this same function rather than adding a parallel
  hit-test path.
- The repo has zero test files and no test runner configured anywhere
  (re-confirmed by search, matching REQ-002's own Constraints) — no `T`-phase
  steps; verification is the manual Smoke Test below.

## Architectural decisions

- A per-cell playable mask (a `rows × cols` array, one boolean per cell)
  replaces `regions` for the outcome of every merge performed after this
  ships. Cells outside the mask are void: no grid lines drawn, excluded from
  `findIslandAt`'s hit test, can't host a token.
- An island's "current real shape" — the input to a new merge's mask
  computation — is derived uniformly regardless of what kind of island it
  is: its own `mask` if it has one, else the union of its `regions`
  rectangles if it has any, else its own full bounding rectangle. A legacy
  regions-based island, or an already-masked island, merging into anything
  else preserves its true (possibly irregular) shape rather than being
  flattened back to a rectangle.
- Both source islands' background images are composited into one new data
  URL, drawn at their correct relative position/size onto a canvas sized to
  the union footprint (capped to `BACKGROUND_IMAGE_MAX_DIM`); an island with
  no background contributes nothing to the composite at its area.
- The merged island always adopts the survivor's `cellSize`. The mask is
  computed by testing each new grid cell's world-space center point against
  each source island's own shape at its own native resolution, so a
  different-`cellSize` absorbed island needs no separate rescaling step —
  each cell resolves independently, which cell size differences merely means
  a cell can straddle more than one of the absorbed island's original cells.
- `confirmMerge` becomes asynchronous, since compositing requires loading
  both source images before it can dispatch. The merge modal disables its
  Merge button and shows a busy state for the duration; a decode failure on
  either image aborts the whole merge (`alert(...)`, no dispatch, both
  islands untouched) rather than falling back to a partial result.
- Existing regions-based merged islands are never converted — `MapBoard.jsx`
  keeps its current region-rendering path for any island whose `regions` is
  non-empty, and gains a second, independent path for an island whose `mask`
  is set. A plain island (neither) renders exactly as it does today.
- Once an island carries a `mask`, `MapSettingsPopover`'s Width/Height fields
  become read-only — resizing a traced, composited shape has no defined
  meaning. A plain or regions-based island's resize is unaffected.
- The new schema column, DB mapping, and export/import field are all named
  `mask`; the rendering/UI concept for an excluded cell is "void cell" —
  continuing the term REQ-002 already used informally for the same idea.

## Acceptance Criteria

- [ ] **AC1 — Plain-island merge produces one flat masked island.** Confirming a merge between two never-merged islands produces a single island with no `regions`, whose `mask` marks exactly the union of both original footprints as playable and everything else in the new bounding grid as void. *Implemented 2026-09-10 (S001–S005) — not yet live-verified (needs a real host session; this environment has no way to sign in).*
- [ ] **AC2 — Backgrounds are truly composited.** The merged island's background is one new image showing both source islands' original art in their respective areas; a source island with no background contributes no fill (not a solid color) to its area of the composite. *Implemented 2026-09-10 (S003, S005) — not yet live-verified.*
- [ ] **AC3 — Void cells render and behave as absent.** A void cell shows no grid lines and no background content, can't be clicked or selected, and rejects a token drop — the token returns to its pre-drag position, the same rejection already used for a drop in the gap between two separate islands. *Implemented 2026-09-10 (S007) — not yet live-verified.*
- [ ] **AC4 — Merge stays busy until compositing resolves.** Clicking "Merge" disables the button and shows a busy state; the modal doesn't close and no state changes until compositing and the resulting dispatch finish. *Implemented 2026-09-10 (S005, S006) — not yet live-verified.*
- [ ] **AC5 — A compositing failure aborts cleanly.** If either source background fails to decode, the merge does not happen, an alert explains the failure, and both islands are exactly as they were before the attempt. *Implemented 2026-09-10 (S005) — not yet live-verified.*
- [ ] **AC6 — Resizing a masked island is blocked.** Once an island carries a `mask`, Map Settings' Width/Height fields are read-only with an explanatory note; a plain or regions-based island's resize is unaffected. *Implemented 2026-09-10 (S008) — not yet live-verified.*
- [ ] **AC7 — Re-merging preserves a prior real shape.** Merging an already-masked island, or a pre-existing regions-based island, into another island produces a mask that is the union of both inputs' actual (possibly irregular) shapes — existing void cells stay void, not filled back in. *Implemented 2026-09-10 (S009) — verified against a standalone simulation of the generalized shape test (plain/mask/regions cases all resolved correctly); not yet live-verified in the running app (needs a real host session).*
- [ ] **AC8 — Cloud mode mirrors local mode.** In cloud mode, a confirmed mask-based merge is reflected in Supabase (the survivor's row carries its new `mask` and composited background; the absorbed row is gone), visible to a second connected client after its next update. *Slice 3 (S010) fully implemented 2026-09-10 — landed with S005 in Slice 1 out of necessity (see its step note), no further code needed. Not live-verified against a real hosted table (no Supabase credentials in this environment).*
- [ ] **AC9 — Mask round-trips through export/import.** Downloading a masked island's shell includes its `mask`; importing that file recreates an island with the identical mask. *Implemented 2026-09-10 (S011, S012) — verified against a standalone simulation (identical round-trip, a malformed/mismatched mask dropped rather than imported, a pre-existing mask-less export file still imports fine); not yet live-verified via the actual Download/Import buttons.*

## Technical Notes

- `src/state/store.jsx:184-210` (`MERGE_ISLANDS`) — unchanged; `islandPatch`
  now carries `{ x, y, cols, rows, mask, backgroundImage, regions: [] }`
  instead of `{ x, y, cols, rows, regions }`.
- `src/components/GameView.jsx:637-663` (`snapAbsorbedToClosestEdge`) —
  unchanged, still runs first to decide the absorbed island's snapped
  position; every downstream calculation (union bounds, the new mask, entity
  positions) uses that snapped position exactly as it does today.
- `src/components/GameView.jsx:665-672` (`impliedRegions`) and `685-748`
  (`confirmMerge`) — `impliedRegions`'s rebase-onto-shared-origin approach is
  replaced by the new per-cell shape test described in Architectural
  decisions; `confirmMerge`'s union bounding-box math
  (`unionX`/`unionY`/`cols`/`rows`, lines 702-707) is unchanged, since the
  flat island still needs that same outer bounding box regardless of its
  mask.
- `src/utils/image.js` — new sibling function to
  `resizeImageToCanvas`/`resizeImageToDataUrl` that draws two source data-URL
  images onto one canvas at their known relative offsets/sizes and resolves
  a composited data URL, rejecting if either fails to load.
- `src/components/MapBoard.jsx:88-97` (`effectiveRegions`) and `99-123`
  (`findIslandAt`) — gain a third case alongside the existing
  plain-rectangle and regions cases: an island with a `mask` renders one
  bordered box, drawing grid lines and accepting hits only for in-mask
  cells.
- `src/lib/mappers.js:30-55` (`mapDbIsland`/`mapClientIslandPatchToDb`) —
  `mask` added following the exact sparse-patch idiom already used for
  `regions`.
- `supabase/migrations/20250101000021_island_regions.sql` — precedent for
  the new migration (next in sequence:
  `20250101000022_island_mask.sql`), `alter table islands add column if not
  exists mask jsonb null default null` (nullable — distinguishes "no mask"
  from an explicit empty one; unlike `regions`, which defaults to `[]`).
- `src/components/GameView.jsx:741-745` — the cloud-mode merge writes
  (`updateIslandRemote`/`moveEntityRemote`/`removeIslandRemote`); the first
  call's payload changes from `{ x, y, cols, rows, regions }` to
  `{ x, y, cols, rows, mask, backgroundImage }`, otherwise unchanged.
- `src/state/persistence.js:81-90` (`downloadIslandAsFile`) and
  `src/components/GameView.jsx:538-562` (`importIsland`) — `mask` added to
  the exported/imported shell fields, following exactly how `regions` was
  added to both in REQ-002.
- `src/components/Toolbar.jsx:305-379` (`MapSettingsPopover`) — the Width
  (line 355) and Height (line 359) inputs' `disabled` condition gains
  `|| Boolean(island.mask)`, with an added note explaining why when true.

## Dependencies

| REQ ID | Title | Reason |
| ------ | ----- | ------ |
| REQ-002 | Island Merging And Import/Export | This plan supersedes REQ-002's merge mechanism for every merge performed after it ships. REQ-002's regions-based system stays in place unmodified for backward compatibility, and its export/import slices are unmodified apart from the added `mask` field. |

> Supersedes: REQ-002's merge design (Slices 1–2: `regions`-based combining).
> REQ-002's export/import design (Slices 3–4) is extended, not replaced.

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| F | Foundation |
| S | Service |
| U | UX |
| D | Docs |

### Slice 1 — Mask-based merge for plain islands, local mode

**Demoable when:** in local mode, merging two never-merged islands produces one flat island with a composited background and a correct mask; void cells show no grid lines, reject clicks/drops, and Map Settings shows Width/Height as read-only for it; the Merge button shows a busy state while compositing runs, and a corrupted background image aborts the merge with an alert instead of a partial result.
**Satisfies:** AC1, AC2, AC3, AC4, AC5, AC6

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S001 | F | `islands.mask` migration | New migration adding `mask jsonb null default null` to `islands`, following the `regions` migration's precedent and comment style. | — | `supabase/migrations/` |
| ✅ | S002 | F | `mask` mapping | `mapDbIsland`/`mapClientIslandPatchToDb` read/write `mask` following the exact pattern already used for `regions`. | S001 | `src/lib/mappers.js` |
| ✅ | S003 | S | Background compositor | New function in `src/utils/image.js` (sibling to `resizeImageToCanvas`) that draws two source data-URL images onto one canvas at given offsets/sizes (capped to `BACKGROUND_IMAGE_MAX_DIM`) and resolves a composited data URL; rejects on a load failure for either image. | — | `src/utils/image.js` |
| ✅ | S004 | S | Plain-island shape test | A point-in-shape test for a plain (no mask, no regions) island against a world-space point, used once per cell of the new union grid to build the merged mask for both sides of the merge. | — | `src/components/GameView.jsx` |
| ✅ | S005 | S | Async mask-based `confirmMerge` | `confirmMerge` awaits S003's compositing and uses S004's shape test to build `mask`, then dispatches `MERGE_ISLANDS` with `islandPatch: { x, y, cols, rows, mask, backgroundImage, regions: [] }` (union bounding-box math unchanged). On a compositing failure: `alert(...)`, no dispatch, both islands left untouched. | S002, S003, S004 | `src/components/GameView.jsx` |
| ✅ | S006 | U | Merge modal busy state | Local "merging" state disables the Merge button and shows a busy label for the duration of S005's async work. | S005 | `src/components/GameView.jsx` |
| ✅ | S007 | U | Mask-aware rendering + hit-testing | `effectiveRegions`/`findIslandAt` gain a mask branch: an island with `mask` renders one bordered box, drawing grid lines and accepting clicks/drops only for in-mask cells. | S005 | `src/components/MapBoard.jsx` |
| ✅ | S008 | U | Resize-gating for masked islands | `MapSettingsPopover`'s Width/Height inputs become read-only (with an explanatory note) when the active island carries a `mask`. | S005 | `src/components/Toolbar.jsx` |

### Slice 2 — Preserve real shape when re-merging a masked or legacy island

**Demoable when:** merging an already-masked island, or a pre-existing regions-based island, into another island produces a mask whose existing void cells stay void instead of being filled back in.
**Satisfies:** AC7

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S009 | S | Generalize the shape test | Extend S004's shape test to also handle a mask-bearing island (test its own mask at the corresponding local cell) and a legacy regions-based island (test against the union of its region rectangles) as either side of a merge. | S004, S005 | `src/components/GameView.jsx` |

### Slice 3 — Cloud-mode sync

**Demoable when:** the same merge flow against a hosted cloud table is reflected in a second connected browser tab after its next update.
**Satisfies:** AC8

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S010 | S | Remote merge writes carry `mask` | The cloud-mode `updateIslandRemote` call in `confirmMerge` sends `{ x, y, cols, rows, mask, backgroundImage }` in place of the current `regions`-carrying payload; `moveEntityRemote`/`removeIslandRemote` calls are unchanged. Landed alongside S005 rather than deferred to this slice — the rewritten `confirmMerge` no longer has a `regions` variable in scope at all, so leaving this call site unupdated would throw in cloud mode (this dev environment has Supabase configured) rather than merely producing a stale write. | S002, S005 | `src/components/GameView.jsx` |

### Slice 4 — Export/import carries the mask, thesaurus updated

**Demoable when:** downloading a masked island's shell includes its mask, and importing that file recreates the identical shape.
**Satisfies:** AC9

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S011 | F | Export includes `mask` | `downloadIslandAsFile`'s shell object includes `mask: island.mask ?? null`, following how `regions` was added in REQ-002. | S005 | `src/state/persistence.js` |
| ✅ | S012 | S | Import validates `mask` | `importIsland` accepts an optional `mask` field (a `rows`-length array of `cols`-length boolean rows), defaulting to none when absent or malformed — a pre-existing plain-island export file keeps importing unchanged. | S011 | `src/components/GameView.jsx` |
| ✅ | S013 | D | Thesaurus update | Add "Mask" and "Void cell" entries; update "Merge"'s definition to describe the mask-based outcome, noting a legacy regions-based merged island stays valid but is no longer produced by new merges. "Region" is left as-is — still accurate for legacy data. | S007, S012 | `THESAURUS.md` |

### Dependency graph

```
S001 → S002 → S005 → S006
S003 ─────────↗    ↘ S007
S004 ─────────↗    ↘ S008
S004, S005 → S009
S002, S005 → S010
S005 → S011 → S012
S007, S012 → S013
```

## Out of Scope

- Converting existing regions-based merged islands to mask-based islands —
  they keep rendering via the existing region path indefinitely; no
  migration/backfill script.
- A true polygon/SVG-traced perimeter outline — the mask is still a per-cell
  (not per-pixel or vector) shape, the same rectilinear "staircase"
  granularity as today's region boxes, just without each source's own
  separate visible border.
- Manually editing a mask after a merge (e.g. painting cells in or out by
  hand) — `MapSettingsPopover` still only edits name/feet-per-square for a
  masked island.
- Regenerating or backfilling a mask for an existing regions-based island
  that isn't itself an input to a future merge — it stays exactly as it
  renders today.
- Undo for a completed merge — matches REQ-002's existing scope cut; no
  undo/redo exists anywhere in the app.
- Server-side/RPC atomicity for the cloud-mode merge writes — same accepted
  non-transactional risk as REQ-002 and the rest of the codebase.

## Open Questions

- [ ] **Q1 — Large-grid mask size.** A 60×60 island's mask is a 3,600-cell boolean array — likely comparable in volume to what `regions` already stores as JSON, but not measured. Deferred until a host reports a large merged map feeling slow, or a Supabase row-size issue surfaces.

## Smoke Test

> Developer runs the app; the agent does not self-run.

1. In local mode, create two plain islands on the same layer, each with its own background image, and drag one to overlap the other well past the edge-snap distance. Confirm the modal appears; click Merge and confirm the button shows a busy state until it resolves. *(AC4)*
2. Inspect the resulting island: one flat island (no `regions`), a background showing both original images in their respective areas, and grid lines only inside the traced union shape — the "outside" area (inside the bounding box but outside either original footprint) shows no grid lines and no background fill. *(AC1, AC2)*
3. Try clicking a void cell and dragging a token onto one; confirm neither registers, and a dropped token returns to its origin. *(AC3)*
4. Open Map settings for the merged island and confirm Width/Height are read-only with an explanatory note; confirm a plain island's Width/Height are still editable. *(AC6)*
5. Temporarily break one island's background (e.g. a corrupted data URL) before merging; confirm the merge aborts with an alert and both islands are unchanged. *(AC5)*
6. Merge a third plain island into the result from step 1; confirm the existing void cells from the first merge stay void in the new mask. Repeat starting from a pre-existing regions-based (legacy) merged island instead, and confirm the same. *(AC7)*
7. Repeat the whole flow against a hosted cloud table with a second browser tab open; confirm the second tab reflects the merge (mask + composited background) after its next update. *(AC8)*
8. Download the merged island's shell via "Download island"; confirm the JSON includes `mask`. Import it as a new island and confirm the imported island's void cells match the original exactly. *(AC9)*

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| M | 10–14 | No new reducer case or modal UI (both are reused from REQ-002), but real new complexity in canvas compositing, per-cell shape/mask geometry, and a third MapBoard render/hit-test path running alongside the two REQ-002 already added. |

## Considered And Rejected

- **Visual-only image mask (grid stays the full bounding rectangle; only the composited image is clipped).** Cells outside the traced shape would still be part of the clickable grid — void behavior (AC3) needs cell-level exclusion, not just a visual crop.
- **Combining REQ-002's original combined-canvas design as-is (composite backgrounds, no mask at all).** REQ-002 already tried and rejected exactly this — the "gap" between the two original footprints rendered as filled parchment/grid, which is what its host screenshots flagged as wrong. This plan's mask is precisely the piece that design was missing.
- **Flattening a legacy regions-based or already-masked island to a full rectangle when it's a merge input.** Silently "heals" a shape the host deliberately built the moment it's merged again — the same failure mode already rejected for the mask-composition case.
- **Blocking any further merge of a regions-based or masked island.** Sidesteps the shape-composition question but permanently locks any previously-merged island out of merging again, with no conversion path.
- **Auto-clamping a void-cell token drop to the nearest valid cell, or rejecting with a flash/highlight effect.** Both were weighed against a plain reject-and-snap-back; auto-clamp can silently place a token somewhere the player didn't point at, and a rejection-flash effect doesn't exist anywhere in the app yet — plain snap-back already matches the existing inter-island-gap behavior.
- **Keeping only the survivor's background image, or no compositing at all (blank background) after a merge.** Both discard the absorbed island's art entirely; true compositing (chosen) is what makes the merge outcome look like one island combining both originals' maps, not one map swallowing another's tokens while erasing its art.
- **Allowing resize on a masked island, either clipping/padding the mask to the new size or discarding the mask outright.** Both let an unrelated resize accidentally destroy carefully-built merge shape; disabling resize on a masked island removes the ambiguity entirely.
- **Closing the merge dialog immediately and compositing in the background, or adding no busy-state handling at all.** The former can look like the merge silently did nothing for a moment; the latter risks a double-submit if compositing is ever slow (large images, a slow device). A disabled button with a busy state was chosen as the simplest option that rules out both.
- **On compositing failure, proceeding with the mask but a blank background instead of aborting.** Considered, but an abort-and-explain outcome is easier for a host to understand and retry than a merge that silently loses one side's art.
- **`shape`/"blocked cell" or `cellMask`/"excluded cell" as the naming instead of `mask`/"void cell".** Both were live options; `mask`/"void cell" was chosen as shorter (matching `THESAURUS.md`'s existing terse style) and because "void" already appears informally in REQ-002's own history describing this exact gap concept.
- **A fourth in-place redesign inside REQ-002 itself, instead of a new superseding REQ.** REQ-002 already recorded three redesigns of the same mechanism via Revision History; a fourth would mean rewriting its already-checked, dated AC3/AC4 evidence a further time and losing the clean historical record REQ-002 currently is of the regions-based system, which stays true for existing data.
- **Rescaling the absorbed island's geometry onto the survivor's cell grid before testing, instead of testing each new cell's world-space center point against each source's own native resolution.** The rescale-first approach was the original framing during grilling, but a per-cell center-point test achieves the same outcome (a deterministic in/out decision per new cell) without a separate rescaling pass, and generalizes cleanly to the mask/regions/plain shape test uniformly.

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-09-10 | Blaxine | Initial plan. |
| 2026-09-10 | Blaxine | Slice 1 implemented (S001–S008): `islands.mask` migration, `mask` mapping, a new background compositor in `src/utils/image.js`, `confirmMerge` rewritten as async and mask-based (`isPointInIslandShape`, plain-island case only), the merge modal's busy state, `MapBoard.jsx`'s mask-aware rendering/hit-testing, and `MapSettingsPopover`'s resize-gating for masked islands. S010 (Slice 3) also landed here rather than deferred — see its step note. `npm run build` passes; not yet live-verified (needs a real host session, which this environment has no way to sign into). |
| 2026-09-10 | Blaxine | Slice 2 implemented (S009): `isPointInIslandShape` generalized to test a mask-bearing island against its own mask, a legacy regions-based island against the union of its region rectangles, and a plain island against its full rectangle (previously only the plain case was handled). `confirmMerge`'s `snappedAbsorbed`/`survivor` already carried `mask`/`regions` through untouched, so no other change was needed for either side of a merge to use the generalized test. `npm run build` passes; verified against a standalone simulation of all three cases (plain/mask/regions) — not yet live-verified in the running app. |
| 2026-09-10 | Blaxine | Slice 3 (S010) confirmed already complete — it landed as part of Slice 1's implementation, since the rewritten `confirmMerge` had no `regions` variable left in scope and the old remote-write call site would have thrown in cloud mode otherwise. No additional code was needed for this slice. |
| 2026-09-10 | Blaxine | Slice 4 implemented (S011–S013): `downloadIslandAsFile` includes `mask`; `importIsland` validates an optional `mask` against the imported island's (post-clamp) rows/cols, dropping it rather than the whole file if malformed or mismatched; `THESAURUS.md` gained "Mask" and "Void cell" entries and an updated "Merge" definition ("Region" left untouched, still accurate for legacy data). `npm run build` passes; verified against a standalone simulation of the export/import round trip (identical mask round-trips, a malformed mask is dropped, a pre-existing mask-less file still imports) — not yet live-verified via the actual Download/Import buttons in the running app. All four slices of REQ-005 are now implemented. |
