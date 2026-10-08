# Hearthbound — Full Application Overview

Hearthbound is a browser-based virtual tabletop (VTT) for running D&D-style
sessions: a Dungeon Master hosts a table, builds one or more battle maps,
populates them with heroes, monsters, doors and loot chests, and up to nine
players join with a short invite code to play everything out together in
real time. This document describes the app **as it exists in the code
today** — not a roadmap or a spec draft (see `SPEC.md` for the original,
now partly superseded, design document, and `README.md` / `supabase/README.md`
for the shorter setup-focused guides).

---

## 1. At a glance

| | |
|---|---|
| **Stack** | React 18 + Vite 5, no router, no CSS framework (hand-rolled `src/styles.css`), no TypeScript, no test suite |
| **Backend** | Optional Supabase project (Postgres + Auth + Realtime + Storage). Absent → the app runs entirely on `localStorage`. |
| **Entry point** | `src/main.jsx` → `src/App.jsx` |
| **State** | One `useReducer` store (`src/state/store.jsx`) shared by every screen via React Context |
| **Players per table** | 1 host (DM) + up to 9 players = 10 seats, enforced client-side and (in cloud mode) by a Postgres trigger |
| **Auth** | Anonymous only — no email/password, no login screen. Every browser gets a durable anonymous identity on first use (cloud mode only). |

