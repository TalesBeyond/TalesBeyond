# REQ-004 — Player Accounts & Character Linking

| Field | Value |
| ----- | ----- |
| ID | REQ-004 |
| Title | Player Accounts & Character Linking |
| Status | Done (awaiting the developer's Smoke Test) |
| Phase | Auth hardening |
| Tier | Core |
| Area | Auth / cloud mode |
| Author | Blaxine |
| Created | 2026-09-09 |
| Last Updated | 2026-10-14 |

## Short Description

Gives a player a choice when joining a hosted table: create a real
email/password account (so their character survives a cleared browser or
a switch to a new device, resuming the exact same seat on rejoin), or
keep joining anonymously as a guest, exactly as today, with zero added
friction. A guest who later decides to create an account ends up with a
second, separate seat at the same table — the host relinks that seat's
hero to it using the "Played by" control that already exists, and can
then kick the old, now-stale guest seat. Cloud mode only; local demo mode
is unaffected.

## User Stories

1. As a returning player, I want to create an account so my character survives a cleared browser or a new device, so that I don't lose progress between sessions.
2. As a casual or one-off player, I want to keep joining instantly without an account, so that playing a single session stays as frictionless as it is today.
3. As a DM, I want to free up a stale seat left behind after a guest becomes an account holder, so that the roster and the table's 10-seat capacity don't fill up with abandoned identities. *(Done — Kick.)*

## Constraints

- **One seat per `(table_id, auth_user_id)`.** `join_table` (latest definition in `20250101000071_moderation.sql`) updates the caller's existing seat if there is one and inserts otherwise (`PITFALLS.md` #14). That is what makes an account durable across sessions with **no schema change**: only switching identities (guest → account, a new `auth_user_id`) produces a second seat.
- **Leaving deletes a non-host's seat today.** `doLeaveTable` (`GameView.jsx:3735`) calls `removePlayerRemote(me.id)` for every cloud player who isn't the host. Only the host is exempt (`:3764`), because deleting their row would hide the table from their own "Your tables" list. An account player hits the same problem: as long as Leave deletes their row, AC3 and AC5 can't hold. S009 extends the host exemption to account players.
- **`ensureAnonymousSession()` caches its session for the life of the page.** `sessionPromise` (`auth.js:8`) is never cleared, and the existing host sign-out (`HostTablesList`, `Landing.jsx:395`) calls `supabase.auth.signOut()` directly. After a sign-out, "Continue as guest" in the same page would get back the signed-out session, and `join_table` would run with no `auth.uid()`. S001 adds a `signOut()` that clears the cache.
- **The browser holds one Supabase session for every role.** A host signed in through REQ-003 is also "signed in" on the Join tab, and signing out from either tab signs out both. Accepted (Q3); S010 shows which account is signed in so nobody uses someone else's by accident.
- **Signing up or logging in replaces this browser's anonymous identity.** For a guest seat that's intended: it becomes the stale seat the DM kicks. But tables hosted *anonymously* before REQ-003 have no other way in (`PITFALLS.md` #6), so a player who signs up on that browser loses them. REQ-003's host sign-in already has this risk, with no warning. Whether to warn depends on the check in Q4 (S011).
- **Guest DM tables (REQ-008) have no `players` rows.** `JoinForm` first probes the invite code over Broadcast (`requestGuestJoin`, `Landing.jsx:974`) and falls back to the cloud join only when no guest DM answers. A player account can't hold a seat at a guest table, so the account path applies only to cloud tables. The probe keeps running first, whichever identity is in use.
- **Terms of Use (`071_moderation.sql`).** `join_table` refuses to run without the ticked terms version (`rpcWithTerms`), and every resume path records acceptance with `acceptTermsRemote(tableId)` (`remoteApi.js:81`). The consent tick (`ConsentCheck`, `Landing.jsx:48`) gates every landing action. The player "Your tables" Resume has to do the same as `HostTablesList.resume` (`Landing.jsx:381`).
- **Bans stick to accounts.** `banned_users` is keyed on `auth_user_id`, and `join_table` refuses a banned identity. An anonymous player escapes a ban by clearing storage, but a player account can't. Nothing to build; the inline error (AC4) just has to show the RPC's message.
- **Closed tables.** `join_table` refuses new seats at a closed table (`is_open = false`), but `JoinForm` resumes an existing seat through `whoami_for_code` first, so a seated player can still get back in. The same holds for Resume from "Your tables", which goes by `tableId` and doesn't need the invite code at all. So it also still works after the DM regenerates the code.
- **REQ-015 overlaps the entry paths.** REQ-015's S013 ("Players never read the database") replaces the player-side `fetchTableSnapshot` calls with "enter with the seat, wait for the DM's snapshot". REQ-004's join and Resume paths use `fetchTableSnapshot` today. Whichever REQ lands second updates the other's player entry paths. Players keep reading their own `players` rows under REQ-015, so `listMyJoinedTablesRemote` is unaffected.
- **The roster is the toolbar's Players dropdown** (`PlayerList`, `Toolbar.jsx:244`) on desktop and the Party sheet (`PhonePartySheet`, `PhoneChrome.jsx:768`) on phones. REQ-011 committed phones to full parity.
- **The Owner control is the hero inspector's "Played by" select** (`RightPanel.jsx:1218`). It already lets the host reassign any hero's `ownerId` to any current player row by name. The interview confirmed this fulfils "the DM links the token to that player", with no new linking UI needed.
- **Anonymous sessions can't upload to Storage** (`20250101000048_no_guest_uploads.sql`, keyed on the JWT's `is_anonymous`). This is a precedent for telling account holders apart from anonymous sessions on the server.
- The installed `@supabase/auth-js` exposes `session.user.is_anonymous`, so the client can tell "signed in for real" apart from "anonymous or no session" with no new RPC.
- No policy on `players` may subquery `players` directly (`PITFALLS.md` #13). The kick policy already goes through `my_hosted_table_ids()` (`056`), and this plan adds no new policy.
- `entities.owner_id references players(id) on delete set null` (`01_schema.sql:65`): kicking a stale seat un-assigns (not deletes) any hero it still owns.
- A player who signs up produces a brand-new `players` row that counts toward `enforce_table_capacity`'s 10-seat cap alongside their old guest row, until the DM kicks it.
- `config.toml`'s `enable_signup = true` / `enable_confirmations = false` already cover email/password sign-up project-wide, as for REQ-003 hosts, including the same live-project "Confirm email" caveat resolved by hand in **Authentication → Providers → Email**.
- **Host sign-in is switched off for now** (`SHOW_HOST_LOGIN = false`, `Landing.jsx`), so the Host tab offers only guest tables to a signed-out visitor. Player sign-in on the Join tab is not behind that switch. Once any session exists (an account, or the anonymous session a guest player gets), `HostForm` shows `HostTablesList` with "Create a new table". That was already true for anonymous sessions before REQ-004.
- The repo has zero test files or runner. Verification is the manual **Smoke Test** below.

## Architectural decisions

- Player auth reuses the same Supabase email/password provider as host auth. `src/lib/auth.js`'s `signUpHost`/`signInHost` become role-agnostic `signUp`/`signIn`, and both roles call them. A new `signOut()` in `auth.js` signs out and clears `ensureAnonymousSession()`'s cached promise; every sign-out control uses it. `ensureAnonymousSession()` otherwise keeps serving the "Continue as guest" path exactly as today.
- `JoinForm` (`src/components/Landing.jsx`) gains the same three-state shape `HostForm` already has (checking / signed-out / signed-in). Its signed-out state offers a choice between the sign-up/log-in form and "Continue as guest", where `HostForm`'s signed-out state is account-only. An anonymous session counts as signed-out.
- **Account players keep their seat when they leave.** An account player's Leave goes back to the landing screen without deleting their `players` row, the same as the host. A guest's Leave still frees the seat, since a guest who left can't come back to it anyway. An account player's seat is freed only by the DM's Kick (Q2).
- The DM's only linking mechanism stays the existing per-hero "Played by" select. There is no new "link to account" action, auto-name-matching, or seat merge.
- A signed-in player's "Your tables" list shows only tables where they hold a **non-host** seat (`is_host = false`). A table they host appears only under the "Host a table" tab.
- When a signed-in player enters a code for a table where they already have a seat, they resume it, and the name and color fields are optional (blank keeps the seat's current name and color).
- **One account per browser, shown by name.** The same account can host some tables and play at others; there's no separate host or player session. Whenever an account is signed in, both landing tabs ("Host a table" and "Join a table") show "Signed in as `<email>` · Not you? Sign out", using `session.user.email`.
- Removing a stale seat is the DM's existing **Kick** (`056_host_kick_player.sql`), a second, additive DELETE policy on `players` alongside the self-only Leave policy.

## Acceptance Criteria

- [ ] **AC1 — Guest join is unchanged.** "Join a table" with no account still works exactly as today: invite code, name, color, anonymous session. A guest's Leave still frees their seat.
- [ ] **AC2 — Sign-up creates a persistent player account.** Submitting a new email + password on the join flow creates a Supabase auth user, then proceeds to join the table by code exactly as a guest would.
- [ ] **AC3 — Log-in resumes the same identity and seat.** An account player who leaves the table keeps their seat. Logging in again (on any device) and re-entering the table's code, or picking it from "Your tables", resumes that seat (same `players.id`, same hero), not a new one.
- [ ] **AC4 — Errors show inline.** A wrong password, an email already in use, a banned account, or a closed table (for a new seat) shows a readable inline error without crashing.
- [ ] **AC5 — Signed-in player sees every table they've joined.** After signing in, a "Your tables" list shows every table where this account holds a non-host seat, with a Resume action per table. Resume records terms acceptance and still works after the DM regenerates the invite code.
- [ ] **AC6 — Sign out returns to the guest/sign-in choice.** A signed-in player can sign out. The join flow then shows the sign-up/log-in-or-guest choice again, not the table list, and "Continue as guest" then joins under a fresh anonymous identity.
- [ ] **AC7 — DM can link a signed-up guest's hero to their new seat.** Once a former guest has signed up and rejoined the same table (producing a second seat), the DM can select that new seat in the hero's "Played by" select.
- [x] **AC8 — Host can remove a stale seat.** The DM can kick any non-host player from the Players dropdown or the phone Party sheet, after a confirm, freeing its capacity slot. A non-host player has no such control. *(Shipped as Kick.)*
- [ ] **AC9 — Local demo mode is unaffected.** None of this appears in local demo mode. Joining stays exactly as it is today, with no account prompt.
- [ ] **AC10 — The signed-in account is named.** With an account signed in, both the "Host a table" and "Join a table" tabs show "Signed in as `<email>` · Not you? Sign out". The Sign out link there signs out of the browser (both tabs) and returns that tab to its signed-out state.
- [ ] **AC11 — Warn before losing an anonymous host identity** *(S011; see Q4).* Signing up or logging in on either tab, from a browser whose anonymous session still hosts tables, first warns "This browser hosts N table(s) without an account. Signing in will lose access to them." and only goes ahead on Continue.

## Technical Notes

> Line numbers are from 2026-10-14. The next migration number is `20250101000073`, though this plan needs no new migration.

- `src/lib/auth.js` — `ensureAnonymousSession()` at `:10` (cache `sessionPromise` at `:8`), `signUpHost` at `:28`, `signInHost` at `:43`. Rename the last two to `signUp`/`signIn` (their bodies are already role-agnostic) and update `HostAuthForm`'s call sites (`Landing.jsx:569`, `:571`). Add `signOut()`: `await supabase.auth.signOut()` then `sessionPromise = null`. Switch `HostTablesList.signOut` (`Landing.jsx:395`) to it.
- `src/components/Landing.jsx` — `HostForm` (`:221`) is the `authState` pattern to mirror in `JoinForm` (`:945`). The one difference: `JoinForm`'s signed-out state covers "no session" *and* "anonymous session" (both get the guest choice), and only a non-anonymous session (`session.user.is_anonymous === false`) skips to signed-in.
- `JoinForm`'s submit (`:953`) is reused once an identity is established: guest probe (`:974`), then `ensureAnonymousSession()` (`:981`), then `whoamiForCodeRemote` (`:984`), then `joinTableRemote` or resume, then `fetchTableSnapshot`. `ensureAnonymousSession()` returns the existing account session unchanged, so the account path needs no other change here. The name check (`:961`) moves after `whoami`, so a resume doesn't need a name.
- `src/lib/remoteApi.js` — `listMyTablesRemote` (`:127`) is the pattern for a new `listMyJoinedTablesRemote()`. Query `players` where `auth_user_id = caller` and `is_host = false`, join `tables` for `name` and `is_open`, and return `{ tableId, playerId, name, isOpen }`, newest first. The existing "members can read the roster of their table" and "members can read their table" policies already cover it. No new RPC or policy.
- `HostTablesList` (`Landing.jsx:357`, `resume` at `:381`) is the shape for the player list: `fetchTableSnapshot` → `acceptTermsRemote` → `onEnter`, Resume disabled until the consent box is ticked, and a "Join a different table" action and a Sign out link.
- `src/components/GameView.jsx` — `doLeaveTable` (`:3735`): widen the host exemption at `:3764` (`if (isRemote && isHost)`) to `isRemote && (isHost || isAccount)`, where `isAccount` comes from the current session's `is_anonymous === false`. Read it once on mount, or pass it in from `App.jsx`, since the session can't change while a table is open.
- Kick, already built: `kickPlayer` (`GameView.jsx:3806`), the confirm dialog (`:4761`), `onKick` on `PlayerList` (`Toolbar.jsx:260`) and `PhonePartySheet` (`PhoneChrome.jsx:799`), the kicked player's landing notice (`App.jsx:103`), and the `REMOVE_PLAYER` reducer case (`store.jsx:382`).
- No `T`-phase steps: the repo has zero test files or runner.

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| F | Foundation |
| P | Persistence |
| S | Service |
| U | UX |
| D | Docs |

Step IDs aren't renumbered, so done steps keep theirs. S009 was added on 2026-10-14.

### Slice 1 — Player signs up, logs in, or stays a guest, then joins by code

**Demoable when:** in cloud mode, "Join a table" offers a sign-up/log-in form with a "Continue as guest" option; guest join and leave behave exactly as before; signing up or logging in then joining by code enters the table under that real account; leaving and rejoining by code lands back in the same seat.
**Satisfies:** AC1, AC2, AC3, AC4, AC7, AC9 · **Covers:** US1, US2

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S001 | F | Generalize auth functions | Renamed `signUpHost`/`signInHost` to `signUp`/`signIn` in `src/lib/auth.js`; both, and the new `signOut()`, clear `ensureAnonymousSession()`'s cached promise. Added `getAccount()` (the signed-in account, or null for anonymous/none). `HostAuthForm` became the shared `AccountForm({ who })`, and `HostTablesList` signs out through `signOut()`. | — | `src/lib/auth.js`, `src/components/Landing.jsx` |
| ✅ | S002 | U | Join flow's sign-up/log-in-or-guest choice | `JoinForm` has the checking/signed-out/signed-in states (an anonymous session counts as signed out). To keep guest joining exactly as it was (AC1), signed out still shows the code form straight away, with a "Sign up or log in" link above it that opens `AccountForm` ("← Continue as guest" goes back). The code form itself moved to `JoinCodeForm`, unchanged except that on a cloud table the name may be blank to take back an existing seat. | S001 | `src/components/Landing.jsx` |
| ✅ | S009 | S | Account players keep their seat on Leave | `GameView` reads `getAccount()` once on mount (cloud tables), and `doLeaveTable`'s host exemption now covers accounts too: `isRemote && (isHost || isAccountRef.current)`. Guests (anonymous) still free their seat. | S002 | `src/components/GameView.jsx` |

### Slice 2 — Signed-in player resumes any table they've joined

**Demoable when:** after signing in, a "Your tables" list shows every table this account has joined as a player, with a working Resume button; a "Join a different table" action still reveals the code-entry form; signing out returns to the guest/sign-in choice and a guest join afterwards works.
**Satisfies:** AC5, AC6, AC10, AC11 · **Covers:** US1

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S003 | S | List joined tables | `listMyJoinedTablesRemote()` in `remoteApi.js` returns `{ tableId, playerId, name, isOpen }` for every non-host seat the signed-in user holds, newest seat first (`players.joined_at`). | — | `src/lib/remoteApi.js` |
| ✅ | S004 | U | "Your tables" list for players | `PlayerTablesList`, shown by `JoinForm` when signed in: Resume per table (`fetchTableSnapshot` → `acceptTermsRemote` → `onEnter`, gated on the consent tick), a "Closed" tag on closed tables, and "Join a table by code", which opens `JoinCodeForm` with a "← Your tables" link back. | S002, S003, S009 | `src/components/Landing.jsx` |
| ✅ | S010 | U | "Signed in as" line on both tabs | `SignedInAs` shows "Signed in as `<email>` · Not you? Sign out" at the top of `HostTablesList` and the player view, using `getAccount()` and `signOut()`. `HostTablesList` keeps its old bottom Sign out link only for an anonymous session, which has no email. No CSS needed. | S004 | `src/components/Landing.jsx` |
| ✅ | S011 | U | Warn before replacing an anonymous host identity | `AccountForm` (both tabs) calls `countAnonymouslyHostedTables()` before `signUp`/`signIn`. If the current session is anonymous and `listMyTablesRemote()` finds tables, it shows the AC11 warning with Cancel/Continue in place of the submit button. A failed check never blocks sign-in. | S001 | `src/components/Landing.jsx` |

### Slice 3 — Host removes a stale seat ✅ (shipped as Kick, `5dc3d67`)

**Demoable when:** the DM sees a Kick control on every other player's roster row, confirming it deletes that seat and frees a capacity slot; a non-host player sees no such control.
**Satisfies:** AC8 · **Covers:** US3

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S005 | P | Host-remove-seat policy | `20250101000056_host_kick_player.sql`: `my_hosted_table_ids()` (`SECURITY DEFINER`) plus the "the host can remove any seat at their table" DELETE policy, additive alongside the self-only Leave policy. In the combined file. | — | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql` |
| ✅ | S006 | S | Host-remove-seat wiring | `kickPlayer` in `GameView.jsx`: dispatches `REMOVE_PLAYER` and calls `removePlayerRemote` (cloud) or broadcasts (guest table, then refreshes the code). The kicked player's tab returns to Landing with a notice. | S005 | `src/components/GameView.jsx`, `src/App.jsx` |
| ✅ | S007 | U | Roster "Kick" control | Kick button on every non-host row in `PlayerList` (desktop Players dropdown) and `PhonePartySheet` (phones), behind a confirm dialog that names any hero the seat still plays. | S006 | `src/components/Toolbar.jsx`, `src/components/PhoneChrome.jsx`, `src/components/GameView.jsx` |

### Docs

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S008 | D | Glossary + Pitfalls update | Added "Guest player" and "Player account" to `reqs/GLOSSARY.md` ("Kick" was already there), and updated "Host account" for `signUp`/`signIn`/`signOut` and the shared account. `PITFALLS.md` #6 is now ✅ for hosts and players, listing the accepted guest and anonymous-host limitations; #11 now names REQ-004. | S010 | `reqs/GLOSSARY.md`, `PITFALLS.md` |

### Dependency graph

```
S001 → S002 → S009 → S004 → S010 → S008
         S003 ──────↗
S001 → S011                   (only if Q4's check finds real tables)
S005 → S006 → S007            (done)
```

## Out of Scope

- Upgrading a guest's existing anonymous session into a real account in place (`supabase.auth.updateUser`). It stays two separate seats plus a manual DM relink, consistent with REQ-003's rejection of the same approach for hosts.
- A dedicated "link to account" UI, automatic name-matching, or any merge of two seats into one. The existing "Played by" select is the entire linking mechanism.
- A "guest" badge or any other UI distinguishing anonymous from account-holding players in the roster.
- Any change to hero ownership beyond the `entities.ownerId` field "Played by" already writes.
- Password reset / forgot-password for players, the same limitation REQ-003 already accepts for hosts.
- Making an account mandatory for players, or removing the guest path.
- Any change to host accounts or host-side flows, apart from S001's rename and shared `signOut()`, S010's "Signed in as" line, and S011's warning if it's built.
- Separate host and player sessions in one browser (two Supabase clients with different storage keys). One account per browser is accepted (Q3).
- Bulk seat cleanup. The DM kicks one seat at a time.
- Player accounts at guest DM tables (REQ-008): those tables have no `players` rows to resume. The guest join probe keeps running before any account choice matters.
- A player profile (a remembered name or color across tables).

## Open Questions

- [x] **Q1 — Warn before removing a seat that still owns a hero?** *Resolved:* the Kick confirm names the hero the seat plays and says it stays on the map with no one playing it.
- [x] **Q2 — Can an account player give up their own seat?** *Resolved (Blaxine, 2026-10-14):* no. Leave keeps an account player's seat, and only the DM's Kick frees it. There is no self-service "Give up my seat".
- [x] **Q3 — Host and player accounts on one browser.** *Resolved (Blaxine, 2026-10-14):* accept one session per browser. A host account opening "Join a table" sees its non-host seats (often none) plus the code form, and Sign out on either tab signs out both. Both tabs show which account is signed in ("Signed in as `<email>` · Not you? Sign out", S010 / AC10), so someone on a shared device doesn't join under another person's account by accident.
- [x] **Q4 — Warn before signing up over an anonymous host identity?** *Resolved (2026-10-14):* S011 is built. The check below wasn't run before implementation, and the warning only appears on a browser whose anonymous session really does host tables, so it costs nothing if there are none. If the query comes back empty, S011 can be kept or removed; either is safe. The original rule, for reference — run this in the live project's SQL editor:

  ```sql
  select t.id, t.name, t.created_at
  from tables t
  join auth.users u on u.id = t.host_auth_id
  where u.is_anonymous;
  ```

  - No rows, or only abandoned test tables → no warning needed.
  - Real tables still in use → keep S011: the AC11 warning on both the Host and Join sign-in paths.

## Smoke Test

> Developer runs the app; the agent does not self-run.

1. In cloud mode, open "Join a table" and confirm "Continue as guest" still joins by code with a name/color exactly as before. Leave, and confirm the DM's roster loses that seat. *(AC1)*
2. Sign up with a new player email/password; confirm it proceeds to join a table by code successfully. *(AC2)*
3. Have the DM assign you a hero. Leave, and confirm the DM's roster still shows your seat. Clear site data (or use another browser), log in with the same email/password, and re-enter the table's code with the name left blank; confirm you land in the same seat with the same hero. *(AC3)*
4. Try a wrong password, and try signing up with the email from step 2; confirm both show a clear inline error. Have the DM close the table, then try joining it by code from a new account; confirm the closed-table error. *(AC4)*
5. While signed in, confirm "Your tables" lists every table joined as a player; join a second table by code and confirm it now appears too. Have the DM regenerate the first table's code, click Resume on it, and confirm it loads fully. *(AC5)*
6. Click Sign out; confirm it returns to the sign-up/log-in-or-guest choice, not the table list. Then "Continue as guest" into a table and confirm the DM sees a new, separate seat. *(AC6)*
7. As a guest, join a table and have the DM assign you a hero via "Played by". Sign up for an account and rejoin the same table by code (producing a second seat); as the DM, open that hero's "Played by" select and confirm the new seat appears and can be selected. *(AC7)*
8. As the DM, kick the old, now-stale guest seat; confirm it disappears from the roster and frees a capacity slot, and that a non-host player has no Kick control. *(AC8, regression)*
9. Repeat step 1 in local demo mode (no Supabase configured) and confirm nothing changed: no account prompt appears anywhere. *(AC9)*
10. Sign in to an account on "Join a table", then switch to "Host a table". Confirm both tabs show "Signed in as `<email>` · Not you? Sign out". Click it on the Join tab and confirm the Host tab is signed out too. *(AC10)*
11. In a browser whose anonymous session hosts a cloud table, start signing up on the Join tab. Confirm the warning names the table count; Cancel keeps the anonymous session and the table, and Continue signs up. (The Host tab shares `AccountForm`, but it can only be reached there while `SHOW_HOST_LOGIN` is on.) *(AC11)*

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| M | 10–13 (+1 for S011) | Slice 3 shipped earlier as Kick. Slices 1–2 cover two auth helpers, the second `JoinForm` branch with its "Your tables" list, the Leave exemption, the "Signed in as" line, and S011's warning. |

## Considered And Rejected

- **Upgrading the guest's anonymous session in place (`supabase.auth.updateUser`).** It would keep the same `auth_user_id` and skip relinking entirely, but it adds a second identity-conversion path to a codebase that deliberately rejected this approach for hosts in REQ-003, in favor of one consistent sign-up-first pattern for both roles.
- **A dedicated "link to account" / seat-merge UI.** The existing "Played by" select already reassigns a hero to any current player row by name, which the interview confirmed is enough. New merge logic would duplicate ownership reassignment that already exists in one place.
- **A player-visible "Your tables" search, filter, or pagination.** This mirrors the same simplicity call `HostTablesList` already made: a flat list, deferred until table counts actually need more.
- **Keeping Leave as "delete my seat" for account players.** It would make AC3 and AC5 impossible: the seat, and the hero assignment with it, would be gone the first time the player left.

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-09-09 | Blaxine | Initial plan. |
| 2026-09-30 | Claude | Status review against the code. Not started. Brought the plan up to date with the `join_table` rewrite (`020`), guest DM tables (REQ-008), the roster moving to the Players dropdown and Party sheet, "Played by", and the anonymous-upload block (`048`). |
| 2026-10-08 | Claude | Paths updated for the reqs/ rename. |
| 2026-10-14 | Claude | Status review against the code. Slice 3 is done, shipped as Kick (`056_host_kick_player.sql`, `5dc3d67`) with a confirm dialog and a kicked-player notice, so Q1 is resolved and "notify a removed player" is no longer out of scope. Slices 1–2 not started. Found and planned for: Leave deleting a non-host's seat (new S009, account players keep theirs), `ensureAnonymousSession()`'s cache surviving sign-out (S001 adds `signOut()`), one session shared by host and player roles (Q3), signing up replacing a legacy anonymous host identity (Q4), terms acceptance on Resume (`071`), bans, closed tables, Resume after a code regenerate, and the REQ-015 overlap on player entry paths. Name/color optional on resume. Refreshed line numbers. |
| 2026-10-14 | Blaxine / Claude | Q2 resolved: only the DM's Kick frees an account player's seat. Q3 resolved: one session per browser, plus a "Signed in as `<email>` · Not you? Sign out" line on both landing tabs (new S010, AC10). Q4: decision rule agreed. A SQL check of the live project decides whether to build the anonymous-host warning (new conditional S011, AC11). Smoke Test steps 10–11 added. |
| 2026-10-14 | Claude | Implemented. Slice 1 (`3869be7`): S001, S002, S009. Slice 2 (`099c992`): S003, S004, S010, S011, with S011 built without waiting on Q4's check, since it only shows on browsers that need it. Docs: S008. Signed-out guests still see the code form first, with sign-up/log-in one click away, to keep AC1's "zero added friction". Noted the `SHOW_HOST_LOGIN` switch, which limits AC10/AC11's Host-tab half. Moved to `reqs/done/`; ACs are left for the developer's Smoke Test. |
