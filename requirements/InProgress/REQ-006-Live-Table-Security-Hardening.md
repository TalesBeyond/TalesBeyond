# REQ-006 — Live Table Security Hardening

| Field | Value |
| ----- | ----- |
| ID | REQ-006 |
| Title | Live Table Security Hardening |
| Status | InProgress |
| Phase | Security hardening |
| Tier | Core |
| Area | Auth / cloud mode / Supabase RPCs |
| Author | Blaxine |
| Created | 2026-09-13 |
| Last Updated | 2026-09-13 |

> Source PRD: REQ-006-PRD-Live-Table-Security-Hardening.md

## Short Description

A security hardening pass over the live Supabase project: a written, severity-ranked audit of host-credential security, cross-table/DM-data isolation, and abuse resistance, followed by concrete fixes for what the audit actually found — a weak host password policy and unthrottled table-creation/invite-code RPCs. Each fix lands as its own independently reviewable change; nothing is applied to the live project without the host confirming it first. Local demo mode is untouched throughout.

## User Stories

1. As a host, I want confidence that my account credentials can't easily be stolen or guessed, so that my account and every table I run stay under my control.
2. As a host or player, I want assurance that another table's information — and, within my own table, information meant for the host only (like DM notes) — genuinely cannot be seen or changed by someone who shouldn't have access, so that private game information stays private.
3. As a host, I want the game to keep working reliably even if someone tries to abuse or overload it, so that my sessions aren't disrupted by something outside normal play.
4. As a host, I want a clear, prioritized list of whatever security gaps are found, so I understand what's wrong and how serious each one is before anything changes.
5. As a host, I want to review and approve each fix before it reaches the live app, so a security improvement doesn't end up breaking an active game session.

## Constraints

- Every table in the current schema already has row-level security enabled (`grep`-confirmed across `supabase/migrations/*.sql`: `tables`, `invite_codes`, `players`, `maps`, `entities`, `layers`, `islands`, `entity_dm_data`, `user_preferences`) — there is no missing-RLS gap to close. US2's audit is a re-verification, not expected to require a code fix.
- No `service_role` key appears anywhere in the client bundle or repo (`grep`-confirmed) — `src/lib/supabaseClient.js:10-13` only ever uses `VITE_SUPABASE_PUBLISHABLE_KEY`, the anon-equivalent key that's safe to ship client-side.
- `create_table` and `join_table` (`supabase/migrations/20250101000003_functions.sql:31-113`) are `SECURITY DEFINER` functions with **zero app-level throttling** today. Supabase's `[auth.rate_limit]` block (`supabase/config.toml:196-210`) only governs its own auth endpoints (sign-in, sign-up, anonymous sign-ins, token refresh, OTP) — it does not apply to arbitrary RPC calls like these two, so it provides no protection here at all.
- Per `requirements/Done/REQ-003-Host-Account-Sign-In.md`'s own Constraints, `config.toml` values are **not guaranteed to auto-apply to the already-live hosted project** — several settings there had to be toggled by hand in the Supabase dashboard despite `config.toml` already having the intended value. The password-policy change in this plan carries the identical risk.
- No client code assumes a 6-character invite code (`grep`-confirmed in `src/components/Landing.jsx` — no `maxLength`, no length-specific regex/validation). Lengthening the code needs no client-side validation change, only the two generator functions.
- `HostTableForm`'s existing `catch (err) { setError(err.message ...) }` (`src/components/Landing.jsx:336-338`) already renders any `create_table` error through the existing `error-note` UI verbatim — the new table-cap rejection needs no new UI code.
- `supabase/config.toml`'s `[auth]` block (lines 180-184) currently ships `minimum_password_length = 6` and an empty `password_requirements`; `[auth.captcha]` (lines 212-216) is present but fully commented out.
- `invite_codes.code` (`supabase/migrations/20250101000001_schema.sql:21-27`) is a plain `text` primary key with no length constraint — existing 6-character codes keep working unchanged after the generator length changes.

## Architectural decisions

