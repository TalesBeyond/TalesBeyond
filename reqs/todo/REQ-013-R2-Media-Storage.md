# REQ-013 — R2 Media Storage

| Field | Value |
| ----- | ----- |
| ID | REQ-013 |
| Title | R2 Media Storage |
| SOLVE | — |
| Status | Todo |
| Phase | Infrastructure |
| Tier | Enhancement |
| Area | Storage / Images / Audio / cloud mode / Cloudflare |
| Author | Blaxine |
| Created | 2026-09-30 |
| Last Updated | 2026-09-30 |

## Short Description

Moves a cloud table's uploaded media — token images, island backgrounds, and audio tracks — out of players' browsers and Supabase Storage into Cloudflare R2, served by a small Cloudflare Worker. A DM's upload becomes available to every player whether or not the DM is online, Supabase carries no media bytes or bandwidth, and nothing is kept permanently: every file expires 30 days after its last upload, and the DM's browser silently re-uploads any file a table still uses. The storage layout and Worker also accept 3D model files so a later 3D feature can use them, though no 3D viewer is built here. Guest tables are unchanged and keep the browser-to-browser image exchange.

## Constraints

- **Guest DMs have no Supabase session and no `tables` row.** `ensureAnonymousSession()` (`src/lib/auth.js`) runs only on the join and resume paths (`src/App.jsx:32`, `src/components/Landing.jsx:904`), so the Worker has nothing to verify a guest host against. Guest tables stay on `src/lib/imageExchange.js`.
- **R2 lifecycle rules expire objects by age since upload, not by last access.** A file in active use still disappears on day 30; only re-writing the object resets its age.
- **`<img src>` and `<audio src>` cannot send an `Authorization` header.** Read access is by URL alone.
- **Cloudflare Workers on the free plan get 10 ms of CPU per request and a 100 MB request body.** Hashing a 10 MB audio body inside the Worker may exceed the CPU budget (Open Question Q1).
- **R2 requires a payment method on the Cloudflare account even within the free tier** (10 GB-month storage, 1M writes, 10M reads per month, no egress fees). Usage past the free tier is billed.
- **The host check depends on the `players` row.** Deleting a table cascades that row away, so R2 cleanup must run before `deleteTableRemote` — the same ordering `deleteTableStorage` already follows (`src/components/Landing.jsx:352`).
- **Fingerprint references are already the database shape.** Migration 55 (`supabase/migrations/20250101000055_no_stored_images.sql`, not yet applied) allows `entities.image_url` and `islands.background_url` to hold `img:<64 hex>`; images need no further schema change.
- **Audio is not cached in the DM's browser today.** `uploadAudio` (`src/lib/storageUpload.js:77`) sends the `File` straight to the `table-audio` bucket; only images are kept in IndexedDB (`src/lib/imageCache.js`). Self-heal for audio needs the DM's copy stored first.
- **`audio_tracks.url` and `storage_path` are `NOT NULL`, and the 50 MB table quota trigger counts `size_bytes`** (`20250101000041_audio_quota.sql`). R2 tracks fill the same columns and stay under the same quota.
- **The repo has no test runner** (`package.json` has no test script). Verification is the Smoke Test.

## Architectural decisions

- **Scope:** cloud tables only. Guest and local tables do not call the Worker.
- **Object keys:** `<tableId>/<fingerprint>.<ext>`, where the fingerprint is the SHA-256 hex of the file's bytes (the same value `src/lib/imageCache.js` already computes). One object per distinct file per table.
- **Database references do not change shape.** Images stay `img:<fingerprint>`; the client derives the R2 URL from the table id, the fingerprint, and a known extension. An R2 audio track stores the Worker URL in `url` and `r2:<object key>` in `storage_path`; a bare `storage_path` still means Supabase Storage.
- **Worker routes** (one Worker, one bucket binding, no R2 keys outside Cloudflare):
  - `PUT /<tableId>/<fingerprint>.<ext>` — host only; writes or overwrites the object.
  - `GET /<tableId>/<fingerprint>.<ext>` — public; `Cache-Control: public, max-age=31536000, immutable` on hits, a short cache on misses.
  - `POST /<tableId>/status` — host only; for a list of keys, reports which exist and when each was last uploaded.
  - `DELETE /<tableId>/` — host only; deletes the table's whole prefix.
