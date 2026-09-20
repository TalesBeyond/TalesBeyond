# REQ-001 — Connection Recovery

| Field | Value |
| ----- | ----- |
| ID | REQ-001 |
| Title | Connection Recovery |
| Status | Done |
| Phase | Realtime hardening (Realtime Roadmap Phase 1) |
| Tier | Core |
| Area | Realtime / cloud sync |
| Author | Blaxine |
| Created | 2026-09-08 |
| Last Updated | 2026-09-20 |

> Source PRD: REQ-001-PRD-Connection-Recovery.md

## Short Description

Closes the silent-desync gap in cloud mode: when a player's or the DM's
connection to a hosted table drops and comes back, the app now notices,
tells them, blocks table interaction until their board is confirmed
current again, and gives them a manual way out if reconnecting keeps
failing. Applies only to cloud mode — local demo mode has no live
connection to lose.

## User Stories

1. As a player at a hosted table, I want to know when my connection to the table has dropped, so that I don't keep playing on a board that might be silently out of date.
2. As a player whose connection was just restored, I want my board to catch up on everything that happened while I was disconnected, so that I'm not missing token moves, sheet changes, or anything else others did.
3. As a player who's reconnecting, I want to be held back from moving tokens or editing anything until my board is confirmed current, so that I don't act on stale information or accidentally undo something that happened while I was out.
4. As a player whose connection won't recover on its own, I want a clear way to try again, so that I'm not stranded staring at a frozen table indefinitely.

## Constraints