Hearthbound always runs in exactly one of two modes, decided automatically
at startup by whether `VITE_SUPABASE_PROJECT_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are
set (`src/lib/supabaseClient.js`):

- **Local demo mode** (default) — the whole table (map, tokens, players)
  lives in `localStorage`. Multiple "players" can be simulated with
  multiple browser tabs on the same machine; a table can be handed to a
  different machine via the toolbar's **Export/Import .json** buttons.
- **Cloud mode** — every action writes straight to Postgres through
  Supabase, and a Realtime subscription pushes every other connected
  browser's changes into the same reducer local mode uses, so components
  never know or care which mode they're in.

---

## 2. Core concepts & data model

The entire shared table state is one JS object (see
`createEmptyGameState` in `src/state/store.jsx`):

```
state = {
  session: { code, tableId, hostPlayerId, isOpen, createdAt, hostKey },
  layers: { [layerId]: Layer },
  layerOrder: [layerId, ...],       // layerOrder[0] is the permanent "base" layer
  entities: { [entityId]: Entity },
  entityOrder: [entityId, ...],     // insertion order = render/stacking order
  players: { [playerId]: Player },
}
```

### Layers → Islands → Entities

A **table** can have multiple **layers** (separate maps/levels, e.g.
"The Sunken Crypt" and "The Undercroft"), linked together by **door**
tokens. A layer is *not* a single grid — it's a freeform canvas that holds
any number of **islands**, each an independent grid with its own size,
cell size, and background image, freely positioned and draggable relative
to each other. Two islands whose corners visually touch let a token walk
straight from one to the other with no click-to-teleport step (unlike
doors, which do teleport between layers).

```
Layer   { id, name, feetPerSquare, islands: { [islandId]: Island }, islandOrder }
Island  { id, name, cols, rows, cellSize, backgroundImage, x, y }
```

`layerOrder[0]` / `islandOrder[0]` are each layer's/island's permanent
"base" — new players land there, and it can never be deleted.

### Entities (tokens)

Every placeable thing on the map is an **entity**, keyed by id, carrying a
`layerId` + `islandId` (which island it's currently on) plus a `kind`:

| Kind | What it is | Kind-specific fields |
|---|---|---|
| `hero` | A player character | `sheet` (full D&D 5e character sheet, see §4), `ownerId`, `dmNotes` |
| `mob` | A monster | `armorClass`, `conditions`, `droppables` (loot list), `dmNotes` |
| `npc` | A character the DM runs, with a hero's sheet | `armorClass`, `conditions`, `mobSheet` (the hero-style sheet, DM-only), `hidden`, `dmNotes`, and for a shopkeeper `shop` (`{ role, wares }`, public — see `src/data/merchants.js`) |
| `door` | A bidirectional portal between two layers | `targetLayerId`, `targetCol`/`targetRow` (independent placement on the far side) |
| `chest` | A lootable container | `chestSize`, `opened`, `items` |

Common fields on every entity: `id, kind, name, imageUrl, color, col, row,
size (1×1..4×4), hp, maxHp, layerId, islandId`. `conditions` (status
markers) apply to both `hero` and `mob` tokens; `dmNotes` (private,
DM-only free text) applies to both as well.

### Players

`Player { id, name, color, isHost, connected, joinedAt, currentLayerId,
ownerId (implicit via hero.ownerId) }`. Exactly one player per table has
`isHost: true` — the DM. `currentLayerId` is which layer that player is
currently viewing (each player can be on a different layer at once; the
host can additionally free-view any layer without moving their own
`currentLayerId`, via `hostViewLayerId` local state in `GameView.jsx`).

### Permissions

The DM edits everything. A player can only:
1. **Move their own hero token** — dragging any other hero, a mob, a
   door, or a chest is a no-op for them (`GameView.jsx`'s
   `canMoveEntity`). Since placing tokens is host-only, a hero starts
   unassigned (`ownerId: null`); the DM links it to a seated player via
   the new **Owner** field on that hero's inspector (right under Name) —
   only once that's set does "their own hero" mean anything for that player.
2. **Open a door** — click it to walk through, same as always.
3. **Open or close a chest** — the one exception to "DM edits
   everything": toggling a chest's `opened` state is the one write a
   non-host is allowed (`canUpdateEntity`).

Everything else — placing or removing tokens, editing any stat/sheet/
condition, chest contents, DM notes/droppables, layers, islands, and
importing a `.json` table — is host-only, enforced both in the UI
(read-only fields, hidden buttons, an entirely host-only `TokenSidebar`)
and, in cloud mode, by Postgres itself (`16_dm_only_edits.sql`'s RLS +
trigger — see §6), so it's a real boundary rather than a UI convention a
player could bypass. See `PITFALLS.md` #1 for how this decision was made.

---

## 3. The login → play → logout journey

1. **Landing** (`src/components/Landing.jsx`) — no account, no password.
   - **Host a table**: name, color, map name, and grid size (4–60 squares
     each dimension) → creates a table, a base layer + base island, and
     an invite code.
   - **Join a table**: invite code + name + color. A returning browser
     (same anonymous identity/localStorage identity) resumes its existing
     seat instead of creating a duplicate.
   - **Local-mode-only "testing" escape hatch**: a `hostKey` (a second,
     private code shown only to the host) can re-seat someone as host of
     a table saved in *this browser* if they ever get dropped from the
     roster — this is a client-side `localStorage` scan, not a server
     feature, and is explicitly out of scope for cloud mode.
2. **Play** (`src/components/GameView.jsx` orchestrating `MapBoard`,
   `TokenSidebar`, `RightPanel`, `Toolbar`) — see §4 for the full feature
   tour.
3. **Logout** — the toolbar's **Leave** button removes the player's own
   seat: locally, that's just deleting the row from `state.players`; in
   cloud mode it deletes the player's row in Postgres (a self-only DELETE
   policy added specifically for this — see §6), which is what actually
   frees the seat for the table's 10-seat capacity. Closing the tab
   without clicking Leave is only handled in local mode (via a
   `beforeunload`/`pagehide` handler that can synchronously flush to
   `localStorage`); cloud mode has no equivalent presence/disconnect
   detection yet — that seat stays "connected" until someone explicitly
   leaves.

A page refresh **resumes** the same table automatically in either mode
(`App.jsx` stores a small "pointer" — mode/code/tableId/playerId — and
reloads the full snapshot on mount).

---

## 4. Feature tour

### Toolbar (`Toolbar.jsx`) — collapsible, icon-card based, no dropdown menus

- **Tool select** (mutually exclusive): **Play** (select/drag tokens,
  walk through doors) · **Edit** (host-only: drag islands to reposition,
  edit chest contents) · **Pan** (click-drag to scroll) · **Ruler**
  (click-drag to measure) · **Fog of war** (host-only, desktop: cover
  parts of a map until the party explores them — see Fog of war below).
- **Zoom**: −/Reset(shows current %)/+ /Recenter (scroll back to the
  currently active island). Mouse wheel also zooms in any tool. Zoom is
  a per-viewer preference, never persisted or synced.
- **Map / Islands / Layers** popovers: rename/resize the active island,
  upload/replace its background, set the layer's feet-per-square scale;
  host-only island manager (create/select/delete — base island
  undeletable) and layer manager (create/switch/delete — base layer
  undeletable, switching a layer moves only the *viewer*, not the whole
  table).
- **Dice** popover: named, saved dice sets (title + die size + quantity),
  rolled on demand with a running roll log that survives closing/
  reopening the popover.
- **Weapons / Items Compendium** (host-only): searchable catalogs (100
  weapons built from the 37 canonical PHB weapons × mundane/+1/+2
  variants; 128 PHB-flavored adventuring-gear/tool/instrument items) —
  each row can be **Bought** (deducts gold, rounded up, from a picked
  hero) or **Given** (no cost) directly into that hero's Bag.
- **Tomes / Food & Drink / Spells** chapters of the same book (built into
  the app, no catalog table): 100 made-up tomes, 60 foods and drinks, 100
  spells. Buy and Give work the same way; a tome, food or drink lands in
  Bag > Other items (a tome keeps its text, read from the Bag row), and a
  spell is written into the hero's Spells tab at its level. The DM writes
  tomes of their own (title, author, text) under Asset Storage > Tomes.
- **Shopkeepers** (Tokens > NPC): Weapon Salesman, Librarian, Food
  Salesman, Wizard, Wandering Salesman (any chapter) and Cartographer
  (maps the DM writes). Each is an NPC with a `shop`; the DM stocks it and
  sets prices when placing it and from its Shop tab, and sells or gives to
  any hero. A player buys into their own hero from the same tab. Stock is
  unlimited; a sale only changes the buyer's sheet.
- **Save / Export / Import**: manual localStorage save (cloud mode shows
  "Synced to the cloud" instead, since every action already writes
  through immediately), download the whole table as `.json`, or restore
  one (import is local-mode only — reject with a message in cloud mode).
- **Invite code controls**: copy code, host-only regenerate (invalidates
  the old code instantly), host-only open/close (closing blocks *new*
  joins only — a returning player with an existing seat can always get
  back in), host-only copy host key, and Leave.

### Map board (`MapBoard.jsx`)

Renders every island on the current layer as its own bordered,
backgrounded grid, positioned in shared world-space so islands can sit
edge-to-edge. Tokens render at their island-relative cell, in
`entityOrder` (insertion order) so later-added tokens stack on top;
doors always render on top of everything else regardless of order.
Dragging a token resolves the drop point against *whichever island's
rectangle contains it*, re-scoping the token to that island if it moved
across a boundary. Distance is measured with D&D 5e's "5-10-5" diagonal
rule (`src/utils/grid.js`'s `feetDistance`).

Fog of war paints inside each island, over the map art, grid, day/night
tint and drawings and under every token (`FogOfWarLayer.jsx`): an opaque
cover for players, a tint for the DM. A player's encounter move range
stops at the cover. A token dropped where the table refuses it (a
player's hero into a held-back fog chunk) never lands: `onMoveEntity`
returns `false` and the map does not hold it at the drop square.

### Token sidebar (`TokenSidebar.jsx`)

- **Add your own image**: upload any image as a Hero or Monster token
  (client-resized to 256px before embedding as a data URL).
- **Default heroes** (8: Fighter, Wizard, Rogue, Ranger, Bard, Barbarian,
  Cleric, Paladin) and **default monsters** (5: Goblin, Skeleton, Orc,
  Dire Wolf, Young Dragon) — hand-drawn inline-SVG icons
  (`src/data/defaultTokens.js`), one click to place. Placing a default
  monster auto-seeds its **Droppables** loot list (see below).
- **Placeable** tiles (Door, Chest, Trap, Ambush): clicking one opens its
  configuration modal straight away; nothing is set up in the sidebar.
  **Door**: name + target layer (or, with no second layer yet, the form
  to create one) → places a linked pair of door tokens. **Chest**: name +
  size (Small=1/Medium=5/Large=8/XLarge=12 item slots) + contents (shared
  `ChestContentsEditor`, see below).

### Players button (`Toolbar.jsx` `PlayerList`)

A toolbar button beside Configurations, for everyone at the table, labelled
with the seats taken ("2/10 players"). It drops down the player list: colour
and online dot, name ("(you)" for yourself), and the DM or the hero they play,
"away" when they've dropped.

### Right panel — inspector (`RightPanel.jsx`, `CreatureCard.jsx`)

Selecting a hero or monster shows its whole inspector as one collectible
**card**: the name (and a hero's level) on the title bar, the token art with
an armor-class shield and a hit-point heart, the owner picker ("played by",
DM-only), a life bar with −/+ steppers, Initiative / Speed / Size plaques,
the six ability scores, death saves (heroes), condition chips, and a tab
ribbon:

- **Hero** — Battle (attacks from a small default weapon list, each
  rollable: d20 to-hit vs. a picked mob's AC, then damage dice straight off
  that mob's HP), Spells (per-level slots + prepared list, levels 0–9), Bag
  (gear and other items, bronze/silver/gold), Skills (proficiency + a
  hand-adjustable bonus per save/skill), and DM (host-only: token sound,
  private notes, remove).
- **Mob** — Battle, Loot (the Droppables list, below), Skills and DM for the
  host; a player sees only its name, AC, HP, size and conditions.

Every value a viewer may change is **click-to-edit**: a pencil appears on
hover, a click turns it into a field, Enter or leaving it saves, Esc
cancels. The DM edits the card; a hero's own player edits its Battle, Spells
and Bag tabs; anyone else sees plain values with no pencil.

- **Door** — name + linked layer.
- **Chest** — name, Open/Close toggle (independent of the active tool), a
  **Give to a player** picker per item once opened (moves the item from
  the chest into a chosen hero's Bag), and contents editing (only while
  the Edit tool is selected) via the shared `ChestContentsEditor`.

**Conditions** (`src/data/conditions.js`): Poisoned, Stunned, Prone,
Shocked, Bleeding — purely visual/informational badges on hero and mob
tokens, toggled host-only; not mechanically enforced (no automated
disadvantage, etc.).

### Chests & loot (`ChestContentsEditor.jsx`, `data/chests.js`)

Every chest/droppable item shares one shape: `{ name, qty, cost,
numberOfDice, diceType, modifier }` — the same fields whether it came
from a compendium chapter or was hand-typed. A chest's editor has two
tabs. **From the compendium** lists a chapter (Weapons, Items, Tomes or
Food & drink, with this table's own entries) to browse and search, each
row with **+ Add** ("In chest" once it is inside), and **+ 1 at random**
adds one of what the list is showing. **Custom item** is the hand-typed
form. A tome or a dish also keeps its chapter as `source`, so looting it
puts it under the hero's Other items (a tome with its text) instead of
Weapons & gear.

### Mob droppables (`DroppablesEditor.jsx`, `data/droppables.js`)

A collapsible, host-only **Droppables** section on every mob: a list of
potential loot items, each with a **drop chance %** rollable against a
d20 (N% drops on a roll of N⁄5 or under — a d20-flavored stand-in for a
percentile roll), individually or all at once ("Roll all drops"), plus
the same compendium-search-or-custom-item picker chests use. Placing one
of the six default monsters seeds a flavor-appropriate starter loot table
built from the PHB weapon/item prices already in the compendiums (the
PHB itself doesn't publish monster loot tables — that's the DMG/Monster
Manual's job — so these are hand-picked, not canonical).

### Encounters (`EncounterHud.jsx`, `utils/encounter.js`)

Roll for Initiative has a **Start encounter** box (ticked by default). Rolling
with it ticked starts a fight: a turn-order ribbon with the round across the
top of the map, the acting token pulsing, its reachable squares (speed from
the sheet, measured from where the turn began) tinted on the map, and an
**End turn / Roll d20 / Log** stack bottom-right. The encounter is one synced value (`tables.encounter`,
49_encounter.sql): the DM ends any turn; a player ends their own hero's turn
through the `end_encounter_turn` RPC (or an intent, on a guest table).

During an encounter, selecting a creature other than the acting hero adds a
preview of that hero's first attack against it under its inspector card
(chance to hit, damage, HP left).

### Game-feel moments (`lib/fx.js`, `FxLayer.jsx`)

Floating hit / critical / heal / MISS numbers over tokens, a life bar whose
lost chunk drains after a beat and glows below 25%, a turn banner, a big die
for natural 20s and 1s, cardboard condition chits, and loot cards that flip
face-up (mob droppables, or a chest being opened). HP changes and chests are
read from synced state, so every player sees them; rolls and misses are local.
The **Grimoire** palette restyles all of it as the DM's open book: a
leather cover with the map as the left page and the inspector as the right,
cross-hatched ink walls around every island, inked tokens, and a thumb index
down the map page's edge (`BookTabs.jsx`) — Map, Bestiary, Armory, Dice,
Music, and the Chronicle (the combat log, open any time).

### DM notes

A private free-text box on every hero and mob's inspector, labeled "only
visible to you," rendered only when `isHost` is true — a place for the DM
to jot secrets (a hero's hidden backstory hook, a monster's true nature)
that never appears in a player's own view of that token.

---

### Drawings (`DrawingLayer.jsx`, `DrawingBar.jsx`, `DrawStyle.jsx`, `utils/drawing.js`)

The DM's **Draw** tool (Tools menu; on a phone, Edit → Draw) marks up the
map; every seated player sees the result, and only the DM can draw.

- **Where drawings live**: each belongs to the island it was drawn on —
  `{ id, islandId, kind: 'pencil' | 'line' | 'circle' | 'rect' | 'fill', geometry, style }`
  in `state.drawings` / `state.drawingOrder` (creation order, newest on top),
  geometry in grid squares from the island's top-left corner. They paint in
  an SVG inside the island, over the map art, grid and day/night tint and
  under every token, so anything past the island's edge is cut off. Dragging
  the island moves them; deleting it (or its layer) deletes them.
- **Tools**: Pencil, Line, Circle (grows from its centre), Rectangle,
  Fill island (a click paints the whole island in the current colour, laid
  over the map art and under the grid; an Opacity slider sits beside the
  bar; clicking a filled island recolours it, and the same colour again
  clears it; Select and Eraser pass over fills), Select (move any drawing within its island; handles resize lines, circles
  and rectangles; pencil strokes move only) and Eraser (removes every
  drawing it touches, whole). A press in Draw always draws, even on a token;
  right-drag still pans.
- **Style**: a colour wheel with brightness, 8 swatches and the last 5
  colours used; 4 thicknesses, and with the Pencil a Thickness slider beside
  the bar (a style's `width` is then a number of squares); a see-through
  fill for circles and rectangles. **Snap to grid** puts line ends and circle centres on grid
  corners or square centres, radii on whole squares and rectangle corners on
  grid corners. A feet label (the ruler's look) shows while drawing or
  resizing.
- **Undo/redo** (bar buttons, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y) covers
  the DM's own draws, moves, resizes, restyles, erases and clears in this
  browser session. **Clear this island** / **Clear this map** confirm with a
  count. Anyone can **Hide drawings** in their own browser.
- **Sync**: one write per finished action — the `drawings` table in cloud
  mode, the guest broadcast in a guest table, the saved state locally. The
  drawing preferences (tool, style, Snap, recent colours, Hide) are
  `hearthbound:drawprefs` in this browser only.

### Fog of war (`FogOfWarLayer.jsx`, `utils/fogOfWar.js`)

The DM's **Fog of war** tool (Tools menu, desktop only) covers parts of a
map until the party explores them. It is not the Fog island condition.

- **Fog chunks**: each is a rectangle on one island —
  `{ id, islandId, x, y, w, h, revealed, revealOnEnter }` in
  `state.fogChunks` / `state.fogChunkOrder`, in whole squares from the
  island's top-left corner. Squares outside the island's current size are
  ignored. A square is fogged while at least one unrevealed chunk covers
  it. Chunks move with their island and are deleted with it (or its layer).
- **What each side sees**: players get a flat opaque cover; the DM gets a
  tint with the map showing through, and a dashed outline with a corner
  tag once a chunk is revealed. There is no per-player fog.
- **The tool**: drag on a map to lay a chunk; **Fog whole island** in the
  bar lays one the size of the active island. Click a chunk to pick it
  (the smallest, where several overlap), then drag it to move it or a
  handle to resize it, in whole squares; Esc drops the selection, Delete
  or Backspace removes the chunk. In Play, the DM's click on a fogged
  square picks its chunk, and a revealed chunk is picked by its corner tag
  only.
- **The fog card** (right panel; a sheet on a phone): **Reveal** or **Fog
  again**, the **Reveals when entered** switch, **Delete**.
- **Tokens in fog**: a token that is not a hero and stands wholly on
  fogged squares is fogged (`entity.fogged`) and does not exist for
  players, the same three ways a hidden token doesn't (`data/visibility.js`).
  A door needs both of its sides in fog; with one side clear, players see
  it on that side only. Only the DM's client writes `fogged`: in the same
  write that places or moves the token, again for every token whenever
  chunks or islands change, and once more on load and after each resync.
- **Reveals when entered**: with the setting on, the DM's client reveals
  a chunk while any hero stands in it — whoever moved the hero. Nothing
  opens while the DM's browser is closed. A chunk laid (or moved) over a
  hero starts with the setting off, and so does one fogged again while a
  hero stands in it.
- **Held-back chunks** (setting off) open only by the DM's hand, and a
  player cannot move their own hero into one — by drag, phone tap, planned
  move or door. The hero stays where it was and the log says the area is
  not open yet. The player's own client checks this on cloud and local
  tables, the DM's client on a guest table; the database does not.
- **Sync**: one write per finished action — the `fog_chunks` table in
  cloud mode, the guest broadcast in a guest table, the saved state
  locally.

### Dice rolls at the table (`RollFeed.jsx`)

Players roll in the open; the DM's own rolls stay on the DM's screen unless
they choose otherwise.

- Every roll — the dice window, Roll d20 in a fight, attack rolls (with the
  target, hit or miss, and whether it was rolled normally, with advantage or
  with disadvantage — both d20s shown) — announces itself on `lib/fx.js` as
  `{ type: 'rolled', what, dice, detail, total, flag }`. `GameView` sends a
  player's roll to the whole table; a DM's roll only when **Reveal rolls to
  players** is on (Configurations; the Dice section of the phone's DM table
  menu; off by default; this browser only, `hearthbound:revealRolls`).
- Rolls travel live and are never stored: Supabase Broadcast on the cloud
  table's own `table:<id>` channel (`subscribeToTable`'s `onRoll` /
  `sendRoll`), or the guest channel's `roll` event. A local table has no one
  else to tell.
- Everyone else sees a short card over the map as a roll lands, and every
  roll goes into the **Roll log** (the toolbar's **Roll log** button on desktop, with a count of new rolls from others; Run table or
  Party → Roll log on a phone). The DM's hidden rolls are marked "Only you";
  revealed ones show as "The DM" with "Shown by the DM". The dice window says
  who will see the next roll.

### Hints (`Hints.jsx`)

Wherever someone gets stuck, the app says why something can't be used yet,
then where to fix it — naming places the way the screen does ("Mapping →
Layers") and offering the fix when it's one step. Four patterns:

- **Hint** (inline, always shown): the door on a one-map table (Create a
  layer opens an inline form; the new map is then picked for the door), a
  door with no map picked, a hero nobody plays, Battle with an empty bag
  (Open the Bag), nothing to attack, loot with no heroes (Open Tokens),
  taking loot without a hero, Initiative with nobody picked, Islands
  (Switch to Edit), the base layer, asset
  storage with nothing saved, and Music where it can't play.
- **Empty state**: the DM's empty map (Open Tokens / the Add sheet), and a
  player without a hero (inspector, phone card).
- **Mode bar** across the top of the map while Ruler, Edit, Group islands
  or Draw changes what a press does, with a way out; each has an × that
  hides it on this device.
- **Tip**, once per device: which code to share on first hosting.

**Show hints and tips** (Configurations → Hints on/off; Look & sound on a
phone) turns tips and mode bars off on this device — inline hints stay.
**Tips again** / **Show all tips again** brings dismissed ones back. Stored
as `hearthbound:hints` in this browser only. "Open Tokens" and "Open the
Bag" travel over `lib/fx.js` (`{ type: 'open', panel: 'tokens' }`,
`{ type: 'cardTab', key }`).

### Phone layout (`PhoneChrome.jsx`, `PhoneCreatureSheet.jsx`, `PhoneHostScreens.jsx`)

Below `(max-width: 767px), (max-height: 499px)` (`PHONE_QUERY`) `GameView`
renders an islands-first phone layout around the same `MapBoard`, store,
handlers and permissions — no separate route, reducer actions or sync.
MOBILE_DESIGN.md is the design; REQ-011 the plan.

- **Island view**: the top bar names the active island over its layer; island
  chips *fly to* an island (active island + the zoom that fits it + centre);
  a mini-map and the **Atlas** show the whole layer. Pinch zooms (a CSS
  transform while the fingers move, one real zoom when they lift), one finger
  pans empty map in Play.
- **Interaction**: tap a square to move your token (in an encounter the
  acting token gets a *planned move* — path, feet, "Move here"); a **Target**
  sheet previews and rolls an attack (`resolveAttackRoll` in
  `utils/combat.js`, shared with the Battle tab); door and chest sheets.
- **Sheets**: the phone creature sheet (Fight · Magic · Bag · Stats · DM for
  heroes, Fight · Loot · Stats · DM for monsters, reusing the desktop tab
  bodies on a paper page); dice (the same `DiceModal`, its roll log now kept
  in `GameView`); the player table menu with **Mute on this device**
  (`tb.muteDevice`, `lib/sfx.js`); Party; the DM's Add sheet
  (`TokenSidebar` `layout="phone"`), Run the table and table menu.
- The DM's `Toolbar` stays mounted out of sight on a phone; its panels
  (bestiary, layers, islands, initiative, asset storage, clock, ambience)
  open over `lib/fx.js` `{ type: 'open', panel }` events. Every modal rises
  as a bottom sheet.
- A guest table hosted from a phone holds a Screen Wake Lock while visible.

## 5. Persistence — local mode

`src/state/persistence.js` wraps `localStorage` behind a small interface
(`saveSession`/`loadSession`/`deleteSession`/`sessionExists`) plus a
separate per-table "identity" store (so a refreshed tab rejoins as the
same player) and a "current pointer" (which table this browser tab is
sitting at, for resume-on-refresh). `src/state/migrate.js` upgrades an
older save into the current shape in up to two guarded steps (pre-layers
→ layers, pre-islands → islands), so a save from *any* point in the app's
history loads correctly.

---

## 6. Persistence & sync — cloud mode (Supabase)

### Auth

No login screen, ever. `src/lib/auth.js`'s `ensureAnonymousSession()`
calls Supabase's anonymous sign-in on first use per browser; every RLS
policy and RPC below keys off that session's `auth.uid()`.

### Schema (16 migrations, run once in order — see `supabase/README.md`)

| File | Adds |
|---|---|
| `01_schema.sql` | `tables`, `invite_codes`, `players`, `maps` (later retired), `entities` (hero/mob only at this point); the 10-seat capacity trigger; a shared `touch_updated_at()` trigger |
| `02_policies.sql` | RLS: "members can read/write their own table's rows" for every table above |
| `03_functions.sql` | `create_table`, `join_table`, `regenerate_invite_code`, `whoami_for_code` (all `SECURITY DEFINER`) |
| `04_storage.sql` | `token-art` and `map-backgrounds` public-read buckets, upload scoped to a table the uploader belongs to |
| `05_layers.sql` | Replaces `maps` with a many-per-table `layers` table; adds `door` as an entity kind + `target_layer_id` |
| `06_conditions.sql` | `entities.conditions text[]`, constrained to the known catalog |
| `07_door_positions.sql` | `target_col`/`target_row` for independent per-side door placement |
| `08_character_sheets.sql` | `entities.sheet jsonb` — the whole hero sheet as one blob |
| `09_armor_class.sql` | `entities.armor_class` for mobs |
| `10_islands.sql` | New `islands` table (many per layer); moves grid fields off `layers` onto `islands`; adds `entities.island_id` |
| `11_chests.sql` | Adds `chest` as an entity kind; `chest_size`, `opened`, `chest_items jsonb` |
| `12_dm_notes.sql` | `entities.dm_notes text` (superseded by migration 15) |
| `13_mob_droppables.sql` | `entities.drop_items jsonb`, the Droppables loot list (superseded by migration 15) |
| `14_entity_ordering_and_player_leave.sql` | `entities.created_at` (real, reliable stacking-order timestamp — the pre-existing `z_order` column was declared but never actually written by the client); a self-only DELETE policy on `players` so **Leave** actually frees a seat in cloud mode instead of only flipping `connected` |
| `15_entity_dm_data_privacy.sql` | Moves `dm_notes`/`drop_items` off `entities` into a new `entity_dm_data` table with host-only SELECT/UPDATE/DELETE — a non-host's query (or Realtime subscription) now returns zero rows instead of the raw value, so this data is actually private, not just UI-hidden |
| `52_drawings.sql` | The Draw tool: a `drawings` table (one row per shape, `island_id` cascading from `islands`), members read, host writes; added to the realtime publication |
| `68_fog_chunks.sql` | Fog of war: a `fog_chunks` table (one row per rectangle of fog in whole squares, `island_id` cascading from `islands`, with `revealed` and `reveal_on_enter`), members read, host writes; added to the realtime publication |
| `69_fogged_tokens.sql` | Fog of war: `entities.fogged`, written only by the DM's client for a token standing wholly in fog. The `entities` read policy gains `and not fogged` for players, and `enforce_entity_write_permissions` keeps `fogged` the DM's, beside `hidden` and `locked` |
| `16_dm_only_edits.sql` | The DM is the only one who edits information — INSERT/DELETE on `entities` becomes host-only, and a BEFORE UPDATE trigger (`enforce_entity_write_permissions`) restricts a non-host's UPDATE to exactly two cases: moving their own hero (col/row/island_id), or opening/closing a chest (opened/image_url) |

Every table trusts "any seated member of this table" for reads and (for
`entities`) writes — matching local mode's "anyone at the table can move
any token" trust model. Layers/islands are host-write-only. `players` can
be updated by the row's own owner (name/color/current layer) and, as of
migration 14, deleted by its own owner (leaving).

### RPCs (`03_functions.sql`, all `SECURITY DEFINER`)

- `create_table(name, cols, rows, display_name, color)` — creates the
  table, its base layer + base island, seats the caller as host, issues
  the first invite code.
- `join_table(code, display_name, color)` — validates the code, checks
  the table is open, seats the caller (or resumes their existing seat on
  conflict) — all in one transaction so the 10-seat cap can't be raced.
- `regenerate_invite_code(table_id)` — host-only; revokes the old code,
  issues a new one.
- `whoami_for_code(code)` — lets a returning browser find its own
  table/player id for a code without needing a fresh `join_table` call
  (and without exposing `invite_codes` rows to someone who hasn't joined).

### Realtime (`src/lib/realtime.js`)

One Postgres-changes subscription per open table, listening on
`entities`, `players`, `layers`, `islands`, `tables` (open/close),
`drawings`, `fog_chunks`, and `invite_codes` (rotation) — every event is translated into the exact same
reducer action a local interaction would dispatch, so no component ever
needs to know whether a change came from this browser or someone else's.
Conflict handling is last-write-wins per row. Realtime sends nothing when
a row stops being readable, so a token the DM hides, or one the fog of war
now covers, leaves players' maps through a `conceal` broadcast naming it
(the row stays the authority: a client drops the token only if it really
can no longer read it). This is already a working
WebSocket-based live sync layer — `REALTIME_ROADMAP.md` lays out the
step-by-step plan for hardening it (reconnect recovery, presence,
ephemeral live-drag updates, load testing) into full live-service quality.

### Storage (`src/lib/storageUpload.js`)

Implemented and ready (client-side resize → upload to a per-table folder
→ public URL) but **not yet wired into the UI** — `TokenSidebar.jsx` and
the background uploader still always embed a base64 data URL, even in
cloud mode. This is a known, intentionally-deferred gap (see
`supabase/README.md`).

### Known gaps (by design, not oversights)

- Kicking a player, and locking a hero token so only its owner can move
  it, are unimplemented (`SPEC.md` §13 roadmap items).
- No presence/disconnect detection in cloud mode — only an explicit
  **Leave** frees a seat; closing the tab does not.
- `.json` import is local-mode only.

---

## 7. Project layout

```
src/
  App.jsx                  Landing ⇄ GameView switch, resume-on-refresh
  main.jsx                 React entry point
  styles.css               Whole design system (ink/parchment/gold-line theme)
  state/
    store.jsx              Reducer + Context: the entire shared table shape
    persistence.js         localStorage save/load/identity/resume-pointer (local mode)
    migrate.js             Upgrades an older save into the current shape
  lib/
    supabaseClient.js      Feature-detected Supabase client (null if unconfigured)
    auth.js                Anonymous sign-in bootstrap
    mappers.js             camelCase (client) <-> snake_case (DB) row translation
    remoteApi.js           create/join/regenerate/snapshot/CRUD network calls
    realtime.js            Postgres-changes subscription -> reducer actions
    storageUpload.js       Client-side resize + upload to Supabase Storage (unwired)
  components/
    Landing.jsx             Host / Join / (local-only) rejoin-as-host screens
    GameView.jsx            Top-level game screen: wires board+panels+toolbar to state
    MapBoard.jsx            Island/grid rendering, token drag, ruler, pan/zoom math
    Toolbar.jsx             Tools, popovers (map/islands/layers/dice/compendiums), session controls
    TokenSidebar.jsx        Default hero/monster gallery, custom upload, doors & chests
    RightPanel.jsx          Player roster + selected-token inspector (all kinds)
    ChestContentsEditor.jsx Shared chest-contents / droppable-loot item picker
    MerchantShop.jsx        A shopkeeper's stocking editor and its Shop tab (sell / give / buy)
    DroppablesEditor.jsx    Mob loot list: same picker + d20 drop-chance rolling
  utils/
    grid.js                 Grid<->pixel math, island canvas bounds, 5-10-5 distance
    inviteCode.js           Invite code / entity / player id generators
    image.js                Client-side image resizing
  data/
    defaultTokens.js        Inline-SVG default hero/monster/condition/chest art
    characterSheet.js       5e sheet shape, defaults, normalizers
    conditions.js           The 5-condition catalog
    weapons.js              100-entry mock weapon compendium (37 PHB base × variants)
    items.js                128-entry mock item compendium (PHB equipment chapter)
    tomes.js / foods.js / spells.js  The Tomes, Food & Drink and Spells chapters
    merchants.js            Shopkeeper roles, the `shop` shape, and the buy / give helpers
    chests.js               Chest size tiers + chest-item shape
    droppables.js           Mob loot item shape + per-monster starter loot tables
supabase/
  01..14_*.sql              Schema, RLS, RPCs, storage, and every feature migration (see §6)
  README.md                 Setup walkthrough + "what isn't wired up yet"
SPEC.md                     Original design spec (partly superseded — see note at its top)
README.md                   Short quickstart (local-mode flow + project layout)
```

---

## 8. Running it

```bash
npm install
npm run dev
```

Open the printed local URL — local demo mode needs no further setup. To
turn on cloud mode, follow `supabase/README.md`: create a free Supabase
project, run the 14 SQL files in order, enable anonymous sign-in, then set
`VITE_SUPABASE_PROJECT_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` and restart.
