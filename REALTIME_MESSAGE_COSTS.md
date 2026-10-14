# Realtime message costs — ways to cut them

Notes for later, not planned work yet. Written 2026-10-14 against the
`fog-of-war` branch. See `HOSTING_COSTS.md` for prices and free-tier
limits, and `REALTIME_ROADMAP.md` for the wider realtime plan.

## What one change costs today

Every change to a token on a cloud table reaches the other browsers twice
(`src/lib/fastSync.js`):

1. **The announcement:** a Broadcast on the table's channel
   (`announceEntityChange`, `src/components/GameView.jsx:1215` →
   `sendEntity`, `src/lib/realtime.js:237`). Fast, but only a preview.
   It reaches the N − 1 other browsers; by default Broadcast doesn't echo
   back to the sender.
2. **The database write:** a `PATCH` to `entities?id=eq.<id>`
   (`moveEntityRemote` / `updateEntityRemote`, `src/lib/remoteApi.js`).
   It comes back out as a `postgres_changes` event
   (`src/lib/realtime.js:85`) to all N browsers, the sender included.
   Slower, but it's the authority: RLS is applied to each subscriber, and
   the guard in `fastSync.js` rolls back any announcement the database
   doesn't confirm within 10 s.

So one change at a table of N people is about **2N Realtime messages**.
Supabase bills Realtime by messages delivered (each one counted once per
receiving client) and by peak concurrent connections. The HTTP `PATCH`
itself isn't billed per request, only as egress. Check the dashboard's
**Usage** page before acting on any of this. At today's scale none of it
should matter.

Open sockets aren't the problem: each browser holds one websocket while
at a table, and every `supabase.channel(...)` in `src` has a matching
`removeChannel` on cleanup.

## Options, from least to most work

### 1. Debounce the database write for sheet edits — do first

Moves are already one write per drop. Sheet edits aren't: `updateEntity`
writes on **every keystroke** (comment at
`src/components/GameView.jsx:2254`). The announcement for those edits is
already batched to one per 250 ms by `createEntityOutbox`, but the
database write isn't. Each letter typed is one `PATCH` plus N echo
messages: a 40-character note at a 5-person table is about 200 messages
where about 10 would do.

(`REALTIME_ROADMAP.md` §2.4 treats per-keystroke writes as a future risk.
They're already happening.)

**Change:** batch `updateEntityRemote` per token, the way the outbox
batches announcements: merge the patches and write after about 500 ms
of quiet.

**Watch out for:**
- Sending any waiting write on GameView unmount and on `pagehide`, so
  closing the tab doesn't lose the last edit.
- Keeping the delay well under the guard's `CONFIRM_WITHIN_MS` (10 s), or
  other browsers will roll back announced edits that haven't been written
  yet.
- Keeping the special paths in `updateEntity` (trap hiding through
  `hideTrapRemote`, hide/fog through `sendConceal`) unbatched, or at
  least sending what's waiting before they run.

Privacy and authority don't change. Small and contained.

### 2. Stop listening to `postgres_changes` on `entities` — not on its own

Keep the database write for persistence, drop the echo, and rely on the
announcement alone. That halves the messages, but on its own it breaks
three things:

- **Authority:** Broadcast isn't checked by the server. A player could
  fake a move and the database would never correct it. Today the guard
  undoes anything the database never confirms.
- **The guard:** with no echo, another browser's change is never
  confirmed, so `settle` reverts it after 10 s. The guard would need
  rework.
- **Privacy edge cases:** what's never announced (hidden or fogged
  tokens, unrevealed traps) would only reach a DM's second tab on reload.

Only safe once the channel is private and authorized. That's what
**REQ-015 (DM-Authoritative Cloud Tables, `reqs/todo/`)** already plans:
private channels split by topic, the DM's browser as the authority, and
Postgres reached only through periodic saves. If REQ-015 goes ahead, it
covers this option and most of the message savings.

### 3. Broadcast from Database — the long-term fix if REQ-015 doesn't happen

Supabase's recommended replacement for `postgres_changes` at scale:

- a trigger on `entities` calls `realtime.broadcast_changes(...)`
- that sends each change to a **private** channel, with the topic chosen
  by the trigger, e.g. `table:<id>:dm` for everything and
  `table:<id>:players` only for what players may see

Authorization is checked once on join (RLS on `realtime.messages`) instead
of once per subscriber per change, so the database does less work. It's
also fast enough that the client-side announcement in `fastSync.js` could
probably go, which gets to **one message per change while staying
authoritative**.

Real migration: the trigger, RLS on `realtime.messages`, new topics, and
`fastSync` removed or reduced. Needs its own REQ.

## Suggested order

1. Do **#1** whenever convenient. Biggest saving for the effort, no risk
   to privacy or authority.
2. Decide on **REQ-015**. If it ships, #2 and #3 are moot.
3. If REQ-015 is dropped and Usage shows Realtime messages climbing,
   plan **#3**.
