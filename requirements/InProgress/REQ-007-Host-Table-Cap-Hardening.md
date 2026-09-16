# REQ-007 — Host Table Cap Hardening

| Field | Value |
| ----- | ----- |
| ID | REQ-007 |
| Title | Host Table Cap Hardening |
| Status | InProgress |
| Phase | Security hardening |
| Tier | Core |
| Area | Auth / cloud mode / Supabase RPCs |
| Author | Blaxine |
| Created | 2026-09-14 |
| Last Updated | 2026-09-14 |

## Short Description

Closes three gaps a `/code-review` of REQ-006's host table-creation cap surfaced: the cap check is a non-atomic race under concurrent calls, its count query has no supporting index, and hitting the cap is permanent with no way to recover a slot. This REQ makes the cap enforcement race-safe and indexed, and gives a host a real way to delete one of their own tables — freeing a slot and permanently removing that table's data (Postgres rows via existing cascades, plus its uploaded images from Storage on a best-effort basis).

## Constraints

- Every child of `tables` already cascades via `on delete cascade` — `layers.table_id`, `islands.table_id`/`layer_id`, `entities.table_id`/`layer_id`/`island_id`, `entity_dm_data.entity_id`/`table_id`, `invite_codes.table_id`, `players.table_id` (confirmed across `20250101000001_schema.sql`, `20250101000005_layers.sql`, `20250101000010_islands.sql`, `20250101000015_entity_dm_data_privacy.sql`). A plain `delete from tables where id = ...` leaves no orphaned Postgres rows anywhere.
- `uploadImage()` (`src/lib/storageUpload.js:29`) is not called from anywhere in the app yet — per `PITFALLS.md` #8, token/background images still embed as base64 data URLs even in cloud mode. In practice, no real objects exist under any table's Storage folder today; this REQ's storage cleanup is forward-compatible plumbing for when #8 lands, not a fix for a currently observable leak.
- `storage.objects` (`supabase/migrations/20250101000004_storage.sql`) has no DELETE policy today — only public SELECT and member-scoped INSERT exist. A client-side delete call would be rejected by RLS without a new policy.
- `tables` (`20250101000001_schema.sql:13-19`) has no index on `host_auth_id` anywhere in the schema (grep-confirmed across every migration) — `create_table`'s 20-table cap check (`20250101000026_security_hardening.sql`) is a full table scan on every call.
- `listMyTablesRemote()` (`src/lib/remoteApi.js:80-105`) already returns `{ tableId, name, code, playerId }` per hosted table — enough for a Delete action with no shape change.
- `players.connected` (used elsewhere for roster display) is already known-unreliable per `PITFALLS.md` #7 — never reliably cleared when a tab closes or crashes.

## Architectural decisions

