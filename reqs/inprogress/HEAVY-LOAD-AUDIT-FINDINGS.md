# Heavy load changes — audit findings

Review findings for commit `1013179 heavy load changes` on `fog-of-war`: the
Store's test Add button and hover animation, the big die's modifier and
natural-roll timing, the natural 20 / natural 1 sounds, layer Download map /
trash icon / layer Settings, and the bundled quick campaign. One file for this
work, numbered continuously across passes.

## Pass 1 — soft — first review of the commit (2026-10-14)

**Effort:** soft — core 5 (correctness/interaction, duplication/reuse, test
coverage, conventions/dead code, security/privacy) + concurrency/ordering
(conditional at soft; run because the diff touches Web Audio scheduling, React
effect cleanups and async picture loading) + one top-to-bottom read of the
whole diff. Scope: the 37 files in `1013179` (the branch's wider diff against
`develop` is 87 files of earlier, already-closed REQ work, so it was left out).
Full current contents read for `sfx.js`, `imageCache.js`, `quickCampaign.js`,
the changed parts of `Toolbar.jsx` (`IslandSettings`, `LayerSettings`,
`GridLinesField`, both `prepare…Background` helpers), and the `GameView.jsx`
call sites (`addRoll`, `updateLayer`, `updateIsland`, `downloadIslandImage` /
`downloadLayerImage`). The bundled campaign was checked by script: no dangling
entity/layer/map ids, and every `img:` fingerprint has a matching file whose
bytes hash to it. Not run at extent/severe; nothing on this work has been
caught after a previous pass.

- [ ] **F1 — A die leaving the screen cuts off someone else's natural-roll sound.** [FxLayer.jsx:115](../../src/components/FxLayer.jsx:115), [sfx.js:212](../../src/lib/sfx.js:212)
  **Category:** concurrency. `RollDie`'s cleanup calls `stopSfx(sound)`, and
  `stopSfx` stops whatever is playing under that id, not the play this die
  started; a later `playSfx('nat20')` from another source restarts the same id.

  **Failure scenario:** You roll a natural 20 at t=0. Your fanfare starts as
  the die lands (0.48s), and the die is due to leave at 3.9s. At t=2s a
  friend's natural 20 arrives (`GameView.addRoll`,
  [GameView.jsx:1127](../../src/components/GameView.jsx:1127)).
  `playSfx('nat20')` stops yours and starts theirs, which should run 3.42s, to
  5.42s. At t=3.9s your die unmounts and `stopSfx('nat20')` fades out *their*
  fanfare 1.5s early. The same happens with `nat1`, and in dev with StrictMode's
  mount→cleanup→mount, if a remote natural roll is playing when a die mounts.

  **Proposed fix:** Make a play identifiable:
  - In `playSfx`, take a token synchronously (`const token = ++playCounter`),
    pass it to `playBuffered` / `playFallback`, which store it (`entry.token`,
    and `fallbackTokens[id]` for the `<audio>` path), and return it.
  - `stopSfx(id, token)` only stops when the current play's token matches; no
    token keeps today's behaviour.
  - In `RollDie`, keep `const playRef = useRef(null)`, set
    `playRef.current = playSfx(sound)` on landing, and call
    `stopSfx(sound, playRef.current)` in the cleanup.

- [ ] **F2 — Layer Settings copies map Settings' picture-laying code instead of sharing it.** [Toolbar.jsx:2666](../../src/components/Toolbar.jsx:2666), [Toolbar.jsx:723](../../src/components/Toolbar.jsx:723)
  **Category:** reuse. `LayerSettings` repeats `IslandSettings`' picture-laying
  code ([Toolbar.jsx:2449](../../src/components/Toolbar.jsx:2449)) almost line
  for line:
  - `pickFile`, `closeFit` and `saveFit` (including the `untouched` rule), the
    `fitRef` revoke-on-unmount, and the two-click `removeBackground`.
  - The preview effect's `backgroundFit` offset math.
  - `prepareLayerBackground`'s last two lines, which repeat
    `prepareIslandBackground`'s ([Toolbar.jsx:712](../../src/components/Toolbar.jsx:712)).

  Only the grid-lines part was pulled out (`GridLinesField`).

  **Failure scenario:** The next change to how a laid picture lines up, such as
  the `backgroundFit` offset or when a lone map keeps the whole picture, gets
  made in `IslandSettings`, where it was first written. The layer copy keeps the
  old rule. A layer's preview then shows the picture in one place while the
  saved slices (`sliceImageForIslands`) land somewhere else, or one lone map
  crops where the other slices.

  **Proposed fix:** Pull out the shared pieces and have both settings use them:
  - In `Toolbar.jsx`, a `useBackgroundFit({ maps, prepare, save })` hook that
    owns `fit` / `busy` and returns `{ fit, setFit, busy, pickFile, closeFit,
    saveFit }`, with the `fitRef` revoke inside.
  - A `fitPreviews(maps, fit)` helper returning `{ [id]: { backgroundImage,
    backgroundFit } }`, used by both preview effects.
  - A `prepareBackgroundFor(members, file, placement, placements)` helper
    holding the `sliceImageForIslands` / `resizeImageToDataUrl` choice, called
    by both `prepareIslandBackground` and `prepareLayerBackground`.

  No behaviour change.

