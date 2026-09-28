# REQ-011 — Phone Release

| Field | Value |
| ----- | ----- |
| ID | REQ-011 |
| Title | Phone Release |
| Status | InProgress |
| Phase | Mobile |
| Tier | Core |
| Area | Game view / UI (phone layout) |
| Author | Blaxine |
| Created | 2026-09-27 |
| Last Updated | 2026-09-27 |

> Design: `MOBILE_DESIGN.md` and the design canvas (Phone page, 25 screens) —
> https://claude.ai/artifact/7FphnpyRQe7hpyAp4nPLJq. Hints are a separate plan.

## Short Description

Makes Hearthbound fully playable and fully hostable in a phone's browser, on the
same Vercel site, with nothing to install. Below a phone-sized viewport the game
screen switches to an islands-first phone layout: the top bar names the island
you are on, chips fly the camera between islands, a mini-map and an Atlas show
the whole layer, and pinch/pan work by touch. Every desktop capability is
reachable on the phone through phone-native screens — moving and attacking,
doors and chests, the character sheet, dice, party and table menu for players;
placing tokens, editing islands and layers, running encounters, clock, music,
codes and saving for the DM. The release is declared done after a manual pass on
a real iPhone (Safari) and a real Android phone (Chrome).

## Constraints

- **Movement isn't measured across islands.** `feetMoved` (`src/utils/encounter.js:85`) returns `null` once a token is on a different island from its turn start, and `GameView.jsx:589-601` then reports `movement.left` as 0; `reachableCells` only ever covers the acting token's own island.
- **Dice state lives in the Toolbar.** `diceRolls` / `diceSaved` are `useState` inside `Toolbar.jsx` (~line 219); a phone dice screen outside the Toolbar can't see the roll log or saved sets until that state moves up.
- **The palette's state lives in `App.jsx`.** `useTheme()` (`src/state/theme.js`) is called once in `App.jsx` and feeds `PalettesMenu` in the header, which the phone layout hides. A second `useTheme()` call would hold separate React state from the first.
- **Per-device audio levels already exist.** Music is `baseVolume × localVolumes[trackId]` (`src/lib/audioEngine.js:79`, `GameView.jsx`'s `localAudioVolumes`); sound effects have per-effect volumes in `localStorage` (`src/lib/sfx.js`, `tb.sfxVolume.*` / `tb.diceVolume`). "Mute on this device" sits on top of both.
- **A guest table lives in the DM's browser** (REQ-008). Screen Wake Lock (`navigator.wakeLock`) is released by the browser whenever the page is hidden and must be re-requested on `visibilitychange`; it cannot keep a backgrounded tab alive.
- **The repo has no test runner or tests** (`package.json` has no `test` script) — verification is manual.
- **Pinch cost.** Every `setZoom` re-renders all of `GameView.jsx` (~2,700 lines) and every island's per-line SVG grid in `MapBoard.jsx`; calling it on each `touchmove` is the current pinch path.
- **The compendium already has a phone layout** (`styles.css`, `@media (max-width: 900px)` `.cbook-*`), and the Join/Host page already restacks at `max-width: 1000px` (`.landing-shell`), unchecked at 390 px.
- **`index.html` has no `viewport-fit=cover`**, so `env(safe-area-inset-*)` used by the phone CSS resolves to 0 on notched iPhones.
- **The drawer layout below 1200 px** (`DRAWER_LAYOUT_BELOW`) still governs tablets and narrow desktop windows; the phone layout overrides it only when the phone query matches.

## Architectural decisions

- **Breakpoint:** the phone layout applies when `(max-width: 767px), (max-height: 499px)` matches — one constant, `PHONE_QUERY` in `src/components/PhoneChrome.jsx`, read through `usePhoneLayout()`. Tablets keep the desktop layout.
- **One app, one state:** the phone layout is a render branch of `GameView`. It reuses the same store, reducer actions, handlers, permission checks and realtime paths. No new reducer actions, no schema or migration changes, no new realtime messages.
- **Permissions are the desktop ones:** a player moves only their own hero and edits only their own hero's Battle/Spells/Bag; opening/closing a chest and walking through a door are the only other player writes (`canMoveEntity` / `canUpdateEntity`, PITFALLS.md #1).
- **Camera:** "fly to island" = make it the active island, set the zoom that fits it, then centre it. Phone zoom floor is 0.2 (`PHONE_ZOOM_MIN`). Zoom stays a per-viewer, unsynced preference.
- **Surfaces:** every phone screen is either a bottom sheet (`PhoneSheet`) over the map or a full-screen overlay (the Atlas). Desktop panels hosted in sheets are interim only and are removed as each phone-native screen lands.
- **Tap to move:** with your hero selected, tapping a square plans a move. In an encounter the plan shows path and feet and needs "Move here"; outside one the hero moves at once. Dragging a token keeps working everywhere.
- **Player character sheet on phones:** tabs Fight · Magic · Bag · Stats, opening on Fight (MOBILE_DESIGN.md §1). A DM sees the same card with every field editable plus the DM tab.
- **Keep-awake:** a Screen Wake Lock is held only while a guest table is hosted from a phone, re-requested whenever the page becomes visible; plus a persistent "this table runs on your phone" note in the DM's table menu. No fallback beyond the note.
- **Per-device settings** (palette, mute, effect volumes) stay in `localStorage` under the existing keys; mute adds one new key. Nothing per-device is synced.
- **Verification:** each slice ends with a written check in mobile emulation; the release gate is a manual pass on iOS Safari 17+ and Android Chrome, portrait and sideways, as player and as DM.

## UI / UX Notes

- The canvas's Phone page is the visual reference: row 1 "Islands first", row 2 "Interacting on an island", row 3 "Everything else" (player and DM).
- Classic palette tokens and fonts from `styles.css`; every phone style uses the palette variables so all palettes keep working.
- Touch targets ≥ 44 × 44 px; icon-only buttons carry `aria-label`; tabs use `role="tab"`, switches `role="switch"`.
- Empty and blocked states in phone screens follow the desktop copy until the separate hints plan lands.
- Landscape: map left, a 220 px right rail with the island chips and tools; overlays sit side by side along the bottom.

## Acceptance Criteria

- [ ] **AC1 — Phone layout switch.** Below 768 px wide or 500 px tall the game screen shows the phone layout (island top bar, island chips, bottom bar) and no desktop toolbar, side panels or app header; at desktop sizes nothing changes.
- [ ] **AC2 — Islands first.** Tapping an island chip, an Atlas island or an Atlas row flies the camera to that island and fits it on screen; the top bar always names the active island and its layer; the mini-map shows every island and the visible area and opens the Atlas.
- [ ] **AC3 — Touch camera.** Two fingers pinch-zoom around their midpoint and pan; one finger on empty map pans in the Play tool; a pan never selects an island or clears a selection; pinching stays smooth on the two test phones.
- [ ] **AC4 — Device fit.** Nothing sits under a notch, rounded corner or home indicator; the Join/Host page works at 390 × 844; the palette can be changed from the phone.
- [ ] **AC5 — Phone DM keep-awake.** While a guest table is hosted on a phone the screen does not sleep, including after the DM leaves and returns to the tab; the DM's table menu says the table runs on this phone.
- [ ] **AC6 — Tap to move.** Outside an encounter, tapping a square moves your selected hero there. In an encounter it shows the path, the feet and the movement left after, and moves only on "Move here"; crossing to a touching island is allowed and labelled.
- [ ] **AC7 — Target and attack.** In an encounter, selecting a creature on your turn shows chance to hit, damage and HP left for the chosen weapon, and "Attack" rolls it with the usual hit numbers on the map.
- [ ] **AC8 — Doors and chests.** Tapping a door opens a sheet naming where it leads, with "Walk through"; tapping a chest opens a sheet to open/close it, where a player takes items and the DM gives them to a hero.
- [ ] **AC9 — Player character sheet.** A player's own hero opens in a phone sheet with Fight · Magic · Bag · Stats; HP, conditions, death saves and stats are read-only; attacks, spells and bag are editable.
- [ ] **AC10 — Player dice, menu and party.** Players have a full-screen dice screen with the roll log and saved sets, a table menu (in-game time, palette, mute on this device, effect volumes, table info without the code, read-only map settings, leave with confirm), and a Party sheet with Show on map or the off-layer label.
- [ ] **AC11 — DM building.** The DM can place heroes, monsters, doors, chests, traps and uploaded images; manage asset storage; move, resize, restyle, group, create, import, download and delete islands; and create, rename, switch and delete layers — all from phone screens.
- [ ] **AC12 — DM running.** The DM can roll initiative, start/end an encounter and end any turn, run the clock and day/night, play table music, edit any creature card (HP, conditions, stats, loot, notes, remove), copy and rotate codes, save, export, import, close the table and leave — all from phone screens.
- [ ] **AC13 — No desktop leftovers.** No phone surface shows a desktop panel, the desktop toolbar or a desktop popover; desktop behaviour is unchanged.
- [ ] **AC14 — Release pass.** The device checklist passes on iOS Safari 17+ and Android Chrome, portrait and sideways, as player and as DM, and REQ-008 is Done.

## Technical Notes

- **Already in the working tree (slice 1, uncommitted):**
  - `src/components/PhoneChrome.jsx` — `PHONE_QUERY`, `usePhoneLayout`, `PhoneTopBar`, `PhoneIslandStrip`, `PhoneMiniMap`, `PhoneIslandConditions`, `PhoneTokenCard`, `PhoneNav`, `PhoneSheet`, `PhoneLayersSheet`, `PhoneAtlas`.
  - `src/components/GameView.jsx` — `STAGE_PADDING`, `PHONE_ZOOM_MIN`, `clampZoom(z, min)`, phone block after the stage wheel effect (`isPhone`, `phoneSheet`, `fitZoomFor`, `flyToIsland`, `phoneGestureRef`, `pinchAnchorRef`, touch listeners), `toolbarEl` / `tokenSidebarEl` / `rightPanelEl` elements rendered either in the desktop layout or inside `PhoneSheet`s, and the phone render branch. `recenterOnIsland` now includes `STAGE_PADDING`.
  - `src/components/MapBoard.jsx` — `gestureRef` prop; `onIslandDragUp` and `handleStageClick` return early while `gestureRef.current.panned`.
  - `src/styles.css` — phone section at the end (`.game-screen.phone`, `.phone-*`, HUD re-seating, compact encounter bar, landscape `@media (max-height: 499px) and (orientation: landscape)`).
- **Map interaction entry points** (`MapBoard.jsx`): tokens `handleTokenPointerDown` → `onTokenDragUp` (click vs drag at `CLICK_MOVE_THRESHOLD_PX`), islands `handleIslandPointerDown` → `onIslandDragUp`, stage `handleStagePointerDown` (pan/ruler); cells via `pixelToCell` and `feetDistance` (`src/utils/grid.js`); door clicks call `onEnterDoor`.
- **GameView handlers the phone screens call:** `addEntity`, `moveEntity`, `updateEntity`, `removeEntity`, `enterDoor` / `confirmEnterDoor` (today's `pendingDoor` modal), `takeChestItem`, `giveChestItemToHero`, `rollInitiative`, `toggleEncounter`, `endTurn`, `createLayer`, `removeLayer`, `updateLayer`, `createIsland`, `removeIsland`, `importIsland`, `updateIsland`, `moveIsland`, `moveIslandGroup`, `toggleGroupCandidate`, `confirmGroup`, `ungroupIslands`, `renameGroup`, `downloadIsland`, `downloadIslandImage`, `addCustomAsset`, `removeCustomAsset`, `regenerateCode`, `toggleOpen`, `saveNow`, `exportTable`, `importTable`, `leaveTable`, `updateClock`, `setClockRunning`, `updateDayNightOverride`.
- **Encounter data:** `actor`, `isMyTurn`, `canEndTurn`, `movement`, `moveRange` (`GameView.jsx:585-601`); `speedOf`, `reachableCells`, `feetMoved` (`src/utils/encounter.js`).
- **Attack preview:** `CreatureCard.jsx` computes `attackPreview(attack, entity)` from the actor's first attack (`:241-244`) and renders `.target-preview` (`:517`).
- **Chest and hero cards:** `ChestInspector` (`RightPanel.jsx:436`, open/close, `TakeChestItemButton`, `GiveChestItemButton`), `HeroInspector` tabs Battle/Spells/Bag/Skills/DM (`RightPanel.jsx:637`), `BattleEquipmentTab`, `SpellsTab`, `BagTab`, `SavesSkillsTab`.
- **Desktop pieces the DM screens replace:** `Toolbar.jsx` — layers modal (`:998`), islands modal (`:1092`), `MapSettingsPopover` (`:888`), initiative roller (`~:1240`), asset storage (`~:1424`), code chips (`:380`), Configurations menu; `TokenSidebar.jsx` — default heroes/monsters, door, chest (`ChestContentsEditor`), trap modal, image upload; `ClockModal.jsx`, `MusicModal.jsx`, `CompendiumBook.jsx`, `DroppablesEditor.jsx`.
- **Per-device settings:** `state/theme.js` (`PALETTES`, `hearthbound_theme`), `lib/sfx.js` (`getSfxVolume`, `setSfxVolume`), `lib/audioEngine.js` (`localVolumes`), `data/defaultAudio.js` (`SOUND_EFFECTS`: Dice roll, Attack hits, Attack misses, Page flip, Turn starts).
- **Viewport:** `index.html:5` `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`.

## Implementation Steps

| Phase | Meaning |
| ----- | ------- |
| F | Foundation |
| S | Service / state wiring |
| U | UX |
| D | Docs |
| T | Tests / verification |
| X | Cleanup |

### Slice 1 — Island view (tracer bullet)

**Demoable when:** at 390 × 844 the game shows the island top bar, chips, mini-map, Atlas, Maps sheet, token card and bottom bar; chips fly and fit; pinch and pan work; the desktop is unchanged.
**Satisfies:** AC1, AC2, AC3 (except smoothness)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S001 | F | Phone query and hook | `PHONE_QUERY` and `usePhoneLayout()` driving an `isPhone` flag in `GameView`. | — | `src/components/PhoneChrome.jsx`, `src/components/GameView.jsx` |
| ✅ | S002 | U | Phone chrome | Island top bar, island chips, mini-map, island-condition banner, token card, bottom bar, sheet shell, Maps sheet, Atlas. | S001 | `src/components/PhoneChrome.jsx` |
| ✅ | S003 | S | Fly to island | `fitZoomFor` + `flyToIsland`; land on your hero's island (or the base island) on phone start and layer change; recenter includes stage padding. | S001 | `src/components/GameView.jsx` |
| ✅ | S004 | S | Touch camera | Pinch around the midpoint, two-finger pan, one-finger pan on empty map in Play; `gestureRef` suppresses the click that ends a pan. | S003 | `src/components/GameView.jsx`, `src/components/MapBoard.jsx` |
| ✅ | S005 | U | Phone render branch and styles | Hide desktop chrome on phones; host the toolbar, tokens panel and players/inspector panel in sheets as interim; re-seat HUD, compact encounter bar, landscape rail. | S002 | `src/components/GameView.jsx`, `src/styles.css` |
| ✅ | S006 | T | Slice 1 check | Emulated 390 × 844 and 844 × 390, host and player: chips, Atlas, Maps, token card, sheets, pinch/pan (mouse-emulated), desktop at 1280 × 800 unchanged. | S004, S005 | — |

### Slice 2 — Phone polish

**Demoable when:** on a notched iPhone emulation the bars clear the safe areas, pinch stays fluid on a large map, the Join page reads well at 390 px, and the palette changes from the phone.
**Satisfies:** AC3, AC4

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S007 | F | Safe areas | Add `viewport-fit=cover`; pad the top bar, bottom bar, sheets and Atlas with `env(safe-area-inset-*)`. | S005 | `index.html`, `src/styles.css` |
| ✅ | S008 | S | Light pinch path | While a pinch is in progress, scale the map canvas with a CSS transform and commit the zoom once when the fingers lift (and at a throttled rate), instead of re-rendering on every `touchmove`. | S004 | `src/components/GameView.jsx` |
| ✅ | S009 | U | Join/Host at phone size | Check and fix `Landing.jsx` at 390 × 844 and 844 × 390: form first, hero art collapsed, 44 px targets, swatches in one row. | S001 | `src/components/Landing.jsx`, `src/styles.css` |
| ✅ | S010 | S | Palette on phones | Pass `theme` / `setTheme` from `App.jsx` into `GameView` so the phone table menu can show the palette choice without a second `useTheme` instance. | S005 | `src/App.jsx`, `src/components/GameView.jsx` |
| | S011 | T | Slice 2 check | Notch emulation, a 60 × 60 island pinch, Join/Host both orientations, palette switch persists after reload. | S007, S008, S009, S010 | — |

### Slice 3 — Phone DM keep-awake

**Demoable when:** hosting a guest table on a phone, the screen stays on, including after switching away and back, and the DM menu shows the "runs on your phone" note.
**Satisfies:** AC5

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S012 | S | Wake lock while hosting | When `isPhone && isGuestHost`, request a screen wake lock; re-request on `visibilitychange` to visible; release on leave or when either condition ends; ignore unsupported browsers silently. | S001 | `src/components/GameView.jsx` |
| ✅ | S013 | U | "Runs on your phone" note | Persistent note at the top of the DM's phone table menu for guest tables: keep Hearthbound open and the screen on, export before closing. | S012 | `src/components/PhoneChrome.jsx` |
| | S014 | T | Slice 3 check | On a real Android phone: host a guest table, leave the screen idle past its sleep timeout, switch apps and back, confirm the lock returns. | S012, S013 | — |

### Slice 4 — Tap to move

**Demoable when:** outside a fight, tapping a square moves your hero; in a fight, tapping shows path, feet and "Move here", and crossing onto a touching island is allowed and labelled.
**Satisfies:** AC6

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S015 | S | Tap-a-square path | In the Play tool on phones, a tap on a square while your own movable token is selected resolves the cell via `pixelToCell` and either moves it (no encounter) or produces a planned move (encounter). Island taps still select the island when nothing movable is selected. | S004 | `src/components/MapBoard.jsx`, `src/components/GameView.jsx` |
| ✅ | S016 | U | Planned-move preview | Dashed path, ghost token at the destination, a feet label on the map, and a confirm card: feet, movement left after, Cancel / Move here. A cross-island plan shows the island it enters and that the distance isn't measured across islands. | S015 | `src/components/PhoneChrome.jsx`, `src/styles.css` |
| ✅ | S017 | S | Confirm and commit | "Move here" calls `moveEntity`; the card then shows movement left and End turn (and Target). | S016 | `src/components/GameView.jsx` |
| | S018 | T | Slice 4 check | Exploration tap-move; encounter plan/cancel/confirm; cross-island move; a player can't plan a move for a token they can't move; drag still works. | S017 | — |

### Slice 5 — Target and attack

**Demoable when:** on your turn, tapping a monster shows the attack preview for your weapons and "Attack" rolls with hit numbers on the map.
**Satisfies:** AC7

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S019 | S | Preview for any equipped weapon | Generalise the existing first-attack preview so the phone target sheet can compute it for each of the actor's attacks. | S005 | `src/components/CreatureCard.jsx` |
| ✅ | S020 | U | Target sheet | Monster summary (what a player may see: name, AC, HP, size, conditions), weapon choice, chance/damage/HP left, Attack button, result line with `aria-live`. | S019 | `src/components/PhoneChrome.jsx` |
| ✅ | S021 | S | Attack through the existing roll | Attack uses the same roll-and-apply path as the Battle tab's Roll attack, so HP, hit floats and the combat log behave identically. | S020 | `src/components/RightPanel.jsx`, `src/components/GameView.jsx` |
| ✅ | S022 | T | Slice 5 check | Hit, miss and critical against a monster; the DM sees the HP change; a non-actor sees no Attack button. | S021 | — |

### Slice 6 — Door and chest sheets

**Demoable when:** tapping a door opens a sheet with where it leads and "Walk through"; tapping a chest opens a sheet to open it, take (player) or give (DM).
**Satisfies:** AC8

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S023 | U | Door sheet | Replaces the `pendingDoor` modal on phones: door name, destination layer and island, who's there, "Walk through" → `confirmEnterDoor`, Cancel. | S005 | `src/components/PhoneChrome.jsx`, `src/components/GameView.jsx` |
| ✅ | S024 | U | Chest sheet | Name, size, slots, island; Open/Close for everyone; items with Take (player, needs their hero) or Give to a hero (DM); the DM's contents editing via `ChestContentsEditor`. | S005 | `src/components/PhoneChrome.jsx`, `src/components/RightPanel.jsx` |
| | S025 | T | Slice 6 check | Player walks through a door and lands on the other layer; player opens a chest and takes an item; DM gives an item; DM edits chest contents. | S023, S024 | — |

### Slice 7 — Player character sheet

**Demoable when:** a player opens their hero on a phone and sees Fight · Magic · Bag · Stats with the desktop permissions.
**Satisfies:** AC9

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| ✅ | S026 | U | Phone hero sheet | Header (portrait, name, level, played by); Fight (HP, AC/initiative/speed, attacks with Roll, conditions, death saves), Magic (`SpellsTab` content), Bag (`BagTab` content), Stats (abilities, proficiency, saves, skills). Reuses the existing tab bodies' edit logic and `canEditOwnTabs`. | S005 | `src/components/PhoneChrome.jsx`, `src/components/RightPanel.jsx` |
| ✅ | S027 | U | DM variant | The DM sees the same sheet with every field editable, "played by", and the DM tab (sound, notes, remove). | S026 | `src/components/PhoneChrome.jsx` |
| ✅ | S028 | X | Retire the inspector-in-a-sheet for heroes | The token card opens the phone hero sheet; `rightPanelEl` is no longer used for heroes on phones. | S026, S027 | `src/components/GameView.jsx` |
| | S029 | T | Slice 7 check | Player edits own bag and spells, can't edit HP or stats; another player's hero is read-only; DM edits everything. | S028 | — |

### Slice 8 — Player dice, table menu and party

**Demoable when:** the player bottom bar's Dice opens a full-screen dice screen, ⋯ opens the phone table menu, and Party lists the roster with Show on map.
**Satisfies:** AC10

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| | S030 | S | Lift dice state | Move `diceRolls` / `diceSaved` from `Toolbar.jsx` to `GameView` and pass them to both the desktop Dice popover and the phone dice screen. | S005 | `src/components/Toolbar.jsx`, `src/components/GameView.jsx` |
| | S031 | U | Phone dice screen | Result card, roll log, d4–d20 grid with quantity, saved sets with Roll, sounds and the big-die moment as on desktop. | S030 | `src/components/PhoneChrome.jsx`, `src/components/DiceModal.jsx` |
| | S032 | S | Mute on this device | One new `localStorage` key; when on, music's local level and every effect volume read as 0 without overwriting the stored levels. | S005 | `src/lib/sfx.js`, `src/lib/audioEngine.js`, `src/components/GameView.jsx` |
| | S033 | U | Player table menu | In-game time, palette (S010), mute switch, effect volume sliders, this table (map, DM, seated), read-only map settings, Leave with inline confirm. | S010, S032 | `src/components/PhoneChrome.jsx` |
| | S034 | U | Party sheet | Seated players with hero, class, player, online; Show on map flies to their token's island; off-layer or unplaced shows a label, no button. Bottom bar gains Dice; Party stays. | S003 | `src/components/PhoneChrome.jsx` |
| | S035 | T | Slice 8 check | Rolls and saved sets survive closing; mute silences music and effects and unmute restores levels; Show on map flies; off-layer label; leave confirm. | S031, S033, S034 | — |

### Slice 9 — DM: add to the map and asset storage

**Demoable when:** the DM's Add opens a phone sheet that places heroes, monsters, doors, chests, traps and uploaded images, and asset storage works on the phone.
**Satisfies:** AC11 (placing and assets)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| | S036 | U | Add sheet | Tabs Heroes · Monsters · Doors · Chests · Traps · Your own. Tap a token to place it on the active island (the same free-cell placement `addEntity` uses today). Door: name + leads to; Chest: name + size + contents; Trap: the trap form; Your own: upload as hero or monster. | S005 | `src/components/PhoneChrome.jsx`, `src/components/TokenSidebar.jsx` |
| | S037 | U | Asset storage screen | Monsters · Weapons · Items lists, create and remove, reachable from Add → Your own and from Run the table. | S036 | `src/components/PhoneChrome.jsx`, `src/components/Toolbar.jsx` |
| | S038 | X | Retire the tokens-panel sheet | `tokenSidebarEl` is no longer shown on phones. | S036 | `src/components/GameView.jsx` |
| | S039 | T | Slice 9 check | Place one of each kind; upload an image; create a custom monster and place it; door pair appears on the target layer. | S037, S038 | — |

### Slice 10 — DM: islands and maps

**Demoable when:** the DM moves an island by touch in Edit, edits its settings in a sheet, groups islands, and manages islands and layers from the Islands & maps screen.
**Satisfies:** AC11 (islands and layers)

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| | S040 | U | Edit mode on phones | Edit in the DM bottom bar; drag an island by touch (existing `onMoveIsland` + snapping); touching edges highlighted; a bottom sheet for the selected island: name, width, height, background upload, PNG and .json download, island conditions, day/night, group/ungroup, delete. | S005 | `src/components/PhoneChrome.jsx`, `src/components/MapBoard.jsx` |
| | S041 | U | Islands & maps screen | The DM's Atlas: map tabs per layer, the layer drawing, island list (go, delete, base protected), select-to-group with name, groups (rename, ungroup), new island, import .json, layer name and feet per square, new layer, delete layer (base protected), switch the viewed layer. | S040 | `src/components/PhoneChrome.jsx` |
| | S042 | S | Group by touch | The Group flow (`tool === 'group'`, `toggleGroupCandidate`, `confirmGroup`) driven from the phone screen, with group drag via the existing group handle in Edit. | S041 | `src/components/GameView.jsx`, `src/components/MapBoard.jsx` |
| | S043 | T | Slice 10 check | Move and snap two islands edge to edge; resize; upload a background; add a condition; group and move the group; create, rename, switch and delete a layer; import an island. | S042 | — |

### Slice 11 — DM: run the table, table menu and creature card

**Demoable when:** the DM runs a full encounter, the clock and music, edits a monster card, and manages codes and saving without leaving phone screens.
**Satisfies:** AC12

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| | S044 | U | Run the table sheet | Encounter (round, whose turn, combat log, End encounter, Roll for initiative), compendium (Weapons · Items · Monsters, the existing phone compendium), in-game time with play/pause and Set time (`ClockModal`), day/night choice, table music (now playing, play/pause, Tracks → `MusicModal`), asset storage, dice. | S037 | `src/components/PhoneChrome.jsx`, `src/components/GameView.jsx` |
| | S045 | U | Initiative sheet | Participants with rolls, add/remove, Start encounter checkbox, Roll, clear badges — calling `rollInitiative` / `toggleEncounter`. | S044 | `src/components/PhoneChrome.jsx` |
| | S046 | U | DM creature card | Monster tabs Fight · Loot · Stats · DM on phones: HP stepper, AC/initiative/speed, conditions toggles, attacks, droppables (`DroppablesEditor`), abilities and skills, notes, sound, remove. | S027 | `src/components/PhoneChrome.jsx`, `src/components/RightPanel.jsx` |
| | S047 | U | DM table menu | Guest-table note (S013), player code copy, DM code show/copy, new code, saved/autosave status, Save · Export · Import, close to new players, Islands & maps link, look & sound, Leave with the existing export warning. | S013, S033 | `src/components/PhoneChrome.jsx` |
| | S048 | X | Retire the toolbar sheet | `toolbarEl` is no longer shown on phones; the DM bottom bar is Play · Edit · Ruler · Add · Run table. | S044, S047 | `src/components/GameView.jsx`, `src/components/PhoneChrome.jsx` |
| | S049 | T | Slice 11 check | Full encounter from initiative to End encounter on a phone; clock and day/night; music play/pause; edit a monster's HP, conditions and loot; rotate the code; export and import; leave with the warning. | S045, S046, S048 | — |

### Slice 12 — Release gate

**Demoable when:** the device checklist passes on a real iPhone and a real Android phone, and the docs describe the shipped phone layout.
**Satisfies:** AC13, AC14

| Done | # | Phase | Title | Description | Depends on | Primary files |
| ---- | - | ----- | ----- | ----------- | ---------- | ------------- |
| | S050 | X | No desktop leftovers | Confirm no phone path renders `Toolbar`, `TokenSidebar`, `RightPanel` or a desktop popover; delete the interim sheet wiring and any phone CSS it needed. | S028, S038, S048 | `src/components/GameView.jsx`, `src/styles.css` |
| | S051 | T | Device checklist | Written checklist covering every AC, run on iOS Safari 17+ and Android Chrome, portrait and sideways, once as player and once as DM (guest table), on a cloud table and a guest table. | S050 | `requirements/Todo/REQ-011-Phone-Release.md` (Smoke Test) |
| | S052 | D | Docs | Rewrite `MOBILE_DESIGN.md` to the shipped design (DM on phones, full parity); add a Phone layout section to `APP_OVERVIEW.md`; note the phone breakpoint in `README.md`. | S051 | `MOBILE_DESIGN.md`, `APP_OVERVIEW.md`, `README.md` |
| | S053 | D | Thesaurus terms | Add Phone layout, Island view, Atlas, Island chip, Fly to island, Phone sheet, Planned move, Keep-awake to `THESAURUS.md`. | S051 | `THESAURUS.md` |
| | S054 | X | Release check | REQ-008 is Done; the device checklist is signed off; move this plan to `Done/`. | S051, S052, S053 | `requirements/` |

### Dependency graph

```
S001 → S002 → S005 ─┬─ S006
     ↘ S003 → S004 ─┘
S005 → S007 ┐
S004 → S008 ├→ S011
S001 → S009 │
S005 → S010 ┘
S001 → S012 → S013 → S014
S004 → S015 → S016 → S017 → S018
S005 → S019 → S020 → S021 → S022
S005 → S023 ┬→ S025
S005 → S024 ┘
S005 → S026 → S027 → S028 → S029
S005 → S030 → S031 ─┐
S005 → S032 ─┐       │
S010 ────────┴→ S033 ├→ S035
S003 → S034 ─────────┘
S005 → S036 → S037 → S039
       S036 → S038 ─┘
S005 → S040 → S041 → S042 → S043
S037 → S044 → S045 ─┐
S027 → S046 ────────┤
S013, S033 → S047 ──┤
S044, S047 → S048 ──┴→ S049
S028, S038, S048 → S050 → S051 → S052, S053 → S054
```

## Dependencies

| REQ ID | Title | Reason |
| ------ | ----- | ------ |
| REQ-008 | Guest DM Sessions | Phone hosting runs on guest tables; the release (S054) waits for REQ-008 to be Done. Phone work may start before it. |
| REQ-009 | Synced Table Audio | The phone table menu's mute and the DM's music controls sit on its local-volume and playback model. |
| REQ-010 | Default Catalog Assets | The phone compendium, add sheet and dice read whatever the catalog provides; no new catalog work here. |

A separate plan owns the **hints** (the canvas's Hints page); this plan uses today's copy for empty and blocked states.

## Out of Scope

- An installable app, service worker or offline mode.
- App-store packaging.
- Automated tests or a test runner.
- Hints, tips, mode bars and new empty-state copy.
- Phone-specific layouts for tablets; tablets keep the desktop layout.
- Changes to the desktop layout beyond the recenter padding fix and the lifted dice state.
- Reducer, schema, RLS or realtime changes.
- Follow mode, a personal music-volume slider, and a one-page compendium book.

## Open Questions

- [x] **Q1 — Ship as.** Mobile web on the existing site. *(Blaxine)*
- [x] **Q2 — Must-haves.** Hardening, interactions, phone-native player screens and phone-native DM screens. *(Blaxine)*
- [x] **Q3 — Hints.** A separate plan. *(Blaxine)*
- [x] **Q4 — Devices.** iOS Safari 17+ and Android Chrome, both orientations, player and DM. *(Blaxine)*
- [x] **Q5 — Phone DM protection.** Wake lock plus the "runs on your phone" note and the existing export warning. *(Blaxine)*
- [x] **Q6 — Tap to move.** Confirm in encounters only. *(Blaxine)*
- [x] **Q7 — Verification.** Manual device checklist. *(Blaxine)*
- [x] **Q8 — REQ-008.** The release waits for it. *(Blaxine)*
- [ ] **Q9 — Short desktop windows.** A desktop browser window under 500 px tall gets the phone layout. Deferred until the device pass or a user report shows a desktop user hitting it; the fix would add a `pointer: coarse` condition to the height rule.
- [ ] **Q10 — Cross-island movement in encounters.** Movement left reads 0 after crossing islands (existing behaviour). Deferred until slice 4 is playtested; the fix would measure across islands the way the ruler already does.

## Smoke Test

> Developer runs the app; the agent does not self-run.

1. `npm run dev`; open the table on a phone (same network, or the deployed preview).
2. Portrait: the top bar names the island; tap each chip — the camera flies and fits; open the Atlas from the title and from the mini-map; open Maps.
3. Pinch in and out on a large island; pan with one finger on empty map; drag your hero.
4. Rotate to landscape: map left, chips and tools in the right rail.
5. As a player: tap-move outside a fight; in a fight, plan, cancel, confirm; target a monster and attack; walk through a door; open a chest and take an item.
6. Open your hero: Fight · Magic · Bag · Stats; edit your bag; confirm HP can't be edited.
7. Dice, table menu (palette, mute, volumes, leave confirm), Party (Show on map).
8. As the DM on a guest table: the screen stays on through idle and an app switch; add each token kind; edit, move and group islands; create and delete a layer; run initiative through End encounter; clock, day/night, music; edit a monster card; rotate the code; export, import, leave with the warning.
9. On a desktop window at 1280 × 800: everything looks and behaves as before.

## Size

| T-Shirt Size | Estimated Hours | Notes |
| ------------ | --------------- | ----- |
| XL | 80–100 | Slice 1 is built (~12 h). The heaviest are slices 7, 10 and 11 (phone-native sheets over large existing components). The device pass needs both physical phones. |

## Considered And Rejected

Nothing here is built. Each entry names the alternative, then why it lost.

- **Installable app (PWA).** Adds a manifest, icons, a service-worker caching decision and iOS install quirks for no gameplay gain in the first phone release.
- **App-store wrapper (Capacitor / Cordova).** Store accounts, review, signing and a second build pipeline, plus native-only bugs, for the same web UI.
- **Desktop panels in sheets as the final phone UI.** Works (slice 1 proves it) but the creature card, toolbar popovers and tokens panel are cramped and mouse-shaped at 390 px; kept only as the interim.
- **A separate phone route or app.** Would fork state wiring and permissions that `GameView` already owns; a render branch reuses every handler and check.
- **Cloud-only hosting on phones.** Host accounts are switched off (`SHOW_HOST_LOGIN = false`), so phones couldn't host at all.
- **Auto-export when the page hides.** Browsers limit downloads from hidden pages; would need a snapshot store this plan doesn't otherwise have.
- **Always confirm / never confirm a tap move.** Always doubles taps while exploring; never lets one mis-tap spend a turn's movement.
- **Playwright in mobile emulation.** A whole e2e suite for this plan to own, and emulation still misses real touch and Safari behaviour.
- **Vitest for the pure helpers.** Helpful for fit-zoom and path maths, but introducing the repo's first runner isn't this plan's job.
- **Hints in this plan.** They apply to desktop too and have their own design page and 20-spot inventory.

## Revision History

| Date | Author | Summary of Change |
| ---- | ------ | ----------------- |
| 2026-09-27 | Blaxine | Initial plan. Slice 1 (island view) already in the working tree. |
