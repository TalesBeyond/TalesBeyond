import React, { useState } from 'react';
import ModalIcon from './ModalIcon.jsx';
import {
  DEFAULT_CYCLE,
  clockTotalMinutes,
  splitTotalMinutes,
  makeClock,
  minutesToTimeInput,
  timeInputToMinutes,
  describeRate,
} from '../utils/gameClock.js';

// "1 real minute = ..." shortcuts for the tick speed, which is stored as
// in-game minutes per real second.
const RATE_PRESETS = [
  { label: 'Real time', rate: 1 / 60 },
  { label: '10× faster', rate: 10 / 60 },
  { label: '1 hour / minute', rate: 1 },
  { label: '4 hours / minute', rate: 4 },
];

// The DM's modal for the table's in-game clock: the current time, the tick
// speed, and the day/night cycle. It opens pre-filled with the clock's
// *current* time (not the moment it was last saved), so saving without
// touching the time doesn't jump the clock backwards.
export default function ClockModal({ clock, onSave, onRemove, onClose }) {
  const [initial] = useState(() => {
    const { day, minuteOfDay } = splitTotalMinutes(clock ? clockTotalMinutes(clock, Date.now()) : 12 * 60);
    return { day, minuteOfDay };
  });
  const cycle = clock?.cycle ?? DEFAULT_CYCLE;

  const [day, setDay] = useState(initial.day);
  const [time, setTime] = useState(minutesToTimeInput(initial.minuteOfDay));
  const [rate, setRate] = useState(clock ? clock.rate : 1);
  const [running, setRunning] = useState(clock ? clock.running : true);
  const [cycleEnabled, setCycleEnabled] = useState(cycle.enabled);
  const [sunrise, setSunrise] = useState(minutesToTimeInput(cycle.sunrise));
  const [sunset, setSunset] = useState(minutesToTimeInput(cycle.sunset));
  const [error, setError] = useState('');

  function save() {
    const minuteOfDay = timeInputToMinutes(time);
    const sunriseMinutes = timeInputToMinutes(sunrise);
    const sunsetMinutes = timeInputToMinutes(sunset);
    if (minuteOfDay === null) return setError('Enter a valid time.');
    if (cycleEnabled && (sunriseMinutes === null || sunsetMinutes === null)) return setError('Enter a valid sunrise and sunset time.');
    if (cycleEnabled && sunsetMinutes <= sunriseMinutes) return setError('Sunset has to be after sunrise.');
    onSave(
      makeClock({
        day: Math.max(1, parseInt(day, 10) || 1),
        minuteOfDay,
        rate: Number(rate) || 0,
        running,
        cycle: { enabled: cycleEnabled, sunrise: sunriseMinutes ?? cycle.sunrise, sunset: sunsetMinutes ?? cycle.sunset },
      })
    );
  }

  return (
    <div className="book-backdrop" onClick={onClose}>
      <div
        className="book-card"
        style={{ background: 'linear-gradient(180deg, var(--ink-900), var(--ink-800))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="book-card-header">
          <span className="book-title"><ModalIcon name="clock" />Ingame time</span>
          <button className="popover-close" onClick={onClose} aria-label="Close" title="Close">
            ×
          </button>
        </div>
        <div style={{ padding: 16, flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div className="two-col">
            <div>
              <label className="field-label">Day</label>
              <input className="field" type="number" min={1} value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Time</label>
              <input className="field" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <label className="field-label" style={{ marginTop: 12 }}>
            Tick speed (in-game minutes per real second)
          </label>
          <input
            className="field"
            type="number"
            min={0}
            step={0.01}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <p className="footer-note" style={{ border: 'none', padding: '4px 0' }}>
            {describeRate(Number(rate))}
          </p>
          <div className="condition-row" style={{ gap: 6 }}>
            {RATE_PRESETS.map((p) => (
              <button key={p.label} type="button" className="btn btn-quiet btn-sm" onClick={() => setRate(Math.round(p.rate * 10000) / 10000)}>
                {p.label}
              </button>
            ))}
          </div>

          <label className="checkbox-row" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={running} onChange={(e) => setRunning(e.target.checked)} />
            Clock running (untick to pause it)
          </label>

          <div className="section-label" style={{ marginTop: 6 }}>
            Day / night cycle
          </div>
          <label className="checkbox-row" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={cycleEnabled} onChange={(e) => setCycleEnabled(e.target.checked)} />
            Show dawn, day, dusk and night
          </label>
          <div className="two-col">
            <div>
              <label className="field-label">Sunrise</label>
              <input className="field" type="time" value={sunrise} disabled={!cycleEnabled} onChange={(e) => setSunrise(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Sunset</label>
              <input className="field" type="time" value={sunset} disabled={!cycleEnabled} onChange={(e) => setSunset(e.target.value)} />
            </div>
          </div>
          <p className="footer-note" style={{ border: 'none', padding: '6px 0 0' }}>
            Islands can follow this cycle or stay always day / always night — set that per island in Map settings. You can also
            override the phase by hand at any time from the toolbar's Day / night button, and pause or resume the clock from the
            readout.
          </p>

          {error && <p className="error-note" style={{ marginTop: 8 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            {clock && (
              <button className="btn btn-danger" onClick={onRemove} title="Remove the clock from this table">
                Remove
              </button>
            )}
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={save}>
              {clock ? 'Save' : 'Start clock'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
