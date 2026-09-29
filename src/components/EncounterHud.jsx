import React, { useState } from 'react';
import { playDiceSound } from '../lib/sfx.js';
import { emitFx } from '../lib/fx.js';
import { rollDie } from '../utils/combat.js';
import { useHudFold, HudFoldButton, InitiativeIcon } from './TableHud.jsx';

// The encounter's HUD, shown over the map only while a fight is running
// (state.encounter, see utils/encounter.js): the turn order along the top,
// and End turn / Roll / Log bottom-right. The selected creature's card lives
// in the inspector (CreatureCard.jsx), not over the map.

// Top of the map: the round, then every participant in initiative order,
// the acting one raised and flagged.
export function TurnOrderRibbon({ encounter, entities, meId }) {
  const [folded, setFolded] = useHudFold('initiative');
  const entries = encounter.order
    .map((entry, index) => ({ ...entry, index, entity: entities[entry.id] }))
    .filter((entry) => entry.entity);
  if (folded) {
    const acting = entries.find((entry) => entry.index === encounter.turn)?.entity;
    const mine = acting?.kind === 'hero' && acting.ownerId === meId;
    return (
      <button type="button" className="turn-ribbon folded hud-unfold" aria-label="Show the turn order" title="Show the turn order" onClick={() => setFolded(false)}>
        <InitiativeIcon />
        <span>
          Round {encounter.round}
          {acting ? ` · ${mine ? 'Your turn' : `${acting.name}’s turn`}` : ''}
        </span>
      </button>
    );
  }
  return (
    <div className="turn-ribbon" role="list" aria-label="Turn order">
      <div className="turn-round" aria-label={`Round ${encounter.round}`}>
        <span>Round</span>
        <strong>{String(encounter.round).padStart(2, '0')}</strong>
      </div>
      {entries.map(({ id, roll, index, entity }) => {
        const active = index === encounter.turn;
        const mine = entity.kind === 'hero' && entity.ownerId === meId;
        return (
          <div
            key={id}
            role="listitem"
            aria-current={active ? 'true' : undefined}
            className={`turn-portrait ${entity.kind === 'mob' ? 'foe' : 'ally'}${active ? ' active' : ''}`}
            title={`${entity.name} — initiative ${roll}`}
          >
            <span className="turn-face" style={{ backgroundImage: `url(${entity.imageUrl})` }} aria-hidden="true" />
            <span className="visually-hidden">{entity.name}, initiative {roll}</span>
            {active && <span className="turn-flag">{mine ? 'Your turn' : 'Now'}</span>}
            <span className="turn-roll" aria-hidden="true">{roll}</span>
          </div>
        );
      })}
      <HudFoldButton label="Hide the turn order" className="turn-ribbon-fold" onClick={() => setFolded(true)} />
    </div>
  );
}

// Bottom-right: movement left, End turn, a quick d20 and the combat log.
export function EncounterActions({ actor, canEndTurn, isMyTurn, onEndTurn, isHost, onEndEncounter, movement, log }) {
  const [logOpen, setLogOpen] = useState(false);
  const [lastRoll, setLastRoll] = useState(null);

  function rollD20() {
    playDiceSound();
    const value = rollDie(20);
    setLastRoll({ value, key: Date.now() });
    emitFx({ type: 'log', tone: 'roll', text: `You rolled a d20: ${value}${value === 20 ? ' (natural 20)' : value === 1 ? ' (natural 1)' : ''}` });
    emitFx({ type: 'die', value });
    emitFx({ type: 'rolled', what: null, dice: '1d20', detail: '', total: value, flag: value === 20 ? 'Natural 20' : value === 1 ? 'Natural 1' : null });
  }

  const endLabel = canEndTurn ? 'End turn' : actor ? `${actor.name}'s turn` : 'Waiting';

  return (
    <div className="encounter-actions">
      {logOpen && <CombatLog log={log} onClose={() => setLogOpen(false)} />}
      {movement && (
        <div className="encounter-move" aria-label={`Movement: ${movement.left} of ${movement.total} feet left`}>
          <div className="encounter-move-head">
            <span>Movement</span>
            <strong>
              {movement.left} / {movement.total} ft
            </strong>
          </div>
          <div className="encounter-move-bar" aria-hidden="true">
            <span style={{ width: `${movement.total ? (movement.left / movement.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      <button
        type="button"
        className={`encounter-end${isMyTurn ? ' mine' : ''}`}
        disabled={!canEndTurn}
        onClick={onEndTurn}
      >
        {endLabel}
      </button>
      <div className="encounter-row">
        <button type="button" className="encounter-small" onClick={rollD20} title="Roll a d20">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2l9 5v10l-9 5-9-5V7zM12 6l-5 9h10zM12 2v4M3 7l4 8M21 7l-4 8M12 22l-5-7M12 22l5-7" />
          </svg>
          {lastRoll ? (
            <span key={lastRoll.key} className="encounter-roll-value">
              d20 · {lastRoll.value}
            </span>
          ) : (
            'Roll d20'
          )}
        </button>
        <button type="button" className={`encounter-small${logOpen ? ' active' : ''}`} aria-expanded={logOpen} onClick={() => setLogOpen((o) => !o)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21a2 2 0 0 1 2-2h13v2" />
          </svg>
          Log
        </button>
      </div>
      {isHost && (
        <button type="button" className="encounter-stop" onClick={onEndEncounter}>
          End encounter
        </button>
      )}
    </div>
  );
}

export function CombatLog({ log, onClose }) {
  return (
    <div className="combat-log" role="log" aria-label="Combat log">
      <div className="combat-log-head">
        <span className="combat-log-title">
          <span className="label-default">Combat log</span>
          <span className="label-grimoire">Chronicle of the Dice</span>
        </span>
        <button type="button" className="popover-close" onClick={onClose} aria-label="Close combat log">
          ×
        </button>
      </div>
      {log.length === 0 ? (
        <p className="combat-log-empty">Nothing yet — rolls, hits and turns land here.</p>
      ) : (
        <ol className="combat-log-list">
          {log.map((entry) => (
            <li key={entry.id} className={`combat-log-entry tone-${entry.tone || 'plain'}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2l9 5v10l-9 5-9-5V7zM12 6l-5 9h10z" />
              </svg>
              <span>{entry.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
