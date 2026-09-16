# Hearthbound — Live-Service Realtime Roadmap

A step-by-step plan for turning cloud mode from "syncs eventually" into a
real live service: every player's table updates the moment anything
changes, reconnects gracefully, and holds up with a full table of nine
players plus a DM. Written against the actual code as of this session —
see `APP_OVERVIEW.md` for the app tour and `PITFALLS.md` for the issues
this roadmap grew out of (#4, #5, #7 specifically).

---

## 0. Where we already are (read this before building anything)

**This app already has WebSocket-based realtime.** Supabase Realtime is
Postgres logical replication (WAL) piped over a WebSocket connection
(built on Phoenix Channels under the hood) — `src/lib/realtime.js`
already subscribes to `postgres_changes` on `entities`, `players`,
`layers`, `islands`, `tables`, and `invite_codes`, and turns every event
into the same reducer action a local interaction would dispatch. When a
player drags a token, every other connected browser sees it move,
already, today. **The plan below is about hardening and extending that,
not replacing it.**

What "live service" adds on top of what exists:
1. Knowing who's actually online right now (presence) — not built.
2. Not silently missing updates across a dropped connection — not
   handled.
3. Feeling instant for things that don't need to hit the database on
   every pixel (a token mid-drag, not just on drop) — not built.
4. Surviving concurrent edits without silently losing one — partially
   addressed by the DM-only edit model, not fully.
5. Not falling over or costing a fortune at real usage — not tested at
   any scale yet.
6. Knowing when it breaks — no monitoring at all yet.

---

## 1. Architecture decision: what transport to use, and why

| Option | Verdict | Why |
|---|---|---|
| **Supabase Realtime (Postgres CDC over WebSocket)** — already in use | ✅ **Keep as the backbone** | Already wired, authoritative (state lives in Postgres, not scattered across peers), respects RLS per-subscriber (critical for the DM-only-data work from this session), reconnects and resubscribes automatically via `supabase-js`, no extra infra to run. |
| **Supabase Realtime Broadcast** (a *different* feature of the same service — pub/sub messages that never touch a table) | ✅ **Add for ephemeral, high-frequency data** | For things like "this token is mid-drag at (x,y)" you don't want a database write per pixel. Broadcast is the same WebSocket connection, same library, near-zero extra infra — just a different channel type. See §4. |
| **Supabase Realtime Presence** (a third feature of the same service) | ✅ **Add for online/away status** | Purpose-built for "who's here right now," heartbeats and disconnect detection included. See §3. |
| **Raw/custom WebSocket server** (e.g. a Node `ws` server, Socket.io) | ❌ Don't build this | Would mean standing up, deploying, and scaling a whole second backend process, reimplementing auth/RLS-equivalent authorization, and reimplementing reconnection logic Supabase already gives for free. No capability gap that justifies it. |
| **WebRTC (peer-to-peer data channels)** | ❌ Not for core game state | WebRTC is peer-to-peer with no authoritative server — wrong shape for "the DM's Postgres row is the truth." It also needs a signaling server and, for players behind strict NATs, a TURN relay server (real infra + real cost) just to establish a connection. **Only worth it later** for voice/video chat or true P2P mouse-cursor sharing at sub-Postgres latency — neither is required for a functional live service. Treat as an optional Phase 6 add-on, not a foundation. |
| **Server-Sent Events (SSE)** | ❌ Wrong shape | One-directional (server→client only); every player write already goes through Postgres anyway, so this buys nothing WebSocket doesn't already give, and adds a second connection type to maintain. |

**Recommendation:** everything in this roadmap builds on the Supabase
Realtime connection that already exists. No new transport, no new
servers to run.

---

## 2. Phase 1 — Harden what's already live (do this first)

The existing `postgres_changes` subscription works for the happy path
but hasn't been hardened for a real session that runs for hours.

### 2.1 Detect and recover from a dropped connection
`supabase-js` auto-reconnects the underlying WebSocket, but
**`postgres_changes` does not guarantee delivery of events that occurred
while disconnected** — there's no "catch-up" replay. Today, if a
player's WiFi blips for 10 seconds while the DM moves three tokens,
those three moves never arrive; that player's board silently drifts out
of sync until something touches those exact rows again.

**Steps:**
1. In `src/lib/realtime.js`, listen for the channel's connection-state
   changes (`channel.on('system', ...)` / the `SUBSCRIBED` /
   `CHANNEL_ERROR` / `TIMED_OUT` states `supabase-js` exposes on
   `.subscribe((status) => ...)`).
2. On a transition from disconnected → `SUBSCRIBED` again, don't just
   trust the WebSocket resumed cleanly — **re-fetch a full
   `fetchTableSnapshot()` and `HYDRATE` the reducer with it** (already
   built for initial join, in `src/lib/remoteApi.js`). This guarantees
   correctness after any gap, at the cost of one extra network round trip.
3. Surface a small "Reconnecting…" / "Back in sync" toast in
   `GameView.jsx` so players know their board might have been briefly
   stale, instead of a silent maybe-wrong board.

### 2.2 Stop re-subscribing on every render
Confirm the `useEffect` in `GameView.jsx` that calls `subscribeToTable`
only re-runs when `state.session.tableId` changes (it already checks
`[isRemote, state.session.tableId]` — verify this holds as more state is
added later; a subscription that gets torn down and recreated on
unrelated re-renders wastes a full resubscribe handshake every time).

### 2.3 One subscription per table, not per component
Today `subscribeToTable` is called once at the `GameView` level — keep
it that way as new features are added. Don't let a future feature (e.g.
a minimap component) open its own second Realtime channel for the same
table; fan state out from the one subscription via context/props instead.
Every extra channel is another WebSocket subscription slot counted
against Supabase's per-project connection limit (see §5).

