# Hearthbound — Virtual Table

A browser-based D&D virtual tabletop: build a square-grid map, place hero and
monster tokens (default art or your own uploads), drag them around, measure
distance with a ruler, and save/reload a table by invitation code.

The app runs in **one of two modes**, chosen automatically at startup:

- **Local demo mode** (default, no setup): everything lives in
  `localStorage`. Fully testable solo, or with a few browser tabs standing
  in for different players — see "Try it locally" below. No real sync
  between different computers.
- **Cloud mode**: set two environment variables (see `supabase/README.md`)
  to point the app at a real Supabase backend, and hosting/joining/moving
  tokens all go over the network with live sync between every connected
  device. This implements SPEC.md §9, points 9.1–9.6 (schema, RLS, auth,
  join/create RPCs, realtime, storage) — see `supabase/`.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL (usually `http://localhost:5173`). The top
bar shows which mode you're in ("local demo mode" or "cloud mode").

## Try the local-mode flow

1. Open the app, choose **Host a table**, fill in your name and a map size,
   and open the table. Note the invitation code shown top-right.
2. Open a **second browser tab in the same browser** (not just a new window —
   see note below) at the same URL, choose **Join a table**, and enter the
   code plus a player name.
3. Both tabs can now place tokens, drag them, and measure distance. Since
   both tabs read the same `localStorage`, refreshing either tab picks up the
   other's latest save.

> Note: `localStorage` is per-browser, not per-tab, so this only simulates
> multiple players within one browser. To truly test with a friend on a
> different computer without setting up cloud mode, use the
> **Export .json / Import .json** buttons in the toolbar to hand a table's
> state between two independent browsers manually.

## Turn on cloud mode

See `supabase/README.md` for the full walkthrough: create a free Supabase
project, run the four SQL files in `supabase/` in order, enable anonymous
sign-in, then copy `.env.example` to `.env` and fill in your project's URL
and anon key. Restart `npm run dev` and the app switches to cloud mode
automatically — no code changes needed.

## Project layout

```
src/
  App.jsx                Top-level screen switch (Landing vs. GameView) + resume-on-refresh
  main.jsx                React entry point
  styles.css              Full design system (tokens, layout, components)
  state/
    store.jsx             Reducer + Context holding map/entities/players (mode-agnostic)
    persistence.js        localStorage-backed save/load (local mode)
  lib/
    supabaseClient.js      Supabase client, feature-detected from env vars
    auth.js                 Anonymous sign-in bootstrap
    mappers.js               DB row <-> client shape translation
    remoteApi.js              create/join/regenerate/snapshot/CRUD calls
    realtime.js               Postgres-changes subscription -> reducer actions
    storageUpload.js          Client-side resize + upload to Supabase Storage
  components/
    Landing.jsx            Host / Join screen
    GameView.jsx           Wires board + panels + toolbar to state
    MapBoard.jsx            Grid rendering, token drag-to-move, ruler tool
    TokenSidebar.jsx        Default hero/monster gallery + custom image upload
    RightPanel.jsx           Player roster + selected-token inspector
    Toolbar.jsx              Tools, map settings, invite code, save/export/import
  utils/
    grid.js                 Grid <-> pixel math, 5-10-5 diagonal distance
    inviteCode.js            Invite code / id generators
  data/
    defaultTokens.js         Original inline-SVG default hero/monster art
```

## What's implemented vs. what's left

Implemented (SPEC.md §9, points 9.1–9.6): Postgres schema, Row Level
Security, anonymous auth, `create_table`/`join_table`/`regenerate_invite_code`
RPCs, Realtime sync dispatching into the same reducer local mode uses, and
Storage buckets + a resize-and-upload helper.

Not yet wired up (see `supabase/README.md` for specifics): the token/
background image uploaders in the UI still embed base64 data URLs even in
cloud mode rather than calling `storageUpload.js`; `.json` import is
disabled in cloud mode rather than actually overwriting a live table; and
none of §13's roadmap items (fog of war, initiative tracker, dice roller,
kicking a player, locking hero tokens to their owner) are built.