- **Auth:** the client sends its Supabase access token as `Authorization: Bearer`. The Worker asks Supabase, with that same token and the publishable key, whether the caller hosts `<tableId>` through a new `security definer` RPC mirroring the `audio_tracks` host policy (`players where auth_user_id = auth.uid() and is_host`). The Worker holds no service-role key.
- **Accepted types and per-file limits (enforced by the Worker):** images `image/webp`, `image/jpeg`, `image/png` ≤ 2 MB; audio MP3/WAV ≤ 10 MB; 3D `model/gltf-binary` (`.glb`) and `model/gltf+json` (`.gltf`) ≤ 25 MB. The 50 MB audio table quota stays in the database.
- **Integrity:** the Worker rejects a `PUT` whose body's SHA-256 does not match the fingerprint in its key, at least for images (Q1 settles audio).
- **Retention:** an R2 lifecycle rule deletes objects 30 days after their last upload. The DM's browser re-uploads, from its IndexedDB copy, any referenced object that is missing or within 5 days of expiry, each time the DM opens a cloud table.
- **Read order on a cloud table:** memory → this browser's IndexedDB → R2 through the Worker → the peer exchange (`src/lib/imageExchange.js`). A file fetched from R2 is stored in IndexedDB like any other.
- **Configuration:** the Worker's base URL reaches the client as a new `VITE_` environment variable beside `VITE_SUPABASE_PROJECT_URL`. Unset means cloud tables behave exactly as today (browser-to-browser images, Supabase audio).
- **CORS:** the Worker allows the app's deployed origin and `http://localhost:5173`.

## UI / UX Notes

- No new screens. Upload controls stay where they are: "Add your own image" (`TokenSidebar.jsx`), island background upload (`MapSettingsPopover`, `Toolbar.jsx`), Compendium "Use my own image" (`CompendiumBook.jsx`), and audio upload (`MusicModal.jsx`, `SoundField.jsx`).
- While a file is being fetched, tokens show their kind's default icon (existing `entityImageSrc` fallback in `src/lib/storedImages.js`).
- An R2 audio file that is missing shows the existing "File expired — re-upload" state (`src/lib/audioEngine.js` `expired`) until self-heal replaces it, then plays without a manual re-upload.
- A failed upload to the Worker never blocks the DM: the image still reaches players through the peer exchange, and a console warning names the file. Audio upload errors surface through the existing `friendlyAudioError` message.

## Acceptance Criteria

- [ ] **AC1 — Images load with the DM offline.** On a cloud table, a token image or island background the DM uploaded is shown to a player who joins in a fresh browser while the DM is not connected.
- [ ] **AC2 — Host-only writes.** A `PUT`, `status`, or `DELETE` request to the Worker without a valid token, or from a user who is not the host of that table, is rejected with 401/403 and writes nothing.
- [ ] **AC3 — Integrity and limits.** The Worker rejects a file whose type is not on the allow-list, whose size exceeds its kind's limit, or (for images) whose bytes don't match the fingerprint in its key.
- [ ] **AC4 — No media in Supabase.** After this lands, a new cloud-table upload of an image or audio file creates no object in Supabase Storage and no bytes in Postgres; Supabase holds only fingerprints, URLs, and metadata.
- [ ] **AC5 — 30-day expiry.** The R2 bucket has a lifecycle rule deleting objects 30 days after upload.
- [ ] **AC6 — Self-heal.** When the DM opens a cloud table, every referenced file that is missing from R2 or within 5 days of expiry is re-uploaded from the DM's browser without any prompt, and players then load it.
- [ ] **AC7 — Audio on R2.** New audio attached to a cloud table is stored in R2, plays for every player as before (sync, volume, loop, quota unchanged), and is covered by self-heal.
- [ ] **AC8 — Legacy audio keeps working.** Tracks uploaded to the `table-audio` bucket before the cut-over still play until the DM replaces or removes them.
- [ ] **AC9 — Table delete clears R2.** Deleting a cloud table removes its whole R2 prefix.
- [ ] **AC10 — 3D-ready.** The Worker accepts `.glb` and `.gltf` uploads within the 3D limit under the same key layout and auth; no 3D display exists.
- [ ] **AC11 — Guest and local unchanged.** Guest tables keep the browser-to-browser image exchange and DM-only audio; local tables keep images in their save; neither calls the Worker.
- [ ] **AC12 — Worker absent.** With the Worker URL unset, cloud tables behave exactly as before this plan.

