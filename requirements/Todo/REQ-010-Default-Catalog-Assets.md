# REQ-010 — Default Catalog Assets

| Field | Value |
| ----- | ----- |
| ID | REQ-010 |
| Title | Default Catalog Assets |
| Status | Todo |
| Phase | Table atmosphere |
| Tier | Enhancement |
| Area | Catalog / Storage / Compendium / Audio / Dice / cloud mode |
| Author | Blaxine |
| Created | 2026-09-24 |
| Last Updated | 2026-09-24 |

## Short Description

Moves the app's default game content into a read-only Supabase **Default catalog** that the admin fills and every player, anonymous or not, reads. Weapons, items and monsters (full stats plus a picture), a small library of songs, dice images, and the empty tables that later hold 3D dice models and their skins each get their own table and storage bucket. The compendium, chest and droppables editors, the Battle Equipment lookup, the Music modal and the Dice modal read from the catalog when Supabase is configured and keep working from today's code data when it is not. The admin loads rows and files with a local Node script; there is no admin screen in the app.

## Constraints

- **Stats are read from code in five components, synchronously.** `WEAPONS`, `ITEMS` and `MONSTERS` are imported by `CompendiumBook.jsx`, `ChestContentsEditor.jsx`, `DroppablesEditor.jsx`, `RightPanel.jsx` (`weaponStatsFor`, which matches a bag item to a weapon by lower-cased name) and `Toolbar.jsx`. A database catalog arrives asynchronously, so every one of these changes.
- **There is no admin identity in the database.** Host accounts exist (`src/lib/auth.js`), but a host account is a table owner, not a catalog admin. The catalog is writable only by the service-role key, which bypasses RLS; the tables carry no insert, update or delete policy for any other role.
- **The service-role key must never reach the bundle.** Vite exposes only `VITE_`-prefixed variables to the browser. `.env` is git-ignored; `.env.example` is committed and holds only placeholders.
- **Catalog reads must work with no session.** Local demo mode has no Supabase client (`supabase` is `null` when the two `VITE_` variables are unset, `src/lib/supabaseClient.js`), and guest DMs and guest players have no `players` row. Read policies therefore grant `anon` as well as `authenticated`, and buckets are public-read.
- **A compendium image folder already exists and is empty.** `src/assets/compendium/{weapons,items,monsters}/` is indexed by `src/data/compendiumImages.js` (`compendiumImage(kind, name)`, slug = lower-cased name with runs of other characters turned into `-`). `CompendiumBook.jsx` uses it for weapons via `baseWeaponName`, so a "+2 Longsword" shares `longsword`'s picture; `+N` names slugify to `1-longsword`, so catalog rows for variants point at their base weapon's file.
- **The weapon list is synthesized.** `WEAPONS` is 37 base weapons at +0, the same 37 at +1, and the first 26 at +2 (100 rows, `src/data/weapons.js`). Each entry is `{ type, name, numberOfDice, diceType, modifier, damage, cost, equipableClass }`; `damage` is `averageDamage(...)`.
- **`audio_tracks` already tolerates a catalog track.** `storage_path` is `not null` but may be empty; `size_bytes` has `check (size_bytes >= 0)`; the 50 MB quota trigger (`20250101000041_audio_quota.sql`) sums `size_bytes`. A track with `storage_path = ''` and `size_bytes = 0` consumes no quota. `removeAudioFiles` filters empty paths and `deleteTableStorage` lists only the table's own folder, so neither touches a catalog file.
- **Guest tables HEAD-check every track file.** `useTableAudio({ checkFiles: isGuest })` (`src/lib/audioEngine.js`) marks a file whose fetch fails as expired, and the UI then says "File expired — re-upload". A catalog track whose file is missing needs different wording.
- **Deleting `storage.objects` rows with SQL does not free the file.** Removing a catalog file goes through the Storage API, which the admin script calls with the service-role key.
- **The repo has no test suite** (`package.json` has no test script), so no `T`-phase steps are included; verification is the Smoke Test. `supabase/00_combined_all_migrations.sql` is kept in sync with `supabase/migrations/` by hand.

