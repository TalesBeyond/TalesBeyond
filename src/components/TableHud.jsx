import React, { useEffect, useRef, useState } from 'react';
import { loadHudFolded, saveHudFolded } from '../state/persistence.js';

// Pieces of the map's HUD (zoom, turn order, the phone's mini-map) can be
// folded down to one small button to leave more of the map in view. Each
// piece's choice is remembered in this browser.
export function useHudFold(name) {
  const [folded, setFolded] = useState(() => loadHudFolded(name));
  return [
    folded,
    (next) => {
      setFolded(next);
      saveHudFolded(name, next);
    },
  ];
}

// The chevron that folds a HUD piece away.
export function HudFoldButton({ label, onClick, className = '' }) {
  return (
    <button type="button" className={`hud-fold ${className}`} aria-label={label} title={label} onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12.5l5-5 5 5" />
      </svg>
    </button>
  );
}
import { useNow } from '../state/useGameClock.js';
import { DAY_PHASES } from '../data/dayPhases.js';
import { clockTotalMinutes, splitTotalMinutes, formatClockTime, dayPhase } from '../utils/gameClock.js';

// "Night, 21:40" for the layer strip. Renders nothing without a clock.
function StripClock({ clock, phaseOverride }) {
  const now = useNow(1000);
  if (!clock) return null;
  const { minuteOfDay } = splitTotalMinutes(clockTotalMinutes(clock, now));
  const phase = DAY_PHASES[phaseOverride] ?? (clock.cycle?.enabled ? DAY_PHASES[dayPhase(minuteOfDay, clock.cycle)] : null);
  return (
    <>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 11a6 6 0 1 1-6-8 5 5 0 0 0 6 8z" />
      </svg>
      <strong>{phase ? `${phase.label}, ` : ''}{formatClockTime(minuteOfDay)}</strong>
      <span aria-hidden="true">&middot;</span>
    </>
  );
}

// Layer tabs under the toolbar. The host can switch which layer they're
// viewing; players only ever see the layer they're on, so it renders as a
// single static label for them.
export function LayerStrip({ layers, layerOrder, currentLayerId, layerPlayerCounts, isHost, onSwitchLayer, feetPerSquare, clock, phaseOverride }) {
  return (
    <div className="layer-strip">
      <div className="layer-strip-tabs" role={isHost ? 'tablist' : undefined} aria-label="Layers">
        <span className="layer-strip-caption">Layers</span>
        {layerOrder.map((id) => {
          const layer = layers[id];
          if (!layer) return null;
          const active = id === currentLayerId;
          if (!isHost && !active) return null;
          return (
            <button
              key={id}
              type="button"
              role={isHost ? 'tab' : undefined}
              aria-selected={isHost ? active : undefined}
              className={`layer-tab${active ? ' active' : ''}`}
              disabled={!isHost}
              onClick={() => onSwitchLayer?.(id)}
            >
              {layer.name}
              {isHost && <span className="layer-tab-count">{layerPlayerCounts?.[id] || 0}</span>}
            </button>
          );
        })}
      </div>
      <div className="layer-strip-meta">
        <StripClock clock={clock} phaseOverride={phaseOverride} />
        <span>{feetPerSquare} ft per square</span>
      </div>
    </div>
  );
}