### 2.4 Debounce high-frequency writes
`moveEntityRemote` fires on every drop today (one write per drag-release,
already reasonable). The risk is future features that might call
`updateEntityRemote` on every keystroke (e.g. a live-typing name field).
Audit new features for this before they ship — debounce any per-keystroke
write to ~300–500ms, matching the existing local-mode autosave debounce
in `src/state/store.jsx`.

**Outcome of Phase 1:** the realtime sync that already exists stops
silently drifting after a network hiccup, and won't be caught off guard
by careless new subscriptions or write patterns.

---

## 3. Phase 2 — Presence (who's actually online)

Closes **PITFALLS.md #7**. Today `players.connected` is a plain boolean
column nobody flips except a full `Leave`. There is no way to tell "away
for 5 seconds" from "closed their laptop an hour ago."

**Steps:**
1. In `src/lib/realtime.js`, alongside the existing `postgres_changes`
   listeners on the same channel, call `channel.track({ playerId, name })`
   after `.subscribe()` succeeds — this is Supabase Realtime Presence, a
   built-in CRDT-backed presence set per channel, no new table needed.
2. Listen for `channel.on('presence', { event: 'sync' }, ...)` and
   `'join'`/`'leave'` — maintain a local `onlinePlayerIds` set (component
   state or a new reducer-adjacent piece of state; presence is
   inherently ephemeral, so it does **not** belong in the persisted
   `state` object or `localStorage`).
3. In `src/components/RightPanel.jsx`'s player roster, replace/augment
   the `AWAY` tag (currently driven by the barely-used `connected`
   column) with the live presence set.
4. On `beforeunload`/`pagehide` in cloud mode, Presence's own
   disconnect detection (a heartbeat timeout, typically ~30s) handles
   cleanup automatically — no code needed, unlike local mode's manual
   `beforeunload` handler in `GameView.jsx`.
5. Optional: once presence exists, revisit `PITFALLS.md #7`'s
   "closing a tab doesn't free a seat" gap — a scheduled Edge Function
   (§5) could auto-`removePlayerRemote` anyone absent from presence for,
   say, 10+ minutes, without needing a client-side signal at all.

**Outcome:** an accurate "who's here right now" roster, and a real path
to finally auto-freeing abandoned seats.

---

## 4. Phase 3 — Ephemeral live updates (optional, for a "true live" feel)

Everything today syncs *on release* — drag a token, and other players
see it jump to its new square only once you drop it. For a more
tabletop-present "I can see your mouse moving the piece" feel, add a
**Broadcast** channel (Supabase Realtime's pub/sub feature, no DB writes
involved) for in-progress drags.

**Steps:**
1. In `src/components/MapBoard.jsx`'s `onTokenDragMove`, when
   `canMoveEntity` allows the drag, additionally
   `channel.send({ type: 'broadcast', event: 'token_drag', payload: { id, x, y } })`
   on a throttle (e.g. every 50–80ms, not every `pointermove` — dozens of
   messages/second per dragging player adds up across a full table).
