# REQ-013 — R2 Media Storage

| Field | Value |
| ----- | ----- |
| ID | REQ-013 |
| Title | R2 Media Storage |
| SOLVE | — |
| Status | Parked |
| Phase | Infrastructure |
| Tier | Enhancement |
| Area | Storage / Audio / Images / moderation / cloud mode / Cloudflare |
| Author | Blaxine |
| Created | 2026-09-30 |
| Last Updated | 2026-10-14 |

> **Parked on 2026-10-14.** Nothing here is built. Pick it up again when either of these happens:
>
> 1. **Storage or egress becomes the limit.** The Supabase Usage page shows file storage or egress nearing the Free plan's limits (1 GB storage; 5 GB + 5 GB cached egress — limits 1 and 2 in `HOSTING_COSTS.md`) *before* the database or Realtime limits. If the project moves to Supabase Pro first, Pro's 100 GB storage and 250 GB egress make this reason moot.
> 2. **Pictures need checking on a server.** The decision is made to scan pictures server-side (`CLOUDFLARE_SCANNING.md`), which needs them stored on R2. Neither trigger has been reached yet.
>
> Done instead, on 2026-10-14: long cache headers on Supabase Storage uploads (`IMMUTABLE_CACHE_SECONDS`, `src/lib/storageUpload.js`), the free fix `HOSTING_COSTS.md` recommends first.

## Short Description

Moves a cloud table's audio out of Supabase Storage into Cloudflare R2, and puts the table's pictures there too so they can be checked on a server. A small Cloudflare Worker controls uploads (host only), checks every picture with a moderation service before storing it, and serves both kinds of file through a Cloudflare zone, so Cloudflare's CSAM Scanning Tool also sees pictures. Nothing is kept for good: every file expires 30 days after its last upload, and the DM's browser quietly re-uploads any file the table still uses. Guest and local tables are unchanged.

## Why, and what is no longer a goal

- **Audio is the only table media still in Supabase Storage** (`table-audio`), and it dominates storage and egress (`HOSTING_COSTS.md`). That's the cost half of this plan.
- **Pictures already never touch Supabase.** They pass between browsers (`src/lib/imageExchange.js`, migration `20250101000055_no_stored_images.sql`). They go to R2 for one reason: R2 gives a server-side point where a picture can be checked before anyone sees it, and a way to refuse pictures that weren't checked (`CLOUDFLARE_SCANNING.md`, layers 2 and 3).
- **No longer a goal: pictures loading while the DM is offline.** A cloud table already ends every player's session 3 minutes after the DM leaves (`HOST_ABSENCE_END_MS`, `src/components/GameView.jsx:178`), and REQ-015 makes players wait for the DM before anything loads.
- **Dropped on 2026-10-14:** 3D model storage, and moving the admin catalog buckets (`catalog-images`, `catalog-audio`, `catalog-models`). See *Out of Scope*.

## Constraints

