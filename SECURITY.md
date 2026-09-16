# Hearthbound — Security Posture

A dedicated, severity-ranked audit of the live Supabase project backing
cloud-mode Hearthbound — host-credential security, cross-table/DM-data
isolation, and abuse/availability resistance — done as part of `REQ-006`
(`requirements/InProgress/REQ-006-Live-Table-Security-Hardening.md`). Kept
separate from `PITFALLS.md` (general bugs/gotchas found during feature
work) so this can stay a focused, revisitable security record, though it
follows the same status-legend convention.

This document was produced by a code/migration-level review only — no
direct access to the live Supabase project's dashboard or CLI. Anything
that can only be confirmed by looking at the live project itself is
called out in the **Live Supabase dashboard checklist** below rather than
marked as verified.

**Status legend:** ✅ Fixed · 🟡 Needs a decision (not a bug) · ⬜ Planned / not yet fixed

## Findings

| # | Severity | Category | Finding | Status | Fix / Next step |
|---|----------|----------|---------|--------|------------------|
| 1 | High | Abuse & availability | `create_table` (`supabase/migrations/20250101000003_functions.sql`) had no cap on how many tables one auth identity could create — a script could spam it to bloat the database (tables, layers, islands, players, invite_codes rows) or run up project cost, with nothing in this schema stopping it. | ✅ | Fixed in code (REQ-006 Slice 3, `supabase/migrations/20250101000026_security_hardening.sql`): `create_table` now rejects a new table once the calling identity already hosts 20. **Migration still needs to be applied to the live project** (SQL Editor or `supabase db push`) — see checklist below. |
| 2 | High | Credential security | The live project's password policy (mirroring `supabase/config.toml`) accepted any 6-character password with no complexity requirement — e.g. `123456` was valid for a host account. | ✅ | Fixed in code (REQ-006 Slice 2): `config.toml` now requires an 8-character minimum with upper+lower+digit. **Still needs the live project's dashboard mirrored by hand** — see checklist below (config.toml changes don't reliably auto-apply to an already-live hosted project, per `REQ-003`'s own history). Existing host accounts created under the old 6-character policy are grandfathered in; Supabase doesn't retroactively invalidate them. |
| 3 | Medium | Abuse & availability | `join_table`'s invite code was 6 characters from a 32-symbol alphabet (≈1.07 billion combinations). Supabase's built-in `[auth.rate_limit]` settings only govern its own auth endpoints (sign-in, sign-up, anonymous sign-ins, token refresh, OTP) — they do **not** apply to `join_table`'s RPC calls, so nothing in this stack throttles a script guessing codes in a loop. | ✅ | Fixed in code (REQ-006 Slice 3, `supabase/migrations/20250101000026_security_hardening.sql`): codes are now 8 characters (≈1.1 trillion combinations) — `generate_unique_code()` (server) and `generateInviteCode()` (client fallback, `src/utils/inviteCode.js`). Previously issued 6-character codes keep working until regenerated. **Migration still needs to be applied to the live project** — see checklist below. |
| 4 | Medium | Credential security | No CAPTCHA is configured on host sign-up/sign-in (`[auth.captcha]` in `config.toml` is present but fully commented out) — nothing slows a scripted sign-up/credential-stuffing attempt beyond Supabase's generic per-IP auth rate limits. | 🟡 | Needs a real hCaptcha or Cloudflare Turnstile account (site key + secret) that only the host can create — deferred as a follow-up until that account exists. See Open Question Q1 in `REQ-006`. |
| 5 | — | Data isolation | Re-verified as part of this audit: every table in the schema has row-level security enabled (`tables`, `invite_codes`, `players`, `maps`, `entities`, `layers`, `islands`, `entity_dm_data`, `user_preferences` — confirmed by grepping every `create table` against every `alter table ... enable row level security` across `supabase/migrations/*.sql`). DM notes and mob droppables live in the host-only-readable `entity_dm_data` table (`20250101000015_entity_dm_data_privacy.sql`), and both storage buckets (`token-art`, `map-backgrounds`) restrict uploads to a folder named after a table the uploader actually belongs to (`20250101000004_storage.sql`). **No gap found — no fix needed.** | ✅ | None — re-verify again if new tables or storage buckets are added. |
| 6 | — | Secrets handling | Re-verified as part of this audit: no `service_role` key appears anywhere in the client bundle or repo (grepped). `src/lib/supabaseClient.js` only ever uses `VITE_SUPABASE_PUBLISHABLE_KEY`, the anon-equivalent key that's safe to ship client-side. `.env` is gitignored; only `.env.example` (with blank values) is tracked. **No gap found — no fix needed.** | ✅ | None. |
| 7 | High | Abuse & availability | A `/code-review` of finding #1's fix (the 20-table host cap) found it was a non-atomic check-then-insert — concurrent `create_table` calls from the same identity could all read a count under 20 before any insert committed, letting more than 20 through. The same review also found `tables.host_auth_id` had no supporting index, so the cap's count query was a full table scan on every call. | ✅ | Fixed in code (REQ-007, `supabase/migrations/20250101000027_host_table_cap_hardening.sql`): `create_table` now takes a `pg_advisory_xact_lock` keyed on the caller's identity before the count, and `tables_host_auth_id_idx` was added. **Migration still needs to be applied to the live project** — see checklist below. |
| 8 | Medium | Abuse & availability | The same `/code-review` found the 20-table cap had no way back: once a host's total ever-created table count reached 20, `create_table` blocked them forever, since there was no delete/archive flow to free a slot. A legitimate long-lived host (or anyone who'd just tested/experimented enough) could hit a permanent, unrecoverable lockout. | ✅ | Fixed in code (REQ-007, same migration): a new host-only `delete_table` RPC lets a host permanently delete one of their own tables — cascading through existing FKs and best-effort cleaning up its Storage images — from a new Delete action on Landing's "Your tables" list, immediately freeing a cap slot. **Migration still needs to be applied to the live project** — see checklist below. |