## Architectural decisions

- **Seven read-only tables**, one per content type: `catalog_weapons`, `catalog_items`, `catalog_monsters`, `catalog_audio`, `catalog_dice_images`, `catalog_dice_models`, `catalog_dice_skins`.
- **Row key:** every table has `slug text primary key`. Weapon, item and dice slugs come from the existing `slugify(name)`; monster slugs are the existing `MONSTERS` key.
- **Row content mirrors the code shape.** Weapons: `type, name, number_of_dice, dice_type, modifier, damage, cost, equipable_class text[]`. Items: `category, name, cost, weight, description`. Monsters: `name, kind, cr, hp, ac, speed, abilities jsonb, size, icon, color, attack, description`. Every content table also has `image_path text null`. `catalog_audio`: `name, audio_path, mime, size_bytes`. `catalog_dice_images`: `name, die_type (d4…d100), image_path`. `catalog_dice_models`: `name, die_type, model_path, preview_image_path null`. `catalog_dice_skins`: `name, texture_path, model_slug null (references catalog_dice_models), die_type null`.
- **Buckets** (all public-read, no client insert or delete policy): `catalog-images` (WebP only, 1 MB object limit), `catalog-audio` (MP3 and WAV, 10 MB), `catalog-models` (GLB, 8 MB). Object paths are `<kind>/<slug>.<ext>`, for example `weapons/longsword.webp`, `dice/d20.webp`. Rows store the path; the client derives the public URL.
- **Access:** RLS enabled on all seven tables with one `SELECT` policy for `anon` and `authenticated`, and no other policy.
- **Catalog module:** one client module holds the current `weapons`, `items`, `monsters`, `audio` and `diceImages` lists. It starts from the code data, fetches once per page load at app startup when Supabase is configured (no session required), and replaces a type's list wholesale when that type's fetch returns at least one row. A failed or empty fetch leaves the code data in place and surfaces no error. A React hook re-renders consumers when a list is replaced; non-React callers read the module's current value.
- **Image resolution order:** the DM's per-browser monster image override, then the catalog row's `image_path`, then the bundled `src/assets/compendium` file, then no image (monsters keep their generated icon).
- **Catalog songs are referenced, not copied.** Choosing one writes an `audio_tracks` row with `url` = the public catalog URL, `storage_path = ''`, `size_bytes = 0`, `name` = the catalog name. Available wherever audio is enabled (cloud tables and guest DMs).
- **Admin script:** a Node ES-module script run on the admin's machine. It imports the existing catalogs from `src/data`, upserts rows by `slug`, and uploads files from a local folder that follows the `<kind>/<slug>.<ext>` convention. It reads the project URL and `SUPABASE_SERVICE_ROLE_KEY` from the git-ignored `.env`. Re-running it converges to the same state.
- **Local demo mode** never fetches the catalog and behaves exactly as today.

## UI / UX Notes

- **Compendium, chest and droppables editors, Battle tab:** no visual change; they show catalog stats and pictures in the same places. An entry with no picture looks as it does today.
- **Music modal (DM only):** a "Choose from catalog" control beside the upload control on each track row, listing catalog songs by name. A catalog-backed track shows its name like any other; a catalog track whose file cannot be fetched shows "Unavailable" to everyone and lets the DM pick another.
- **Dice modal:** each die tile shows its catalog image when one exists, otherwise the current outline shape.
- **3D dice models and skins:** no UI.

## Acceptance Criteria

