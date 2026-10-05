import React from 'react';
import { activityText } from '../utils/heroActivity.js';

// Dice rolls at the table: players' rolls are open to everyone; the DM's own
// stay on the DM's screen unless "Reveal rolls to players" is on. Each roll
// that arrives from someone else shows as a short card over the map (a
// toast), and every roll lands in the roll log. Nothing here is stored — the
// rolls travel live (GameView.jsx's announceRoll) and live in this browser.
//
// A roll entry: { id, byId, name, color, isDm, what, dice, detail, total,
// flag, mine, hidden }.

function Eye({ off }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {off ? (
        <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10 10 0 0 1 12 4c6 0 10 8 10 8a17 17 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s4 8 10 8a9.7 9.7 0 0 0 5.4-1.6" />
      ) : (
        <path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
      )}
    </svg>
  );
}

export function RollChip({ hidden, children }) {
  return (
    <span className={`roll-chip${hidden ? ' hidden' : ''}`}>
      <Eye off={hidden} />
      {children}
    </span>
  );
}

function whoLabel(roll) {
  if (roll.mine) return 'You';
  return roll.isDm ? 'The DM' : roll.name;
}

function whatLabel(roll) {
  return roll.what ? roll.what : roll.dice;
}

// The cards for rolls that just arrived; each fades after a few seconds.
// The DM's "may they open it?" cards, at the top of the toast stack: a player
// asked to open a chest (GameView.jsx's chestAsks) and only the DM can say
// yes. They stay until answered.
export function ChestAsks({ asks, onAllow, onDeny }) {
  return asks.map((ask) => (
    <div key={ask.chestId} className="roll-toast chest-ask" role="group" aria-label={`${ask.playerName} wants to open ${ask.chestName}`}>
      <span className="roll-avatar" style={{ background: ask.color || 'var(--ember)' }} aria-hidden="true">
        {(ask.playerName || '?').charAt(0).toUpperCase()}
      </span>
      <span className="roll-toast-text">
        <span>
          <b>{ask.playerName}</b> wants to open <b>{ask.chestName}</b>
        </span>
        {ask.where && <span className="roll-toast-dice">{ask.where}</span>}
        <span className="chest-ask-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onDeny(ask.chestId)}>
            Deny
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onAllow(ask.chestId)}>
            Allow
          </button>
        </span>
      </span>
    </div>
  ));
}

export function RollToasts({ toasts, onDismiss, children = null }) {
  if (!toasts.length && !children) return null;
  return (
    <div className="roll-toasts" aria-live="polite">
      {children}
      {toasts.map((r) => (
        <button key={r.id} type="button" className="roll-toast" onClick={() => onDismiss(r.id)} title="Dismiss">
          <span className="roll-avatar" style={{ background: r.color || 'var(--ember)' }} aria-hidden="true">
            {(r.isDm ? 'D' : r.name || '?').charAt(0).toUpperCase()}
          </span>
          <span className="roll-toast-text">
            <span>
              <b>{whoLabel(r)}</b> rolled {whatLabel(r)}
            </span>
            <span className="roll-toast-dice">
              {r.what ? r.dice : ''}
              {r.what && r.detail ? ' · ' : ''}
              {r.detail}
            </span>
            {r.isDm && <RollChip>Shown by the DM</RollChip>}
          </span>
          <span className="roll-total">{r.total}</span>
        </button>
      ))}
    </div>
  );
}

export function RollLog({ entries, emptyText = 'No rolls yet this session.' }) {
  if (!entries.length) return <p className="roll-log-empty">{emptyText}</p>;
  return (
    <ul className="roll-log">
      {entries.map((r) => (
        <li key={r.id}>
          <span className="roll-dot" style={{ background: r.color || 'var(--ember)' }} aria-hidden="true" />
          <span className="roll-log-text">
            <span>
              <b>{whoLabel(r)}</b> rolled {whatLabel(r)} {r.what && <span className="roll-log-dice">{r.dice}</span>}
            </span>
            {(r.detail || r.flag) && (
              <span className="roll-log-detail">
                {r.detail}
                {r.flag ? ` · ${r.flag}` : ''}
              </span>
            )}
            {r.hidden && <RollChip hidden>Only you</RollChip>}
            {!r.mine && r.isDm && <RollChip>Shown by the DM</RollChip>}
          </span>
          <span className="roll-total">{r.total}</span>
        </li>
      ))}
    </ul>
  );
}

// The character log (utils/heroActivity.js): what each player changed on
// their own hero this session. The DM's alone.
export function CharacterLog({ entries, emptyText = 'No changes yet this session.' }) {
  if (!entries.length) return <p className="roll-log-empty">{emptyText}</p>;
  return (
    <ul className="roll-log">
      {entries.map((e) => (
        <li key={e.id}>
          <span className="roll-dot" style={{ background: e.color || 'var(--ember)' }} aria-hidden="true" />
          <span className="roll-log-text">
            <span>
              <b>{e.name}</b> · {e.heroName}
            </span>
            <span className="roll-log-detail">{activityText(e)}</span>
          </span>
          <time className="roll-log-time" dateTime={new Date(e.at).toISOString()}>
            {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>
        </li>
      ))}
    </ul>
  );
}
