import React from 'react';
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
// entities. Hidden until someone has rolled.
export function InitiativeBar({ entities }) {
  const order = Object.values(entities || {})
    .filter((e) => e.initiativeTurn != null)
    .sort((a, b) => a.initiativeTurn - b.initiativeTurn);
  if (order.length === 0) return null;
  return (
    <div className="hud-initiative" role="list" aria-label="Initiative order">
      <span className="hud-caption">Initiative</span>
      {order.map((e, i) => (
        <span key={e.id} role="listitem" className={`hud-initiative-chip${i === 0 ? ' first' : ''}`}>
          {e.name}
          <span className="hud-initiative-roll">{e.initiativeRoll}</span>
        </span>
      ))}
    </div>
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
    </div>
  );
}