- Findings and the live-dashboard checklist are written to a new, standalone `SECURITY.md` at the repo root, distinct from `PITFALLS.md` but following its same `✅ Fixed · 🟡 Needs a decision · ⬜ Deferred / accepted limitation` status-legend convention, updated in place as later slices land fixes.
- Invite-code length increases from 6 to 8 characters, changed in both the server generator (`generate_unique_code`) and the client fallback generator (`generateInviteCode`) — no versioning or backfill; already-issued 6-character codes remain valid until regenerated.
- The per-host table-creation cap (20) is enforced inside `create_table` itself via a count against `tables.host_auth_id` before insert — no new table, no background job, no time-windowed tracking.
- Password policy is enforced entirely through Supabase's built-in `config.toml` auth settings (mirrored by hand on the live project's dashboard), not custom validation code — consistent with how password validation is handled everywhere else in this codebase today (nowhere).
- CAPTCHA, per-identity join-attempt cooldowns, and time-windowed create-table rate limiting are deliberately not built in this plan — each was weighed and set aside during the interview (see Out of Scope / Considered And Rejected), not overlooked.
- Every fix in this plan ships as its own independent migration/config change; none is applied to the live Supabase project until the host has reviewed and approved it (US5) — this is a process guarantee honored by every slice, not a feature with its own code path.

## Acceptance Criteria

- [ ] **AC1 — Findings report exists.** `SECURITY.md` contains a severity-ranked list of findings covering host-credential security, data-access/RLS isolation, and abuse/availability, plus a checklist of live-Supabase-dashboard settings the host must verify by hand (since this plan has no dashboard access).
- [ ] **AC2 — Data isolation re-verified.** `SECURITY.md` explicitly records that RLS is enabled and correctly scoped on every table (including `user_preferences`), and that DM-only data and storage-upload paths remain properly restricted, as a "verified, no change needed" entry rather than an open item.
- [ ] **AC3 — Weak passwords rejected.** A host sign-up or password change with a password shorter than 8 characters, or missing an uppercase letter, lowercase letter, or digit, is rejected against the local Supabase dev stack; `SECURITY.md`'s checklist tells the host how to mirror the same setting on the live project.
- [ ] **AC4 — Invite codes are 8 characters.** Every newly generated invite code (initial table creation and regeneration) is 8 characters long; a previously issued 6-character code keeps working until regenerated.
- [ ] **AC5 — Host table cap enforced.** `create_table` rejects a new table once the calling identity already hosts 20 tables, surfacing a clear inline error through the existing `error-note` UI with no new UI code.
- [ ] **AC6 — Fixes ship reviewably.** Each of Slice 2 and Slice 3 lands as its own independent, reviewable migration/config change, and is not applied to the live Supabase project until the host has explicitly reviewed and approved it.

## Technical Notes

- `supabase/migrations/20250101000003_functions.sql:7-26` — `generate_unique_code()`: the `for i in 1..6 loop` bound becomes `1..8`. No other change to its collision-retry logic.
- `supabase/migrations/20250101000003_functions.sql:31-67` — `create_table(...)`: add a capacity check (`select count(*) from tables where host_auth_id = auth.uid()`) before the `insert into tables`, raising a clear exception once at 20. Both changes ship as `CREATE OR REPLACE FUNCTION`, so they land as one new migration file, `supabase/migrations/20250101000026_security_hardening.sql`, mirrored into `supabase/00_combined_all_migrations.sql` (per the pattern already established for `20250101000025_user_preferences.sql`).
- `src/utils/inviteCode.js:5` — `generateInviteCode(length = 6)` default becomes `8`. This function is only used by local demo mode and as a client-side fallback; cloud mode always gets its code from `generate_unique_code()` server-side.
- `supabase/config.toml:180-184` — `minimum_password_length = 6` → `8`; `password_requirements = ""` → `"lower_upper_letters_digits"`.
- `src/components/Landing.jsx:290-340` (`HostTableForm`) — no code change; its existing `catch`/`error-note` path already surfaces the new cap's exception message.
- No new Supabase tables, columns, or RLS policy changes anywhere in this plan.
- No `T`-phase steps: the repo has zero test files or runner anywhere (confirmed by search, consistent with REQ-001/REQ-003) — verification is the manual **Smoke Test** below.

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| F | Foundation |
| P | Persistence |
| D | Docs |