## Technical Notes

- `src/lib/imageCache.js` — `storeImage` (`:122`) hashes and keeps a picture in IndexedDB (`tales-beyond-images` / `images`, keyed by hash); `resolveImage` (`:133`) returns an object URL or starts `load`, which falls to `markWanted` → the peer requester when IndexedDB misses. The R2 fetch slots between the IndexedDB miss and `markWanted`, and needs the current cloud table id, supplied the way `setPeerRequester` (`:171`) supplies the peer transport. `getImageBlob` (`:144`) is the DM-side source for self-heal uploads.
- `src/lib/imageExchange.js` — attached per channel from `src/lib/realtime.js` (`subscribeToTable`) and `src/lib/guestRealtime.js`; remains the last resort on cloud tables and the only path on guest tables.
- `src/components/GameView.jsx` — `isSharedTable`/`allowCustomImages` (`:410-415`); `needsSharing` (`:919`) converts uploads to fingerprints in `addEntity` (`:927`), `updateIsland` (`:1284`), and `importIsland`. The R2 upload for cloud tables follows `storeImage` at those points. `attachAudio` (`:1370`) calls `uploadAudio(file, audioScope)` at `:1382`; `audioScope` (`:479`) is the table id in cloud mode. `releaseAudioFiles` (`:1330`) calls `removeAudioFiles`, which must skip `r2:` paths.
- `src/lib/storageUpload.js` — `uploadAudio` (`:77`) returns `{ url, storagePath, mime, sizeBytes }`, the shape an R2 audio upload returns too; `removeAudioFiles` (`:88`); `TABLE_STORAGE_BUCKETS` (`:95`) and `deleteTableStorage` (`:124`), which the R2 prefix delete joins.
- `src/components/Landing.jsx:352` — `await deleteTableStorage(table.tableId)` before the table delete; the Worker `DELETE` goes beside it.
- `src/lib/audioEngine.js` — `resolveTrackUrl` (`:6`, from `src/data/defaultAudio.js`) turns `track.url` into a playable URL; `expired` (`:54`) and `markExpired` (`:65`) drive the missing-file state; `:80` marks a track expired when its URL doesn't resolve.
- `src/lib/mappers.js` / `src/lib/storedImages.js` — `toStoredImage`/`toStoredBackground` already pass `img:` fingerprints through; no change for images.
- `supabase/migrations/20250101000038_synced_table_audio.sql:44-55` — the host policy expression the new RPC mirrors. Next migration number is `20250101000056`; `supabase/00_combined_all_migrations.sql` is kept in sync by hand.
- `.env.example` holds `VITE_SUPABASE_PROJECT_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; `package.json` has `env:pull` (`npx vercel env pull .env`), so the new variable is set in Vercel too.
- The repo has no Cloudflare tooling. The Worker lives in a new top-level directory with its own `wrangler` config, bucket binding, lifecycle rule, and `SUPABASE_URL`/publishable-key vars; it is deployed separately from the Vercel app.

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| F | Foundation |
| P | Persistence |
| S | Service |
| U | UX |
| D | Docs |
| X | Cross-doc / cleanup |

### Slice 1 — Tracer: cloud images from R2

**Demoable when:** on a cloud table, the DM uploads a token image and an island background; the DM closes their tab; a player joining in a fresh browser sees both, loaded from the Worker (visible in the network panel), and an unauthenticated `curl -X PUT` to the Worker is rejected.
**Satisfies:** AC1, AC2, AC3 (images), AC4 (images), AC12

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S001 | P | Host-check RPC | Migration adding a `security definer` function returning whether `auth.uid()` hosts a given table id, executable by `authenticated`. Mirror into the combined file. | — | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql` |
|  | S002 | F | Worker and bucket | New Worker project: R2 bucket binding, `PUT` and `GET` routes per *Architectural decisions*, host check via the S001 RPC with the caller's token, image type/size allow-list, fingerprint verification, CORS, cache headers. Local run with `wrangler dev`. | S001 | new top-level Worker directory |
|  | S003 | F | Client configuration | New `VITE_` variable for the Worker URL in `.env.example` and Vercel; an "R2 enabled" flag true only for cloud tables with the variable set. | — | `.env.example`, `src/lib/supabaseClient.js` or a sibling module |
|  | S004 | S | Upload after fingerprinting | On a cloud table with R2 enabled, after `storeImage` at the `needsSharing` points, `PUT` the blob to the Worker with the session's access token; failures log and fall back silently to the peer exchange. | S002, S003 | `src/components/GameView.jsx`, `src/lib/imageCache.js` |
|  | S005 | S | Read from R2 | In `imageCache`, on an IndexedDB miss for a cloud table, `GET` from the Worker before asking peers; store a hit in IndexedDB. Supply the current table id when a cloud table subscribes and clear it on leave. | S002, S003 | `src/lib/imageCache.js`, `src/lib/realtime.js` |

