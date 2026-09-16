# SPEC.md audit — what's missing

Cross-checked every claim in `SPEC.md` against the actual `src/` and
`supabase/` code, plus a read of the document for topics it never
addresses at all.

## A. Spec claims that don't hold up against the code

1. **Accessibility is overstated.** §7 says all interactive controls
   are real `<button>`/`<input>` elements with visible focus states.
   True for the toolbar/roster, but map tokens — the main thing you
   interact with — are plain `<div>`s with only `onPointerDown`
   (`src/components/MapBoard.jsx:136-149`). No `role`, `tabIndex`,
   keyboard handler, or focus style — tokens can't be selected or
   moved without a pointer.
2. **The spec's own sample SQL doesn't compile.** §9.1 shows
   `tables.host_id references players(id)` while `players.table_id
   references tables(id)` — a circular FK. The real
   `supabase/01_schema.sql:16` uses `host_auth_id references
   auth.users(id)` instead. §9.4's `join_table` sample also has a
   broken `returning ... into strict` line that the real
   `supabase/03_functions.sql:67` fixes. The deployed backend is
   better than the spec's own inline code — but following the doc
   literally would break.
3. **Server-side upload validation required by §12 doesn't exist.**
   No `supabase/functions/` directory at all;
   `supabase/04_storage.sql` only restricts *who* can write and
   *where*, with zero MIME/size enforcement. The client-side resize
   code (`storageUpload.js`) that would mitigate this is dead code —
   zero call sites anywhere in `src/`.
4. **Rate-limiting (§12) is pure aspiration** — no code, config, or
   edge function anywhere implements it.
5. Worth noting the other direction too: **close-table, regenerate-
   code cleanup, read-only map settings for non-hosts, and 1x1-4x4
   token resize are all genuinely implemented**, not just
   aspirational — so the doc undersells itself there.

## B. Topics the document never addresses at all

1. **`localStorage` quota exhaustion** — combined with the admitted
   lack of any upload size cap, a table with a few custom images
   could silently fail to save, and nothing specs what should happen.
2. **Host abandonment** — no host-transfer or orphaned-table story if
   the DM never returns, despite several actions being host-gated.
3. **No undo/redo** — given editing is trust-based and open to every
   player, an accidental delete has no recovery besides a manual
   export made beforehand.
4. **Content moderation** for uploaded token images — never
   mentioned.
5. **Data retention/cleanup** for abandoned cloud tables — no TTL or
   archival policy.
6. **Mobile/responsive layout** — only a roadmap bullet, not actually
   specified for the current three-column layout.
7. **Browser support matrix** — unaddressed.
8. **Testing framework/CI** — §11 lists a manual matrix but names no
   test runner or pipeline.
9. **Presence "AWAY" timeout threshold** — undefined.
10. **Duplicate player name/color handling** — unaddressed.
11. **Legal/privacy policy or ToS** — absent despite handling
    uploaded images and anonymous identities.