- [ ] **AC1 — Public read-only catalog.** With the anon key, all seven catalog tables can be read; an insert, update or delete from the browser client is rejected. Files in the three catalog buckets load by public URL; an upload or delete from the browser client is rejected.
- [ ] **AC2 — Weapons from the catalog.** With Supabase configured and weapons seeded, the Weapons compendium, the chest and droppables editors, the Battle Equipment weapon lookup and the Asset Storage weapon lists use the catalog's weapon rows, including the +1 and +2 variants.
- [ ] **AC3 — Weapon pictures.** A weapon row with an `image_path` shows that picture in the compendium; every +N variant of a weapon shows its base weapon's picture.
- [ ] **AC4 — Items from the catalog.** The Items compendium, the chest and droppables editors and Asset Storage use the catalog's item rows, with pictures where a row has one.
- [ ] **AC5 — Monsters from the catalog.** The Monster compendium shows catalog monsters with their pictures, and adding one to the map creates a token with the catalog's stats. A picture the DM set in their own browser still wins over the catalog's.
- [ ] **AC6 — Offline fallback.** In local demo mode, with Supabase unreachable, or for any content type with no catalog rows, the app shows today's code data with no error visible to the player.
- [ ] **AC7 — Image order.** For an entry with a catalog picture, a bundled picture and a DM override, the DM override shows; without the override the catalog picture shows; without either the bundled picture shows.
- [ ] **AC8 — Catalog songs.** The DM can attach a catalog song to the world, a layer, an island or a token from the Music modal; it plays synced for every client like an uploaded track, uses none of the table's 50 MB quota, and is untouched when the table's uploaded audio is purged or deleted.
- [ ] **AC9 — Missing catalog song.** A catalog track whose file cannot be fetched shows "Unavailable" and never throws or shows "File expired — re-upload".
- [ ] **AC10 — Dice images.** Each die tile in the Dice modal shows its catalog image; a die with no catalog image keeps the current outline shape.
- [ ] **AC11 — 3D bases.** `catalog_dice_models` and `catalog_dice_skins` exist with the `catalog-models` bucket. After the admin script uploads a sample GLB and texture, both rows are readable with the anon key and both files load by public URL. The app has no UI for them.
- [ ] **AC12 — Admin script.** Running the script twice creates no duplicate rows or files, and a production build contains no service-role key.

## Technical Notes

- `src/data/weapons.js`, `items.js` and `monsters.js` are the seed source and stay as the fallback. `monsters.js` builds each entry with an `M(key, name, kind, cr, hp, ac, speed, abilities, size, icon, color, attack, description)` helper and imports `makeIconDataUrl` from `defaultTokens.js`; none of the three imports a browser-only API, so a Node script can import them.
- `src/components/CompendiumBook.jsx:132-185` builds entries from `MONSTERS`, `[...WEAPONS, ...customWeapons]` and `[...ITEMS, ...customItems]` and takes images from `compendiumImage(...)` (`:142`, `:161`, `:176`) or `monsterImages[m.key]` (a per-browser store, `loadMonsterImages`).
- `src/components/RightPanel.jsx:1116` — `weaponStatsFor` finds the weapon by lower-cased trimmed name in `WEAPONS`.
- `src/components/ChestContentsEditor.jsx:37,44` and `src/components/DroppablesEditor.jsx:41,48` filter `WEAPONS` and `ITEMS` by name for their pickers. `src/components/Toolbar.jsx:7-8` imports `WEAPONS`, `ITEMS`, `averageDamage`, `CLASSES` for Asset Storage. `src/state/store.jsx:131` only mentions the catalogs in a comment.
- `src/App.jsx` runs the startup effect (resume detection, `isSupabaseConfigured`); it is where a once-per-page-load catalog fetch belongs. `src/lib/remoteApi.js` `fetchTableSnapshot` shows the forgiving-read convention (a query error yields empty data).
- `src/lib/storageUpload.js` — `getPublicUrl` usage (`uploadImage`, `uploadAudio`), `removeAudioFiles`, `deleteTableStorage` and the `TABLE_STORAGE_BUCKETS` list; the new buckets are not added to it.
- `src/components/MusicModal.jsx` and the `attachAudio` write path in `src/components/GameView.jsx` (`:1311-1334`) create the `audio_tracks` row for an upload; a catalog attach follows the same dispatch, remote-write, guest-broadcast sequence with no Storage call. `src/lib/mappers.js` maps `audio_tracks` rows.
- `src/components/DiceModal.jsx` draws each die tile from an inline SVG path (`DIE_PATHS`).
- `supabase/migrations/20250101000004_storage.sql` and `20250101000038_synced_table_audio.sql` show the bucket-plus-policy pattern (`insert into storage.buckets … on conflict`, `"public can view …"` select policy on `storage.objects`); migrations run in filename order and the next number after `20250101000041` is `…42`.
- `.env.example` currently holds `VITE_SUPABASE_PROJECT_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` placeholders only; `.gitignore` already excludes `.env`.
- `src/assets/compendium/README.md` documents the bundled-folder convention and needs a note that the catalog takes precedence.

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| F | Foundation |
| P | Persistence |
| S | Service |
| U | UX |
| D | Docs |
| X | Cross-doc / cleanup |

