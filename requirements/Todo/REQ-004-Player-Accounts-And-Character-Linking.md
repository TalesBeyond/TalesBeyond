# REQ-004 — Player Accounts & Character Linking

| Field | Value |
| ----- | ----- |
| ID | REQ-004 |
| Title | Player Accounts & Character Linking |
| Status | Todo |
| Phase | Auth hardening |
| Tier | Core |
| Area | Auth / cloud mode |
| Author | Blaxine |
| Created | 2026-09-09 |
| Last Updated | 2026-09-09 |

## Short Description

Gives a player a choice when joining a hosted table: create a real
email/password account (so their character survives a cleared browser or
a switch to a new device, resuming the exact same seat on rejoin), or
keep joining anonymously as a guest, exactly as today, with zero added
friction. A guest who later decides to create an account ends up with a
second, separate seat at the same table — the host relinks that seat's
hero to it using the Owner control that already exists, and can then
remove the old, now-stale guest seat. Cloud mode only; local demo mode is
unaffected.

## User Stories

1. As a returning player, I want to create an account so my character survives a cleared browser or a new device, so that I don't lose progress between sessions.
2. As a casual or one-off player, I want to keep joining instantly without an account, so that playing a single session stays as frictionless as it is today.
3. As a DM, I want to free up a stale seat left behind after a guest becomes an account holder, so that the roster and the table's 10-seat capacity don't fill up with abandoned identities.

## Constraints