- [ ] **F3 — The grid-less export's doc note sits above the wrong function.** [image.js:61](../../src/utils/image.js:61)
  **Category:** conventions. The new `grid: false` note (lines 72–73) extends
  `renderIslandsTemplateToDataUrl`'s doc block. That block already sat above
  `islandsTemplateSize`, separated from the function it describes by
  `islandsTemplateSize`'s own two lines.

  **Failure scenario:** Someone reading `islandsTemplateSize` sees the export's
  description and the `grid` option above it. Someone reading
  `renderIslandsTemplateToDataUrl` (line 82), where the new `{ grid }` parameter
  is, finds no comment on it at all.

  **Proposed fix:** Move lines 61–73 to sit directly above
  `export async function renderIslandsTemplateToDataUrl`, leaving only "The
  pixel size of that PNG…" (lines 74–75) above `islandsTemplateSize`. Comment
  move only.

### Checked, no issue found (this pass)

- **Natural-roll detection agrees everywhere.** FxLayer's `isNatural`
  (single d20, range 1–20) matches the roll flags every source sets:
  DiceModal's `rollPool` (exactly one d20 in the pool), `combat.js`
  `resolveAttackRoll`, and EncounterHud's initiative roll. A mixed pool without
  a d20 has `min` ≥ 2, so it can never read as natural. Other screens play the
  sound from `addRoll` only for `!mine` rolls. Hidden DM rolls are never sent,
  so they never sound for players.
- **The modifier beside the die.** DiceModal's `result.total - moment.value`
  is the plain modifier for one kind of die. With mixed dice around a single
  d20 it also counts the other dice, which the code comment states on purpose.
  `combat.js` passes `toHitMod`. A zero modifier shows nothing.
- **Die timing and CSS.** `DIE_MS` 2000 matches `nat-pop 2s`, and `NAT_MS` 3900
  matches `.natural`'s `nat-pop-long 3.9s`. The keyframe percentages land on
  the documented 0.5s / 0.7s / 3.5s marks. The reduced-motion rules cover
  `.nat-mod` and `.nat-moment.natural`. A d6 showing 6 still gets the `nat-20`
  styling, timed at 2s on both the JS and CSS sides.
- **Sound engine.** `source.start(t, startSeconds)` with `maxSeconds` counted
  from that start, and the fade-in and fade-out ramps don't overlap (0.2s in,
  0.4s out over 3.42s). Mute cancels scheduled ramps and the fallback interval.
  The fallback interval clears itself once a fade-in-only effect is done.
  `preloadSfx` warms the buffer 480ms before the cue.
- **`updateIsland`'s new `layerId`.** Toolbar passes it through (`onUpdateIsland`
  is `updateIsland` itself). The deferred `storeImage` re-call keeps it, and the
  guest broadcast carries it. Remote mode doesn't need it, because the
  realtime echo takes the layer from the row. Every other caller still gets
  `currentLayerId` by default.
- **Layer Settings saving.** It sends one combined layer patch (the local-mode
  `saveOrWarn` stale-state race found earlier), and map patches go through the
  reducer, so several in a row don't overwrite one another. Feet and grid lines
  only reach maps once touched. `normalizeGridLines` returning `null` for the
  default is compared the same way on both sides.
- **Host-only surfaces.** The Layers list (download, settings, delete) is only
  rendered inside `isHost` mapping panels. `updateLayer` and `updateIsland`
  return early for non-hosts. A player can't download a layer they're not on.
- **Quick campaign.** The template's keys are a subset of
  `createEmptyGameState`'s, and `session` / `players` are replaced, so it gets
  a fresh code and DM key. No entity has an owner, and every entity picture is
  an `icon:` ref. The audio track is `builtin:` and points at a real layer. The
  flow matches `GuestHostForm` (`markGuestActive`, then `onEnter` with
  `mode: 'guest'`), and the 2.6k-line JSON is code-split behind the dynamic
  import.
- **Security / privacy.** `keepBundledImage` skips the picture filter only for
  bytes that hash to a fingerprint the app itself ships, and it can only unblock
  those hashes. No PII or credentials in the new code. The owned-heroes key
  (`hearthbound:ownedSprites`) follows the app's `hearthbound:` prefix, and its
  contents are filtered against `STORE_SPRITE_HEROES` on read.
- **Store.** The sprite `<span>` in `.store-frame` is a grid item, so it's
  blockified and its 100% size applies. The frame is square, so the sheet isn't
  stretched. Add is idempotent and ignores keys that aren't in the Store.
  CharacterBuilder still treats every built-in look, owned or not, as not the
  hero's own picture.
- **Layer download's 3s wait.** It's stricter than `downloadIslandImage`, which
  silently exports parchment for a picture that hasn't arrived. A picture that
  never arrives (no peer online with it) gives "Try again in a moment", which
  is the honest answer from this browser's point of view.
- **Test coverage.** The repo has no test runner (`package.json` has only
  `vite build`), so there's no suite to extend. Verification for this work is
  the build compiling, and the user tests by hand.
