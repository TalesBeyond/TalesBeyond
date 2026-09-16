# REQ-001-PRD — Connection Recovery

| Field | Value |
| ----- | ----- |
| ID | REQ-001-PRD |
| Title | Connection Recovery |
| Status | Todo |
| Author | Blaxine |
| Created | 2026-09-08 |
| Last Updated | 2026-09-08 |

## Problem Statement

When a player or DM at a hosted table loses their connection for even a
short moment — a WiFi blip, a phone losing signal — their board can
silently fall out of step with what's actually happening at the table.
Token moves, chest openings, sheet edits made by others while they were
disconnected never arrive, and nothing tells them their view might now be
wrong. They keep playing on a board that looks normal but isn't, and only
find out something's off when it collides with what everyone else sees.

## Solution

The app notices when a player's connection to a live table is interrupted
and tells them so, in the moment. Once the connection comes back, it
brings their board fully up to date with everything that happened while
they were away, and confirms to them that they're caught up. While their
board's accuracy is in question — from the moment the drop is noticed
until it's confirmed current again — the app holds off letting them take
any action at the table, so nobody moves a token, edits a sheet, or makes
a call based on information that might already be stale. If reconnecting
keeps failing, the player isn't left stuck forever — they're given a way
to try again.

## User Stories

1. As a player at a hosted table, I want to know when my connection to the table has dropped, so that I don't keep playing on a board that might be silently out of date.
2. As a player whose connection was just restored, I want my board to catch up on everything that happened while I was disconnected, so that I'm not missing token moves, sheet changes, or anything else others did.
3. As a player who's reconnecting, I want to be held back from moving tokens or editing anything until my board is confirmed current, so that I don't act on stale information or accidentally undo something that happened while I was out.
4. As a player whose connection won't recover on its own, I want a clear way to try again, so that I'm not stranded staring at a frozen table indefinitely.

## Out of Scope

- Knowing who is currently online/away at the table (presence) — a separate feature.
- Seeing other players' token drags move live, mid-drag, before they're dropped — this is only about staying correct after a disconnect, not about making ordinary play feel more real-time.
- Resolving two people editing the same thing at the same moment — a separate concern from recovering after a drop.
- Local demo mode, which has no live connection to a table to lose in the first place.