- The installed `@supabase/realtime-js` (v2.115.0) already exposes exactly the hook this feature needs: `channel.subscribe((status, err) => ...)`, with `status` typed as `SUBSCRIBED | TIMED_OUT | CLOSED | CHANNEL_ERROR` (`node_modules/@supabase/realtime-js/dist/main/RealtimeChannel.d.ts`) — `src/lib/realtime.js`'s `subscribeToTable` doesn't pass a callback to its `.subscribe()` call today.
- `fetchTableSnapshot` (`src/lib/remoteApi.js:77-152`) already returns the exact shape the `HYDRATE` reducer action expects, and is already used for both initial join and refresh-resume (`src/components/GameView.jsx:490`, `src/App.jsx:30`, `src/components/Landing.jsx:94,201`) — resync needs no new fetch logic, just a new call site.
- The `HYDRATE` reducer case (`src/state/store.jsx:71-72`) is a bare `return action.state` — a wholesale replace, not a merge — which is why any local write dispatched during the resync fetch window is unsafe to allow.
- `src/App.jsx:17-54`'s resume-on-refresh flow already reconstructs a table view from scratch on mount via `loadCurrentPointer` + `fetchTableSnapshot`; a plain `window.location.reload()` re-enters this exact path, so the manual escape hatch needs no new recovery code.
- There is no toast/notification system anywhere in the app — `reportError` (`GameView.jsx:674-678`) is a bare `console.error` stub. The reconnect indicator is genuinely new UI.
- The repo has zero test files, zero test runner config, and no test script in `package.json` — verification for this feature is manual only; introducing a framework is out of scope here.
- **Discovered during implementation:** establishing the very first Realtime connection can itself flap through `TIMED_OUT`/`CHANNEL_ERROR` before ever reaching `SUBSCRIBED` (a slow initial handshake competing with the rest of the page's startup, not a drop) — confirmed live, where this incorrectly triggered the scrim on a clean page load even though `supabase.realtime`'s channel was actually `joined`/connected the whole time. Fixed by tracking a `hasConnectedOnce` flag in `GameView.jsx`'s effect so grace-period/blocking logic only engages after the first real `SUBSCRIBED`, never before it.

## Architectural decisions

- Reconnect state (disconnected-since timestamp, grace-period timer, scrim visibility, retry attempt count, backoff timer) lives as local React state inside `GameView.jsx`, not in the reducer's persisted `state` object or `localStorage` — ephemeral, per-browser UI state only.
- Detection attaches a status callback to the single channel `subscribeToTable` already opens per table; no second subscription is introduced.
- Recovery reuses `fetchTableSnapshot` and the existing `HYDRATE` action verbatim — no new snapshot-fetch function or reducer action.
- Blocking is a full-screen scrim over the entire `.game-layout` render tree (`TokenSidebar`, `Toolbar` + `MapBoard`, `RightPanel`) — applied identically regardless of host/player role.
- Grace period before showing the scrim: 1.5s. Resync retry backoff: 2s, 4s, 8s, 16s, then capped at 30s for any further attempt. Manual reload control appears once 4 resync attempts have failed, without stopping the retry loop.
- The whole flow is gated on `isRemote` (`mode === 'remote' && isSupabaseConfigured`), the same condition every other cloud-only branch in `GameView.jsx` already uses — local demo mode runs none of it.

## UI / UX Notes

- The indicator and scrim render inside `GameView.jsx`, layered over `.game-layout` (`GameView.jsx:562-572`) — the app-shell header in `App.jsx` (mode indicator, session chip) is untouched.
- Copy: "Reconnecting…" while blocked and retrying; once the 4th resync attempt has failed, additionally show a plain reload control (e.g. "Still trying — reload the page").
- Same appearance and behavior for the host and for players — no role-specific messaging.
- Visual treatment follows `styles.css`'s existing hand-rolled design system rather than introducing a new visual language; no animation or sound requirement.

## Acceptance Criteria

- [x] **AC1 — Grace period suppresses blips.** A channel status transition to `TIMED_OUT`/`CLOSED`/`CHANNEL_ERROR` that returns to `SUBSCRIBED` within 1.5s never shows the scrim or blocks anything. *Verified live by the host, 2026-09-20.*
- [x] **AC2 — A real drop is surfaced.** If the disconnected state persists past 1.5s, the "Reconnecting…" indicator appears and the entire game screen (map, toolbar, right panel, token sidebar) becomes inert to input. *Verified live by the host, 2026-09-20.*
- [x] **AC3 — Full resync before unblocking.** Once the channel reports `SUBSCRIBED` again after the scrim was shown, the app fetches a fresh table snapshot and replaces local state with it; the scrim only clears after that snapshot has landed successfully. *Verified live by the host, 2026-09-20.*
- [x] **AC4 — Resync failure retries with backoff.** If the snapshot fetch itself fails, the app retries automatically on a 2s/4s/8s/16s schedule capped at 30s, remaining blocked and showing the indicator throughout. *Verified live by the host, 2026-09-20.*
- [x] **AC5 — Escape hatch without stopping retries.** After 4 failed resync attempts, a manual reload control appears alongside the indicator; automatic retries continue in the background regardless. *Verified live by the host, 2026-09-20.*
- [x] **AC6 — Local mode is unaffected.** None of this triggers in local demo mode, which has no realtime channel to lose. *Verified live by the host, 2026-09-20.*

## Technical Notes

- `src/lib/realtime.js:15-102` — `subscribeToTable(tableId, dispatch)` currently ends its chain with a bare `.subscribe()` (line 97) and returns the `unsubscribe` cleanup (lines 99-101). Extend it to accept and wire through a connection-status callback so `GameView.jsx` can observe `SUBSCRIBED`/`TIMED_OUT`/`CLOSED`/`CHANNEL_ERROR` transitions on the same channel, without opening a second one.
- `REALTIME_SUBSCRIBE_STATES` (`node_modules/@supabase/realtime-js/dist/main/RealtimeChannel.d.ts:230-235`) is the enum to switch on.
- `src/components/GameView.jsx:180-187` — the existing subscription `useEffect`, correctly gated on `[isRemote, state.session.tableId]` (Realtime Roadmap §2.2 — confirmed correct by inspection, no change needed here). The new reconnect-state tracking, timers, and effects attach alongside this hook.
- `src/lib/remoteApi.js:77-152` — `fetchTableSnapshot(tableId)` returns `{ session, layers, layerOrder, entities, entityOrder, players }`, the exact shape `HYDRATE` consumes. Reused as-is for resync; no changes to this function.
- `src/state/store.jsx:71-72` — `HYDRATE` reducer case (`return action.state`). No reducer change needed.
- `src/App.jsx:17-54` — existing resume-on-refresh flow (`loadCurrentPointer` → `ensureAnonymousSession` → `fetchTableSnapshot`). The manual reload control triggers `window.location.reload()`, re-entering this flow on remount — no new recovery path.
- `src/components/GameView.jsx:562-572` — the `.game-layout` wrapper div the scrim must cover.
- This feature is entirely client-side: no new Supabase tables, columns, RPCs, or migrations.
- No `T`-phase steps are included: the repo has no test files or runner anywhere (confirmed by search), so verification is the manual DevTools pass in **Smoke Test** below, not an automated suite.

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| F | Foundation |
| S | Service |
| U | UX |
| D | Docs |

### Slice 1 — Detect & recover from a dropped connection

**Demoable when:** throttling the network to offline in DevTools against a real cloud-mode table shows "Reconnecting…" appear after ~1.5s with the whole game screen unclickable, and going back online resolves to a caught-up board with the indicator gone.
**Satisfies:** AC1, AC2, AC3, AC6 · **Covers:** US1, US2, US3

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| x | S001 | F | Connection-status callback | Extend `subscribeToTable`'s existing `.subscribe()` call to report `SUBSCRIBED`/`TIMED_OUT`/`CLOSED`/`CHANNEL_ERROR` transitions to a caller-supplied callback, distinguishing the very first `SUBSCRIBED` (initial join) from a later one (recovery). | — | `src/lib/realtime.js` |
| x | S002 | F | Reconnect state tracking | In `GameView.jsx`'s subscription effect, track disconnected-since time, a 1.5s grace-period timer, and scrim visibility as local component state, gated on `isRemote`. | S001 | `src/components/GameView.jsx` |
| x | S003 | U | Reconnecting indicator + scrim | Render the "Reconnecting…" text and a full-screen scrim over `.game-layout` when blocked, styled per `styles.css`'s existing conventions. | S002 | `src/components/GameView.jsx`, `src/styles.css` |
| x | S004 | S | Resync on confirmed recovery | On `SUBSCRIBED` after the scrim was shown, call `fetchTableSnapshot` and dispatch the existing `HYDRATE` action with the result; clear the scrim only once it resolves. | S002 | `src/components/GameView.jsx` |
| x | S005 | D | Discipline comments (2.3/2.4) | Add inline comments closing Realtime Roadmap items 2.3 (one channel per table — don't let a future feature open a second one) and 2.4 (debounce any future per-keystroke write) at the relevant call sites. | — | `src/components/GameView.jsx`, `src/lib/remoteApi.js` |

### Slice 2 — Retry-with-backoff and manual reload escape hatch

**Demoable when:** forcing the resync fetch to fail repeatedly (channel reconnects but the snapshot request itself is blocked) shows the backoff schedule play out and the reload control appear after the 4th failure, with the scrim staying up throughout.
**Satisfies:** AC4, AC5 · **Covers:** US4

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| x | S006 | S | Retry with capped backoff | Wrap S004's snapshot call in a retry loop: on failure, wait 2s/4s/8s/16s, then 30s for any further attempt, before retrying; track the attempt count. | S004 | `src/components/GameView.jsx` |
| x | S007 | U | Manual reload control | Once the attempt count passes 4, show a reload control alongside the indicator (`window.location.reload()`) without interrupting the retry loop. | S006 | `src/components/GameView.jsx` |
| x | S008 | D | Thesaurus update | Add the reconnect-flow terms settled during implementation (e.g. resync, connection grace period) to `THESAURUS.md`. | S007 | `THESAURUS.md` |

### Dependency graph

```
S001 → S002 → S003
            ↘ S004 → S006 → S007 → S008
S005 (standalone)
```

## Out of Scope

- Local demo mode's save/export/import flow — untouched; this feature only runs when `isRemote` is true.
- Presence (online/away roster) — a separate future phase per `REALTIME_ROADMAP.md` §3.
- Ephemeral live-drag broadcast (seeing a token move before it's dropped) — a separate future phase per `REALTIME_ROADMAP.md` §4.
- Optimistic-concurrency / conflict resolution beyond today's last-write-wins — a separate future phase per `REALTIME_ROADMAP.md` §5.
- Any change to write-permission enforcement (`16_dm_only_edits.sql`) — the scrim blocks everyone's client-side interaction equally, but doesn't touch RLS/trigger logic.
- An automated test suite for this feature — the repo has none today; verification is the manual pass in **Smoke Test**.

## Smoke Test

> Developer runs the app; the agent does not self-run.

1. Configure cloud mode (`supabase/README.md`) and open two browser tabs on the same hosted table — one as host, one as a joined player.
2. In one tab, DevTools → Network → set throttling to "Offline" for under a second, then restore. Confirm no indicator or scrim ever appears. *(AC1)*
3. Set "Offline" and leave it for 5+ seconds. Confirm "Reconnecting…" appears within ~1.5s, and that clicking a token, opening a Toolbar popover, and selecting a RightPanel field all do nothing while blocked. *(AC2)*
4. While still offline in that tab, move a token and edit a hero's HP in the other tab. Restore connectivity on the blocked tab and confirm it lands on a board reflecting both changes, with the scrim clearing only once that's visible. *(AC3)*
5. Go offline, then instead of restoring the WebSocket, block only the Supabase REST endpoint (e.g. a DevTools request-blocking rule on the project's `.supabase.co` domain) so the channel reconnects but the resync fetch keeps failing. Watch the backoff schedule play out and confirm the reload control appears after the 4th failed attempt, with retries still visibly continuing. *(AC4, AC5)*
6. Without any Supabase env vars set (local demo mode), repeat step 3's offline test and confirm nothing in this feature ever triggers. *(AC6)*

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| M | 8–10 | Two thin slices; most of the time is in the timing-sensitive state machine (grace period + backoff) and manual verification, not new persistence or schema work — this is entirely client-side. |

## Considered And Rejected

- **A shared toast/notification system.** Would let other silent `reportError` call sites migrate to it later, but no such system exists anywhere in the app today, and building one is a bigger change than this feature warrants. A one-off banner in `GameView.jsx` stays scoped to the problem at hand.
- **Reusing `App.jsx`'s top-bar mode indicator for the reconnect message.** Keeps everything in one visual spot, but couples a game-screen-only concern to the app-shell header that also renders on the Landing screen. A `GameView`-local banner keeps the change contained to where the problem actually lives.
- **Allowing interaction during reconnect (accept lost writes, or queue and replay them after resync).** Accepting losses reintroduces a narrower version of the exact silent-desync bug this feature exists to close. A replay queue avoids that but is meaningfully more state-tracking machinery than a phase whose entire goal is closing one specific gap justifies.
- **Guarding only the mutation choke-point functions instead of a full-screen scrim.** Would have kept pan/zoom/layer-viewing live during reconnect, since those never touch synced state. Rejected in favor of the simpler, blunter full-screen scrim.
- **Retrying forever with no escape hatch.** Simpler, but strands a player indefinitely during a real outage (not just a WiFi blip) with no way out. A capped backoff plus a manual reload control after 4 failed attempts avoids that while still preferring automatic recovery.
- **Introducing a test framework (e.g. Vitest) for this feature.** The repo has zero existing test infrastructure; adding a framework is a bigger decision than this feature warrants on its own. Verification stays manual via DevTools, consistent with how the rest of the app is tested today (not at all).

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-09-08 | Blaxine | Initial plan. |
| 2026-09-09 | Blaxine | Both slices implemented (S001-S008), all checked off. Fixed a live-verified bug found during implementation: the initial-connection-handshake flap incorrectly triggered the scrim (see new Constraints bullet). Moved to `InProgress` — code is done, but the DevTools network-throttling **Smoke Test** (real drop/recovery, resync failure/backoff, escape hatch) still needs a manual pass before this moves to `Done`. |
| 2026-09-20 | Blaxine | Smoke Test run live by the host against a real hosted cloud table — confirmed working. AC1-AC6 all verified. Moved to `Done`. |