### Slice 2 — Expiry and self-heal

**Demoable when:** with the lifecycle rule in place, deleting an object by hand from the R2 dashboard and reopening the table as DM restores it within seconds, and a player then loads it.
**Satisfies:** AC5, AC6 (images)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S006 | P | Lifecycle rule | Configure the bucket to delete objects 30 days after upload; record it in the Worker's config or deploy notes. | S002 | Worker directory |
|  | S007 | S | Status route | `POST /<tableId>/status`: host only; for up to a bounded list of keys, return existence and upload time. | S002 | Worker directory |
|  | S008 | S | DM self-heal pass | When the DM opens a cloud table (initial join and resync), collect every referenced fingerprint (entity images, island backgrounds), query status, and re-upload missing or near-expiry objects from IndexedDB. A fingerprint the DM's browser lacks is first requested through the peer exchange, then uploaded. | S004, S007 | `src/components/GameView.jsx`, `src/lib/imageCache.js` |

### Slice 3 — Audio on R2

**Demoable when:** the DM attaches a new MP3 to World music on a cloud table; it plays for a player; the Supabase `table-audio` bucket gains no object; deleting the object from R2 and reopening as DM restores playback for the player without a manual re-upload; an older Supabase-hosted track still plays.
**Satisfies:** AC7, AC8, AC3 (audio), AC4 (audio), AC6 (audio)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S009 | S | Worker accepts audio | Extend the allow-list and limit to MP3/WAV ≤ 10 MB; apply the Q1 outcome for audio fingerprint verification. | S002 | Worker directory |
|  | S010 | S | Cache DM audio locally | On a cloud table, keep an attached audio file's bytes in IndexedDB under its fingerprint, alongside images. | — | `src/lib/imageCache.js` or a sibling module |
|  | S011 | S | Upload audio to R2 | In `attachAudio`, on a cloud table with R2 enabled, fingerprint the file, `PUT` it to the Worker, and return `{ url, storagePath: 'r2:<key>', mime, sizeBytes }`; otherwise keep `uploadAudio`. `removeAudioFiles` skips `r2:` paths. | S009, S010, S003 | `src/components/GameView.jsx`, `src/lib/storageUpload.js` |
|  | S012 | S | Self-heal covers audio | Include R2 audio tracks in the S008 pass; after a re-upload, re-send the track row so players' `expired` state clears and playback resumes. | S008, S011 | `src/components/GameView.jsx`, `src/lib/audioEngine.js` |

### Slice 4 — Cleanup and 3D-ready