## Live Supabase dashboard checklist

Things this audit could not verify directly (no live project access) —
the host should confirm each of these on the actual hosted project:

- [ ] **`20250101000027_host_table_cap_hardening.sql` applied live.** Same reason as below — this migration (advisory-lock cap fix, index; and later REQ-007 Slice 2's delete-table capability) exists as a file only until it's run against the live project.
- [ ] **`20250101000026_security_hardening.sql` applied live.** This migration (8-character invite codes, 20-table host cap) exists as a file but is not applied to the live project automatically — run it via the CLI (`supabase db push`) or paste it into the SQL Editor, the same way prior migrations in this project's history have needed manual application (see `PITFALLS.md` #13/#14).
- [ ] **Password policy mirrored.** Once REQ-006 Slice 2 lands in `config.toml`, manually set the equivalent minimum length (8) and character requirements (upper+lower+digit) in **Authentication → Providers → Email** on the live project. `config.toml` values are not guaranteed to auto-apply to an already-live hosted project (confirmed the hard way during `REQ-003` — "Confirm email" needed the same manual mirroring).
- [ ] **Anonymous sign-in rate limit is live.** Confirm **Authentication → Rate Limits** actually enforces a per-IP cap on anonymous sign-ins (config.toml specifies 30/hour) — this is the only thing currently limiting how fast an attacker can mint fresh identities to work around the new create_table/invite-code protections.
- [ ] **"Confirm email" stays disabled.** Already required for this app's no-confirmation host sign-up flow (`REQ-003`) — verify it hasn't been re-enabled by a project settings change or reset.
- [ ] **No `service_role` key has ever been exposed.** Double-check no commit, log, or support ticket has ever pasted the live project's `service_role` key; rotate it if there's any doubt.
- [ ] **CAPTCHA provider (recommended follow-up).** Consider creating a Cloudflare Turnstile (or hCaptcha) account and enabling **Authentication → Attack Protection → CAPTCHA** — deferred in this pass (see Finding #4); flag when ready so REQ-006's Open Question Q1 can be picked up.
- [ ] **Auth rate-limit values still make sense.** Spot-check **Authentication → Rate Limits** against `config.toml`'s `[auth.rate_limit]` block (`sign_in_sign_ups`, `token_refresh`, `token_verifications`, `web3`) — these were never tuned for this app specifically, just left at Supabase's defaults.

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ------------------ |
| 2026-09-13 | Claude | Initial audit (REQ-006 Slice 1) — findings #1-6 and the live-dashboard checklist. |
| 2026-09-13 | Claude | REQ-006 Slice 2: password policy fixed in code (finding #2 → ✅); live-dashboard mirror step remains open in the checklist below. |
| 2026-09-13 | Claude | REQ-006 Slice 3: 8-character invite codes and a 20-table host cap fixed in code (findings #1, #3 → ✅), via `supabase/migrations/20250101000026_security_hardening.sql`. Neither is live yet — applying that migration to the live project is now its own checklist item below. |
| 2026-09-14 | Claude | REQ-007 Slice 1: added finding #7 (race condition + missing index in the 20-table cap, found via `/code-review` of REQ-006) and marked it fixed via `supabase/migrations/20250101000027_host_table_cap_hardening.sql`. Also corrected this doc's stale link to REQ-006 (moved from `Todo/` to `InProgress/`). |
| 2026-09-14 | Claude | REQ-007 Slice 2: added finding #8 (permanent lockout, no delete/archive path) and marked it fixed — a new `delete_table` RPC + Landing.jsx "Delete" action closes the gap. Migration `027` is now complete but still needs live application. |
