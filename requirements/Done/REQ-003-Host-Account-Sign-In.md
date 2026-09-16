# REQ-003 — Host Account Sign-In

| Field | Value |
| ----- | ----- |
| ID | REQ-003 |
| Title | Host Account Sign-In |
| Status | Done |
| Phase | Auth hardening |
| Tier | Core |
| Area | Auth / cloud mode |
| Author | Blaxine |
| Created | 2026-09-09 |
| Last Updated | 2026-09-09 |

## Short Description

Replaces the host's anonymous Supabase identity with a real email/password
account, so a host can sign in from any device or browser and see (and
resume) every table they've created, instead of being permanently tied to
whichever single browser happened to hold their anonymous session
(PITFALLS.md #6). Players are untouched — joining a table via invite code
stays instant and anonymous exactly as it is today; only the host side of
cloud mode changes. Local demo mode is unaffected.

## Constraints

- `tables.host_auth_id` and `players.auth_user_id` already reference
  `auth.users(id)` generically (`supabase/migrations/20250101000001_schema.sql:16,32`)
  — neither `create_table` nor `join_table` (`20250101000003_functions.sql:31-113`)
  checks *how* `auth.uid()` was established, only that it's non-null. Email/password
  and anonymous users are both just rows in `auth.users`, so **no schema or RLS
  change is needed** for this feature.
- `supabase/config.toml`'s `[auth.email]` block already ships with
  `enable_signup = true` and `enable_confirmations = false` (lines 220, 225) —
  email/password sign-up is already enabled project-wide with no email-confirmation
  step required, the same way `enable_anonymous_sign_ins = true` already covers
  players. If this project was ever set up by hand instead of via the GitHub
  integration/CLI pushing `config.toml`, these two toggles need verifying in
  **Authentication → Providers** the same way `supabase/README.md` step 3 already
  calls out for anonymous sign-in.
- `ensureAnonymousSession()` (`src/lib/auth.js:10-23`) first calls
  `supabase.auth.getSession()` and only signs in anonymously if **no** session
  exists at all — it's a no-op once any session (anonymous or real) is already
  stored. This means `App.jsx`'s page-refresh resume path (`App.jsx:27-36`, which
  calls `ensureAnonymousSession()` unconditionally before `fetchTableSnapshot`)
  needs **no change**: a host who has already signed in with email/password keeps
  that session on refresh, since `ensureAnonymousSession()` only reads it back.
- The existing "members can read their table" RLS policy
  (`20250101000002_policies.sql:17-19`, `id in (select table_id from players
  where auth_user_id = auth.uid())`) already permits a signed-in host to select
  their own `tables` rows directly — listing "my tables" needs no new RLS policy
  or RPC, just a new client-side query.
- `Landing.jsx`'s `RejoinHostForm` / "host key" flow (`Landing.jsx:29,283-369`) is
  gated entirely on `!isSupabaseConfigured` — it's a local-mode-only testing
  workaround, unrelated to and untouched by this feature.
- Tables created under a purely anonymous host identity before this feature
  (including any created while testing) have no migration path to a real
  account here — once that anonymous session's `localStorage` is gone, so is
  access to those tables, exactly as PITFALLS.md #6 already describes.
- **Discovered and resolved during verification (2026-09-09):** `config.toml`'s
  `enable_confirmations = false` only governs the local CLI dev stack — it did
  not automatically apply to the live hosted project, whose "Confirm email"
  setting had to be disabled by hand in **Authentication → Providers → Email**
  (mirroring the manual anonymous-sign-in step in `supabase/README.md`) before
  sign-up worked without hitting Supabase's email rate limit.
- **Discovered and fixed during verification (2026-09-09):** the `players`
  table's own SELECT policy (`02_policies.sql`) checked table membership by
  querying `players` itself, so any read of `players` — including from every
  *other* policy that subqueries it for a membership check (`tables`,
  `invite_codes`, `layers`, `islands`, `entities`, `entity_dm_data`,
  `storage.objects`) — recursed infinitely (`"infinite recursion detected in
  policy for relation players"`). This is not a REQ-003 regression: it's a
  pre-existing bug in the base schema that has silently blocked every
  client-side read cloud mode depends on (host and player alike) since
  `02_policies.sql`, never caught before because every earlier attempt at a
  real cloud session failed even earlier (anonymous sign-in disabled, then the
  email rate limit above) — REQ-003's host sign-in was the first path to
  actually reach a `players` read. Fixed by
  `20250101000018_fix_players_rls_recursion.sql`, a `SECURITY DEFINER` helper
  function (`my_table_ids()`) mirroring this schema's existing
  `create_table`/`join_table` pattern, applied to the live project via the SQL
  Editor and confirmed live. See `PITFALLS.md` #13.

