# Hearthbound — Pitfalls Log

A running list of the ways this app can bite you, found during a schema
audit of the full login → playthrough → logout flow. Kept separate from
`APP_OVERVIEW.md` (which describes what the app *does*) so this can stay a
living "things to revisit" list without cluttering that description. For
the realtime/scale-related items here (#4, #5, #7), see
`REALTIME_ROADMAP.md` for the full step-by-step implementation plan.

**Status legend:** ✅ Fixed · 🟡 Needs a decision (not a bug) · ⬜ Deferred / accepted limitation

| # | Issue | Status | Fix / Next step |
|---|-------|--------|------------------|
| 1 | Any seated player could edit any token (HP, AC, another player's sheet) — no owner/host write gate | ✅ | Decided: DM edits everything; a player may only move their own hero, and open/close a chest. Enforced client-side in `GameView.jsx` (`canMoveEntity`/`canUpdateEntity` — every mutation funnels through these) and `RightPanel.jsx`/`TokenSidebar.jsx` (read-only fields, hidden buttons, host-only sidebar), and server-side for cloud mode via `16_dm_only_edits.sql` (RLS + a field-level trigger). See §1 below for exactly what's allowed and why. |
| 2 | DM notes / mob droppables were only UI-hidden, not actually private — readable via devtools or a direct query | ✅ | Split into a new host-only-readable `entity_dm_data` table (`15_entity_dm_data_privacy.sql`) — a non-host query or Realtime subscription now returns zero rows, enforced by Postgres RLS. |
| 3 | `saveSession` called `localStorage.clear()` before every save — hosting a 2nd local table wiped the 1st | ✅ | Removed the `clear()` call (`src/state/persistence.js`). A failed save now just warns via the existing quota-exceeded path instead of nuking other tables. |
| 4 | Realtime broadcasts the full row (incl. embedded base64 images/jsonb) on every tiny update | ⬜ | Fix is to wire up the already-built `storageUpload.js` so images are URLs, not embedded data (see #8) — planned as `REALTIME_ROADMAP.md` Phase 5. |
| 5 | No conflict resolution — concurrent edits to the same token silently overwrite (last write wins) | ⬜ | Shrunk a lot by the DM-only edit model (#1) since most fields now have one legitimate writer; remaining cases planned as `REALTIME_ROADMAP.md` Phase 4. |
| 6 | Losing the anonymous auth session (cleared cookies, new browser) permanently strands that identity | 🟡 | **Fixed for hosts** — REQ-003 gave hosts a real email/password account (`src/lib/auth.js`'s `signUpHost`/`signInHost`), so signing in from any device resumes every table they host, no `localStorage` dependency. Still open for players: joining stays anonymous and frictionless by design, so a player who loses their session still can't recover their seat. Tables hosted anonymously before REQ-003 also have no migration path — that identity's `localStorage` is still the only way in. |
| 7 | No disconnect detection in cloud mode — closing the tab without clicking Leave leaves the seat "connected" forever | ⬜ | Needs a Realtime Presence channel — planned as `REALTIME_ROADMAP.md` Phase 2; explicit Leave (the more common path) is fixed as part of #10 below. |
| 8 | Image uploads still embed base64 data URLs even in cloud mode | ⬜ | `uploadImage()` (`src/lib/storageUpload.js`) is implemented and ready — just not called from `TokenSidebar.jsx` / the background uploader yet. |
| 9 | No automated tests — a refactor can silently break local or cloud sync | ⬜ | No test framework in the project yet (`package.json`). Would need to add one (e.g. Vitest) plus mapper/reducer round-trip tests. |
| 10 | Rare race: two players joining at the exact same instant could both pass the 10-seat capacity check | ⬜ | Would need `select ... for update` (row lock) on the table row inside `join_table`, or a serializable transaction. Low priority — needs precise timing to trigger. |
| 11 | Anonymous sign-in was enabled on the live Supabase project (Authentication → Providers) to unblock cloud-mode testing | 🟡 | **Not a toggle to flip back off later** — it's still the permanent auth mechanism for every player (SPEC.md §9.3, `supabase/README.md` step 3); disabling it would break joining outright. REQ-003 is the "real login/account system" this row anticipated, but only for hosts — `signUpHost`/`signInHost` (`src/lib/auth.js`) replace anonymous sign-in on the host side only. Players still join anonymously via `ensureAnonymousSession()`, unchanged. |
| 12 | Prototype `connectivity_pings` scratch table + the toolbar's "☁️ Save to Supabase" button existed only to manually smoke-test that the browser can write to Supabase | ✅ | Removed 2026-09-09, once REQ-003's real sign-up/table-creation/resume flow proved connectivity far more thoroughly than the ping ever did: deleted the never-applied `20250101000017_connectivity_test.sql` migration, the `pingSupabaseRemote` export in `src/lib/remoteApi.js`, and the button/handler in `src/components/Toolbar.jsx` / `src/components/GameView.jsx`. |
| 13 | **Critical, now fixed:** the `players` table's own SELECT policy (`02_policies.sql`) checked table membership by querying `players` itself, so reading `players` — including from every *other* policy that subqueries it for a membership check (`tables`, `invite_codes`, `layers`, `islands`, `entities`, `entity_dm_data`, `storage.objects`) — recursed infinitely (`"infinite recursion detected in policy for relation players"`). This silently blocked every client-side read cloud mode depends on, for host and player alike, since `02_policies.sql` was written — never caught before because every earlier attempt at a real cloud session had failed even earlier (anonymous sign-in disabled, then an email rate limit). REQ-003's host sign-in verification was the first path to actually reach a `players` read. | ✅ | Fixed by `20250101000018_fix_players_rls_recursion.sql` — a `SECURITY DEFINER` helper function (`my_table_ids()`) mirroring this schema's existing `create_table`/`join_table` pattern, so the membership check reads `players` as its owner (bypassing RLS) instead of as the calling role. Applied to the live project via the SQL Editor and verified live 2026-09-09 (sign-up, table list, resume, and a full local-storage-clear cross-device login all worked afterward). |
| 14 | **Critical, now fixed:** `join_table` (`03_functions.sql`) declares `returns table (table_id uuid, player_id uuid)`, which makes `table_id` both an OUT parameter and a plpgsql variable for the whole function body — and it had **two** bare references to the column name `table_id` that collided with it, not one: a `where` clause (`from layers where table_id = v_table_id`) and, less obviously, `on conflict (table_id, auth_user_id)`. Postgres's default `plpgsql.variable_conflict = error` setting refuses to guess which is meant and raised `"column reference \"table_id\" is ambiguous"` on every call, blocking every player's *first* join to a table in cloud mode (a rejoin under an existing seat never reached this code path, since `whoami_for_code` short-circuits it — see `Landing.jsx`'s `JoinForm`). The first fix attempt (`...19`) only caught the `where` clause, since a plain `INSERT`'s target column list is just a bare name list — never ambiguous — which made it easy to assume `ON CONFLICT`'s target list works the same way. It doesn't: `ON CONFLICT`'s target list is parsed as a list of *expressions* (to support expression indexes like `on conflict (lower(email))`), so it goes through the same identifier resolution as a `WHERE` clause and hit the identical collision. Confirmed live: calling `join_table` directly still raised the identical error (Postgres code `42702`) even with `...19` applied. Never caught earlier for the same reason as #13: every previous attempt at a real multi-seat cloud session failed even earlier (anonymous sign-in disabled, then the #13 recursion bug) before a second player's `join_table` call ever actually ran. | ✅ | `20250101000019_fix_join_table_ambiguous_column.sql` qualified the `where` clause but wasn't sufficient on its own. `20250101000020_fix_join_table_on_conflict_ambiguous.sql` drops `ON CONFLICT` entirely, replacing it with an explicit "try `UPDATE`, `INSERT` if no row matched" — same upsert semantics, using only patterns already proven safe elsewhere in this schema. `create_table` and `whoami_for_code` were audited and don't have this bug (neither uses `ON CONFLICT`, and every other reference is already qualified). **Both `...19` and `...20` need to be applied live** via the SQL Editor, same as #13 and #18. |

*(Bonus, found and fixed alongside #2/#3 while auditing: leaving a table only marked a player "disconnected" rather than freeing the seat in cloud mode, and token stacking order relied on a `z_order` column the client never wrote. Both fixed in `14_entity_ordering_and_player_leave.sql` — see `APP_OVERVIEW.md` §6.)*

| 15 | **Critical, now fixed:** a signed-in host clicking **Leave** (`GameView.jsx`'s `doLeaveTable`) called `removePlayerRemote(me.id)` unconditionally, including for the host — deleting their own `players` row. `tables`' only SELECT policy (`02_policies.sql:17-19`) is `id in (select table_id from players where auth_user_id = auth.uid())`, which requires that exact row to exist — so leaving a table permanently hid it from the host's own `listMyTablesRemote()` query (`"Your tables"`), and from ever resuming or deleting it again, even though the table itself still existed and still counted against the 20-table cap (REQ-007). Reported live 2026-09-20: "once i click on leave table, in the list of user tables, the new table does not reflect." Root-caused by reading the actual RLS policy rather than guessing, then reproduced live with a throwaway test account: create table → Leave → table missing from "Your tables." | ✅ | `doLeaveTable` now special-cases `isRemote && isHost`: clears the local pointer and returns to Landing without touching the `players` row at all — no RPC call, nothing deleted. A player leaving still frees their seat exactly as before; only the host's own leave-without-losing-access is new. Local mode is unaffected (untouched by this branch, and already has a working host-recovery path via `RejoinHostForm` that doesn't depend on the row existing). Re-verified live with the same test account: table now stays visible, resumable, and deletable after Leave, with no sign-out/sign-in needed. |

---

## #1 in detail — the DM-only edit model (decided, implemented)

`SPEC.md` §2 originally designed token permissions as fully open ("a real
table is a cooperative, trusted space"), with an optional future "lock
hero tokens to their owner" setting. You asked for something stricter:
**the DM is the only one editing any information — players only move
their own token, open doors, and open chests.** That's now implemented,
superseding SPEC §2/§13's original plan.

**What a player can still do:**
1. Drag their own hero token around (col/row/island — not other players'
   heroes, not mobs, not doors, not chests). "Their own" means whichever
   hero the DM has linked to them via the new **Owner** field on that
   hero's inspector — a freshly placed hero starts unassigned, since
   placing is host-only now, so this is a required setup step per player.
2. Click a door to walk through it.
3. Click "Open chest" / "Close chest" on a chest's inspector.

**Everything else is DM-only**, including: placing or removing any
token, renaming/resizing/HP/AC/conditions on anything, a hero's entire
character sheet (abilities, saves, skills, attacks/rolling, spells,
bag/currency), chest contents and "Give to a player," DM notes and mob
droppables (already were), layers/islands (already were), and importing
a `.json` table (overwrites the whole shared state).

**Where it's enforced:**
- `GameView.jsx` — `canMoveEntity(entity)` and `canUpdateEntity(entity,
  patch)` gate every call to `moveEntity`/`updateEntity`, and `addEntity`/
  `removeEntity`/layer/island mutators are `if (!isHost) return;` outright.
  This is the single choke point every UI action already funnels through.
- `RightPanel.jsx` — read-only fields (`disabled`) for non-host, tab
  content wrapped in `<fieldset disabled>` for a hero's sheet (one native
  HTML disable instead of touching ~40 individual inputs), Remove/Give
  buttons hidden entirely for non-host.
- `TokenSidebar.jsx` — the whole panel is host-only now; a player sees
  "Only the DM can add tokens to the map" instead of the placement gallery.
- Cloud mode: `16_dm_only_edits.sql` makes this a real security boundary,
  not just a UI convention — `entities` INSERT/DELETE become host-only via
  RLS, and a BEFORE UPDATE trigger (`enforce_entity_write_permissions`)
  rejects any UPDATE from a non-host except the two allowed cases above,
  checked field-by-field (RLS alone can't express "these columns, only on
  this row" — hence the trigger).

**Caveat:** in local mode, this is a UX guardrail, not real security — a
single browser simulating "multiple players" via tabs is one trust
domain, so someone could still edit their own localStorage state or the
in-memory reducer directly if they wanted to. It's a real boundary only
in cloud mode, where players are genuinely different browsers/computers.
