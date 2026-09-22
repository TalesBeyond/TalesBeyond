import React from 'react';
import { useNow } from '../state/useGameClock.js';
import { DAY_PHASES } from '../data/dayPhases.js';
import { clockTotalMinutes, splitTotalMinutes, formatClockTime, dayPhase } from '../utils/gameClock.js';

// The toolbar's "Ingame time" display: current in-game time, day number, and
// the day/night phase. Everyone sees it; for the DM it is also a shortcut into
// the configuration modal, with a pause/play button beside it.
export default function ClockReadout({ clock, isHost, onOpen, onSetRunning, phaseOverride }) {
  const now = useNow(500);
  if (!clock) return null;

  const { day, minuteOfDay } = splitTotalMinutes(clockTotalMinutes(clock, now));
  // A phase the DM set by hand wins over the clock's own cycle.
  const phase = DAY_PHASES[phaseOverride] ?? (clock.cycle?.enabled ? DAY_PHASES[dayPhase(minuteOfDay, clock.cycle)] : null);
  const canRun = clock.rate > 0;
  const stopped = !clock.running || !canRun;
  const Tag = isHost ? 'button' : 'div';

  return (
    <>
      <Tag
        className="clock-readout"
        type={isHost ? 'button' : undefined}
        onClick={isHost ? onOpen : undefined}
        title={isHost ? 'Edit the in-game time, tick speed, and day/night cycle' : 'In-game time'}
      >
        {phase && <img className="clock-readout-icon" src={phase.imageUrl} alt={phase.label} />}
        <span className="clock-readout-body">
          <span className="clock-readout-caption">Ingame time</span>
          <span className="clock-readout-time">
            {formatClockTime(minuteOfDay)}
            {stopped && <span className="clock-readout-paused"> ⏸</span>}
          </span>
          <span className="clock-readout-sub">
            Day {day}
            {phase ? ` · ${phase.label}` : ''}
            {phase && phaseOverride ? ' (manual)' : ''}
          </span>
        </span>
      </Tag>
      {isHost && (
        <button
          type="button"
          className="clock-toggle"
          onClick={() => onSetRunning(!clock.running)}
          disabled={!canRun}
          aria-label={clock.running ? 'Pause the clock' : 'Play the clock'}
          title={
            !canRun ? 'Set a tick speed above 0 (Ingame time) to run the clock' : clock.running ? 'Pause the clock' : 'Resume the clock'
          }
        >
          {stopped ? '▶' : '⏸'}
        </button>
      )}
    </>
  );
}
