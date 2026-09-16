# REQ-002-PRD — Island Merging And Import/Export

| Field | Value |
| ----- | ----- |
| ID | REQ-002-PRD |
| Title | Island Merging And Import/Export |
| Status | Todo |
| Author | Blaxine |
| Created | 2026-09-08 |
| Last Updated | 2026-09-08 |

## Problem Statement

A host building a map out of islands can end up dragging one island right on
top of another — on purpose, to combine two pieces into one bigger space, or
by accident. Either way, the app just lets them sit stacked with no way to
actually merge them into a single island, so the host is left manually
recreating one side's content on the other's map by hand.

Separately, a host who has put real effort into building out an island —
picking a background, sizing the grid just right — has no way to reuse that
work anywhere else. It only ever exists inside the one table it was built on.
If they want the same map on a different table, or want to hand a map to
someone else to use, or just want a personal backup, there's nothing to do
but rebuild it from scratch.

## Solution

When a host drags an island so it overlaps another, the app offers to merge
them into one, asking for confirmation first so an accidental drag can't
silently combine two maps. Once confirmed, everything that was placed on the
smaller island — tokens, doors, chests, anything — carries over onto the
surviving island rather than being lost.

Separately, a host can save any island they've built to a file on their own
computer, and bring that file back in later — on the same table, a different
table, or handed to someone else — to add it as a new map without disturbing
anything already there.

## User Stories

1. As a host building a map, I want overlapping islands to combine into one when I drag them together, so that I don't end up with two disconnected maps stacked in the same spot.
2. As a host merging two islands, I want to confirm the merge before it happens, so that an accidental drag doesn't cost me a map.
3. As a host, I want everything placed on the smaller island to carry over onto the surviving one when they merge, so that tokens, doors, and chests aren't lost in the process.
4. As a host, I want to save a map I've built to a file, so that I can reuse it later or share it with someone else.
5. As a host bringing a saved map back in, I want it added as a new map rather than replacing what I'm already working on, so that I don't lose anything currently in place.

## Out of Scope

- A dedicated way to undo a merge once confirmed — reversing one means rebuilding it by hand.
- Bringing along whatever is placed on a map (tokens, doors, chests, characters) when saving or reusing it — only the map itself travels.
- A Store placeable for selling to players — a separate feature, not addressed here.