### Slice 1 — Tracer: weapons from the catalog

**Demoable when:** the admin script seeds the weapon rows and one weapon picture; in a cloud-mode browser the Weapons compendium shows that picture and the database's stats, the Battle Equipment tab and the chest editor resolve the same weapons, and in local demo mode everything looks exactly as before.
**Satisfies:** AC1, AC2, AC3, AC6, AC7, AC12

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S001 | P | Weapons table and image bucket | Migration adding `catalog_weapons` with RLS (anon and authenticated select, no write policy) and the public `catalog-images` bucket (WebP only, 1 MB) with a public select policy and no insert or delete policy. Mirror into the combined migration file. | — | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql` |
| ✅ | S002 | S | Admin script (weapons) | Node script that reads `WEAPONS`, upserts rows by slug, and uploads `weapons/<slug>.webp` files from a local folder, using the service-role key from `.env`; base-weapon pictures are referenced by their +N variants. Idempotent. Add the `SUPABASE_SERVICE_ROLE_KEY` placeholder (no `VITE_` prefix) to `.env.example` and confirm `.gitignore` covers `.env`. | S001 | new script folder, `.env.example`, `package.json` |
| ✅ | S003 | F | Catalog module and hook | Client module holding the current lists, initialised from the code data, with a replace-when-rows-exist rule per type and a hook that re-renders on replacement. Weapons only in this slice. | — | new module under `src/lib/` |
| ✅ | S004 | S | Startup fetch | Fetch weapon rows once at app startup when Supabase is configured, forgivingly, and hand them to the catalog module. | S001, S003 | `src/App.jsx`, `src/lib/remoteApi.js` |
| ✅ | S005 | U | Weapon consumers | Switch `CompendiumBook`, `ChestContentsEditor`, `DroppablesEditor`, `RightPanel` (`weaponStatsFor`) and `Toolbar` to read weapons from the catalog module. | S003, S004 | `src/components/CompendiumBook.jsx`, `ChestContentsEditor.jsx`, `DroppablesEditor.jsx`, `RightPanel.jsx`, `Toolbar.jsx` |
| ✅ | S006 | U | Image resolution | Resolve a weapon's picture as catalog `image_path` public URL, then the bundled folder, then none. | S004, S005 | `src/data/compendiumImages.js`, `src/components/CompendiumBook.jsx` |
| ✅ | S007 | D | Docs and thesaurus | Add Default catalog, Catalog asset and Admin script to `THESAURUS.md`; document the script and the catalog in `supabase/README.md`; note catalog precedence in `src/assets/compendium/README.md`. | S002 | `THESAURUS.md`, `supabase/README.md`, `src/assets/compendium/README.md` |

### Slice 2 — Items from the catalog

**Demoable when:** after seeding, the Items compendium, the chest editor and the droppables editor list the database's items with pictures, and a table with the items rows deleted falls back to code data.
**Satisfies:** AC4, AC6

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S008 | P | Items table | Migration adding `catalog_items` with the same RLS shape. Mirror into the combined file. | S001 | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql` |
| ✅ | S009 | S | Admin script (items) | Extend the script to seed `ITEMS` and upload `items/<slug>.webp`. | S002, S008 | admin script |
| ✅ | S010 | F | Catalog items list | Add the items list and its fetch to the catalog module and startup fetch. | S003, S004, S008 | catalog module, `src/App.jsx`, `src/lib/remoteApi.js` |
| ✅ | S011 | U | Item consumers | Switch `CompendiumBook`, `ChestContentsEditor`, `DroppablesEditor` and `Toolbar` to the catalog's items, with image resolution as in S006. | S010 | `src/components/CompendiumBook.jsx`, `ChestContentsEditor.jsx`, `DroppablesEditor.jsx`, `Toolbar.jsx` |