- `join_table`'s upsert (`supabase/migrations/20250101000003_functions.sql:100-107`, `on conflict (table_id, auth_user_id) do update`) already resumes the *same* `players` row whenever the same `auth_user_id` rejoins a table — this is what makes an account durable across sessions with **no schema change**: only switching identities (guest → account, a new `auth_user_id`) produces a second seat.
- The installed `@supabase/auth-js` already exposes `session.user.is_anonymous` (`node_modules/@supabase/auth-js/dist/main/lib/types.d.ts`) — the client can already tell "signed in for real" apart from "anonymous or no session" for its own session, with no new RPC.
- `RightPanel.jsx`'s existing `OwnerField` (`src/components/RightPanel.jsx:172-194`) already lets the host reassign any hero's `ownerId` to any current player row by name — confirmed during the interview that this already fulfills "the DM links the token to that player," with no new linking UI needed.
- No policy on `players` may subquery `players` itself directly — doing so is exactly what caused the infinite-recursion bug fixed in REQ-003 (`PITFALLS.md` #13). The new host-remove-seat policy this plan adds must go through its own `SECURITY DEFINER` helper, mirroring `my_table_ids()` (`20250101000018_fix_players_rls_recursion.sql`), not an inline subquery.
- `entities.owner_id references players(id) on delete set null` (`supabase/migrations/20250101000001_schema.sql:65`) — removing a stale seat automatically un-assigns (not deletes) any hero it still owns. Removing the old seat before relinking is a harmless, easily-corrected no-op, not data loss.
- A returning player who signs up produces a brand-new `players` row that counts toward `enforce_table_capacity`'s 10-seat cap (`01_schema.sql:73-85`) alongside their old, now-stale guest row, until the host removes it (Slice 3).
- `config.toml`'s `enable_signup = true` / `enable_confirmations = false` (lines 220, 225) already cover email/password sign-up project-wide, same as REQ-003 relied on for hosts — including the same live-project "Confirm email" caveat REQ-003 already resolved by hand in **Authentication → Providers → Email**.
- The repo has zero test files or runner (consistent with REQ-001/REQ-003) — verification is the manual **Smoke Test** below.

## Architectural decisions

- Player auth reuses the same Supabase email/password provider as host auth, via `src/lib/auth.js`'s `signUpHost`/`signInHost` generalized to role-agnostic `signUp`/`signIn` (both roles call the same two functions). `ensureAnonymousSession()` is untouched and keeps serving the "Continue as guest" path exactly as today.
- `JoinForm` (`src/components/Landing.jsx`) gains the same three-state shape `HostForm` already has (checking / signed-out / signed-in) — but its signed-out state offers a choice between the sign-up/log-in form and "Continue as guest," where `HostForm`'s signed-out state is account-only.
- The DM's only linking mechanism stays the existing per-hero Owner dropdown — no new "link to account" action, auto-name-matching, or seat merge is introduced.
- A signed-in player's "Your tables" list shows only tables where they hold a **non-host** seat (`is_host = false`); a table they separately host still only appears under the "Host a table" tab.
- Removing a stale seat is host-only, added as a **second, additive** DELETE policy on `players` alongside the existing self-only Leave policy — Postgres OR's multiple permissive policies for the same command together, so neither replaces the other.

## Acceptance Criteria

- [ ] **AC1 — Guest join is unchanged.** "Join a table" with no account still works exactly as today: invite code, name, color, anonymous session.
- [ ] **AC2 — Sign-up creates a persistent player account.** Submitting a new email + password on the join flow creates a Supabase auth user, then proceeds to join the table by code exactly as a guest would.
- [ ] **AC3 — Log-in resumes the same identity and seat.** Logging in with an already-registered player account and re-entering a table's code resumes that account's existing seat (same `players.id`), not a new one.
- [ ] **AC4 — Bad credentials show an inline error.** A wrong password, or signing up with an email already in use, surfaces a readable inline error without crashing.
- [ ] **AC5 — Signed-in player sees every table they've joined.** After signing in, a "Your tables" list shows every table where this account holds a player seat, with a Resume action per table.
- [ ] **AC6 — Sign out returns to the guest/sign-in choice.** A signed-in player can sign out; the join flow then shows the sign-up/log-in-or-guest choice again, not the table list.
- [ ] **AC7 — DM can link a signed-up guest's hero to their new seat.** Once a former guest has signed up and rejoined the same table (producing a second seat), the DM can select that new seat as a hero's Owner from the existing dropdown.
- [ ] **AC8 — Host can remove a stale seat.** The host has a control to delete any non-host player row from the roster (freeing its capacity slot); a non-host player has no such control.
- [ ] **AC9 — Local demo mode is unaffected.** None of this appears in local demo mode — joining stays exactly as it is today, with no account prompt.

## Technical Notes

- `src/lib/auth.js:28-50` — rename `signUpHost`/`signInHost` to role-agnostic `signUp`/`signIn` (the bodies are already generic email/password calls with no host-specific logic); update `Landing.jsx`'s `HostAuthForm` call sites (currently lines 233, 235) to the new names. `ensureAnonymousSession()` (lines 10-23) is untouched.
- `src/components/Landing.jsx:73-113` (`HostForm`) — the `authState` (`checking`/`signedOut`/`signedIn`) pattern to mirror in `JoinForm` (currently lines 394-498). The one difference: `JoinForm`'s signed-out state must distinguish "no session" and "an anonymous session already exists" (both eligible for the guest choice) from "a real account is signed in" (skip straight to signed-in), using `session.user.is_anonymous` from `supabase.auth.getSession()`.
- `src/components/Landing.jsx:394-465` (`JoinForm`'s current submit) — the code-entry + `ensureAnonymousSession()`/`whoamiForCodeRemote`/`joinTableRemote` logic is reused as-is once an identity (guest or account) is established; it does not need to change, since `join_table`/`whoami_for_code` already key off `auth.uid()` regardless of how it was established.
- `src/lib/remoteApi.js:80-115` (`listMyTablesRemote`) — the pattern to mirror for a new `listMyJoinedTablesRemote()`: query `players` where `auth_user_id = caller` and `is_host = false`, join `tables` for the name, return `{ tableId, playerId, name }`. No new RPC or RLS policy — the existing "members can read the roster of their table" (via `my_table_ids()`) and "members can read their table" policies already cover it, since a row's own `auth_user_id` trivially satisfies that membership check.
- `src/components/RightPanel.jsx:60-73` — the player roster block where a host-only "Remove" control attaches to each non-self row, reusing the existing `.player-row`/`.player-tag` classes and the `btn btn-danger` convention already used by `RemoveButton` (lines 196-200).
- `src/components/GameView.jsx:593-602` (`leaveTable`) — the shape to mirror for a new host-only removal function: dispatch `{ type: 'REMOVE_PLAYER', id }` locally and call the existing `removePlayerRemote(id)` (`src/lib/remoteApi.js:283-285`), targeting someone else's id instead of `me.id`. `store.jsx`'s `REMOVE_PLAYER` case (`src/state/store.jsx:198`) and `realtime.js`'s player-DELETE listener already exist and need no change.
- `supabase/migrations/` — new migration adding `my_hosted_table_ids()` (a `SECURITY DEFINER` function mirroring `my_table_ids()` from `20250101000018_fix_players_rls_recursion.sql`, filtered to `is_host`) and a second `players` DELETE policy, `"the host can remove any seat at their table"`, using it — additive alongside the existing self-only DELETE policy from `20250101000014_entity_ordering_and_player_leave.sql:28-31`.
- This feature adds one new migration (the host-remove policy) and no other schema changes.
- No `T`-phase steps: the repo has zero test files or runner — verification is the manual **Smoke Test** below.

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| F | Foundation |
| P | Persistence |
| S | Service |
| U | UX |
| D | Docs |

### Slice 1 — Player signs up, logs in, or stays a guest, then joins by code

**Demoable when:** in cloud mode, "Join a table" offers a sign-up/log-in form with a "Continue as guest" option; guest join behaves exactly as before; signing up or logging in then joining by code enters the table under that real account.
**Satisfies:** AC1, AC2, AC3, AC4, AC7, AC9 · **Covers:** US1, US2

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S001 | F | Generalize auth functions | Rename `signUpHost`/`signInHost` to `signUp`/`signIn` in `src/lib/auth.js`; update `HostAuthForm`'s call sites in `Landing.jsx`. | — | `src/lib/auth.js`, `src/components/Landing.jsx` |
|  | S002 | U | Join flow's sign-up/log-in-or-guest choice | Give `JoinForm` the checking/signed-out/signed-in state machine (mirroring `HostForm`), where signed-out shows an email/password form (using S001) plus a "Continue as guest" action that runs today's unconditional `ensureAnonymousSession()` path unchanged; the existing code-entry submit logic runs after either path establishes an identity. | S001 | `src/components/Landing.jsx` |

### Slice 2 — Signed-in player resumes any table they've joined

**Demoable when:** after signing in, a "Your tables" list shows every table this account has joined as a player, with a working Resume button; a "Join a different table" action still reveals the code-entry form.
**Satisfies:** AC5, AC6 · **Covers:** US1

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S003 | S | List joined tables | Add `listMyJoinedTablesRemote()` to `remoteApi.js`, returning `{ tableId, playerId, name }` for every table the signed-in user has joined as a non-host, newest first. | — | `src/lib/remoteApi.js` |
|  | S004 | U | "Your tables" list for players | When `JoinForm` detects a signed-in (non-anonymous) session, show S003's list with a Resume button per table (via `fetchTableSnapshot`), a "Join a different table" action revealing the code-entry form, and a Sign out control — mirroring `HostTablesList`. | S002, S003 | `src/components/Landing.jsx` |

### Slice 3 — Host removes a stale seat

**Demoable when:** the host sees a Remove control on every other player's roster row, clicking it deletes that seat and frees a capacity slot; a non-host player sees no such control.
**Satisfies:** AC8 · **Covers:** US3

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S005 | P | Host-remove-seat policy | New migration: `my_hosted_table_ids()` (`SECURITY DEFINER`, mirroring `my_table_ids()`) plus a second `players` DELETE policy using it, additive alongside the existing self-only Leave policy. | — | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql` |
|  | S006 | S | Host-remove-seat wiring | Add a host-only removal function in `GameView.jsx` mirroring `leaveTable`'s shape (dispatch `REMOVE_PLAYER` + call `removePlayerRemote`), passed down to `RightPanel`. | S005 | `src/components/GameView.jsx` |
|  | S007 | U | Roster "Remove" control | Add a host-only, per-row "Remove" control to `RightPanel`'s player roster (excluding the host's own row), wired to S006. | S006 | `src/components/RightPanel.jsx` |
|  | S008 | D | Thesaurus + Pitfalls update | Add "Guest" and "Player account" to `THESAURUS.md`; update `PITFALLS.md` #6 to reflect that players now have the same account-based recovery path hosts already got in REQ-003. | S007 | `THESAURUS.md`, `PITFALLS.md` |

### Dependency graph

```
S001 → S002 → S003 → S004
S005 → S006 → S007 → S008
```

## Out of Scope

- Upgrading a guest's existing anonymous session into a real account in place (`supabase.auth.updateUser`) — stays two separate seats plus a manual DM relink, consistent with REQ-003's rejection of the same approach for hosts.
- A dedicated "link to account" UI, automatic name-matching, or any merge of two seats into one — the existing Owner dropdown is the entire linking mechanism.
- A "guest" badge or any other UI distinguishing anonymous from account-holding players in the roster.
- Any change to hero ownership beyond the `entities.ownerId` field the Owner dropdown already writes.
- Password reset / forgot-password for players — same limitation REQ-003 already accepts for hosts.
- Making an account mandatory for players, or removing the guest path.
- Any change to host accounts or host-side flows — REQ-003 is untouched.
- Bulk or self-service seat cleanup — the host removes one seat at a time.
- Notifying a removed player's own open tab that their seat was deleted — if their tab is still open, they'll only notice their next write failing.

## Open Questions

- [ ] **Q1 — Warn before removing a seat that still owns a hero?** Removing a seat auto-unassigns (not deletes) any hero it owns (`on delete set null`), which is easily corrected via the Owner dropdown. Deferred until real usage shows this catches a DM off guard often enough to warrant a confirmation step.

## Smoke Test

> Developer runs the app; the agent does not self-run.

1. In cloud mode, open "Join a table" and confirm "Continue as guest" still joins by code with a name/color exactly as before. *(AC1, AC9)*
2. Sign up with a new player email/password; confirm it proceeds to join a table by code successfully. *(AC2)*
3. Leave, return to Landing, log in with that same email/password, and re-enter the same table's code; confirm you land back in the same seat (same hero, if one was assigned), not a new one. *(AC3)*
4. Try a wrong password, and try signing up with the email from step 2; confirm both show a clear inline error. *(AC4)*
5. While signed in, confirm "Your tables" lists every table joined as a player; join a second table by code and confirm it now appears too; click Resume on one and confirm it loads fully. *(AC5)*
6. Click Sign out; confirm it returns to the sign-up/log-in-or-guest choice, not the table list. *(AC6)*
7. As a guest, join a table and have the DM assign you a hero via Owner. Sign up for an account and rejoin the same table by code (producing a second seat); as the DM, open that hero's Owner dropdown and confirm the new signed-in seat appears and can be selected. *(AC7)*
8. As the DM, click Remove on the old, now-stale guest seat; confirm it disappears from the roster and frees a capacity slot; confirm a non-host player has no such control. *(AC8)*
9. Repeat step 1 in local demo mode (no Supabase configured) and confirm nothing changed — no account prompt appears anywhere. *(AC9)*

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| M | 12–16 | Similar shape to REQ-003 but with one added migration (the host-remove policy, which needs care to avoid re-triggering the players-recursion bug) plus a second Landing.jsx form branch and a RightPanel addition. |

## Considered And Rejected

- **Upgrading the guest's anonymous session in place (`supabase.auth.updateUser`).** Would preserve the same `auth_user_id` and skip relinking entirely, but layers a second host-identity-conversion path onto a codebase that already deliberately rejected this exact approach for hosts in REQ-003, in favor of one consistent sign-up-first pattern for both roles.
- **A dedicated "link to account" / seat-merge UI.** The existing Owner dropdown already reassigns a hero to any current player row by name — confirmed sufficient during the interview. New merge logic would duplicate ownership-reassignment behavior that already exists in one place.
- **A player-visible "Your tables" search, filter, or pagination.** Mirrors the same simplicity call `HostTablesList` already made — a flat list, deferred until table counts actually make one necessary.

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-09-09 | Blaxine | Initial plan. |
