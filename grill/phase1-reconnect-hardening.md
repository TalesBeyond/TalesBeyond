# Phase 1: Reconnect Hardening — resolved plan

Produced by a `/grill-me` session walking `REALTIME_ROADMAP.md`'s Phase 1
("harden what's already live") into a concrete, decided plan before any
code gets written.

**What's being built:** Cloud-mode's `postgres_changes` subscription
doesn't guarantee delivery across a dropped connection — a WiFi blip
silently desyncs a player's board. This closes that gap and audits the
two adjacent risks the roadmap flags.

## In scope (all four Phase 1 sub-items)

- **2.1 — the real work:** detect a genuine disconnect, resnapshot on
  recovery, block interaction meanwhile, surface it visibly.
- **2.2 — verify only:** confirm `GameView.jsx`'s subscription
  `useEffect` (`src/components/GameView.jsx:182-187`) truly only
  re-runs on `tableId` change, not on every render. No code change
  expected — the roadmap already believes this is correct.
- **2.3 / 2.4 — discipline, not code:** one channel per table, and a
  debounce expectation for any future per-keystroke write. Nothing to
  build now.

## Key decisions

| Decision | Resolution | Why |
|---|---|---|
| UI surface | One-off inline banner in `GameView.jsx`, local component state | No toast system exists anywhere in the app; building one is out of scope for this feature |
| Race handling | **Block all interaction app-wide** (map, toolbar, right panel) while reconnecting | Any of the three can dispatch an entity/layer/island mutation that a wholesale `HYDRATE` would silently stomp — narrowing the block to just drag would reintroduce the exact bug this phase closes |
| Grace period | ~1-2s timer before showing the banner/blocking | Avoids flash-freezing the UI on sub-second `CHANNEL_ERROR`/`TIMED_OUT` blips that resolve on their own |
| Retry policy | Retry `fetchTableSnapshot` with capped backoff, stay blocked | Matches "never show a silently-wrong board," which is the entire point of this phase |
| Escape hatch | Manual "reload" link appears after a few failed retries | Reuses `App.jsx`'s existing resume-on-refresh path rather than inventing new recovery logic; prevents an indefinite freeze during a real outage |
| Verification | Manual test via Chrome DevTools network throttling against a real cloud-mode table | Consistent with zero existing test infra in the repo; introducing a framework is explicitly out of scope here |
| 2.3/2.4 discipline | Inline code comments at `subscribeToTable`'s call site and near the entity-write functions | Keeps the constraint visible to whoever touches this code next, rather than relying on `REALTIME_ROADMAP.md` being re-read |

## Deferred, not decided here

Distinguishing "first `SUBSCRIBED`" from "`SUBSCRIBED` after a real
drop" is a mechanical implementation detail (a ref flag), not a design
branch — left to implementation time.