### Slice 1 — Security findings report

**Demoable when:** `SECURITY.md` exists at the repo root with a severity-ranked findings list and a live-dashboard checklist the host can act on immediately.
**Satisfies:** AC1, AC2 · **Covers:** US2, US4

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S001 | D | Write SECURITY.md | New root-level doc, `PITFALLS.md`'s status-legend convention: findings for credential security (weak password policy, no CAPTCHA), data isolation (RLS/DM-data/storage-paths re-verified, no gap found), and abuse/availability (unthrottled `create_table`/`join_table`), each ranked by severity; plus a "Live Supabase dashboard checklist" section for settings this plan can't verify itself (password policy mirrored live, CAPTCHA provider decision, anonymous-sign-in rate limits). | — | `SECURITY.md` |

### Slice 2 — Host credential hardening

**Demoable when:** against the local Supabase dev stack, signing up with a 6-character or all-lowercase password is rejected; `SECURITY.md` is updated to reflect the change and to flag the live-project dashboard mirror step.
**Satisfies:** AC3 · **Covers:** US1

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S002 | F | Tighten password policy | `minimum_password_length` 6→8, `password_requirements` → `"lower_upper_letters_digits"`. | S001 | `supabase/config.toml` |
| ✅ | S003 | D | Update SECURITY.md status | Mark the password-policy finding ✅, add the live-dashboard mirror step to the checklist, and add a 🟡 row noting CAPTCHA as a deferred follow-up pending a provider account (see Open Questions). | S002 | `SECURITY.md` |

### Slice 3 — Abuse throttling on create_table/join_table

**Demoable when:** a freshly created or regenerated invite code is 8 characters; scripting 21 consecutive `create_table` calls under the same identity succeeds 20 times and then fails with a clear error.
**Satisfies:** AC4, AC5 · **Covers:** US3

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S004 | P | Lengthen invite codes | `generate_unique_code()`'s loop bound 6→8; `generateInviteCode(length = 6)` default →`8`. | S001 | `supabase/migrations/20250101000026_security_hardening.sql`, `src/utils/inviteCode.js` |
| ✅ | S005 | P | Cap tables per host | Add the `host_auth_id` count check to `create_table`, rejecting past 20 with a clear message. | S001 | `supabase/migrations/20250101000026_security_hardening.sql` |
| ✅ | S006 | D | Mirror migration + update SECURITY.md | Append S004/S005's migration to `supabase/00_combined_all_migrations.sql` (per the `20250101000025_user_preferences.sql` precedent); mark both findings ✅ in `SECURITY.md`. | S004, S005 | `supabase/00_combined_all_migrations.sql`, `SECURITY.md` |

### Dependency graph

```
S001 → S002 → S003
S001 → S004 → S006
S001 → S005 → S006
```

## Out of Scope

- CAPTCHA on host sign-up/sign-in — needs a real hCaptcha/Cloudflare Turnstile account and secret only the host can create; documented as a follow-up in `SECURITY.md`, not implemented here.
- Per-identity join-attempt cooldowns/lockouts on `join_table` — the chosen mitigation is a longer invite code instead (see Considered And Rejected).
- Time-windowed rate limiting on `create_table` — the chosen mitigation is a flat per-host cap instead (see Considered And Rejected).
- Retroactively invalidating or forcing a reset of existing host passwords that don't meet the new policy — Supabase doesn't support this, and it isn't attempted.
- A table deletion/archiving flow for hosts approaching the 20-table cap — already an open question on `REQ-003` (its Q1), not reopened here.
- Any RLS policy or schema change — the audit found none currently needed (see Constraints).
- Local demo mode — untouched; this plan is cloud-mode/live-project only.

## Open Questions

