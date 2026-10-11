# Moderation — handling reports and unlawful content

What the operator does when someone reports a table, and the tools for it.
The Terms of Use (section 6) promise this; `supabase/migrations/20250101000071_moderation.sql`
and `scripts/moderation-admin.mjs` are what back it.

This is a working procedure, not legal advice. Have a lawyer in your country
confirm the steps under "Child sexual abuse material" before launch — the
reporting body, the deadline and what you must keep all depend on where you
operate.

## Where reports arrive

| From | How | Where you read it |
|---|---|---|
| A cloud table | "Report this table" in the table menu | `npm run moderate -- reports` |
| A guest or local table | The same button opens an email | The contact inbox (`contactEmail` in `src/data/legal.js`) |
| Anyone else | Email | The contact inbox |

Nothing notifies you of a new report. Check both places every day the
service is open. A report you have received and not read still counts as you
knowing about it.

## What the server holds

- **Cloud tables:** text (names, notes, tomes, character sheets) and audio
  the host uploaded. Pictures are never stored: they live in the players'
  browsers and pass between them.
- **Guest tables:** nothing. They live in the DM's browser. You cannot see,
  export or remove one; you can only answer the report and block an identity
  if you have it.

## What is checked automatically

Every picture is scored for pornographic or explicit content in the browser,
when a DM picks it and again when another player's browser receives it
(`src/lib/imageSafety.js`). A refused picture is never added or shown. You
are not told about refusals: nothing leaves the device.

The filter makes mistakes both ways, and it cannot tell a person's age. A
report about a picture that got through is still yours to handle. Scanning
on the server, including matching against lists of known child sexual abuse
material, is planned for when pictures move to Cloudflare R2
(`CLOUDFLARE_SCANNING.md`).

## Handling a report

1. Read it: `npm run moderate -- reports`
2. Look at the table: `npm run moderate -- show <code or table id>`
3. Decide.
   - **Nothing wrong:** `npm run moderate -- resolve <report id> --note "why"`
   - **Breaks the terms:** remove the table and block the host:
     `npm run moderate -- remove <code or table id> --reason "..." --ban-host --yes`
   - **A player, not the DM, is the problem:**
     `npm run moderate -- ban <identity> --reason "..."` (the identity is the
     long id beside their name in `show`). Their seats at other people's
     tables are removed.
   - **May involve the sexual abuse of a child:** stop and follow the next
     section instead.
4. Answer the reporter if they wrote by email.

Act the same day where you can. The protection the law gives a host for what
its users add generally depends on removing it promptly once told.

## Child sexual abuse material

1. **Do not look further than you need to understand the report.** Do not
   screenshot it, download it, forward it, or ask the reporter to send it.
2. **Report it** to the body for your country, promptly:
   - United States: the NCMEC CyberTipline, <https://report.cybertip.org>.
     A provider that learns of this material on its service is legally
     required to report it.
   - Elsewhere: your national hotline (<https://www.inhope.org> lists them)
     or the police.
3. **Keep what the law tells you to keep.** Removing a table deletes it for
   good. Before removing, run `npm run moderate -- export <code or table id>`,
   which saves the table's rows, its reports and its seats (with their
   identities) to `moderation-exports/` on this machine. Leave out `--files`
   unless the authority or your lawyer tells you to keep the uploaded files
   too. Keep that folder private, give it only to the authorities, and
   delete it when the period you must keep it for is over.
4. **Remove the table and block the host:**
   `npm run moderate -- remove <code or table id> --reason "..." --ban-host --yes`
5. Do not tell the host why, and do not discuss the report with anyone but
   the authority and your lawyer.

## Commands

All of them need `SUPABASE_SERVICE_ROLE_KEY` in `.env` (never commit it, never
prefix it `VITE_`).

| Command | What it does |
|---|---|
| `reports [--all]` | Lists open reports (`--all`: resolved ones too) |
| `show <code\|id>` | A table's name, host, seats, codes, and how much is on it |
| `export <code\|id> [--files]` | Saves the table's rows (and, with `--files`, its uploads) to `moderation-exports/` |
| `remove <code\|id> --reason "..." [--ban-host] --yes` | Deletes the table and its uploaded files for good, and resolves its reports |
| `ban <identity> --reason "..."` | Blocks an identity from hosting or joining, and removes its seats at other people's tables |
| `unban <identity>` | Lifts a block |
| `resolve <report id> [--note "..."]` | Marks a report as dealt with |

Every `export`, `remove`, `ban` and `unban` is written to the
`moderation_actions` table, as your record of what you did and when.

## Limits

- **A block stops an identity, not a person.** Most people have an anonymous
  identity kept in their browser; clearing the browser's data gives them a
  new one.
- **The picture filter runs in the user's own browser.** Someone who
  changes the app's code can switch off their own check. They still cannot
  make another player's browser show the picture, because that browser
  checks it again.
- **No freeze.** A table cannot be hidden from its players while it is kept;
  it is there, or it is removed.
- **Accepted terms are recorded for cloud tables only**
  (`terms_acceptances`). A guest table leaves no record on the server.
- **A page refresh that puts someone back in their seat does not ask for the
  terms again.**

## Before launch

- [ ] Fill in `operator`, `operatorAddress` and `governingLaw` in `src/data/legal.js`.
- [ ] A lawyer has confirmed the reporting body, deadline and retention for your country.
- [ ] Migration `20250101000071_moderation.sql` is applied live (see `SECURITY.md`).
- [ ] `npm run moderate -- reports` runs on the machine you will check it from.
- [ ] Someone is named to check reports and the contact inbox every day.