// Floating turn order, built from whatever Roll for Initiative stamped on the
// entities. Hidden until someone has rolled. On a phone it is also the
// encounter's turn order: the acting creature's chip is raised and kept in
// view as the turns go round.
export function InitiativeBar({ entities, encounter = null }) {
  const barRef = useRef(null);
  const [folded, setFolded] = useHudFold('initiative');
  const order = encounter
    ? encounter.order
        .map((entry) => (entities?.[entry.id] ? { ...entities[entry.id], initiativeRoll: entry.roll } : null))
        .filter(Boolean)
    : Object.values(entities || {})
        .filter((e) => e.initiativeTurn != null)
        .sort((a, b) => a.initiativeTurn - b.initiativeTurn);
  const activeId = encounter ? encounter.order[encounter.turn]?.id : order[0]?.id;

  useEffect(() => {
    // Scroll the bar itself only, never the map behind it.
    const bar = barRef.current;
    const chip = bar?.querySelector('[aria-current="true"]');
    if (!chip) return;
    // The first chip keeps the bar at its start (caption showing); later ones
    // scroll just far enough to be fully in view.
    const first = chip === bar.querySelector('.hud-initiative-chip');
    const right = chip.offsetLeft + chip.offsetWidth + 6;
    let left = bar.scrollLeft;
    if (first) left = 0;
    else if (right > left + bar.clientWidth) left = right - bar.clientWidth;
    else if (chip.offsetLeft - 6 < left) left = chip.offsetLeft - 6;
    bar.scrollLeft = Math.max(0, left);
  }, [activeId]);

  if (order.length === 0) return null;
  if (folded) {
    const active = order.find((e) => e.id === activeId);
    return (
      <button type="button" className="hud-initiative folded hud-unfold" aria-label="Show the initiative order" title="Show the initiative order" onClick={() => setFolded(false)}>
        <InitiativeIcon />
        <span>{encounter && active ? `${active.name}’s turn` : 'Initiative'}</span>
      </button>
    );
  }
  return (
    <div ref={barRef} className="hud-initiative" role="list" aria-label="Initiative order">
      <span className="hud-caption">Initiative</span>
      {order.map((e) => {
        const active = e.id === activeId;
        return (
          <span
            key={e.id}
            role="listitem"
            aria-current={encounter && active ? 'true' : undefined}
            className={`hud-initiative-chip${active ? ' first' : ''}`}
          >
            {e.name}
            <span className="hud-initiative-roll">{e.initiativeRoll}</span>
          </span>
        );
      })}
      <HudFoldButton label="Hide the initiative order" className="hud-initiative-fold" onClick={() => setFolded(true)} />
    </div>
  );
}

export function InitiativeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h12M4 10h12M4 15h8" />
    </svg>
  );
}

// Bottom-left: shows the measured distance while the ruler tool is in use.
export function RulerReadout({ feet }) {
  if (feet == null) return null;
  return (
    <div className="hud-ruler" role="status">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 15L15 3l2 2L5 17zM6 11l2 2M9 8l2 2M12 5l2 2" />
      </svg>
      <span>
        <strong>Ruler</strong> {feet} ft
      </span>
    </div>
  );
}

// Bottom-right: zoom and recenter, always in reach.
export function ZoomControl({ zoom, onZoomIn, onZoomOut, onZoomReset, onRecenter }) {
  const [hidden, setHidden] = useHudFold('zoom');
  if (hidden) {
    return (
      <div className="hud-zoom folded">
        <button type="button" className="hud-zoom-toggle" aria-label="Show zoom controls" title="Show zoom and recenter" onClick={() => setHidden(false)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8.5 3.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12.2 12.2l4.3 4.3M6.5 8.5h4M8.5 6.5v4" />
          </svg>
        </button>
      </div>
    );
  }
  return (
    <div className="hud-zoom">
      <button type="button" aria-label="Zoom out" onClick={onZoomOut}>
        &minus;
      </button>
      <button type="button" className="hud-zoom-value" aria-label="Reset zoom to 100%" onClick={onZoomReset}>
        {Math.round((zoom ?? 1) * 100)}%
      </button>
      <button type="button" aria-label="Zoom in" onClick={onZoomIn}>
        +
      </button>
      <button type="button" className="hud-zoom-recenter" aria-label="Recenter on the current island" title="Scroll back to the currently selected island" onClick={onRecenter}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10 2v3M10 15v3M2 10h3M15 10h3" />
        </svg>
      </button>
      <button type="button" className="hud-zoom-toggle hud-zoom-hide" aria-label="Hide zoom controls" title="Hide zoom and recenter" onClick={() => setHidden(true)}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 5l5 5-5 5" />
        </svg>
      </button>
    </div>
  );
}