- **Guest DMs have no Supabase session and no `tables` row.** `ensureAnonymousSession()` (`src/lib/auth.js`) runs only on the cloud join and resume paths (`src/App.jsx:61`, `src/components/Landing.jsx:1277`), so the Worker has nothing to check a guest host against. Guest tables stay on `src/lib/imageExchange.js` and DM-only audio.
- **R2 lifecycle rules expire objects by age since upload, not by last access.** A file in active use still disappears on day 30; only writing the object again resets its age.
- **`<img src>` and `<audio src>` cannot send an `Authorization` header.** Read access is by URL alone.
- **Cloudflare Workers on the free plan get 10 ms of CPU per request and a 100 MB request body.** Hashing a 10 MB audio body in the Worker may exceed the CPU budget (Q1). Waiting on a moderation service doesn't count as CPU; hashing and encoding the body do.
- **R2 requires a payment method on the Cloudflare account even within the free tier** (10 GB-month storage, 1M writes, 10M reads per month, no egress fees). Usage past the free tier is billed.
- **The host check depends on the `players` row.** Deleting a table cascades that row away, so R2 cleanup must run before `deleteTableRemote`, in the same order `deleteTableStorage` already runs (`src/components/Landing.jsx:429`).
- **Pictures are already stored as fingerprints.** `entities.image_url` and `islands.background_url` hold `img:<64 hex>` (migration 55). The client no longer uploads pictures anywhere, so 55 is almost certainly applied; confirm on the live project before building.
- **Audio is not cached in the DM's browser today.** `uploadAudio` (`src/lib/storageUpload.js:89`) sends the `File` straight to `table-audio`; only pictures are kept in IndexedDB (`src/lib/imageCache.js`). Self-heal for audio needs the DM's copy stored first.
- **`audio_tracks.url` and `storage_path` are `NOT NULL`, and the 50 MB table quota trigger counts `size_bytes`** (`20250101000041_audio_quota.sql`). R2 tracks fill the same columns and stay under the same quota.
- **Every picture a browser keeps passes the picture filter.** `assertImageAllowed` (`src/lib/imageSafety.js:203`) runs when a picture is chosen. `checkReceivedImage` (`:216`) runs when one is received, inside `acceptImage` (`src/lib/imageCache.js`), which also checks the bytes match the fingerprint. A picture fetched from R2 is a received picture.
- **Pictures come from players too.** A player's "Send to the DM" (`offerHero`, `GameView.jsx:1426`) keeps the picture in the player's browser and offers its fingerprint; the DM's browser fetches it like any shared picture. The Worker only accepts the host's uploads, so such a picture reaches R2 when the DM's browser uploads it.
- **Who may see a file is decided by the database today.** A table's audio rows are readable by its members (RLS). R2 objects are public by URL, protected only by an unguessable table id and fingerprint, as `table-audio`'s public URLs already are.
- **REQ-015 (DM-Authoritative Cloud Tables) changes the paths this touches.** Audio uploads are among its direct writes, players stop reading the database, and the image exchange moves to its private Table channel.
- **The repo has no test runner** (`package.json` has no test script). Verification is the Smoke Test.

## Architectural decisions

- **Scope:** cloud tables only; audio and pictures. Guest and local tables never call the Worker. Catalog files and 3D models stay out.
- **Object keys:** `<tableId>/<fingerprint>.<ext>`, where the fingerprint is the SHA-256 hex of the file's bytes (the value `imageCache.js` already computes). One object per distinct file per table.
- **Database references keep their shape.** Pictures stay `img:<fingerprint>`; the client builds the R2 URL from the table id, the fingerprint and a known extension. An R2 audio track stores the Worker URL in `url` and `r2:<object key>` in `storage_path`; a bare `storage_path` still means Supabase Storage.
- **Worker routes** (one Worker, one bucket binding, no R2 keys outside Cloudflare):
  - `PUT /<tableId>/<fingerprint>.<ext>` — host only; writes or overwrites the object.
  - `GET /<tableId>/<fingerprint>.<ext>` — public; `Cache-Control: public, max-age=31536000, immutable` on hits, a short cache on misses.
  - `POST /<tableId>/status` — host only; for a bounded list of keys, reports which exist and when each was last uploaded.
  - `POST /<tableId>/exists` — any seated member; for a bounded list of picture fingerprints, reports which exist. Used for the peer check below.
  - `DELETE /<tableId>/` — host only, or the operator's service key; deletes the table's whole prefix.
- **Auth:** the client sends its Supabase access token as `Authorization: Bearer`. The Worker asks Supabase, with that token and the publishable key, whether the caller hosts (or, for `exists`, is seated at) `<tableId>`, through new `security definer` RPCs that mirror the `audio_tracks` host policy. The Worker holds no service-role key; the operator's `DELETE` uses a separate Worker secret.
- **Accepted types and per-file limits, enforced by the Worker:** pictures `image/webp`, `image/jpeg`, `image/png` ≤ 2 MB; audio MP3/WAV ≤ 10 MB. The 50 MB audio table quota stays in the database.
- **Integrity:** the Worker rejects a `PUT` whose body's SHA-256 doesn't match the fingerprint in its key, at least for pictures (Q1 settles audio).
- **Moderation on every picture `PUT`:** before writing, the Worker sends the bytes to a moderation service (Q9). Over the limit → `422` with a reason the client can show. Service down or erroring → also refused, so the DM retries; a check that passes pictures when it fails isn't a check. The service's key is a Worker secret, never a `VITE_` variable.
- **Retention:** an R2 lifecycle rule deletes objects 30 days after their last upload. Each time the DM opens a cloud table, the DM's browser re-uploads, from its IndexedDB copy, any referenced object that is missing or within 5 days of expiry.
- **Picture read order on a cloud table:** memory → this browser's IndexedDB → R2 through the Worker → the peer exchange. A picture from R2 goes through the same checks as one from a peer (`acceptImage`: the bytes match the fingerprint, then `checkReceivedImage`) before it is kept.
- **Peer check:** on a cloud table with R2 enabled, a browser accepts a peer's picture only if `exists` says R2 holds that fingerprint. Exception: the DM's own browser, which takes a player's picture (Constraints), checks it with the filter, and uploads it, so the picture goes through moderation like any other.
- **Served through a Cloudflare zone with caching on,** on a custom domain, so the CSAM Scanning Tool sees picture responses. Whether a Worker serving from R2 is scanned must be confirmed with Cloudflare (Q10); if it isn't, serve pictures from the bucket's own custom domain.
- **Configuration:** the Worker's base URL reaches the client as a new `VITE_` variable beside `VITE_SUPABASE_PROJECT_URL`. Unset means cloud tables behave exactly as today.
- **CORS:** the Worker allows the app's deployed origin and `http://localhost:5173`.

