# Hearthbound — Mobile Design (players and DM)

The phone layout of Hearthbound: every desktop capability, for players and
the DM, in a phone's browser on the same site. Implemented under REQ-011
(`requirements/InProgress/REQ-011-Phone-Release.md`); the release waits on a
real-device pass and on REQ-008.

- **Design canvas (private until shared):**
  https://claude.ai/artifact/7FphnpyRQe7hpyAp4nPLJq — the **Phone** page
  (islands first, interacting on an island, everything else) and the
  **Hints** page (a separate plan).
- **Frame size:** designed at 390 × 844 CSS px; layouts stretch in width.
- **Code:** `src/components/PhoneChrome.jsx` (chrome, sheets, atlas, party,
  menus), `PhoneCreatureSheet.jsx`, `PhoneHostScreens.jsx`, the phone branch
  of `GameView.jsx`, and the phone section at the end of `src/styles.css`.

---

## 1. Decisions

| Area | Decision |
|---|---|
| When the phone layout applies | `(max-width: 767px), (max-height: 499px)` — `PHONE_QUERY`. The height rule catches phones held sideways. Tablets and desktop windows keep the desktop layout. |
| Ships as | Mobile web on the existing site. No app store, no install. |
| Islands first | The top bar names the island you're on over its layer; island chips *fly to* an island (fit it, centre it); a mini-map and the Atlas show the whole layer. |
| Landscape | Same layout, reflowed: map left, a right rail with the island chips and tools. |
| Hosting on a phone | Full parity: the DM can build (islands, layers, map settings, groups, tokens, asset storage) and run a session from a phone. |
| Permissions | Same as desktop (PITFALLS.md #1). A player edits only their own hero's attacks, spells and bag; opening/closing chests, taking items and walking through doors are the other player writes. |
| Tap to move | Tapping a square moves your selected token. In an encounter, the acting token gets a planned move — path, feet, "Move here". Drag still works. |
| Character sheet | Heroes: Fight · Magic · Bag · Stats (+ DM for the host). Monsters: Fight · Loot · Stats · DM for the host; a player sees the summary. |
| Invite code | DM only. |
| Sound | "Mute on this device" silences music and effects in this browser; per-effect volumes stay stored. |
| Phone DM keep-awake | A Screen Wake Lock while a guest table is hosted from a phone, re-requested when the page returns; plus the "runs on this phone" note. |

---

## 2. Screens (as built)

**Everyone**

- **Join or host** (`Landing.jsx`): the form comes right after the headline on
  a phone; colour swatches have 44 px targets.
- **Island view**: top bar (island · layer, Maps, ⋯), island chips, mini-map,
  island-condition banner, zoom column, the selected token's card (HP, AC; the
  DM gets +/−; a monster on the actor's turn gets **Target**).
- **Atlas** (tap the title or the mini-map): every island with tokens, and a
  list; the DM also gets Manage islands / Manage maps.
- **Maps** sheet: the layers, who is where; the DM can view any and manage them.
- **Planned move** card, **Target** sheet (chance to hit, damage, HP left,
  Attack), **door** sheet (where it leads, who's there, Walk through), **chest**
  sheet (open/close, Take for players, Give and contents for the DM).
- **Creature sheet** (`PhoneCreatureSheet.jsx`): HP, armor, initiative, speed,
  size, conditions and death saves up top; the tabs reuse the desktop card's
  tab bodies on a paper page.
- **Dice**: the desktop `DiceModal` as a full-height sheet, sharing its roll
  log and saved sets with the desktop popover.

**Players** — bottom bar Play · Pan · Ruler · Dice · Party.

- **Table menu**: in-game time, palette, Mute on this device, effect volumes,
  this table (map, DM, seated), read-only map settings, Leave with a confirm.
- **Party**: seated players, their hero and online state; Show on map, or the
  map they're on, or "Not on the map".

**DM** — bottom bar Play · Edit · Ruler · Add · Run table.

- **Add** (`TokenSidebar` `layout="phone"`): Heroes · Monsters (bestiary, asset
  storage) · Doors · Chests · Traps · Your own.
- **Edit** mode bar: island settings (Map settings), Group (tap islands, name
  the group), Done.
- **Run the table** (`PhoneHostScreens.jsx`): encounter (round, turn, combat
  log, end) or Roll for initiative; compendiums and asset storage; clock and
  day/night; table music; dice; party.
- **Table menu**: guest-table note, player and DM codes, new code, save
  status, Save / Export / Import, Close to new players, islands and maps, look
  & sound, Leave.
- The desktop toolbar stays mounted out of sight; its panels open over
  `lib/fx.js` and every modal rises as a bottom sheet.

---

## 3. Flow

```
Player:
Join ──Take a seat──▶ Island view ──token card──▶ Creature sheet ──✕──▶ Island view
                       ├──title / mini-map──▶ Atlas ──island──▶ Island view
                       ├──tap a square──▶ (fight) Planned move ──Move here──▶ Island view
                       ├──monster card · Target──▶ Target sheet ──Attack
                       ├──door──▶ Door sheet ──Walk through──▶ other map
                       ├──Dice / Party / ⋯──▶ sheets
                       └──⋯ · Leave──▶ Join

DM:
Host ──Start a guest table──▶ Island view ──Add / Edit / Run table / ⋯──▶ sheets and panels
```

---

## 4. Look

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

## 5. Zoom and gestures on phones

| Input | On a phone |
|---|---|
| Two-finger pinch | Zooms around the fingers' midpoint and pans with them. While pinching, only the canvas is scaled (a CSS transform); the real zoom is set once when the fingers lift. |
| One finger on empty map | Pans, in the Play tool. A pan never selects an island or clears a selection. |
| One finger on a token | Drags it (if you may move it). |
| Tap a square | Moves the selected token, or plans the move for the acting token in an encounter. |
| +/− / 100% / recenter | Still there; recenter flies back to the active island. |

The phone zoom floor is 20 % (desktop 40 %), so a whole island fits a phone.

---

## 6. Open items

- **Real-device pass** (REQ-011 S051): iOS Safari 17+ and Android Chrome,
  portrait and sideways, as player and as DM, on a cloud and a guest table.
  Notch/safe areas, the wake lock and touch feel are only verifiable there.
- **Cross-island movement in encounters** reads 0 ft left after crossing
  (existing behaviour; REQ-011 Q10).
- **Short desktop windows** under 500 px tall get the phone layout (REQ-011 Q9).
- **Hints** (the canvas's Hints page) are a separate plan.
- **Large text**: the phone chrome uses fixed px sizes and doesn't yet grow
  with the phone's text-size setting.