### Slice 3 — Monsters from the catalog

**Demoable when:** the Monster compendium shows database monsters with pictures; adding one puts a token on the map with the database's HP and AC; a picture the DM set in their own browser still overrides it.
**Satisfies:** AC5, AC6, AC7

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S012 | P | Monsters table | Migration adding `catalog_monsters` (abilities as jsonb) with the same RLS shape. Mirror into the combined file. | S001 | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql` |
| ✅ | S013 | S | Admin script (monsters) | Extend the script to seed `MONSTERS` (slug = key) and upload `monsters/<slug>.webp`. | S002, S012 | admin script |
| ✅ | S014 | F | Catalog monsters list | Add the monsters list and its fetch to the catalog module and startup fetch. | S003, S004, S012 | catalog module, `src/App.jsx`, `src/lib/remoteApi.js` |
| ✅ | S015 | U | Monster consumers | Switch `CompendiumBook`'s monster chapter and `monsterToDraft` to the catalog's monsters; keep the per-browser image override first in the image order. | S014 | `src/components/CompendiumBook.jsx`, `src/data/monsters.js` |

### Slice 4 — Catalog songs

**Demoable when:** the admin seeds two songs; the DM opens the Music modal, picks a catalog song for World music and plays it, a second browser hears it synced, the table's usage meter does not move, and deleting the table leaves the catalog file in place.
**Satisfies:** AC8, AC9

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S016 | P | Audio table and bucket | Migration adding `catalog_audio` with the same RLS shape and the public `catalog-audio` bucket (MP3 and WAV, 10 MB). Mirror into the combined file. | S001 | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql` |
| ✅ | S017 | S | Admin script (songs) | Extend the script to upload `audio/<slug>.<ext>` files and upsert their rows with mime and size. | S002, S016 | admin script |
| ✅ | S018 | F | Catalog audio list | Add the songs list and its fetch to the catalog module and startup fetch. | S003, S004, S016 | catalog module, `src/App.jsx`, `src/lib/remoteApi.js` |
| ✅ | S019 | S | Attach a catalog track | DM action that creates the track record with the catalog URL, empty storage path and zero size, through the existing dispatch, remote-write and guest-broadcast sequence, replacing any track on that target. | S018 | `src/components/GameView.jsx`, `src/lib/remoteApi.js` |
| ✅ | S020 | U | Music modal picker | "Choose from catalog" on each DM track row, listing songs by name. | S019 | `src/components/MusicModal.jsx`, `src/styles.css` |
| ✅ | S021 | S | Catalog file unavailable | Distinguish a catalog track whose file cannot be fetched from an expired guest upload: show "Unavailable" and let the DM re-pick. | S019 | `src/lib/audioEngine.js`, `src/components/MusicModal.jsx` |
| ✅ | S022 | D | Docs | Document catalog songs in `supabase/README.md`; add Catalog track to `THESAURUS.md`. | S019 | `supabase/README.md`, `THESAURUS.md` |

### Slice 5 — Dice images

