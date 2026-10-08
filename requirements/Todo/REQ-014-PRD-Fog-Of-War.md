# REQ-014-PRD — Fog of War

| Field | Value |
| ----- | ----- |
| ID | REQ-014-PRD |
| Title | Fog of War |
| Status | Todo |
| Author | Blaxine |
| Created | 2026-10-07 |
| Last Updated | 2026-10-07 |

## Problem Statement

A DM who lays out a dungeon shows the whole of it to the players the moment
they look at the map. Every room, corridor and dead end is visible before
anyone has walked there, so there is nothing to explore and nothing to be
surprised by.

The only tool the DM has today is hiding tokens one at a time. That keeps a
single monster or chest secret, but it does nothing for the map itself, it has
to be done token by token, and the DM has to remember to show each one again
at the right moment. A DM who wants the party to discover a place room by room
has no way to do it.

## Solution

**Fog of war.** The DM covers parts of a map with fog, in chunks. A chunk is a
rectangle the DM drags over the map — usually one room or one stretch of
corridor. Fogging a whole map is the same thing with a single chunk covering
every square, so a map can also start out completely unknown.

To players, a fogged chunk is an opaque cover: they see that the map continues
there, but not what it looks like. Whatever the DM has standing inside it —
monsters, NPCs, chests, doors and traps — does not exist on their maps at all
until the chunk is revealed. Heroes are the exception: a hero is always shown,
even inside fog, so nobody ever loses their own character. A token that is
partly in the fog and partly in the clear is shown.

A chunk is revealed for the whole table at once, in one of two ways. The DM
can open it by hand, and can fog it again later. Or it opens by itself when a
hero lands in it — each chunk has its own "reveals when entered" setting, on
by default. A chunk with that setting off is a room the DM is holding back:
players cannot walk into it, or come through a door into it, until the DM
opens it.

Chunks can overlap. A square is clear only once every chunk covering it has
been revealed, so a DM can fog a whole map and then draw individual rooms on
top of it.

The DM always sees the chunks as a tinted overlay on the map, with everything
underneath still visible, and manages a chunk by clicking it during normal
play — no need to switch tools in the middle of a session.

The feature is called "Fog of war" everywhere, to keep it apart from the
existing Fog island condition, which stays as it is.

## User Stories

1. As a DM, I want to cover parts of a map — or all of it — with rectangular chunks of fog, so that players only see the areas they have explored
2. As a DM, I want a fogged chunk to hide the map beneath it and keep every monster, NPC, chest, door and trap inside it off my players' maps, so that an unexplored room gives nothing away
3. As a DM, I want to reveal a chunk for the whole table by clicking it during play, and to fog it again if I need to, so that I control when a room opens and can undo a mistake
4. As a player, I want a fogged chunk to open when my hero steps into it, so that exploring the map reveals it without waiting for the DM
5. As a DM, I want to turn off "reveals when entered" on a chunk, so that a room I am holding back stays shut to players — on foot or through a door — until I open it

## Out of Scope

- **Per-player sight.** A chunk is fogged or revealed for the whole table. A split party does not see different maps.
- **Line of sight and vision ranges.** Fog does not react to walls, light, or how far a hero can see; it opens chunk by chunk, and never returns on its own.
- **Chunks that are not rectangles.** An L-shaped room or a winding cave is several chunks that open separately.
- **Hiding heroes in fog.** Hero tokens are always visible, including inside unexplored chunks.
- **Decoy maps and invisible maps.** A fogged map still shows that it is there; there is no fake map with nothing behind it and no map hidden outright.
- **Drawing chunks on a phone.** A DM on a phone can reveal and re-fog chunks, and phone players get the full experience, but new chunks are drawn on desktop.
- **Auto-reveal with no DM at the table.** On a table where players can play while the DM is away, a hero who steps into fog stays in the dark until the DM is back.
- **Changes to the Fog island condition.** It keeps its name and its meaning.