## UI / UX Notes

- No new screens. Upload controls stay where they are: a token's own picture (`CreatureCard.jsx`'s `TokenPictureButton`), island background (`MapSettingsPopover`, `Toolbar.jsx`), Compendium "Use my own image" (`CompendiumBook.jsx`), ambush monsters, and audio (`MusicModal.jsx`, `SoundField.jsx`).
- A picture the moderation service refuses shows the same kind of message the in-browser filter shows today (`imageErrorMessage`, `src/lib/imageSafety.js`), saying the picture can't be used at this table. A picture refused by the Worker is never shown to players, even through the peer exchange.
- While a picture is being fetched, tokens show their kind's default icon (`entityImageSrc` in `src/lib/storedImages.js`).
- An R2 audio file that is missing shows the existing "File expired — re-upload" state (`src/lib/audioEngine.js`) until self-heal replaces it, then plays with no manual re-upload.
- An upload that fails for any reason other than moderation never blocks the DM: on a cloud table without the peer check, the picture still reaches players through the peer exchange, and a console warning names the file. Audio upload errors surface through the existing `friendlyAudioError` message.

## Acceptance Criteria

- [ ] **AC1 — Audio on R2.** New audio attached to a cloud table is stored in R2 and plays for every player as before (sync, volume, loop, quota unchanged). The `table-audio` bucket gains nothing.
- [ ] **AC2 — Legacy audio keeps working.** Tracks uploaded to `table-audio` before the cut-over still play until the DM replaces or removes them.
- [ ] **AC3 — Host-only writes.** A `PUT`, `status` or `DELETE` to the Worker without a valid token, or from someone who isn't the table's host, is rejected with 401/403 and writes nothing. `exists` refuses anyone not seated at the table.
- [ ] **AC4 — Integrity and limits.** The Worker rejects a file whose type isn't on the allow-list, whose size exceeds its kind's limit, or (for pictures) whose bytes don't match the fingerprint in its key.
- [ ] **AC5 — No new media in Supabase.** After this lands, a new cloud-table upload creates no object in Supabase Storage and no bytes in Postgres; Supabase holds only fingerprints, URLs and metadata.
- [ ] **AC6 — 30-day expiry.** The R2 bucket has a lifecycle rule deleting objects 30 days after upload.
- [ ] **AC7 — Self-heal.** When the DM opens a cloud table, every referenced audio file and picture that is missing from R2 or within 5 days of expiry is re-uploaded from the DM's browser with no prompt, and players then load it.
- [ ] **AC8 — Pictures on R2.** Every picture used on a cloud table (a token's, an island background, an ambush's monsters, a picture changed on an existing token, and a player's hero picture once the DM's browser has it) is uploaded to R2, and players load it from there.
- [ ] **AC9 — Moderated uploads.** A picture the moderation service refuses is rejected with 422, the DM sees why, and no player ever gets it. With the service unreachable, the upload is refused too.
- [ ] **AC10 — The filter covers R2 reads.** A picture fetched from R2 is checked like one from a peer: refused if its bytes don't match its fingerprint or the in-browser filter blocks it.
- [ ] **AC11 — Peer check.** On a cloud table with R2 enabled, a player's browser refuses a peer's picture whose fingerprint R2 doesn't hold.
- [ ] **AC12 — CSAM Scanning Tool.** The tool is enabled on the zone that serves pictures, with a monitored email address, and Cloudflare has confirmed it covers those responses (Q10).
- [ ] **AC13 — Deleting removes R2 files.** Deleting a cloud table removes its whole R2 prefix. `scripts/moderation-admin.mjs`'s `remove` deletes the prefix too, and `export --files` copies from it.
- [ ] **AC14 — Legal.** Before audio or pictures go to Cloudflare, the Privacy Policy (`LegalPage.jsx`) names Cloudflare as a host of uploaded files and, once moderation is on, the moderation service; `LEGAL.termsVersion` changes; `MODERATION.md` names who reads the scan emails.
- [ ] **AC15 — Guest and local unchanged.** Guest tables keep the browser-to-browser picture exchange and DM-only audio; local tables keep pictures in their save; neither calls the Worker.
- [ ] **AC16 — Worker absent.** With the Worker URL unset, cloud tables behave exactly as before this plan.