**Demoable when:** after seeding a d20 image, the Dice modal's d20 tile shows it while the other tiles keep their outline shapes.
**Satisfies:** AC10

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S023 | P | Dice images table | Migration adding `catalog_dice_images` with the same RLS shape. Mirror into the combined file. | S001 | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql` |
| ✅ | S024 | S | Admin script (dice images) | Extend the script to upload `dice/<slug>.webp` and upsert rows by die type. | S002, S023 | admin script |
| ✅ | S025 | F | Catalog dice images list | Add the list and its fetch to the catalog module and startup fetch. | S003, S004, S023 | catalog module, `src/App.jsx`, `src/lib/remoteApi.js` |
| ✅ | S026 | U | Dice tiles | Show a die's catalog image on its tile in `DiceModal` when one exists; otherwise the existing outline. | S025 | `src/components/DiceModal.jsx`, `src/styles.css` |

### Slice 6 — 3D dice bases

**Demoable when:** the admin script uploads a sample GLB, a texture and their rows, and a plain anon-key request reads both rows and both public file URLs; the app itself shows nothing new.
**Satisfies:** AC11

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S027 | P | Models and skins tables | Migration adding `catalog_dice_models`, `catalog_dice_skins` (skin may reference a model or a die type) and the public `catalog-models` bucket (GLB, 8 MB), with the same RLS shape. Mirror into the combined file. | S001 | `supabase/migrations/`, `supabase/00_combined_all_migrations.sql` |
| ✅ | S028 | S | Admin script (models and skins) | Extend the script to upload `dice-models/<slug>.glb` and `dice-skins/<slug>.webp` and upsert their rows. | S002, S027 | admin script |
| ✅ | S029 | D | Docs and thesaurus | Add Dice model and Dice skin to `THESAURUS.md`; document the tables and buckets in `supabase/README.md`. | S027 | `THESAURUS.md`, `supabase/README.md` |
| ✅ | S030 | X | Final sweep | Confirm every content type falls back to code data when its table is empty, and that a production build contains no service-role key. | S011, S015, S021, S026, S028 | — |

### Dependency graph

```
S001 → S002 ─┬→ S009, S013, S017, S024, S028
     ↘ S003 → S004 → S005 → S006 → S007