2. Other clients subscribe to the same broadcast event and render a
   lightweight "ghost" position for that token, separate from its
   authoritative `col`/`row` in `state.entities` (which still only
   updates on drop, via the existing `moveEntityRemote` path). Don't let
   a missed/late broadcast message ever corrupt real state — broadcast
   is fire-and-forget, best-effort, and must stay purely cosmetic.
3. Same technique extends naturally to a shared pointer/cursor per
   player later, if wanted — broadcast `{ playerId, x, y }` on
   mousemove, throttled, rendered as a small labeled dot. Skip this for
   v1; it's a nice-to-have, not part of "tables stay in sync."
4. **This is the one place WebRTC could genuinely help** — a
   broadcast-based cursor share routes every move through Supabase's
   servers (extra ~30-80ms round trip); a WebRTC data channel would be
   direct peer-to-peer and lower latency still. Not worth the
   signaling/TURN-server complexity unless cursor-sharing latency turns
   out to matter in practice — ship the Broadcast version first, and
   only reach for WebRTC if it's demonstrably not smooth enough.

**Outcome:** dragging a token feels live to everyone watching, not just
on-drop; foundation for future presence-adjacent features (cursors,
"typing…" indicators) without new infrastructure.

---

## 5. Phase 4 — Conflict resolution beyond last-write-wins

Closes part of **PITFALLS.md #5**. The DM-only edit model shipped this
session (see `PITFALLS.md` #1) already shrinks this problem a lot — most
fields now have exactly one legitimate writer (the DM), so "two people
editing the same thing" mostly reduces to "the DM editing on two devices
at once," a much rarer case.

**Steps:**
1. Where it still matters (the DM open on a laptop *and* a phone
   simultaneously, or the two-writer chest-toggle case where a player
   opens a chest right as the DM edits its contents), add an optimistic
   concurrency check: include the row's `updated_at` (already
   maintained by `touch_updated_at()`, see `01_schema.sql`) in the
   client's `UPDATE ... WHERE id = ? AND updated_at = ?`. A mismatch
   means someone else wrote first — the mismatched writer's client
   refetches the row instead of silently overwriting it.
2. Surface a lightweight "this changed elsewhere, refreshed" note when a
   write like that gets rejected, so it's visible rather than a silent
   no-op.
3. Don't over-engineer this — full CRDT-style merge is unwarranted for a
   VTT's data shapes (a `sheet` jsonb blob doesn't merge sensibly field-
   by-field via CRDT without real design work). Optimistic-concurrency
   "reject and refetch" is enough; skip anything fancier unless real
   sessions show it's actually a problem.

**Outcome:** the rare true double-edit becomes a visible "someone else
just changed this" instead of an invisible lost write.

---

## 6. Phase 5 — Bandwidth and scale

Closes **PITFALLS.md #4 and #8**.

**Steps:**
1. **Wire up `src/lib/storageUpload.js`** (already implemented, just
   unused) into `TokenSidebar.jsx`'s upload flow and the map-background
   uploader, gated on `isSupabaseConfigured`. This is the single highest-
   leverage fix here: every custom token/background currently ships as a
   base64 data URL embedded directly in the row, which means it gets
   re-sent in full on every `postgres_changes` UPDATE payload for that
   row (Postgres logical replication includes the full new row, not a
   diff) — moving to Storage URLs turns a multi-hundred-KB payload into
   a ~100-byte string.
2. Re-verify `fetchTableSnapshot`'s parallel queries (`src/lib/remoteApi.js`)
   stay cheap as tables grow — add pagination or narrower `select()`
   column lists if a table ever accumulates enough entities/layers for
   the initial snapshot fetch to become slow (not a concern at today's
   scale, worth a comment marking it as a future lever).
3. **Know Supabase's realtime connection limits for your plan** — the
   free tier caps concurrent Realtime connections and messages/second
   per project; a "live service" plan should include picking (and
   budgeting for) a paid tier before real user load arrives, not after
   an outage. Check the current limits on Supabase's pricing page at
   deploy time, since they change.
4. One channel per table (already true, see §2.3) keeps connection count
   proportional to *open tables*, not to *players* — confirm this holds:
   Supabase Realtime channels support multiple subscribers per channel
   from different clients, so nine players plus a DM on one table should
   be nine-plus-one *subscriptions* on *one* channel's broadcast fan-out,
   not nine-plus-one separate channels. Verify this in practice under
   load (§8) rather than assuming.

**Outcome:** payload sizes that don't balloon with custom art, and a
known (not guessed-at) ceiling for how many concurrent tables/players
the current Supabase plan actually supports.