## Architectural decisions

- Host auth uses Supabase's built-in email/password provider
  (`supabase.auth.signUp` / `supabase.auth.signInWithPassword`) — no custom
  backend auth code, consistent with how anonymous auth is already just
  `supabase.auth.signInAnonymously()`.
- Two new sibling functions in `src/lib/auth.js`, `signUpHost(email, password)`
  and `signInHost(email, password)`, used only by the host-facing Landing flow.
  `ensureAnonymousSession()` stays exactly as-is and keeps serving `JoinForm`
  (players) and both resume paths (`App.jsx`, `Landing.jsx`'s prior-seat lookup).
- A new `listMyTablesRemote()` in `src/lib/remoteApi.js`, following
  `fetchTableSnapshot`'s existing multi-query `Promise.all` boundary pattern
  (no new RPC) — returns each table the signed-in user hosts (id, name, code,
  their player id) via the existing RLS, newest first.
- `Landing.jsx`'s cloud-mode host entry point changes shape: **not signed in**
  → an email/password sign-up-or-log-in form; **signed in** → a "Your tables"
  list (Resume per table) plus a "Create a new table" action that reveals
  today's existing map-name/cols/rows form. Local demo mode's `HostForm` is
  completely untouched (it never sees this branch).
- No password-reset flow is part of this plan — a host who forgets their
  password has no self-service recovery path here.

## Acceptance Criteria

- [x] **AC1 — Sign-up creates a persistent host account.** On Landing's host flow (cloud mode), submitting a new email + password creates a Supabase auth user and proceeds to create a table exactly as today, with that table's `host_auth_id` tied to the new account's permanent `auth.uid()`. *Verified live 2026-09-09* via an equivalent path to the one planned (`HostAuthForm` → `signUpHost` → `HostTablesList` → "Create a new table" → `HostTableForm` — see Revision History).
- [x] **AC2 — Log in resumes the same host identity.** Submitting the email + password of an already-registered host account signs in as that same account (same `auth.uid()`) rather than creating a new one. *Verified live 2026-09-09.*
- [x] **AC3 — Bad credentials show an inline error.** A wrong password, or signing up with an email already in use, surfaces a readable inline error (matching `HostForm`'s existing `error-note` pattern) without crashing or silently retrying. *Verified live 2026-09-09 — both "Invalid login credentials" and Supabase's own rate-limit error render correctly inline.*
- [x] **AC4 — Signed-in host sees every table they host.** After signing in, the host sees all of their previously created tables (name, at least), not just the most recent one. *Verified live 2026-09-09.*
- [x] **AC5 — Resuming a listed table reconnects fully.** Clicking Resume on a listed table fetches a full snapshot and enters `GameView` as that table's host, with the same permissions as if they'd just created it. *Verified live 2026-09-09.*
- [x] **AC6 — Works across devices/browsers.** Signing in with the same email + password from a different browser (simulating a separate device, with no prior `localStorage`) shows the same table list and can resume any table from it. *Verified live 2026-09-09* by clearing all local storage (session + identity + pointer) and logging back in — the same table list and Resume worked identically.
- [x] **AC7 — Sign out returns to the sign-in form.** A signed-in host can sign out; the host flow then shows the sign-up/log-in form again, not the table list. *Verified live 2026-09-09.*

## Technical Notes

- `src/lib/auth.js:1-23` — existing shape to mirror: `ensureAnonymousSession()` guards on `isSupabaseConfigured`, memoizes via `getSession()`, and throws Supabase's own `error` on failure. `signUpHost`/`signInHost` follow the same guard-and-throw shape but call `supabase.auth.signUp({ email, password })` / `supabase.auth.signInWithPassword({ email, password })` directly (no memoization needed — these are explicit user actions, not a lazy background check).
- `src/components/Landing.jsx:67-170` (`HostForm`) — today: name + color + map fields → `ensureAnonymousSession()` → `createTableRemote(...)`. This becomes two states: signed-out (email/password fields, Sign up / Log in submit) and signed-in (table list + create-new action, reusing the existing map-name/cols/rows JSX verbatim for the "create new" case). The player's display `name`/`color` fields stay exactly where they are today — the DM's display name shown to players is independent of their login email.
- `src/lib/remoteApi.js:77-152` (`fetchTableSnapshot`) — reused as-is for resuming a table picked from the list, same call already used by `HostForm`/`JoinForm`/`App.jsx`.
- `src/lib/remoteApi.js` — new `listMyTablesRemote()` sits alongside `fetchTableSnapshot`, querying `tables`/`players`/`invite_codes` filtered to the caller's own host rows (RLS already scopes this via `auth.uid()`, per Constraints above).
- `src/App.jsx:11-54` — `checkedResume` / `loadCurrentPointer` flow needs no change (per Constraints, `ensureAnonymousSession()` already no-ops when a real session exists); a host who refreshes mid-table resumes exactly as today.
- Styling: reuse `Landing.jsx`'s existing CSS classes verbatim — `field`, `field-label`, `btn btn-primary btn-block`, `error-note`, `divider-word`, `mode-toggle`, `footer-note`, `link-btn` (all already in `src/styles.css`) — this feature introduces no new visual language.
- This feature adds no new Supabase tables, columns, RPCs, or migrations.
- No `T`-phase steps: the repo has zero test files or runner (confirmed by search, consistent with REQ-001/REQ-002) — verification is the manual **Smoke Test** below.

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| F | Foundation |
| S | Service |
| U | UX |
| D | Docs |

### Slice 1 — Host signs up or logs in, then creates a table

**Demoable when:** in cloud mode, Landing's host flow shows an email/password form; submitting a new email creates an account and proceeds straight into creating a table exactly as before; submitting an existing account's credentials signs back in as that same host.
**Satisfies:** AC1, AC2, AC3

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S001 | F | Host auth functions | Add `signUpHost(email, password)` and `signInHost(email, password)` to `src/lib/auth.js`, mirroring `ensureAnonymousSession`'s guard/throw shape. | — | `src/lib/auth.js` |
| ✅ | S002 | U | Sign-up/log-in form | Replace `HostForm`'s unconditional `ensureAnonymousSession()` call with a signed-out state: email/password fields, a Sign up / Log in toggle, wired to S001; on success, proceed into the existing map-creation flow unchanged. Inline errors reuse the existing `error-note` pattern. | S001 | `src/components/Landing.jsx` |

### Slice 2 — Resume any hosted table from any device

**Demoable when:** signing in as an existing host (including from a browser with no prior `localStorage`) shows a list of every table that account has created, and clicking Resume on one re-enters it as host with full state.
**Satisfies:** AC4, AC5, AC6, AC7

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S003 | S | List hosted tables | Add `listMyTablesRemote()` to `remoteApi.js`, returning `{ tableId, code, name, playerId }` for every table the signed-in user hosts, newest first. | — | `src/lib/remoteApi.js` |
| ✅ | S004 | U | "Your tables" list | When a signed-in host session already exists (on mount or right after S002's sign-in), show S003's list with a Resume button per table (calling `fetchTableSnapshot` + the existing `onEnter`) and a "Create a new table" action that reveals the existing map-creation form. | S002, S003 | `src/components/Landing.jsx` |
| ✅ | S005 | U | Sign out | Add a sign-out control on the "Your tables" view (`supabase.auth.signOut()`), returning to S002's signed-out form. | S004 | `src/components/Landing.jsx` |
| ✅ | S006 | D | Thesaurus + Pitfalls update | Add "Host account" to `THESAURUS.md`; update PITFALLS.md #6 and #11 to reflect that hosts now have a real sign-in path (#11 already anticipated this — "only replace [anonymous sign-in] if a real login/account system is ever added"). | S005 | `THESAURUS.md`, `PITFALLS.md` |

### Dependency graph

```
S001 → S002 → S004 → S005 → S006
S003 ────────↗
```

## Out of Scope

- Password reset / "forgot password" — no self-service recovery for a locked-out host in this plan.
- Rescuing tables created under a purely anonymous host identity before this feature (including any created while testing this app) — no migration path exists for them.
- Email confirmation on sign-up — already disabled project-wide (`enable_confirmations = false`); this plan doesn't touch that toggle.
- OAuth or magic-link sign-in — email/password only, per the earlier scope decision.
- Making sign-in mandatory (or available) for players — the invite-code join flow stays anonymous and frictionless, unchanged.
- Deleting or archiving a table from the "Your tables" list — view and resume only.
- Changing a host's email or password after account creation.

## Open Questions

- [ ] **Q1 — Table list management.** Should "Your tables" eventually support deleting or archiving old tables? Deferred until a host actually accumulates enough tables for it to matter.
- [ ] **Q2 — Locked-out recovery.** Should a forgotten-password host have any self-service recovery? Deferred until this plan's no-reset limitation actually causes a lockout in practice.
- [x] **Q3 — Live "Confirm email" setting.** Resolved — disabled by hand in the live project's **Authentication → Providers → Email**; sign-up verified working afterward. *(2026-09-09)*

## Smoke Test

> Developer runs the app; the agent does not self-run.

1. In cloud mode, open Landing and confirm the host flow now asks for email + password instead of going straight to anonymous hosting.
2. Sign up with a new email/password; confirm it proceeds into today's map-creation form and successfully opens a table. *(AC1)*
3. Leave the table, return to Landing, and log in again with that same email/password; confirm it signs back in as the same host account rather than erroring or creating a duplicate. *(AC2)*
4. Try logging in with a wrong password, and try signing up with an email already used in step 2; confirm both show a clear inline error and don't crash. *(AC3)*
5. After logging in, confirm the "Your tables" list shows the table created in step 2. Create a second table from that screen and confirm both now appear in the list. *(AC4)*
6. Click Resume on one of the listed tables and confirm it opens exactly as if freshly hosted, with full host permissions. *(AC5)*
7. Clear this browser's storage entirely (or use a private window) and log in with the same email/password; confirm the same table list appears and a table can be resumed from it. *(AC6)*
8. Click Sign out; confirm the host flow returns to the signed-out email/password form, not the table list. *(AC7)*

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| M | 10–14 | No schema/RLS work at all — the entire feature is new client-side auth calls and a new Landing.jsx flow. Most of the time is in `Landing.jsx`'s new signed-out/signed-in states, not backend logic. |

## Considered And Rejected

- **Upgrading an existing anonymous session in place** (`supabase.auth.updateUser({ email, password })`, which converts an anonymous user into a permanent one while keeping the same `auth.uid()` — rescuing tables that user already hosted anonymously). Would recover pre-existing anonymous-hosted tables, but means permanently maintaining two parallel host-identity paths (anonymous-then-claim vs. sign-up-first) rather than one. The request that started this plan was explicitly to replace anonymous host sign-in with a real one, not layer an upgrade path on top of it.
- **A new `list_my_tables` SECURITY DEFINER RPC.** The existing "members can read their table" RLS policy already lets a host select their own rows directly via `auth.uid()` with no privilege escalation involved — a plain client-side query (mirroring `fetchTableSnapshot`'s existing pattern) is simpler than adding server-side function surface for a read RLS already permits.
- **Requiring email confirmation before a new host account is usable.** `supabase/config.toml` already ships with `enable_confirmations = false`; turning it on would add transactional-email deliverability as a new project dependency this feature doesn't otherwise need.
- **Making sign-in available or required for players too.** Rejected per the earlier scope decision — instant, frictionless anonymous join is core to the app's existing pitch ("no login screen") and stays untouched.

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-09-09 | Blaxine | Initial plan. |
| 2026-09-09 | Claude | Both slices implemented (S001–S006). Verified AC2, AC3, AC7 live; AC1/AC4/AC5/AC6 code-reviewed as correctly implemented but blocked from live verification by the live project's email rate limit (see Constraints, Q3). Status set to InProgress pending that check. |
| 2026-09-09 | Claude | "Confirm email" disabled on the live project (Q3 resolved). Verification then surfaced a pre-existing, cross-cutting `players` RLS infinite-recursion bug blocking every cloud-mode read — fixed via `20250101000018_fix_players_rls_recursion.sql`, applied live. All 7 ACs verified live afterward, including AC6 via a full local-storage clear + re-login. Status set to Done. |