S001 → S008 → S010 → S011
S001 → S012 → S014 → S015
S001 → S016 → S018 → S019 → S020, S021, S022
S001 → S023 → S025 → S026
S001 → S027 → S029
S011, S015, S021, S026, S028 → S030
```

## Dependencies

| REQ ID | Title | Reason |
| ------ | ----- | ------ |
| REQ-009 | Synced Table Audio | Slice 4 attaches catalog songs as `audio_tracks` rows and reuses its playback engine, Music modal and quota rules. |
| REQ-003 | Host Account Sign-In | None functionally; noted because host accounts do not grant catalog write access. |

Supersedes: nothing. The custom assets in `custom_assets` (Asset Storage) are unchanged and still sit beside the catalog.

## Out of Scope

- No admin screen or admin login in the app.
- No realtime subscription or cache-invalidation layer for the catalog; it loads once per page load.
- No removal of `src/data/weapons.js`, `items.js`, `monsters.js` or the bundled compendium folder.
- No change to `DEFAULT_MOBS` in `defaultTokens.js`, `custom_assets`, or per-table token art.
- No 3D rendering, no three.js, no per-player skin selection or storage.
- No Supabase image transforms and no thumbnail generation.
- No server-side quota for guest tables.
- No end-to-end tests; the repo has no test suite.

## Open Questions

- [x] **Q1 — Resolved.** Source files live in `catalog-assets/` at the repo root (git-ignored); `--assets <dir>` points the script elsewhere. *(Blaxine)*
- [ ] **Q2 — Dice skin persistence.** Where a player's chosen skin is stored when there are no accounts. Deferred until the 3D dice requirement is written.
- [ ] **Q3 — Song categories.** Whether songs need a category or tag column for browsing. Deferred until the library passes about ten songs.
- [ ] **Q4 — Catalog vs. `DEFAULT_MOBS`.** Whether the six token-list monsters in `defaultTokens.js` should read from `catalog_monsters`. Deferred until the monsters slice ships and the two lists are compared.

## Smoke Test

> Developer runs the app; the agent does not self-run.

1. Apply the migrations to a Supabase project; run the admin script with the service-role key in `.env`; confirm the seven tables and three buckets exist.
2. With the anon key, read `catalog_weapons` and try an insert; the read succeeds and the insert is rejected. Load a `weapons/…` file by its public URL.
3. Open the app in cloud mode: the Weapons, Items and Monster compendiums show the seeded pictures and stats; the Battle Equipment tab still resolves a weapon by name.
4. Delete the items rows in the dashboard and reload; the Items compendium shows the code data.
5. Run the app with the `VITE_` variables unset; nothing changes from today.
6. In a cloud table, choose a catalog song for World music and play it; a second browser hears it; the usage meter stays where it was.
7. Rename the song file in the bucket; the track shows "Unavailable".
8. Seed a d20 image; the Dice modal's d20 tile shows it.
9. Upload a sample GLB and texture with the script; read both rows and both file URLs with the anon key.
10. Run the script a second time; row counts do not change. Build for production and search the output for the service-role key; there is no match.

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| L | 36 | Slice 1 is roughly a third of the work (script, catalog module, five consumers); slices 2, 3 and 5 repeat its pattern; slice 4 touches the audio path; slice 6 is schema and script only. |

## Considered And Rejected

Nothing here is built. Each entry names the alternative, then why it lost.

- **Admin upload screen inside the app.** It forces an answer to who counts as admin, and the app has no such identity and no login for the anonymous majority of users.
- **Bundling defaults in the repo or the Vite public folder.** Songs bloat every deploy and any change needs a redeploy; the empty bundled compendium folder stays as the last-resort fallback.
- **Rows with identity and image only, stats left in code.** It keeps the eight readers untouched, but the admin then cannot change a stat without a code change, which is not the "database is the catalog" model that was chosen.
- **Blocking app startup until the catalog loads.** A slow or unreachable Supabase would delay or break the landing page, and local demo mode would need a special skip.
- **Overwriting the exported `WEAPONS`, `ITEMS` and `MONSTERS` arrays in place.** Components that already rendered would not update when the data landed.
- **A generated SQL seed migration.** It cannot upload images or songs, so a second manual path is needed anyway, and every content change becomes another migration.
- **Manual dashboard entry only.** About 350 hand-typed rows drift from the code fallback.
- **Copying catalog songs into each table's private storage.** A handful of songs would eat the 50 MB table quota and duplicate files across every table.
- **A separate ambient-library playback path.** Two music systems and a second modal to maintain.
- **Original plus thumbnail per image.** Doubles the files and needs generated thumbnails for a small library; a single optimized WebP is enough.
- **Supabase image transforms.** Depends on the project's plan supporting them and adds per-image processing.
- **Merging the items and monsters slices.** Would make one large middle slice touching the compendium, chest and droppables code at once; each content type is its own slice so a wrong assumption surfaces in the weapons tracer.
- **Splitting the weapons tracer into two slices.** Leaves the Battle Equipment tab on code data while the compendium reads the database.
- **An auto-granted starter kit or level-tiered item availability.** The catalog is a library to pick from; no starter-kit or tier rules are designed.
- **A full 3D pipeline now (three.js roller with per-device skin choice).** Large build and a detour from getting compendium images working; only the tables and buckets are prepared.
- **Only 2D dice images now, adding 3D tables later.** A later migration might have to reshape the tables; the empty tables are cheap to create now.

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-09-24 | Blaxine | Initial plan. |
| 2026-09-24 | Blaxine | Implemented slices 1-6; resolved Q1. Toolbar.jsx needed no change (its WEAPONS/ITEMS imports were unused). |