---

## 7. Phase 6 — Resilience & correctness edge cases

1. **Idempotent reducer actions.** Since Phase 1's reconnect logic
   re-hydrates from a fresh snapshot, and a `postgres_changes` INSERT
   could in rare cases arrive twice (network retries), confirm
   `ADD_ENTITY`/`ADD_LAYER`/`ADD_ISLAND`/`ADD_PLAYER` in
   `src/state/store.jsx` stay no-ops on a duplicate id (worth an explicit
   test — `ADD_ENTITY` already merges into the existing dict by id,
   which is naturally idempotent; verify the others are too).
2. **Clock skew.** `touch_updated_at()` uses the database's `now()`, not
   the client's clock — correct as-is; don't introduce any client-side
   timestamp comparisons for conflict resolution (§5) without being
   deliberate about this.
3. **RLS regressions.** Every new realtime feature (presence, broadcast)
   should get a matching pass over what a non-member of a table could
   theoretically see or send — Presence and Broadcast channels are
   scoped by channel name (`table:${tableId}` today), not by RLS the way
   `postgres_changes` is, so **don't put anything sensitive in a
   Broadcast payload** (§4's drag positions are fine; a DM's private
   note would not be). Revisit `16_dm_only_edits.sql`'s trust model
   whenever a new write path is added.
4. **The Import feature stays local-mode-only.** `GameView.jsx`'s
   `importTable` already refuses in cloud mode; don't quietly lift that
   restriction without designing an actual server-side "atomically
   replace this table's entities/layers/islands" RPC first — a client-
   side loop of individual `remoteApi.js` calls importing a whole table
   is neither atomic nor realtime-broadcast-friendly (it'd fire a storm
   of individual change events instead of one clean state transition).

---

## 8. Phase 7 — Observability (know when it breaks)

There is currently zero monitoring — a Realtime outage or a silent
desync would only surface as a confused player message.

**Steps:**
1. Add basic error tracking (e.g. Sentry's free tier, or even a
   lightweight custom logger POSTing to a Supabase Edge Function) around
   every `reportError` call site in `GameView.jsx` — today those just
   `console.error`/no-op; a live service needs these to actually reach
   a human.
2. Log Realtime channel state transitions (`SUBSCRIBED`, `CHANNEL_ERROR`,
   `TIMED_OUT`, `CLOSED`) from Phase 1's connection-state listener, at
   minimum to the browser console with a timestamp, ideally to a real
   log sink.
3. Track a simple client-side metric: time from a local optimistic
   dispatch to the matching Realtime echo arriving back (a rough
   round-trip latency signal) — cheap to add, useful for noticing
   regional latency problems before players complain.
4. Watch Supabase's own project dashboard (Database → Realtime tab,
   plus general Postgres load) during and after rollout — no code
   needed, just make it part of the actual launch checklist.

---

## 9. Phase 8 — Load testing before calling it "live service"-ready

Nothing above has been tested beyond a couple of manual browser tabs
this session. Before treating this as production-ready for real
sessions:

1. Simulate a full table (1 host + 9 players) with a scripted client
   (e.g. a Node script using `@supabase/supabase-js` directly, no
   browser needed) each moving tokens/editing sheets at a realistic
   cadence, and confirm every client's local state converges to the
   same thing within a reasonable window.
2. Simulate a mid-session network drop for one client and confirm
   Phase 1's resnapshot-on-reconnect actually recovers it correctly.
3. Run several tables concurrently (simulating multiple DMs hosting at
   once) to sanity-check the per-project connection ceiling from §5.3
   against real numbers, not just documented limits.
4. Only after this: treat cloud mode as ready for a real group, not just
   a demo.

---

## Suggested order of work

Given everything above, if picking where to start:

1. **Phase 1** (reconnect hardening) — cheap, and everything else's
   correctness depends on the sync layer actually being trustworthy.
2. **Phase 5.1** (wire up Storage uploads) — single highest bandwidth
   win, already-built code just needs connecting.
3. **Phase 2** (Presence) — directly closes a named pitfall, moderate
   effort, high visible payoff ("who's actually here" is a real feature
   players will notice).
4. **Phase 7** (basic observability) — do this *before* Phase 8, not
   after, so load testing actually produces useful signal.
5. **Phase 8** (load test) — validates everything above actually holds
   up before calling it done.
6. **Phases 3, 4, 6** — polish, tackle as time allows; none of them are
   blocking for "a real table can play a real session reliably."