**Demoable when:** deleting a cloud table empties its R2 prefix; a `.glb` `PUT` by the host succeeds and a `.exe` is rejected; docs describe the Worker and its setup.
**Satisfies:** AC9, AC10, AC11

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
|  | S013 | S | Prefix delete | `DELETE /<tableId>/` route (host only), called from the table-delete flow before `deleteTableRemote`, beside `deleteTableStorage`. | S002 | Worker directory, `src/components/Landing.jsx`, `src/lib/storageUpload.js` |
|  | S014 | S | 3D types | Add `.glb`/`.gltf` to the Worker allow-list at 25 MB. No client code. | S002 | Worker directory |
|  | S015 | X | Retire `table-audio` | Once no `audio_tracks` row has a bare (non-`r2:`) `storage_path`, remove the bucket from `TABLE_STORAGE_BUCKETS` and drop it and its policies in a migration (Q3). | S011 | `src/lib/storageUpload.js`, `supabase/migrations/` |
|  | S016 | D | Docs and thesaurus | Document Worker setup, deploy, env vars, and the lifecycle rule in `supabase/README.md` (or a Worker README) and `SPEC.md` §9.6; add terms to `reqs/GLOSSARY.md`: Media fingerprint, Media Worker, Self-heal. | S013, S014 | `reqs/GLOSSARY.md`, `SPEC.md`, `supabase/README.md` |

### Dependency graph

```
S001 → S002 ─┬→ S004 ─┬→ S008 → S012
S003 ────────┼→ S005  │    ↑
             │        │  S007
             ├→ S006  │
             ├→ S009 → S011 → S012
             │  S010 ↗     ↘ S015
             ├→ S013 ─┐
             └→ S014 ─┴→ S016
```

## Dependencies

| REQ ID | Title | Reason |
| ------ | ----- | ------ |
| REQ-009 | Synced Table Audio | Slice 3 changes where its cloud audio files live; tracks, quota, playback, and expired handling are reused unchanged. |
| REQ-008 | Guest DM Sessions | Guest tables are explicitly left on their current transport. |
| REQ-006 | Live Table Security Hardening | The host-check RPC follows its RLS conventions. |

Also depends on migration `20250101000055_no_stored_images.sql` being applied (fingerprint references in `entities` and `islands`).

## Out of Scope

- Guest-table uploads to R2.
- Copying existing `table-audio` objects into R2.
- A 3D viewer, 3D upload controls, or attaching models to tokens.
- Members-only reads or signed download URLs.
- Per-table image quotas.
- A scheduled sweep of idle tables.
- Custom domain setup beyond what the Worker's `workers.dev` route provides.
- Automated tests.

## Open Questions

- [ ] **Q1 — Audio hash verification.** Does verifying a 10 MB body's SHA-256 in the Worker fit the free plan's 10 ms CPU limit? Deferred until S009; measure with `wrangler dev` and a 10 MB MP3. If it doesn't fit, verify images only and check audio by size and type.
- [ ] **Q2 — Custom domain.** Serve the Worker on a custom domain for full Cloudflare cache control? Deferred until R2 read operations approach the 10M/month free tier.
- [ ] **Q3 — Retiring `table-audio`.** When may the bucket be dropped if some DMs never replace old tracks? Deferred until S015; check the count of bare `storage_path` rows first.
- [ ] **Q4 — 3D size limit.** Is 25 MB right for `.glb` files? Deferred until a 3D feature is planned.
- [x] **Q5 — Issuer resolved.** A Cloudflare Worker issues and checks uploads and serves downloads. *(Blaxine)*
- [x] **Q6 — Guest tables resolved.** Guest tables stay browser-to-browser. *(Blaxine)*
- [x] **Q7 — Layout and retention resolved.** Per-table keys; 30-day expiry with DM self-heal; public reads through the Worker. *(Blaxine)*
- [x] **Q8 — Existing audio resolved.** New uploads go to R2; the `table-audio` bucket is retired later. *(Blaxine)*

## Smoke Test

> Developer runs the app; the agent does not self-run.

