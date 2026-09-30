import React, { useRef, useState } from 'react';
import ClockReadout from './ClockReadout.jsx';
import { DAY_PHASES, ISLAND_DAY_NIGHT_MODES } from '../data/dayPhases.js';
import { emitFx } from '../lib/fx.js';
import { PhoneSheet, PhoneLookAndSound, PhoneSwitch, PhoneGuestHostNote } from './PhoneChrome.jsx';
import { Tip } from './Hints.jsx';

// The DM's phone screens that stand in for the desktop toolbar: "Run the
// table" (the session: encounter, compendium, clock, music, dice, party) and
// the table menu (codes, saving, the table's door, maps, look & sound,
// leaving). Every button calls the same GameView handler, or opens the same
// toolbar panel over lib/fx.js, that the desktop toolbar does.

const open = (panel) => emitFx({ type: 'open', panel });

export function PhoneRunTable({
  encounter,
  actorName,
  onEndEncounter,
  onShowLog,
  onShowRolls,
  rollCount = 0,
  clock,
  phaseOverride,
  onSetClockRunning,
  onSetDayNight,
  islandName,
  islandDayNight = 'cycle',
  onIslandDayNight,
  audioEnabled,
  onOpenMusic,
  onOpenDice,
  onOpenParty,
  onClose,
}) {
  const hasCycle = Boolean(clock?.cycle?.enabled);
  const phases = [
    [null, 'Follow the clock'],
    ['dawn', DAY_PHASES.dawn?.label || 'Dawn'],
    ['day', DAY_PHASES.day?.label || 'Day'],
    ['dusk', DAY_PHASES.dusk?.label || 'Dusk'],
    ['night', DAY_PHASES.night?.label || 'Night'],
  ];
  const go = (fn) => () => {
    onClose();
    fn();
  };
  return (
    <PhoneSheet title="Run the table" onClose={onClose}>
      <div className="phone-sheet-pad">
        <section className="phone-menu-section" aria-label="Encounter">
          <span className="phone-label">Encounter</span>
          {encounter ? (
            <div className="phone-run-card">
              <div className="phone-run-head">
                <b>Round {encounter.round}</b>
                <span>{actorName ? `${actorName}’s turn` : 'Waiting'}</span>
              </div>
              <div className="phone-move-actions phone-two">
                <button type="button" className="phone-btn-ghost" onClick={go(onShowLog)}>
                  Combat log
                </button>
                <button type="button" className="phone-btn-danger-ghost" onClick={go(onEndEncounter)}>
                  End encounter
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="phone-btn-primary phone-btn-block-primary" onClick={go(() => open('initiative'))}>
              Roll for initiative
            </button>
          )}
          {onShowRolls && (
            <button type="button" className="phone-btn-ghost phone-btn-full" onClick={go(onShowRolls)}>
              Roll log{rollCount ? ` · ${rollCount}` : ''}
            </button>
          )}
        </section>

        <section className="phone-menu-section" aria-label="Compendium">
          <span className="phone-label">Compendium</span>
          <div className="phone-run-grid">
            <button type="button" className="phone-tile" onClick={go(() => open('armory'))}>
              Weapons
            </button>
            <button type="button" className="phone-tile" onClick={go(() => open('items'))}>
              Items
            </button>
            <button type="button" className="phone-tile" onClick={go(() => open('bestiary'))}>
              Monsters
            </button>
          </div>
          <button type="button" className="phone-btn-ghost phone-btn-full" onClick={go(() => open('assetStorage'))}>
            Asset storage
          </button>
        </section>

        <section className="phone-menu-section" aria-label="In-game time">
          <span className="phone-label">In-game time</span>
          {clock ? (
            <div className="phone-clock">
              <ClockReadout clock={clock} isHost onOpen={go(() => open('clock'))} onSetRunning={onSetClockRunning} phaseOverride={phaseOverride} />
            </div>
          ) : (
            <p className="phone-caption phone-caption-flush">No in-game clock yet.</p>
          )}
          <button type="button" className="phone-btn-ghost phone-btn-full" onClick={go(() => open('clock'))}>
            {clock ? 'Set the time' : 'Start a clock'}
          </button>
          <div className="phone-segment" role="radiogroup" aria-label="Day and night">
            {phases.map(([key, label]) => {
              const on = (phaseOverride || null) === key;
              return (
                <button key={label} type="button" role="radio" aria-checked={on} className={on ? 'active' : ''} onClick={() => onSetDayNight(key)}>
                  {label}
                </button>
              );
            })}
          </div>
          {!phaseOverride && !hasCycle && <p className="phone-caption phone-caption-flush">No day/night cycle is running.</p>}
          {onIslandDayNight && (
            <label className="phone-owner">
              <span>{islandName || 'This island'}</span>
              <select value={islandDayNight} onChange={(e) => onIslandDayNight(e.target.value)}>
                {ISLAND_DAY_NIGHT_MODES.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        <section className="phone-menu-section" aria-label="Table music">
          <span className="phone-label">Table music</span>
          {audioEnabled ? (
            <>
              <button type="button" className="phone-btn-ghost phone-btn-full" onClick={go(onOpenMusic)}>
                Music and sounds
              </button>
              <button type="button" className="phone-btn-ghost phone-btn-full" onClick={go(() => open('ambience'))}>
                This map’s ambience
              </button>
            </>
          ) : (
            <p className="phone-caption phone-caption-flush">Music plays on cloud and guest tables.</p>
          )}
        </section>

        <div className="phone-move-actions phone-two">
          <button type="button" className="phone-btn-ghost" onClick={go(onOpenDice)}>
            Dice
          </button>
          <button type="button" className="phone-btn-ghost" onClick={go(onOpenParty)}>
            Party
          </button>
        </div>
      </div>
    </PhoneSheet>
  );
}

export function PhoneHostMenu({
  session,
  isGuestHost,
  savedLabel,
  autosaveSecondsLeft,
  onRegenerateCode,
  onToggleOpen,
  onSaveNow,
  onExport,
  onImport,
  onManageIslands,
  onManageLayers,
  theme,
  onThemeChange,
  muted,
  onMutedChange,
  hideDrawings,
  onHideDrawingsChange,
  revealRolls = false,
  onRevealRollsChange,
  onLeave,
  onClose,
}) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(null);
  const importRef = useRef(null);

  function copy(which, value) {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(which);
        setTimeout(() => setCopied(null), 1500);
      },
      () => {}
    );
  }
  const minutes = Math.floor((autosaveSecondsLeft || 0) / 60);
  const seconds = String((autosaveSecondsLeft || 0) % 60).padStart(2, '0');

  return (
    <PhoneSheet title="Table menu" onClose={onClose}>
      {isGuestHost && <PhoneGuestHostNote />}
      <div className="phone-sheet-pad">
        <section className="phone-menu-section" aria-label="Codes">
          <span className="phone-label">Codes</span>
          <Tip id="codes" title="Share the player code" className="phone-tip">
            Players join with the player code. Keep the {isGuestHost ? 'DM code' : 'host key'} to yourself — it’s how you get the table back.
          </Tip>
          <div className="phone-code-row">
            <span className="phone-code">
              <span>Player code</span>
              <b>{session.code}</b>
            </span>
            <button type="button" className="phone-btn-ghost" onClick={() => copy('player', session.code)}>
              {copied === 'player' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          {session.hostKey && (
            <div className="phone-code-row">
              <span className="phone-code">
                <span>{isGuestHost ? 'DM code · private' : 'Host key · private'}</span>
                <b>{shown ? session.hostKey : '•••• ••••'}</b>
              </span>
              <button type="button" className="phone-btn-ghost" onClick={() => setShown((s) => !s)}>
                {shown ? 'Hide' : 'Show'}
              </button>
              <button type="button" className="phone-btn-ghost" onClick={() => copy('dm', session.hostKey)}>
                {copied === 'dm' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
          {isGuestHost ? (
            <p className="phone-caption phone-caption-flush">Keep your DM code with an exported .bmp to resume this table later.</p>
          ) : (
            <button type="button" className="phone-btn-ghost phone-btn-full" onClick={onRegenerateCode}>
              New player code
            </button>
          )}
        </section>

        {onRevealRollsChange && (
          <section className="phone-menu-section" aria-label="Dice">
            <span className="phone-label">Dice</span>
            <label className="phone-check">
              <input type="checkbox" checked={revealRolls} onChange={(e) => onRevealRollsChange(e.target.checked)} />
              <span>
                <b>Reveal rolls to players</b>
                <small>Off: only you see the rolls you make. On: every roll you make shows for the players too. Players’ rolls always reach you.</small>
              </span>
            </label>
          </section>
        )}
        <section className="phone-menu-section" aria-label="Save and share">
          <span className="phone-label">Save &amp; share</span>
          <span className="phone-caption phone-caption-flush" role="status">
            {savedLabel ? `${savedLabel} · ` : ''}autosaves in {minutes}:{seconds}
          </span>
          <div className="phone-run-grid">
            <button type="button" className="phone-tile" onClick={onSaveNow}>
              Save
            </button>
            <button type="button" className="phone-tile" onClick={onExport}>
              Export
            </button>
            <button type="button" className="phone-tile" onClick={() => importRef.current?.click()}>
              Import
            </button>
          </div>
          <input
            ref={importRef}
            type="file"
            accept="image/bmp,.bmp"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImport(file);
              e.target.value = '';
            }}
          />
          <span className="phone-caption phone-caption-flush">Import overwrites the whole table.</span>
          <PhoneSwitch
            label="Close to new players"
            caption={session.isOpen ? 'Anyone with the player code can join.' : 'Nobody new can join. Seated players stay.'}
            checked={!session.isOpen}
            onChange={onToggleOpen}
          />
        </section>

        <section className="phone-menu-section" aria-label="Maps">
          <span className="phone-label">Islands &amp; maps</span>
          <div className="phone-move-actions phone-two">
            <button type="button" className="phone-btn-ghost" onClick={onManageIslands}>
              Islands
            </button>
            <button type="button" className="phone-btn-ghost" onClick={onManageLayers}>
              Maps
            </button>
          </div>
        </section>

        <PhoneLookAndSound theme={theme} onThemeChange={onThemeChange} muted={muted} onMutedChange={onMutedChange} hideDrawings={hideDrawings} onHideDrawingsChange={onHideDrawingsChange} />

        <button type="button" className="phone-btn-danger-ghost phone-btn-full" onClick={onLeave}>
          Leave the table
        </button>
      </div>
    </PhoneSheet>
  );
}