- `create_table` acquires `pg_advisory_xact_lock(hashtext(auth.uid()::text)::bigint)` before its cap-count check, serializing concurrent `create_table` calls from the same auth identity for the transaction's lifetime (auto-released on commit/rollback) — no new table, no client-side retry logic. A 32-bit `hashtext` collision could rarely serialize two *different* hosts' calls against each other, but can never let either miscount the other's tables, since the count query still filters by the correct `host_auth_id`.
- Deletion is a new `delete_table(p_table_id uuid)` `SECURITY DEFINER` RPC, matching the existing `create_table`/`join_table`/`regenerate_invite_code` pattern — it re-verifies `host_auth_id = auth.uid()` itself rather than trusting the caller only filtered to their own tables client-side.
- Storage cleanup happens client-side through the Storage API (list, then remove, both buckets' `<tableId>/` folders) — not by deleting `storage.objects` rows directly in SQL, which bypasses Supabase's storage engine and can desync file existence from its metadata.
- Storage cleanup is best-effort and non-blocking: a failure there never blocks the table's deletion, and its worst case (an orphaned file) is the same outcome as not attempting cleanup at all.
- No programmatic "is anyone still connected" check gates deletion — the confirm dialog's copy warns the host instead.
- Both this cap-hardening SQL and the delete RPC/policy land in one migration, `supabase/migrations/20250101000027_host_table_cap_hardening.sql`, mirroring how `20250101000026_security_hardening.sql` bundled its two related fixes.

## Acceptance Criteria

- [ ] **AC1 — Cap enforcement is race-safe.** Concurrent `create_table` calls from the same auth identity, once at the cap, never result in more than 20 total tables for that identity.
- [ ] **AC2 — Cap check is indexed.** An index exists on `tables.host_auth_id` and is used by the cap-check query.
- [ ] **AC3 — Host can delete their own table.** Landing's "Your tables" list shows a Delete action per table; clicking it shows a confirmation dialog stating the action is permanent and asking the host to make sure no one is still playing, before anything happens.
- [ ] **AC4 — Deletion is complete.** Confirming removes the table and every layer/island/entity/player/invite code under it, and best-effort removes any of its uploaded images from Storage.
- [ ] **AC5 — Deletion frees a cap slot.** A host previously blocked by the 20-table cap can successfully create a new table immediately after deleting one of their existing ones.
- [ ] **AC6 — Only the host can delete.** A `delete_table` call for a table the caller doesn't host is rejected server-side, regardless of what the UI would normally allow.

## Technical Notes

- `supabase/migrations/20250101000027_host_table_cap_hardening.sql` (new): `create index if not exists tables_host_auth_id_idx on tables (host_auth_id);` (naming matches `players_table_idx`/`entities_table_idx` in `20250101000001_schema.sql`); `create_table` (`20250101000003_functions.sql:31-67`, last redefined by `20250101000026_security_hardening.sql`) redefined again to add the advisory lock immediately after the `auth.uid() is null` check and before the cap count; new `delete_table(p_table_id uuid)` function; new `storage.objects` DELETE policy scoped to `(storage.foldername(name))[1]::uuid in (select id from tables where host_auth_id = auth.uid())`, mirroring the shape of the existing INSERT policies in `20250101000004_storage.sql`.
- `src/lib/remoteApi.js` — new `deleteTableRemote(tableId)` calling `supabase.rpc('delete_table', { p_table_id: tableId })`, following `regenerateInviteCodeRemote`'s shape (`remoteApi.js:59-63`).
- `src/lib/storageUpload.js` — new `deleteTableStorage(tableId)` alongside `uploadImage`: for each of `token-art`/`map-backgrounds`, `supabase.storage.from(bucket).list(tableId)` then `.remove()` the returned paths; swallow/log errors rather than throw, per the best-effort decision above.
- `src/components/Landing.jsx`'s `HostTablesList` (currently `Landing.jsx:115-214`) — add a Delete button per row (disabled while any resume/delete is in flight, mirroring the existing `resumingId` pattern) and a confirm step before calling S004's functions; on success, remove that row from local `tables` state without refetching.
- `src/styles.css` — new `.delete-confirm-backdrop`/`.delete-confirm-card`/`.delete-confirm-actions`, matching `.door-confirm-*`/`.merge-confirm-*`'s existing shape (`styles.css`, "Door confirmation dialog" / "Island merge confirmation" sections).
- No `T`-phase steps: the repo has zero test files or runner anywhere (confirmed by search, consistent with prior REQs) — verification is the manual **Smoke Test** below. AC1's concurrency guarantee specifically is argued from the locking mechanism (Architectural decisions) rather than manually reproduced, since reliably racing two requests needs a script this repo has no harness for.

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| P | Persistence |
| S | Service |
| U | UX |
| D | Docs |

### Slice 1 — Race-safe, indexed cap

**Demoable when:** code review confirms `create_table` takes an advisory lock scoped to the caller before its cap check, and `tables.host_auth_id` has a supporting index.
**Satisfies:** AC1, AC2

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S001 | P | Lock + index the cap check | New migration: add `tables_host_auth_id_idx`; redefine `create_table` to acquire `pg_advisory_xact_lock(hashtext(auth.uid()::text)::bigint)` before its existing cap count. | — | `supabase/migrations/20250101000027_host_table_cap_hardening.sql` |
| ✅ | S002 | D | Mirror + document | Append S001's migration to `00_combined_all_migrations.sql`; add a `SECURITY.md` finding for the race/missing-index issues (found via code review of REQ-006) and mark it fixed. | S001 | `supabase/00_combined_all_migrations.sql`, `SECURITY.md` |

### Slice 2 — Delete a table

**Demoable when:** on Landing's "Your tables" list, deleting a table removes it (and everything under it) after a confirmation step, and a previously-capped host can immediately create a new table afterward.
**Satisfies:** AC3, AC4, AC5, AC6

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S003 | P | delete_table RPC + storage policy | Append `delete_table(p_table_id uuid)` (host-checked, `SECURITY DEFINER`) and the new `storage.objects` DELETE policy to S001's migration file. | S001 | `supabase/migrations/20250101000027_host_table_cap_hardening.sql` |
| ✅ | S004 | S | Client delete functions | `deleteTableRemote(tableId)` in `remoteApi.js`; `deleteTableStorage(tableId)` in `storageUpload.js` (list+remove both buckets, best-effort). | S003 | `src/lib/remoteApi.js`, `src/lib/storageUpload.js` |
| ✅ | S005 | U | Delete button + confirm dialog | Delete action per row in `HostTablesList`, gated behind a confirm dialog (new CSS matching the door/merge-confirm shape); on confirm, calls S004's storage cleanup then `deleteTableRemote`, then drops the row from local state. | S004 | `src/components/Landing.jsx`, `src/styles.css` |
| ✅ | S006 | D | Re-mirror + document | Re-mirror the now-complete migration file into `00_combined_all_migrations.sql`; add a `SECURITY.md` finding for the permanent-lockout issue and mark it fixed via this delete capability. | S003, S005 | `supabase/00_combined_all_migrations.sql`, `SECURITY.md` |

### Dependency graph

```
S001 → S002
S001 → S003 → S004 → S005 → S006
```

## Out of Scope

- Reusing `is_open` ("closed to new joins") as a signal that a table no longer counts toward the cap — would overload an existing toggle with a second, unrelated meaning.
- A programmatic "is anyone still connected" check before allowing deletion — `players.connected` is already known-unreliable (see Constraints); the confirm dialog's copy carries this instead.
- Retrying storage cleanup if it fails — best-effort, one attempt, no retry queue.
- Deleting a table from anywhere other than Landing's "Your tables" list (e.g. from inside an active `GameView` session) — not reachable there, since being in `GameView` means you're not on this list.
- The player-seat capacity trigger's own, separate, already-accepted race (`PITFALLS.md` #10) — untouched by this REQ.

## Smoke Test

> Developer runs the app; the agent does not self-run.

1. Read `create_table` in the new migration and confirm the advisory lock is acquired before the cap count, and that `tables_host_auth_id_idx` exists. *(AC1, AC2)*
2. On Landing, sign in as a host with at least one table and open "Your tables"; confirm a Delete action appears per row. Click it and confirm a dialog appears warning the action is permanent, without deleting anything yet. *(AC3)*
3. Confirm the deletion; verify (via the Supabase dashboard's table editor or SQL Editor) that the table's row, its layers/islands/entities/players/invite codes are all gone, and that the row disappears from "Your tables" without a page refresh. *(AC4)*
4. If that host was previously at (or artificially bring them to) the 20-table cap, confirm creating a new table now succeeds immediately after the deletion in step 3. *(AC5)*
5. Attempt a `delete_table` RPC call (e.g. via the SQL Editor as a different signed-in user, or by editing the request) for a table you don't host; confirm it's rejected. *(AC6)*

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| M | 8–12 | Slice 1 is a small, self-contained SQL change. Slice 2 is the bulk of the effort: a new RPC, a new storage policy, two client functions, and a new confirm-dialog UI pattern on Landing. |

## Considered And Rejected

- **`SERIALIZABLE` transaction isolation with client-side retry.** Would also close the cap race, but forces every `create_table` caller to handle a new serialization-failure/retry path that doesn't exist anywhere in this codebase today. An advisory lock scoped to the caller makes concurrent calls simply wait instead, with no retry logic needed anywhere.
- **A per-host counter table with atomic increment-and-check.** Closes the race in a single statement, but adds a new table whose value must stay in sync with `count(*) from tables` — more schema surface than locking the existing count query.
- **Reusing `is_open` so closed tables don't count toward the cap.** No new UI, but overloads "closed to new joins" with a second, unrelated meaning a host wouldn't expect — closing a table mid-session to pause joins would also silently free a hosting slot.
- **Blocking deletion when `players.connected` shows anyone present.** A real check, but that flag is already known-unreliable (`PITFALLS.md` #7) and could permanently block deleting an actually-abandoned table whose flag never cleared.
- **Deleting `storage.objects` rows directly via SQL inside `delete_table`.** Would keep cleanup to one round trip, but bypasses Supabase's storage engine, which is the documented, supported path for removing objects — risking metadata/file desync.
- **Raising the cap instead of building delete (e.g. 20 → 100).** Cheaper, but doesn't fix the underlying gap — only pushes the same permanent-lockout risk further out for a very active host.

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-09-14 | Blaxine | Initial plan, from `/code-review` findings against `REQ-006`. |
| 2026-09-14 | Claude | Slice 1 implemented (S001-S002): new migration `20250101000027_host_table_cap_hardening.sql` adds the advisory-lock cap fix and `tables_host_auth_id_idx`; mirrored into `00_combined_all_migrations.sql`; `SECURITY.md` finding #7 added and marked fixed. AC1/AC2 satisfied in code — migration still needs to be applied to the live project (new checklist item). |
| 2026-09-14 | Claude | Slice 2 implemented (S003-S006): `delete_table` RPC + storage DELETE policy appended to the same migration; `deleteTableRemote`/`deleteTableStorage` client functions; a Delete action + confirm dialog on Landing's "Your tables" list; migration re-mirrored; `SECURITY.md` finding #8 added and marked fixed. AC3-AC6 satisfied in code. All of REQ-007 is now code-complete — migration `027` still needs to be applied to the live project, and the delete flow itself needs a manual pass against the live app (the agent couldn't self-verify it without creating a real host account on the live Supabase project). |
| 2026-09-14 | Claude | Post-implementation `/code-review` of Slice 2 found and fixed three issues in the AC4 storage cleanup: `listAllTableFiles` now pages through every object instead of only the first 100; list failures are now logged (previously silent, unlike remove failures); `confirmDelete` retries `deleteTableRemote` up to 3 times to narrow the window where a transient failure could strip a table's images without actually deleting the table. |