1. `wrangler dev` the Worker, set the Worker URL variable, and open a cloud table as DM. Upload a token image and an island background. *(AC1)*
2. Close the DM's tab. In a fresh browser profile, join by invite code; confirm both images show and the network panel shows `GET`s to the Worker. *(AC1)*
3. `curl -X PUT` an image to the Worker with no token, then with a player's token; both are refused. Upload a `.txt` renamed `.webp` and an image under the wrong fingerprint as host; both are refused. *(AC2, AC3)*
4. Check the Supabase dashboard: no new Storage objects; `entities.image_url` holds `img:…`. *(AC4)*
5. Confirm the bucket's lifecycle rule reads 30 days. Delete one object by hand, reopen the table as DM, and confirm it reappears in R2 and loads for a player. *(AC5, AC6)*
6. Attach a new MP3 as World music; confirm it plays for a player and the `table-audio` bucket gains nothing. Delete it from R2, reopen as DM, confirm playback returns for the player. Play an older Supabase-hosted track. *(AC7, AC8)*
7. `PUT` a `.glb` as host (accepted) and a `.exe` (refused). *(AC10)*
8. Delete the table from Landing; confirm its R2 prefix is empty. *(AC9)*
9. Start a guest table and a local table; confirm image upload works as before and the network panel shows no Worker calls. Unset the Worker URL and repeat step 1; images travel browser-to-browser as before. *(AC11, AC12)*

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| L | 20–30 | A new deploy target (Worker, bucket, lifecycle rule, CORS) plus one migration and client changes concentrated in `imageCache.js` and `GameView.jsx`. Slice 2's self-heal and Slice 3's audio caching are the least certain parts; Q1 may reshape audio verification. |

## Considered And Rejected

Nothing here is built. Each entry names the alternative, then why it lost.

- **Supabase Edge Function as the issuer.** Needs R2 access keys stored as Supabase secrets and still leaves downloads without a cached public path; `supabase/functions/` would be new infrastructure anyway.
- **Vercel serverless function as the issuer.** The Hobby plan is non-commercial only, and it would be a third place holding secrets.
- **Pre-signed R2 URLs issued to the browser.** The upload would bypass the Worker, so it couldn't verify the fingerprint or enforce per-kind size limits on the body.
- **Guest uploads with an anonymous login.** Anyone can mint anonymous sessions, making the Worker an open upload endpoint on a card-backed account.
- **Guests read R2 but never write.** Adds a rule to explain for little gain; guest DMs have no cloud library to read from.
- **Global keys (`media/<fingerprint>`).** Deletion needs cross-table reference counting, and anyone who learns a fingerprint can attach any table to it.
- **Per-host-account keys.** Deleting a table can't delete files another table may use, so cleanup needs reference counting or a library UI.
- **Files live as long as the table.** Storage grows with every abandoned table; contradicts "nothing permanent".
- **Sweeping idle tables on a schedule.** Needs a scheduler and a last-active signal per table; the lifecycle rule plus self-heal needs neither.
- **7-day or 90-day expiry.** Seven re-uploads nearly every weekly session; ninety keeps abandoned files for three months.
- **Copying existing `table-audio` objects to R2.** DMs' browsers hold no copy of those files, so self-heal couldn't restore them after expiry.
- **Wiping existing audio at cut-over.** Breaks tables that already rely on it for no gain over letting it age out.
- **Members-only reads with signed URLs.** Media elements can't send auth headers, so every file would need a short-lived signed URL per viewer, costing Worker calls and cache hits.
- **Public `r2.dev` URLs.** Rate-limited, not for production, and without cache rules.
- **Building a 3D viewer now.** A new rendering surface in a 2D app with large files; the storage layer is made ready instead.

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-09-30 | Blaxine | Initial plan, from a `/create-req` interview (issuer, guest posture, key layout, retention, existing audio, read access, slices) and a deep-dive into `imageCache.js`, `GameView.jsx`, `storageUpload.js`, `audioEngine.js`, and the audio migrations. |
| 2026-09-30 | Blaxine | Renumbered from REQ-010 (taken on develop by Default Catalog Assets); migration references updated for the renumbered 55_no_stored_images.sql and next migration 56. |
| 2026-10-08 | Claude | Paths updated for the reqs/ rename. |
