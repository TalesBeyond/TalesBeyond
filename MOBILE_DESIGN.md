# Hearthbound — Mobile Design (player view)

A phone layout for Hearthbound, from a **player's** point of view. This is a
design proposal, not a description of shipped code: today the app is a
desktop layout (`GameView` + `Toolbar` + `TokenSidebar` + `RightPanel`) with a
`width=device-width` viewport and no phone-specific layout.

- **Mockup (clickable, private until shared):** https://claude.ai/artifact/KWWP6taUJ39m79zsFTT5s6
- **Frame size:** 390 × 844 CSS px (a modern phone). Layouts should stretch in
  width, not assume 390.
- **Scope:** the player journey only — join, play on the map, open your
  character sheet, roll dice. DM (host) tools are out of scope for this pass
  (see [Open questions](#open-questions)).

---

## 1. Look

Uses the app's existing **Classic** palette and fonts from `src/styles.css`,
so the mobile layout can reuse the same CSS variables and the other palettes
(`dark`, `eddies`, `syfy`) keep working.

| Role | Variable | Classic value |
|---|---|---|
| Page background | `--ink-950` | `#17140f` |
| Panels, bars | `--ink-900` | `#201b15` |
| Cards | `--ink-800` | `#2b241c` |
| Borders | `--ink-700` | `#3a3226` |
| Body text | `--parchment-100` | `#f2e9d4` |
| Labels | `--parchment-300` | `#d9c89e` |
| Accent line / selection | `--gold-line`, `--gold-hi` | `#a9853f`, `#e0b25a` |
| Primary buttons | `--ember` | `#c1502e` (white text) |
| Healthy / positive | `--moss` | `#62795a` |
| Danger / monsters | `--danger` | `#b23a3a` |

The mockup also uses a muted caption color `#b8a882`, which has no variable
today. Either add one (e.g. `--parchment-400`) or use `--parchment-300`.

| Use | Font |
|---|---|
| App name, screen titles | `--font-display-caps` (Spectral SC) |
| Names, headings | `--font-display` (Spectral) |
| UI text | `--font-ui` (Instrument Sans) |
| Numbers: HP, codes, dice, distances | `--font-mono` (IBM Plex Mono) |

Rules carried through every screen:

- **Touch targets ≥ 44 × 44 px** (icon buttons, color swatches, tabs, nav).
- Small uppercase labels: 12–13 px, weight 600, `letter-spacing: .08–.1em`.
- Rounded corners: 10–16 px on cards and inputs, 22 px on the top of bottom
  sheets.
- Monsters are drawn with a dark fill + `--danger` ring; heroes with their
  player color + parchment ring, so they differ in lightness, not only hue.
- Icon-only buttons carry an `aria-label`, reusing the labels already in
  `TableHud.jsx` / `RightPanel.jsx` ("Zoom in", "Lose 1 hit point", …).

---

## 2. Screens

### 2.1 Join a table (`Landing.jsx`)

- App mark + "Hearthbound" + tagline.
- Two-way switch: **Join a table** / **Host a table**.
- **Invite code** — large mono input, letter-spaced, centered.
- **Your name** input.
- **Token color** — 8 swatches in one row; each is a 44 px button with a
  30 px circle; the picked one gets a double ring.
- Primary button **Take a seat** pinned near the bottom (thumb reach).
- Helper line: returning on the same device gives you your old seat back
  (matches the existing resume behavior).

### 2.2 Map — your turn (`GameView` / `MapBoard` / `TableHud`)

Top to bottom:

1. **Top bar** — current layer name (tap to switch layer) with
   "Layer 1 of 2 · 5 ft squares" under it; stacked avatars of seated players
   (DM shown as "DM"); **⋯ Table menu**.
2. **Initiative strip** — "Round N", then one pill per combatant
   (token dot, name, roll). Current turn has a gold border; those who have
   already acted are dimmed.
3. **Map** — fills the remaining height. Shows the ruler/move path as a
   dashed gold line with a distance label (5-10-5 rule, e.g. "15 ft"), a
   selection ring on the selected token, condition dots on tokens.
4. **Zoom controls** — floating on the right: Zoom in, `100%` (reset),
   Zoom out, Recenter.
5. **Selected-token card** — floating above the nav: avatar, name,
   class/level, "your turn", HP bar + `24/31`, `AC 17`. Tapping it opens the
   character sheet.
6. **Bottom nav** — **Play · Pan · Ruler · Dice · Party**. Play/Pan/Ruler
   are the existing tool modes (one active, gold). Dice opens the dice
   screen; Party shows the roster.

Toolbar items that don't fit a phone (Edit tool, map / islands / layers
managers, invite-code controls, save/export, day-night clock, Leave) move
into the **⋯ Table menu**. The menu itself is not designed yet.

### 2.3 Character sheet (`RightPanel.jsx`, hero inspector)

A bottom sheet over the dimmed map (tap the dimmed strip or ✕ to close).

- Header: avatar, name, "Level 3 Fighter · played by you".
- Tabs as pills: **Overview · Abilities · Saves · Gear · Spells · Bag**
  (short names for the existing Overview / Abilities / Saves & Skills /
  Battle Equipment / Spells / Bag tabs).
- **Hit points** card: big 56 px − and + buttons either side of the current
  HP, bar colored moss > 50 %, gold > 25 %, danger below.
- Three stat tiles: **Armor**, **Initiative**, **Speed**.
- **Conditions**: the five conditions as chips; active ones filled, inactive
  dashed. Caption "Only the DM can change conditions." (players can't edit
  them today).
- **Attacks**: one row per weapon, to-hit and damage in mono, a **Roll**
  button each.

### 2.4 Dice (Toolbar dice popover)

A full screen instead of a popover.

- Header with back button and "Rolling as <hero>".
- **Result** card: label, big total, the individual dice + modifier
  (`[14] +5`). `aria-live="polite"` so screen readers announce rolls.
- **Quick roll**: d4 d6 d8 d10 d12 d20 in a 3 × 2 grid, with a quantity
  stepper (1–10).
- **Saved sets**: the existing named dice sets, each with **Roll**.
- **Roll log**: the last few rolls under the result.

---

## 3. Flow

```
Join a table ──Take a seat──▶ Map ──token card──▶ Character sheet ──✕──▶ Map
                               └────Dice tab────▶ Dice ──back──▶ Map
```

---

## 4. Zoom on phones

The mockup draws the zoom buttons but its map doesn't really zoom. The
current app, checked in code:

| Input | Today | On a phone |
|---|---|---|
| Mouse wheel | Zooms, anchored at the cursor (`GameView.jsx` ~1885–1901) | Never fires |
| Two-finger pinch | Not handled — `MapBoard` tracks one pointer at a time | Nothing happens |
| Browser page zoom | Blocked over the map by `touch-action: none` (`styles.css:606`) | Nothing happens |
| +/− buttons (`TableHud`) | Work | **The only way to zoom** |

Needed for mobile:

- **Pinch to zoom** on the map, anchored at the midpoint between the two
  fingers, reusing the wheel-zoom anchoring math so both feel the same.
- **Two-finger drag to pan** in every tool, so one finger can stay on
  Play (move tokens) or Ruler.
- Keep the buttons as the accessible alternative to the gestures.
- Keep `touch-action: none` on the map only; the rest of the UI should
  allow normal page zoom.

**Large text**: the mockup uses fixed px sizes and has no large-text
variant. Chrome (bars, sheet, dice) should grow with the phone's text-size
setting; the map grid scales with map zoom instead.

---

## 5. Open questions

1. **DM on a phone** — support it, or keep hosting desktop-only? If
   supported, the token sidebar, compendium and island/layer editing need
   their own screens.
2. **⋯ Table menu** contents and order.
3. **Breakpoint** — at what width does the app switch from the desktop
   layout to this one? Tablet (768+) likely stays desktop-like.
4. **Landscape phones** — stack the map and a side sheet, or keep portrait
   only?
5. **Party tab** — roster only, or also a way to follow other players'
   tokens?
6. **Sample content** in the mockup (Brenna, Tamsin, Ossic, their stats) is
   made up for illustration.