- [ ] **Q1 — CAPTCHA provider.** Deferred until the host creates a Cloudflare Turnstile (or hCaptcha) account and supplies a site key + secret; `SECURITY.md` carries this as a standing recommendation until then.
- [ ] **Q2 — Live-project config mirroring.** `config.toml`'s password-policy change (S002) is not guaranteed to auto-apply to the already-live hosted project (see Constraints). Deferred until the host confirms, via `SECURITY.md`'s checklist, that the equivalent setting was changed by hand in the Supabase dashboard's Authentication settings.

## Smoke Test

> Developer runs the app; the agent does not self-run.

1. Open `SECURITY.md` and confirm it lists findings across all three categories (credentials, data isolation, abuse/availability), each with a severity, plus a live-dashboard checklist section. *(AC1, AC2)*
2. Against the local Supabase dev stack (`supabase start`), attempt host sign-up with a 6-character password, then with an 8+ character all-lowercase password; confirm both are rejected, and that an 8+ character password with upper+lower+digits succeeds. *(AC3)*
3. Create a new table (or regenerate an existing table's code) and confirm the resulting invite code is 8 characters. *(AC4)*
4. Using the same signed-in identity, create tables up to the cap; confirm the 21st `create_table` call fails with a readable inline error in the host UI rather than succeeding or crashing. *(AC5)*
5. Confirm each of Slice 2's and Slice 3's changes was reviewed and explicitly approved before being applied to the live Supabase project (via the SQL Editor or `supabase db push`), not auto-applied. *(AC6)*
6. Confirm the live project's Authentication settings were updated by hand to match `config.toml`'s new password policy (Q2), and that `SECURITY.md`'s checklist reflects this as done.

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| S | 5–8 | No new tables, no RLS changes, no UI code — one migration touching two existing functions, one config edit, and one new documentation file. Most of the time is in writing a genuinely useful `SECURITY.md`, not the code changes themselves. |

## Considered And Rejected

- **Per-identity join-attempt cooldown table for `join_table`.** Would slow a brute-force script hitting one identity, but doesn't stop an attacker from cheaply minting new anonymous identities to reset the counter, and needs a new tracking table plus prune logic. Lengthening the code to 8 characters (32^8 ≈ 1.1 trillion combinations) raises the cost of guessing for every identity at once, with no new schema.
- **Time-windowed rate limit on `create_table`.** Bounds bursts but allows unlimited tables accumulated slowly over time, and needs a timestamp-tracking table to implement. A flat 20-table cap per host bounds the total footprint directly with a single count query and no new table.
- **CAPTCHA in this pass.** Meaningfully raises the cost of automated sign-up abuse, but requires the host to create and configure a third-party provider account (Turnstile or hCaptcha) — a real external dependency this plan can't complete on its own. Deferred to a follow-up once that account exists.
- **12+ character password with no complexity rule.** Modern guidance (e.g. NIST) favors long passphrases over forced complexity, but the interview favored 8-char + mixed-case + digits as the more familiar, less disruptive bar for this app's existing (small) host base.

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-09-13 | Blaxine | Initial plan. |
| 2026-09-13 | Claude | Slice 1 implemented (S001): wrote `SECURITY.md` with findings #1-6 and the live-dashboard checklist. AC1 and AC2 satisfied. |
| 2026-09-13 | Claude | Slice 2 implemented (S002-S003): `config.toml` password policy tightened to 8+ chars with upper+lower+digit; `SECURITY.md` finding #2 marked fixed. AC3's code/local-stack half satisfied — the live-project dashboard mirror (Q2) is still open, not yet confirmed by the host. |
| 2026-09-13 | Claude | Slice 3 implemented (S004-S006): new migration `20250101000026_security_hardening.sql` lengthens invite codes to 8 characters and caps table creation at 20 per host; mirrored into `00_combined_all_migrations.sql`; `SECURITY.md` findings #1 and #3 marked fixed in code. AC4 and AC5 satisfied at the code level — the migration itself is not yet applied to the live project (new `SECURITY.md` checklist item), consistent with AC6's "nothing auto-applies to the live project" guarantee. |
