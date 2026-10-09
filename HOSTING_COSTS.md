# Hosting costs and free-tier limits

Written 2026-10-09. Prices and limits were read from the vendors' pricing pages that day and will drift; re-check them before acting on any number here.

The growth estimates are not measurements. They come from the code and the published limits, with an assumed play pattern of 5 people per table and one 3-hour session a week. Check the Usage page in the Supabase dashboard for real figures.

## Summary

- The app currently costs $0/month: Vercel Hobby plus Supabase Free.
- Moving to Cloudflare with R2 would also cost $0/month, plus about $10/year for a domain. It saves nothing today.
- Free should carry the app to a few dozen active groups. Past that, the realistic bill is Supabase Pro at $25/month, not hundreds.
- R2 delays that $25; it does not avoid it.
- The cheapest thing to do now is set long cache headers on uploads (see [Stretching the free tier](#stretching-the-free-tier)).

## What runs where

| Service | What it does for this app |
|---|---|
| Vercel (Hobby) | Serves the built Vite SPA and nothing else. There are no serverless functions, no `vercel.json` and no Vercel Blob. |
| Supabase (Free) | Database, auth, realtime and all file storage. |

File storage is six public Supabase Storage buckets: `token-art`, `map-backgrounds`, `table-audio`, `catalog-images`, `catalog-audio` and `catalog-models`.

So "Vercel to Cloudflare with R2" is two separate moves:

1. **Hosting:** Vercel to Cloudflare.
2. **File storage:** Supabase Storage to R2.

Supabase stays in both cases for database, auth and realtime.

## Prices

### Hosting

| | Vercel Hobby | Vercel Pro | Cloudflare (static assets) |
|---|---|---|---|
| Price | $0 | $20/month | $0 |
| Data transfer | 100 GB/month | 1 TB/month, then from $0.15/GB | Free and unlimited |
| Requests | 1M/month | 10M/month, then from $2 per 1M | Free and unlimited |
| Commercial use | Not permitted | Permitted | Permitted |

### File storage

| | Supabase Free | Supabase Pro | Cloudflare R2 |
|---|---|---|---|
| Price | $0 | $25/month | Pay per use |
| Storage | 1 GB | 100 GB, then $0.0213/GB | 10 GB free, then $0.015/GB |
| Egress | 5 GB + 5 GB cached | 250 GB + 250 GB cached, then $0.09/GB ($0.03 cached) | Always free |
| Writes | Included | Included | 1M/month free, then $4.50 per 1M |
| Reads | Included | Included | 10M/month free, then $0.36 per 1M |

At 100 GB of maps and audio, R2 would cost about $1.35/month.

R2 has two extra requirements:

- **A custom domain on Cloudflare** to serve files publicly in production. The `r2.dev` URL is rate-limited.
- **A Worker to authorize uploads**, because R2 has no equivalent of Supabase's RLS policies. Workers are free up to 100,000 requests/day, then $5/month for 10M requests.

### Everything else on Supabase

| | Free | Pro ($25/month) |
|---|---|---|
| Database size | 500 MB | 8 GB, then $0.125/GB |
| Realtime concurrent connections | 200 | 500, then $10 per 1,000 |
| Realtime messages per month | 2 million | 5 million, then $2.50 per 1M |
| Monthly active users | 50,000 | 100,000, then $0.00325 each |
| Paused after inactivity | Yes, after 1 week | No |

## How far the free tier goes

These are the Supabase Free limits in the order the app is likely to hit them.

| Order | Limit | Roughly when | What happens |
|---|---|---|---|
| 1 | Egress: 5 GB + 5 GB cached per month | 15–50 weekly groups if they use audio; several hundred if they don't | Supabase restricts the project until the next cycle or an upgrade |
| 2 | File storage: 1 GB | 40–70 tables with maps and some audio | Uploads fail |
| 3 | Realtime: 200 concurrent connections | About 40 tables playing at the same moment | New players can't connect |
| 4 | Realtime: 2 million messages per month | Around 50+ weekly groups | Realtime is throttled |
| 5 | Database: 500 MB | Probably hundreds of tables | Writes blocked |

Notes on these:

- **Audio drives limits 1 and 2.** Every player downloads the map backgrounds and audio tracks each session. A single 10 MB track uses the 5 GB cached allowance after roughly 500 plays.
- **One user can fill the storage alone.** A host can create 20 tables (`create_table` cap) with 50 MB of audio each (`enforce_audio_quota`), which is the full 1 GB.
- **Realtime messages are counted per recipient.** The table channel in `src/lib/realtime.js` subscribes to `postgres_changes` on many tables, so one database change at a 5-person table counts as 5 messages.
- **Guest tables are cheap.** They use broadcast only (`src/lib/guestRealtime.js`) and never upload, so they cost realtime connections and messages but no storage, egress or database space.
- **Vercel Hobby is not a bottleneck** for a static SPA. Its only real limit is the non-commercial rule.

## Options as the app grows

| Option | Monthly cost | Work | What it lifts |
|---|---|---|---|
| Stay as is | $0 | None | Nothing; fine until limit 1 or 2 hits |
| Supabase Pro | $25 | None | All five limits at once |
| Move files to R2 | $0 | A real migration | Limits 1 and 2 only |
| Move hosting to Cloudflare | $0 | Small | The Vercel non-commercial rule |

With R2 in place, the app stays free until realtime (limits 3 and 4) forces Supabase Pro anyway, at somewhere around 100–200 weekly groups.

At real scale the bill is Supabase Pro at $25–50/month, plus either Vercel Pro at $20 or Cloudflare hosting at $0 once the app is commercial.

### What triggers each move

| Trigger | Action | What it avoids |
|---|---|---|
| The app starts charging or otherwise goes commercial | Move hosting to Cloudflare | Vercel Pro at $20/month |
| A Supabase limit is actually reached | Upgrade to Supabase Pro | An outage |
| Audio egress alone would exceed Pro's 250 GB | Move files to R2 | Egress overage at $0.09/GB |

R2 is only worth doing earlier than that if file storage or egress is the single thing pushing the app off Supabase Free. If the database or realtime limit is reached first, Pro's included 100 GB storage and 250 GB egress make R2 pointless.

## What the migrations involve

### Hosting to Cloudflare

1. Connect the repository to Cloudflare.
2. Set the build command to `vite build` and the output directory to `dist`.
3. Copy the two environment variables: `VITE_SUPABASE_PROJECT_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Replace the `env:pull` script in `package.json`, which calls `vercel env pull`.

### File storage to R2

- **A Worker that authorizes uploads and deletes.** It must verify the Supabase JWT and re-implement the rules now enforced by storage policies and triggers:
  - table membership for image uploads (`20250101000004_storage.sql`)
  - delete rights tied to the table still existing (`20250101000027_host_table_cap_hardening.sql`)
  - host-only audio, the 10 MB file limit and the MP3/WAV allow-list (`20250101000038_synced_table_audio.sql`)
  - the 50 MB per-table audio quota (`20250101000041_audio_quota.sql`)
  - no guest uploads (`20250101000048_no_guest_uploads.sql`)
  - the catalog buckets' size and type limits (`20250101000042`, `20250101000045`, `20250101000047`)
- **Client changes** in `src/lib/storageUpload.js` and `src/lib/catalog.js`, plus the catalog seed script `scripts/catalog-admin.mjs`.
- **Data migration:** copy the existing objects to R2 and rewrite the public URLs already saved in database rows.

## Stretching the free tier

These cost nothing and need no migration.

- **Long cache headers on uploads.** The upload calls in `src/lib/storageUpload.js` don't set `cacheControl`, so files get Supabase's 1-hour default and returning players download maps and audio again every session. File names are random and never reused, so a one-year cache is safe and cuts repeat egress to near zero.
- **A per-user storage cap**, rather than only per-table, to close the 20 tables × 50 MB case.
- **A tighter audio limit**, such as a smaller quota or MP3 only, since audio dominates both storage and egress.

## Sources

- <https://vercel.com/pricing>
- <https://supabase.com/pricing>
- <https://developers.cloudflare.com/r2/pricing/>
- <https://developers.cloudflare.com/workers/platform/pricing/>
