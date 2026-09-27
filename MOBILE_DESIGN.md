# Hearthbound — Mobile Design (players and DM)

A phone layout for Hearthbound, for **players and the DM**. This is a design
proposal, not a description of shipped code: today the app is a desktop
layout (`GameView` + `Toolbar` + `TokenSidebar` + `RightPanel`) with a
`width=device-width` viewport and no phone-specific layout.

- **Design canvas (clickable, private until shared):**
  https://claude.ai/artifact/7FphnpyRQe7hpyAp4nPLJq — rows "Phone · the
  player view" and "Phone · the DM view". Open an artboard in Play to tap
  through the flow. (The earlier mockup,
  https://claude.ai/artifact/KWWP6taUJ39m79zsFTT5s6, is superseded.)
- **Frame size:** 390 × 844 CSS px (a modern phone). Layouts should stretch in
  width, not assume 390.
- **Who it's for:** tables are still mainly run on a computer or big screen.
  The phone layout lets players join from a phone when they need to, and lets
  a DM **run a session** from a phone. Building maps stays on bigger screens
  (see [Scope](#2-scope)).

---

## 1. Decisions

| Area | Decision |
|---|---|
| When the phone layout applies | Viewport **width < 768 px, or height < 500 px** — `@media (max-width: 767px), (max-height: 499px)`. The height rule catches phones held sideways (~850 × 390). Tablets and desktop windows keep the desktop layout. |
| Landscape | Same layout, reflowed: the map gets wider and shorter, sheets cap their height and scroll. No second phone layout. |
| Hosting on a phone | **Allowed.** The DM can start or resume a guest table and run the session. Building maps (islands, layers, map settings, asset storage) stays on a computer or tablet. |
| Permissions | **Same as desktop** (PITFALLS.md #1). A player edits only their own hero's attacks, spells and bag. HP, conditions, death saves, abilities and skills are the DM's. The DM edits every card. |
| Character sheet (player) | Phone-first tabs **Fight · Magic · Bag · Stats**, opening on Fight. Differs from desktop's Battle · Spells · Bag · Skills on purpose: grouped by what a player does mid-turn. |
| ⋯ Table menu (player) | In-game time · Look & sound · This table · Map settings (read-only) · Leave. |
| Invite code | **DM only.** Players never see it, matching desktop and the "hide dm code" change. |
| Sound | "Mute on this device" (music + effects, new, per device) plus the existing per-effect volume sliders. The DM's music volume stays the table default. |
| Party tab | Roster (hero, class, player, online) with **Show on map**. A token on another layer or not placed shows a label ("On Layer 2 · The Deep Hall", "Not on the map") and no button — it never switches your layer. |

---

## 2. Scope

**In (phone):**

- Players: join, move on the map, measure, end their turn, read their sheet,
  manage their own attacks / spells / bag, roll dice, see the party, change
  their palette and sound, leave.
- DM: start or resume a guest table, copy and rotate the player code,
  show/copy the DM code, add monsters and loot from the compendium (already
  has a phone layout, see 3.9), move any token, edit any card (HP,
  conditions, stats, loot, private notes, remove), roll for initiative, end
  turns and encounters, run the clock and day/night, play table music, save,
  export, import, close the table to new players, leave.

**Out (bigger screens only):** the Edit tool (dragging and grouping islands),
map / islands / layers managers, map settings editing, custom backgrounds,
asset storage (custom monsters, weapons and items).

**Deferred:**

- Following a player's token live ("follow mode"). Revisit if players ask for
  it after using Show on map.
- A personal music-volume slider. Revisit if Mute turns out to be too blunt.
- A one-page-at-a-time compendium book (see 3.9).

---

## 3. Screens

### 3.1 Join or host (`Landing.jsx`) — Phone 1

- App mark, "Hearthbound", "Gather round the table, wherever you are."
- Switch: **Join a table** / **Host a table**.
- **Join:** invitation code (large mono, letter-spaced), your name, token
  color (8 × 44 px swatches, the app's `PLAYER_COLORS`; picked = double ring),
  **Take a seat**, and "Coming back on this device? You'll get your old seat
  back."
- **Host:** "You will be the Dungeon Master. Up to nine players can join
  you.", your name (as Dungeon Master), your color, map name, width / height
  in squares, **Start a guest table**, **Resume guest session**, and: "A guest
  table runs on this phone and nothing is saved on our end. Keep Hearthbound
  open while you play, and export the table before you close it."

### 3.2 Map — player, your turn (`GameView` / `MapBoard` / `TableHud`) — Phone 2

1. **Top bar** — layer name (tap to switch layer), "Layer 1 of 2 · 5 ft
   squares", stacked avatars (overflow as "+3", DM as "DM"), **⋯** → Table
   menu.
2. **Initiative strip** — "Round N", one pill per combatant (dot, name,
   roll). Current turn gold border; those who've acted dimmed.
3. **Map** — the ruler/move path as a dashed gold line with a distance label
   (5-10-5 rule), selection ring, condition dots.
4. **Zoom** — Zoom in, `100%` (reset), Zoom out, Recenter.
5. **Token card** — top half opens the sheet (avatar, name, class/level,
   HP bar, `24/31`, `AC 17`); bottom half shows **Movement** ("15 of 30 ft
   left", from `EncounterActions`) and **End turn**.
6. **Bottom nav** — **Play · Pan · Ruler · Dice · Party**.

### 3.3 Character sheet — player (`RightPanel.jsx` hero card) — Phone 3

Bottom sheet over the dimmed map; tap the dimmed strip or ✕ to close. Header:
avatar, name, "Level 3 Fighter · played by you". Tabs as four equal pills.

- **Fight:** HP (read-only number + bar, moss > 50 %, gold > 25 %, danger
  below; "Your DM keeps track of hit points."), Armor / Initiative / Speed
  tiles, **Attacks** (to-hit and damage in mono, **Roll** each, result read
  out via `aria-live`, "+ Add from the bag"), **Conditions** (all five; active
  filled, inactive dashed; read-only), **Death saves** (read-only).
- **Magic:** the Spells tab — spellcasting class, ability, save DC, attack
  bonus, slots and spells per level. Empty state for non-casters: "Brenna has
  no spells yet" + **Set up spellcasting**.
- **Bag:** currency (Bronze / Silver / Gold), "Weapons & gear" and "Other
  items" with 44 px −/+ quantity steppers, **+ Add item**.
- **Stats:** six abilities (modifier big, score small), proficiency bonus,
  saving throws and all 18 skills with proficiency dots. Read-only: "Only the
  DM edits abilities, saves and skills."

### 3.4 Dice (Toolbar dice popover) — Phone 4

Full screen. Back button, "Rolling as <hero>". Result card (big total,
individual dice + modifier, `aria-live="polite"`) with the last three rolls
under it. Quick roll: d4–d20 in a 3 × 2 grid with a 1–10 quantity stepper.
Saved sets, each with **Roll**.

### 3.5 Table menu — player — Phone 5

Bottom sheet from **⋯**.

- **In-game time:** `ClockReadout` — "18:40", "Day 3 · Dusk".
- **Look & sound:** palette (Classic, Dark Mode, Eddie's Palette, Syfy,
  Grimoire — `state/theme.js`), **Mute on this device** switch, sound-effect
  volume sliders (Dice roll, Attack hits, Attack misses, Page flip, Turn
  starts — `data/defaultAudio.js`), dimmed while muted.
- **This table:** map, DM, who's seated. No invite code.
- **Map settings (read-only):** island, feet per square, island conditions,
  "Only the host can change map settings."
- **Leave the table** → inline confirm: "Leave The Sunken Crypt? You'll need
  the invitation code to join again." **Stay** / **Leave**.

### 3.6 Party — player — Phone 6

Shorter bottom sheet from the Party tab. Header "Party", "5 players · DM Mara
is online". One row per player: hero avatar with online dot, hero name,
"Rogue 3 · played by Sam · online", and **Show on map** — or the off-layer /
not-placed label instead of the button.

### 3.7 Map — DM (`GameView` host) — DM phone 1

Same map as 3.2, with:

- **Top bar:** player code chip (tap to copy, "Copied!") in place of the
  avatars; **⋯** opens the DM Table menu.
- **Token card** for any selected token: tap the name to open its card;
  quick **HP −/+** stepper right on the card; Movement and **End <name>'s
  turn** for whoever's turn it is.
- **Bottom nav:** **Play · Pan · Ruler · Dice · Run table**.

### 3.8 Run the table — DM phone 2

Bottom sheet from **Run table**.

- **Encounter:** "Round 3 · Ghoul's turn", **Combat log**, **End encounter**;
  with no encounter, **Roll for initiative**.
- **Compendium:** Weapons · Items · Monsters, opening the compendium (3.9).
- **In-game time:** clock with play/pause and **Set time**; day/night as
  **Follows the clock / Always day / Always night** (`data/dayPhases.js`).
- **Table music:** current track, play/pause for everyone, **Tracks** (the
  Music modal).

### 3.9 Monster / hero card — DM (`RightPanel.jsx`) — DM phone 3

Same bottom sheet as 3.3; the DM edits everything. Monster tabs **Fight ·
Loot · Stats · DM**: HP with 56 px −/+, tappable Armor / Initiative / Speed,
conditions as toggle buttons, attacks with **Roll**; loot list with "+ Add
loot from the compendium"; editable abilities; DM tab with private notes,
sound, **Remove from the map**. A hero's card for the DM uses the player tabs
(3.3) with every field editable, plus the DM tab and "played by".

### 3.10 Table menu — DM phone 4

- Banner: "This guest table runs on your phone. Keep Hearthbound open and the
  screen on while you play."
- **Codes:** player code + Copy; DM code (hidden until **Show**) + Copy;
  "Keep your DM code with an exported .bmp to resume this table later.";
  **New player code**.
- **Save & share:** "Saved 2 min ago · autosaves in 3:12", **Save · Export ·
  Import** ("Import overwrites the whole table."), **Close to new players**
  switch.
- **Map:** read-only summary + "Build islands and layers, and change map
  settings, on a computer or tablet."
- **Look & sound:** same controls as 3.5.
- **Leave the table** → if the table hasn't been exported (the existing
  `pendingLeaveWarning` path): **Export and leave**, **Stay**, **Leave
  anyway**.

### 3.11 Compendium (DM, `CompendiumBook.jsx`)

Already built: at 900 px wide or less the book stacks. Fixed size
`height: min(720px, 100dvh − 64px)`, full width minus a 16 px gutter.

- **Top row:** Weapons · Items · Monsters share the width (14 px text); ✕ at
  the top-right, always on screen.
- **Book** takes the remaining height, fitting as many 86 px rows per page as
  it can; the ribbon is hidden.
- **Info panel** below, up to 38 % of the height: search, filters, the
  entry's stat block, and Give / Buy / Add to map. Long entries scroll inside
  the panel.
- Between 900 and 1100 px the side panel narrows from 340 px to 280 px.
- Known issue: at phone width the two pages are cramped (names cut to "Gi…").
  Deferred: a one-page-at-a-time book.

---

## 4. Flow

```
Player:
Join ──Take a seat──▶ Map ──token card──▶ Sheet ──✕──▶ Map
                       ├──Dice──▶ Dice ──back──▶ Map
                       ├──Party──▶ Party ──Show on map / ✕──▶ Map
                       └──⋯──▶ Table menu ──Leave──▶ Join

DM:
Host ──Start a guest table──▶ DM map ──token card──▶ Card ──✕──▶ DM map
                               ├──Run table──▶ Run the table ──✕──▶ DM map
                               ├──Dice──▶ Dice
                               └──⋯──▶ DM Table menu ──Leave──▶ Join
```

---

## 5. Look

Uses the app's existing **Classic** palette and fonts from `src/styles.css`,
so the phone layout reuses the same CSS variables and the other palettes keep
working.

| Role | Variable | Classic value |
|---|---|---|
| Page background | `--ink-950` | `#17140f` |
| Panels, bars, sheets | `--ink-900` | `#201b15` |
| Cards | `--ink-800` | `#2b241c` |
| Borders | `--ink-700` | `#3a3226` |
| Body text | `--parchment-100` | `#f2e9d4` |
| Labels | `--parchment-300` | `#d9c89e` |
| Accent line / selection | `--gold-line`, `--gold-hi` | `#a9853f`, `#e0b25a` |
| Primary buttons | `--ember` | `#c1502e` (white text) |
| Healthy / positive | `--moss` | `#62795a` |
| Danger / monsters / leave | `--danger` | `#b23a3a` |

The mockups also use a muted caption color `#b8a882`, which has no variable
today. Either add one (e.g. `--parchment-400`) or use `--parchment-300`.

| Use | Font |
|---|---|
| App name, screen titles | `--font-display-caps` (Spectral SC) |
| Names, headings | `--font-display` (Spectral) |
| UI text | `--font-ui` (Instrument Sans) |
| Numbers: HP, codes, dice, distances, time | `--font-mono` (IBM Plex Mono) |

Rules carried through every screen:

- **Touch targets ≥ 44 × 44 px** (icon buttons, swatches, tabs, nav, steppers).
- Small uppercase labels: 12 px, weight 600, `letter-spacing: .1em`.
- Corners: 10–16 px on cards and inputs, 22 px on the top of bottom sheets.
- Monsters: dark fill + `--danger` ring; heroes: player color + parchment
  ring, so they differ in lightness, not only hue.
- Read-only values look like plain text; editable ones are buttons or inputs
  (the DM's editable tiles have a dashed border).
- Icon-only buttons carry an `aria-label`; tabs use `role="tab"`, switches
  `role="switch"`, palette choices `role="radio"`.

---

## 6. Zoom on phones

The current app, checked in code:

| Input | Today | On a phone |
|---|---|---|
| Mouse wheel | Zooms, anchored at the cursor (`GameView.jsx` ~1885–1901) | Never fires |
| Two-finger pinch | Not handled — `MapBoard` tracks one pointer at a time | Nothing happens |
| Browser page zoom | Blocked over the map by `touch-action: none` (`styles.css:606`) | Nothing happens |
| +/− buttons (`TableHud`) | Work | **The only way to zoom** |

Needed for mobile:

- **Pinch to zoom** on the map, anchored at the midpoint between the two
  fingers, reusing the wheel-zoom anchoring math.
- **Two-finger drag to pan** in every tool, so one finger can stay on Play or
  Ruler.
- Keep the buttons as the accessible alternative to the gestures.
- Keep `touch-action: none` on the map only; the rest of the UI allows normal
  page zoom.

**Large text:** the mockups use fixed px sizes. Chrome (bars, sheets, dice)
should grow with the phone's text-size setting; the map grid scales with map
zoom instead.

---

## 7. Risks and new work

- **A guest table lives in the DM's browser.** If the DM's phone locks,
  switches apps or drops the tab, players lose sync until the DM is back, and
  an unexported table can be lost. Mitigations: the banner in 3.10, the
  existing unexported-leave warning, and a Screen Wake Lock
  (`navigator.wakeLock.request('screen')`) while a guest table is hosted.
  Worth testing on iOS Safari and Android Chrome before shipping DM-on-phone.
- **New behavior** (not in the app today): per-device "Mute on this device"
  for music in `audioEngine.js`; the Party tab's Show on map; the phone
  breakpoint itself; pinch zoom and two-finger pan.
- **Sample content** in the mockups (Brenna, Tamsin, Ossic, Wren, Pell, Mara,
  the Ghoul's card, "The Sunken Crypt", codes) is made up for illustration.
