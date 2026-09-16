# Island Merge & Import/Export — resolved plan

Produced by a `/grill-me` session walking two of three feature ideas the user
raised ("merge islands that overlap into one", "download and upload
islands", and a Store placeable). The Store placeable was scoped out of this
session entirely — see Deferred below.

**What's being built:** Two island-lifecycle features. (1) Dragging one
island so it overlaps another offers to merge them into one, instead of
leaving two overlapping islands sitting on the same layer. (2) A host can
export an island's shell to a file and import one back in, to share or reuse
maps outside a single table.

## In scope

- **Island merging** — automatic overlap detection on drag, confirm-gated,
  destructive on accept.
- **Island import/export** — shell-only (no entities), file-based, host-only,
  works in both local demo mode and cloud mode.

## Key decisions

| Decision | Resolution | Why |
|---|---|---|
| Merge trigger | Automatic on drag-drop overlap, gated behind a confirm prompt | Pure automatic-on-overlap risks an accidental drag permanently combining two maps with no undo; a confirm step catches that without needing a separate manual "merge" action |
| Merge reject path | Declining the prompt snaps the dragged island back to its pre-drag position | Keeps the drag interaction reversible up to the moment of confirmation |
| Merge result | The pixel-larger island (`cols×cellSize × rows×cellSize`) survives with its own grid and background; the other island's grid/background are discarded | Always produces one clean, valid grid — never has to reconcile two different cellSizes or layer two background images |
| Absorbed entities | Translated into the survivor's coordinate space based on where the overlap occurred | This is what "merge" has to mean beyond just deleting the smaller island — nothing on it should vanish |
| Out-of-bounds entities | Clamped to the nearest edge cell of the survivor's grid | Guarantees nothing is silently lost or hidden; accepted trade-off that a clamped entity may end up visually relocated from its exact pre-merge spot |
| Base island | Always survives a merge regardless of pixel size | The base island is permanent/undeletable elsewhere in the app (new players land there) — the size rule can't be allowed to violate that invariant |
| Undo | None added; the confirm prompt is the only safety net | The app has no undo/redo anywhere (verified — only a dice-roll history log exists); adding one just for merge would be a much bigger scope increase than the feature itself |
| Export scope | Shell only — grid dimensions, cell size, background image. No entities. | Exporting entities would drag along full hero character sheets and DM-private notes; shell-only sidesteps that privacy exposure entirely and avoids defining what an "imported hero" even means |
| Export UI surface | Lives inside the existing per-island settings popover (`MapSettingsPopover` in `Toolbar.jsx`) | It's a per-island action already; export is a per-island action |
| Import behavior | Always creates a brand-new island on the layer — never overwrites the island currently being edited | Never destructive; matches "upload an island" literally rather than silently replacing existing work |
| Import UI surface | A control placed next to the existing "Add Island" action (`IslandManagerPopover` in `Toolbar.jsx`) | Both actions produce a new island on the layer, so they belong together, not inside a single-island editing flow |
| Bad import handling | Validate required shell fields; reject with an alert on any missing/malformed field, import nothing | Mirrors the existing "Could not read that image — try a different file." pattern already used for background image uploads — no new UI pattern needed |
| Mode scope | Both local demo mode and cloud mode | Both features operate purely on reducer state with no realtime-specific logic of their own; nothing about them is inherently cloud-only |
| Permissions | Host-only for both features | Matches the existing convention that all island-editing UI (add island, island settings) is host-gated |

## Deferred, not decided here

- **The Store placeable** — not walked in this session at all. Needs its own
  grill session; will likely take the existing Chest placeable as a starting
  precedent, but selling-to-players/currency mechanics are a real design
  branch of their own that hasn't been touched.
- **Cloud-mode sync mechanics** for merge/import (how the delete-and-reparent
  lands as a realtime-safe mutation) — implementation grounding, not a
  product decision; left for whoever grounds this in code.