## Technical Notes

> Line numbers are from 2026-10-14. Re-check them when this is picked up again.

- `src/lib/storageUpload.js` — `uploadAudio` (`:89`) returns `{ url, storagePath, mime, sizeBytes }`, the shape an R2 audio upload returns too; `removeAudioFiles` (`:101`) must skip `r2:` paths; `TABLE_STORAGE_BUCKETS` (`:108`) and `deleteTableStorage` (`:137`), beside which the R2 prefix delete goes. `IMMUTABLE_CACHE_SECONDS` is the long-cache fix done while this is parked.
- `src/lib/imageCache.js` — `storeImage` (`:157`) hashes, filters and keeps a picture in IndexedDB (`tales-beyond-images` / `images`); `resolveImage` (`:169`) → `load` (`:144`) → `loadKept` (`:130`), which falls to `markWanted` (`:116`) and the peer requester on an IndexedDB miss. The R2 fetch slots in between, then goes through `acceptImage` (`:200`). It needs the current cloud table id, supplied the way `setPeerRequester` (`:213`) supplies the peer transport. `getImageBlob` (`:181`) is the DM-side source for self-heal uploads.
- `src/lib/imageSafety.js` — `assertImageAllowed` (`:203`), `checkReceivedImage` (`:216`), `imageErrorMessage`.
- `src/lib/imageExchange.js` — attached per channel from `src/lib/realtime.js` and `src/lib/guestRealtime.js`; stays the last resort on cloud tables (behind the peer check) and the only path on guest tables.
- `src/components/GameView.jsx` — `isSharedTable` (`:545`); `audioScope` (`:698`, the table id on a cloud table); `offerHero` (`:1426`); `needsSharing` (`:1920`). Picture upload points, each after `storeImage`: `shareAmbushMonsters` (`:2011`), `addEntity` (`:2014`, `:2022`), `updateEntity` (`:2217`, `:2226`), `updateIsland` (`:2981`, background at `:2983`). Audio: `releaseAudioFiles` (`:3038`), `attachAudio` (`:3078`), calling `uploadAudio` at `:3090`.
- `src/components/Landing.jsx:429` — `await deleteTableStorage(table.tableId)` before the table delete; the Worker `DELETE` goes beside it.
- `src/lib/audioEngine.js` — `resolveTrackUrl` turns `track.url` into a playable URL; the `expired` / `markExpired` state drives "File expired — re-upload".
- `scripts/moderation-admin.mjs` — `remove` and `export --files` gain R2 (operator `DELETE` and a listing/copy through the Worker or R2's S3 API with operator credentials kept outside the repo).
- `src/components/LegalPage.jsx` (sections 3, 8 and 9) and `src/data/legal.js` (`LEGAL.termsVersion`) — AC14.
- `supabase/migrations/20250101000038_synced_table_audio.sql:44-55` — the host policy expression the new RPCs mirror. The next free migration number is `20250101000073`; `supabase/00_combined_all_migrations.sql` is kept in step by hand.
- `.env.example` holds `VITE_SUPABASE_PROJECT_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; `npm run env:pull` pulls from Vercel, so the new variable is set there too.
- The repo has no Cloudflare tooling. The Worker lives in a new top-level directory with its own `wrangler` config, bucket binding, lifecycle rule, `SUPABASE_URL`/publishable-key vars and secrets (moderation key, operator key); it deploys separately from the Vercel app.

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| F | Foundation |
| P | Persistence |
| S | Service |
| U | UX |
| D | Docs |
| X | Cross-doc / cleanup |

Renumbered on 2026-10-14 when the plan was narrowed; nothing had been built.

### Slice 1 — Tracer: cloud audio on R2

**Demoable when:** with the Worker running, the DM attaches a new MP3 to World music on a cloud table; it plays for a player; the `table-audio` bucket gains no object; an older Supabase-hosted track still plays; an unauthenticated `curl -X PUT` to the Worker is rejected.
**Satisfies:** AC1, AC2, AC3, AC4 (audio), AC5, AC14 (Cloudflare as host), AC16

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S001 | P | Host-check RPCs | Migration adding `security definer` functions returning whether `auth.uid()` hosts, or is seated at, a given table id, executable by `authenticated`. Mirror into the combined file. | — | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql` |
|  | S002 | F | Worker and bucket | New Worker project: R2 bucket binding, `PUT` and `GET` per *Architectural decisions*, host check through S001 with the caller's token, audio type/size allow-list (Q1 decides hashing), CORS, cache headers. Local run with `wrangler dev`. | S001 | new top-level Worker directory |
|  | S003 | F | Client configuration | New `VITE_` variable for the Worker URL in `.env.example` and Vercel; an "R2 enabled" flag true only for cloud tables with it set. | — | `.env.example`, `src/lib/supabaseClient.js` or a sibling module |
|  | S004 | S | Keep DM audio locally | On a cloud table, keep an attached audio file's bytes in IndexedDB under its fingerprint, beside pictures. | — | `src/lib/imageCache.js` or a sibling module |
|  | S005 | S | Upload audio to R2 | In `attachAudio`, on a cloud table with R2 enabled, fingerprint the file, `PUT` it to the Worker, and return `{ url, storagePath: 'r2:<key>', mime, sizeBytes }`; otherwise keep `uploadAudio`. `removeAudioFiles` skips `r2:` paths. | S002, S003, S004 | `src/components/GameView.jsx`, `src/lib/storageUpload.js` |
|  | S006 | D | Privacy Policy: Cloudflare | Name Cloudflare as a host of uploaded audio in `LegalPage.jsx`; bump `LEGAL.termsVersion`. | — | `src/components/LegalPage.jsx`, `src/data/legal.js` |

### Slice 2 — Expiry and self-heal

**Demoable when:** with the lifecycle rule in place, deleting an audio object by hand from the R2 dashboard and reopening the table as DM restores it within seconds, and the player's track plays again without a re-upload.
**Satisfies:** AC6, AC7 (audio)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S007 | P | Lifecycle rule | Configure the bucket to delete objects 30 days after upload; record it in the Worker's config or deploy notes. | S002 | Worker directory |
|  | S008 | S | Status route | `POST /<tableId>/status`: host only; for a bounded list of keys, existence and upload time. | S002 | Worker directory |
|  | S009 | S | DM self-heal pass | When the DM opens a cloud table (first load and every resync), collect every referenced R2 file, query `status`, and re-upload missing or near-expiry ones from IndexedDB. After an audio re-upload, re-send the track so players' `expired` state clears. | S005, S008 | `src/components/GameView.jsx`, `src/lib/audioEngine.js` |

### Slice 3 — Pictures on R2, checked on the server

**Demoable when:** the DM sets a token picture and an island background on a cloud table and both are read from the Worker by a player (network panel); a test picture the moderation service refuses is rejected with its reason and never reaches the player; a player's console `img_want` answer for a fingerprint R2 lacks is ignored; a player's "Send to the DM" picture ends up in R2.
**Satisfies:** AC4 (pictures), AC7 (pictures), AC8, AC9, AC10, AC11, AC12, AC14 (moderation service)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S010 | S | Worker takes pictures | Picture allow-list and 2 MB limit, fingerprint check, and the moderation call before writing (refuse on a high score or a failed call, `422` with a reason). Moderation key as a Worker secret. | S002 | Worker directory |
|  | S011 | S | Upload pictures | On a cloud table with R2 enabled, after `storeImage` at every upload point (`addEntity`, `updateEntity`, `shareAmbushMonsters`, `updateIsland`), `PUT` the blob. A `422` is shown like the in-browser filter's refusal and the change isn't applied; other failures log and carry on. | S010, S003 | `src/components/GameView.jsx`, `src/lib/imageCache.js` |
|  | S012 | S | Read pictures from R2 | In `imageCache`, on an IndexedDB miss for a cloud table, `GET` from the Worker before asking peers, through `acceptImage`'s checks. Supply the table id when a cloud table subscribes; clear it on leave. | S010, S003 | `src/lib/imageCache.js`, `src/lib/realtime.js` |
|  | S013 | S | Peer check | `POST /<tableId>/exists` (seated members). A player's browser accepts a peer's picture only if R2 holds it; the DM's browser accepts a player's picture, then uploads it (S011's path), so it passes moderation. Self-heal (S009) also covers pictures. | S011, S012, S009 | Worker directory, `src/lib/imageCache.js`, `src/lib/imageExchange.js`, `src/components/GameView.jsx` |
|  | S014 | F | Zone and CSAM Scanning Tool | Custom domain on a Cloudflare zone with caching on; Worker (or bucket) served from it; CSAM Scanning Tool enabled with a monitored email; Cloudflare's confirmation recorded (Q10). | S002 | Worker directory, deploy notes |
|  | S015 | D | Privacy Policy: moderation | Name the moderation service in `LegalPage.jsx`; bump `LEGAL.termsVersion`; `MODERATION.md` names who reads the scan emails. | S010 | `src/components/LegalPage.jsx`, `src/data/legal.js`, `MODERATION.md` |

### Slice 4 — Cleanup and docs

**Demoable when:** deleting a cloud table empties its R2 prefix; `npm run moderate -- remove <table id>` empties it too; docs describe the Worker and its setup.
**Satisfies:** AC13, AC15

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S016 | S | Prefix delete | `DELETE /<tableId>/` (host, or the operator key), called from the table-delete flow before `deleteTableRemote`, beside `deleteTableStorage`. | S002 | Worker directory, `src/components/Landing.jsx`, `src/lib/storageUpload.js` |
|  | S017 | S | Moderation script | `remove` deletes the table's R2 prefix; `export --files` copies its R2 objects. | S016 | `scripts/moderation-admin.mjs`, `MODERATION.md` |
|  | S018 | X | Retire `table-audio` | Once no `audio_tracks` row has a bare (non-`r2:`) `storage_path`, remove the bucket from `TABLE_STORAGE_BUCKETS` and drop it and its policies in a migration (Q3). | S005 | `src/lib/storageUpload.js`, `supabase/migrations/` |
|  | S019 | D | Docs and glossary | Worker setup, deploy, env vars, secrets and the lifecycle rule in a Worker README and `SPEC.md` §9.6; tick `CLOUDFLARE_SCANNING.md`'s checklist; update `HOSTING_COSTS.md`; add Media fingerprint, Media Worker, Self-heal to `reqs/GLOSSARY.md`. | S016, S017 | `reqs/GLOSSARY.md`, `SPEC.md`, `CLOUDFLARE_SCANNING.md`, `HOSTING_COSTS.md` |

### Dependency graph

```
Slice 1   S001 → S002 ─┬→ S005 ← S003, S004        S006
                       │
Slice 2                ├→ S007
                       ├→ S008 → S009 ← S005
                       │
Slice 3                ├→ S010 ─┬→ S011 ─┐
                       │        ├→ S012 ─┼→ S013 ← S009
                       │        └→ S015  │
                       ├→ S014           │
                       │                 │
Slice 4                └→ S016 → S017 ───┴→ S019
                          S005 → S018
```

## Dependencies

| REQ ID | Title | Reason |
| ------ | ----- | ------ |
| REQ-015 | DM-Authoritative Cloud Tables | Both change cloud audio uploads (a direct write in REQ-015) and add migrations; whichever lands second rebases its audio steps and takes the next number. REQ-015 moves the image exchange to a private Table channel, which S013's peer check attaches to. |
| REQ-009 | Synced Table Audio | This changes where its cloud audio files live; tracks, quota, playback and expired handling are reused unchanged. |
| REQ-008 | Guest DM Sessions | Guest tables are explicitly left on their current transport. |
| REQ-006 | Live Table Security Hardening | The new RPCs follow its RLS conventions. |

Also depends on migration `20250101000055_no_stored_images.sql` being applied on the live project. Source documents: `HOSTING_COSTS.md` (why and when) and `CLOUDFLARE_SCANNING.md` (the scanning layers this carries out).

## Out of Scope

- Guest-table uploads to R2.
- Copying existing `table-audio` objects into R2.
- **3D model files** (dropped 2026-10-14). The admin catalog already keeps `.glb` dice models in the `catalog-models` Supabase bucket; a future 3D feature can plan its own storage.
- **The catalog buckets** (`catalog-images`, `catalog-audio`, `catalog-models`). They are admin-uploaded and rewritten in place by `scripts/catalog-admin.mjs`, so they don't fit fingerprint keys or 30-day expiry.
- Pictures loading while the DM is offline, as a goal.
- Members-only reads or signed download URLs.
- Per-table picture quotas.
- A scheduled sweep of idle tables.
- Automated tests.

## Open Questions

- [ ] **Q1 — Audio hash verification.** Does verifying a 10 MB body's SHA-256 in the Worker fit the free plan's 10 ms CPU limit? Measure with `wrangler dev` and a 10 MB MP3 in S002. If it doesn't fit, check audio by size and type only.
- [ ] **Q2 — Which domain.** A custom domain on a Cloudflare zone is now required (CSAM Scanning Tool, and `r2.dev` is rate-limited). Which domain, and does the app move to Cloudflare hosting at the same time (`HOSTING_COSTS.md`, "two separate moves")?
- [ ] **Q3 — Retiring `table-audio`.** When may the bucket be dropped if some DMs never replace old tracks? Check the count of bare `storage_path` rows first (S018).
- [ ] **Q9 — Moderation service.** Which one (OpenAI moderation, AWS Rekognition, Google Vision SafeSearch, Azure Content Safety; see `CLOUDFLARE_SCANNING.md`), and at what score is a picture refused?
- [ ] **Q10 — Does the CSAM Scanning Tool see Worker-served R2 responses?** Cloudflare's page doesn't mention R2 or Workers. Confirm with Cloudflare before relying on it; otherwise serve pictures from the bucket's own custom domain.
- [ ] **Q11 — Reporting duty.** A lawyer confirms the reporting duty for the operator's country once pictures are hosted (`CLOUDFLARE_SCANNING.md` checklist).
- [x] ~~**Q4 — 3D size limit.**~~ *Dropped 2026-10-14 with 3D storage.*
- [x] **Q5 — Issuer resolved.** A Cloudflare Worker issues and checks uploads and serves downloads. *(Blaxine)*
- [x] **Q6 — Guest tables resolved.** Guest tables stay browser-to-browser. *(Blaxine)*
- [x] **Q7 — Layout and retention resolved.** Per-table keys; 30-day expiry with DM self-heal; public reads through the Worker. *(Blaxine)*
- [x] **Q8 — Existing audio resolved.** New uploads go to R2; the `table-audio` bucket is retired later. *(Blaxine)*
- [x] **Q12 — Narrowed and parked.** *(Blaxine, 2026-10-14)* Audio plus pictures-for-scanning only; parked until a trigger in the header is reached; cache headers done meanwhile.

## Smoke Test

> Developer runs the app; the agent does not self-run.

1. `wrangler dev` the Worker, set the Worker URL variable, open a cloud table as DM, and attach a new MP3 as World music. It plays for a player; the `table-audio` bucket gains nothing. An older Supabase-hosted track still plays. *(AC1, AC2, AC5)*
2. `curl -X PUT` a file to the Worker with no token, then with a player's token; both are refused. As host, upload a `.txt` renamed `.webp`, and a picture under the wrong fingerprint; both are refused. *(AC3, AC4)*
3. Confirm the lifecycle rule reads 30 days. Delete the MP3 from R2, reopen as DM, and confirm it reappears and the player's track plays again. *(AC6, AC7)*
4. Set a token picture, an island background and an ambush monster picture; confirm the player's network panel shows `GET`s to the Worker for each. Have the player "Send to the DM" a hero with their own picture; once the DM has it, it appears in R2. *(AC8)*
5. As DM, upload a picture the moderation service refuses; the DM sees the reason and the player never gets it. Block the moderation service (wrong key) and upload a normal picture; it is refused. *(AC9)*
6. Replace an R2 picture's object with different bytes by hand; the player's browser refuses it. From a player's console, answer an `img_want` with a picture R2 doesn't hold; other players ignore it. *(AC10, AC11)*
7. In the Cloudflare dashboard, the CSAM Scanning Tool is enabled on the zone that serves pictures. *(AC12)*
8. Delete the table from Landing; its R2 prefix is empty. On another table, `npm run moderate -- remove <table id>` empties its prefix, and `export --files` copied its objects first. *(AC13)*
9. Read the Privacy Policy: Cloudflare and the moderation service are named, and the terms version changed. *(AC14)*
10. Start a guest table and a local table; picture upload works as before and the network panel shows no Worker calls. Unset the Worker URL and repeat step 1; audio goes to `table-audio` and pictures travel browser to browser as before. *(AC15, AC16)*

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| L | 25–35 | A new deploy target (Worker, bucket, lifecycle rule, zone, CORS, secrets), two RPCs, client changes concentrated in `imageCache.js` and `GameView.jsx`, a moderation integration, and legal text. Not counted: the time to choose a moderation service, get Cloudflare's answer on Q10, and get legal advice (Q11). |

## Considered And Rejected

Nothing here is built. Each entry names the alternative, then why it lost.

- **Doing R2 now.** `HOSTING_COSTS.md`: it saves nothing at today's usage, and if the database or Realtime limit is hit first, Supabase Pro makes it pointless for cost. Long cache headers were the free first step.
- **Pictures on R2 so players can load them with the DM offline.** Players can't stay at a cloud table without the DM (`HOST_ABSENCE_END_MS`), and REQ-015 has them wait for the DM. Pictures go to R2 only so they can be checked on a server.
- **3D-ready storage.** No 3D feature is planned, and the catalog already keeps its `.glb` files in Supabase.
- **Moving the catalog buckets too.** Admin files rewritten in place by the seed script; they don't fit fingerprint keys or expiry, and are small next to table audio.
- **Supabase Edge Function as the issuer.** Needs R2 access keys stored as Supabase secrets and still leaves downloads without a cached public path.
- **Vercel serverless function as the issuer.** The Hobby plan is non-commercial only, and it would be a third place holding secrets.
- **Pre-signed R2 URLs issued to the browser.** The upload would bypass the Worker, so it couldn't verify the fingerprint, enforce per-kind size limits, or run the moderation check.
- **Guest uploads with an anonymous login.** Anyone can mint anonymous sessions, making the Worker an open upload endpoint on a card-backed account.
- **Global keys (`media/<fingerprint>`).** Deletion needs cross-table reference counting, and anyone who learns a fingerprint can attach any table to it.
- **Per-host-account keys.** Deleting a table can't delete files another table may use, so cleanup needs reference counting or a library UI.
- **Files live as long as the table.** Storage grows with every abandoned table.
- **Sweeping idle tables on a schedule.** Needs a scheduler and a last-active signal per table; the lifecycle rule plus self-heal needs neither.
- **7-day or 90-day expiry.** Seven re-uploads nearly every weekly session; ninety keeps abandoned files for three months.
- **Copying existing `table-audio` objects to R2.** DMs' browsers hold no copy of those files, so self-heal couldn't restore them after expiry.
- **Wiping existing audio at cut-over.** Breaks tables that already rely on it for no gain over letting it age out.
- **A moderation check that passes pictures when the service fails.** Not a check.
- **Members-only reads with signed URLs.** Media elements can't send auth headers, so every file would need a short-lived signed URL per viewer.
- **Public `r2.dev` URLs.** Rate-limited, not for production, no cache rules, and outside any zone the CSAM Scanning Tool covers.

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-09-30 | Blaxine | Initial plan, from a `/create-req` interview (issuer, guest posture, key layout, retention, existing audio, read access, slices) and a deep-dive into `imageCache.js`, `GameView.jsx`, `storageUpload.js`, `audioEngine.js`, and the audio migrations. |
| 2026-09-30 | Blaxine | Renumbered from REQ-010 (taken on develop by Default Catalog Assets); migration references updated for the renumbered 55_no_stored_images.sql and next migration 56. |
| 2026-10-08 | Claude | Paths updated for the reqs/ rename. |
| 2026-10-14 | Blaxine / Claude | Reviewed, narrowed and parked. Narrowed to cloud audio plus pictures-for-scanning: dropped "pictures with the DM offline" as a goal (sessions end 3 min after the DM leaves; REQ-015), 3D storage (AC10, S014, Q4) and the catalog buckets. Folded in `CLOUDFLARE_SCANNING.md` (moderation on `PUT`, peer check, CSAM Scanning Tool on a zone, moderation script, Privacy Policy) and `HOSTING_COSTS.md` (why and when). Added the picture filter on R2 reads, the missing upload points (`updateEntity`, ambush monsters, players' hero pictures) and the REQ-015 dependency; `importIsland` no longer exists. Slices reordered (audio first) and steps renumbered; references refreshed. Parked until storage/egress or server-side scanning makes it worth doing; the long-cache-header fix was done instead. |
