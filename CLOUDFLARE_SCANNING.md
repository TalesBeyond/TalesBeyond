# Server-side picture scanning on Cloudflare (future)

Not built. This is the plan for the day pictures are stored on a server —
REQ-013 (`reqs/todo/REQ-013-R2-Media-Storage.md`) moves a cloud table's
pictures and audio to Cloudflare R2 behind a Worker. Until then pictures only
pass between browsers, and the only check is the in-browser picture filter
(`src/lib/imageSafety.js`).

It is a plan, not legal advice. Check every Cloudflare detail below against
its current documentation before building; the facts here were read on
2026-10-11.

## Why this waits for R2

| | Today | After REQ-013 |
|---|---|---|
| Where a picture lives | The players' browsers | An R2 bucket you pay for and control |
| Who is hosting it | Nobody on the server side | You |
| What can scan it | Only the browser that holds it | A Worker on upload, and Cloudflare on the way out |

Hosting changes your position: a picture on your bucket is one you can be
told about, can remove, and are expected to act on. That is the point at
which the two checks below stop being optional.

## The three layers, once pictures are on R2

| Layer | Where it runs | What it finds | Can a user switch it off? |
|---|---|---|---|
| 1. Picture filter (built) | Each browser, on pick and on receipt | Pornography and explicit drawings | Their own, yes; everyone else's still runs |
| 2. Moderation check on upload | The R2 Worker's `PUT` route | The same, more accurately, plus violence and gore if wanted | No |
| 3. CSAM Scanning Tool | Cloudflare's cache, on the way out | Known child sexual abuse material, by fuzzy hash against lists from bodies such as NCMEC | No |

Layer 1 stays. It is free, it covers guest tables (which never touch R2),
and it stops most pictures before they are uploaded at all.

## Layer 2 — moderation check in the Worker

REQ-013's Worker already authorises every `PUT /<tableId>/<fingerprint>.<ext>`
and checks the body's SHA-256 against the fingerprint. Add one step for
image types, before the object is written:

1. Send the bytes to a moderation service.
2. Refuse the `PUT` (HTTP 422, with a reason the client can show) when the
   picture scores over the limit.
3. Write the object only when it passes.

Because a cloud table's players read pictures from R2, a picture that never
got in cannot be shown to them. That is what makes the check enforceable.
The browser-to-browser exchange stays as the fallback read path in REQ-013;
to close that side too, a browser should accept a peer's picture on a cloud
table only if the Worker says its fingerprint exists (`POST /<tableId>/status`).

Choosing the service (prices seen on third-party pages, confirm before use):

| Service | Cost | Note |
|---|---|---|
| OpenAI moderation endpoint | Free | Images are scored for sexual content; its minors category was text-only at launch |
| AWS Rekognition content moderation | About $0.40–$1.00 per 1,000 images | Fine-grained labels |
| Google Cloud Vision SafeSearch | First 1,000 a month free, then about $1.50 per 1,000 | Five likelihood levels |
| Azure AI Content Safety | Free allowance, then per image | Graded severity per category |

Things to settle before building:

- **Worker limits.** The free plan gives a Worker 10 ms of CPU per request.
  Waiting on another service's answer does not count as CPU, but hashing and
  encoding the body do (REQ-013, Open Question Q1).
- **The service's key** is a Worker secret, never a `VITE_` variable.
- **If the service is down:** refuse the upload and let the DM retry. A check
  that passes pictures whenever it fails is not a check.
- **Privacy Policy.** Pictures would be sent to a third party for the first
  time. `LegalPage.jsx` must say so (sections 3, 8 and 9) before this ships,
  and `LEGAL.termsVersion` must change.

## Layer 3 — Cloudflare's CSAM Scanning Tool

What Cloudflare's documentation says:

- It compares content served for your site **through the Cloudflare cache**
  with lists of known material from child-safety organisations.
- **To turn it on:** Cloudflare dashboard → your account and zone →
  **Caching** → **Configuration** → **CSAM Scanning Tool** → **Configure**.
  You give an email address for notifications and accept the tool's
  service-specific terms.
- **On a match:** you get one email a day listing the matched file paths, and
  Cloudflare blocks the content from being served where it can (the email
  says when it could not).
- **You still report it yourself.** The page tells site owners they likely
  have their own reporting duty. Follow `MODERATION.md`.
- **A wrong block** is reviewed from Security Center → Blocked Content, by an
  Admin, Super Admin or Trust & Safety role.

What that means for REQ-013:

- **Pictures must go out through the cache.** The Worker's `GET` already
  sends `Cache-Control: public, max-age=31536000, immutable`. The zone the
  Worker (or the bucket's custom domain) is on is the one to enable the tool
  for.
- **Open question:** Cloudflare's page does not mention R2 or Workers.
  Confirm with Cloudflare that a response served by a Worker from R2 is
  scanned, or serve pictures from the bucket's own custom domain with caching
  on, before relying on it.
- **The emailed file path is the object key**, `<tableId>/<fingerprint>.<ext>`.
  The table id goes straight into `npm run moderate -- show <table id>`.
- **It is built for pictures.** Do not count on it for audio.

## When a scan finds something

A match means you now know. Do not open the file. Follow "Child sexual abuse
material" in `MODERATION.md`: report it, keep what the law tells you to keep,
remove the table, block the host. With R2 in place, `remove` in
`scripts/moderation-admin.mjs` must also delete the table's R2 prefix (the
Worker's `DELETE /<tableId>/`), and `export --files` must be able to copy
from it.

## Checklist for the day R2 is built

- [ ] REQ-013 Slice 1 is live: cloud pictures are read from R2.
- [ ] The Worker refuses a `PUT` that the moderation service scores over the limit.
- [ ] A cloud table's browsers accept a peer's picture only if R2 has its fingerprint.
- [ ] CSAM Scanning Tool is enabled on the zone, with a monitored email address.
- [ ] Cloudflare has confirmed that Worker-served R2 responses are scanned (or pictures are served from the bucket's custom domain).
- [ ] `scripts/moderation-admin.mjs` removes and exports R2 objects.
- [ ] Privacy Policy and `LEGAL.termsVersion` are updated; `MODERATION.md` names who reads the scan emails.
- [ ] A lawyer has confirmed the reporting duty for your country now that you host pictures.

## Sources

- Cloudflare docs, CSAM Scanning Tool: <https://developers.cloudflare.com/cache/reference/csam-scanning/>
- Cloudflare blog, the CSAM Scanning Tool: <https://blog.cloudflare.com/the-csam-scanning-tool>
- Cloudflare changelog, easier onboarding (2025-02-04): <https://developers.cloudflare.com/changelog/2025-02-04-easier-onboarding-for-csam-scanning-tool>
- OpenAI moderation guide: <https://developers.openai.com/api/docs/guides/moderation>
