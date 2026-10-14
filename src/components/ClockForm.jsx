import React, { useState } from 'react';
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

// What the form shows for a clock (or for none yet): its *current* time, not
// the moment it was last saved, so saving without touching the time doesn't
// jump the clock backwards.
function fieldsFor(clock) {
  const { day, minuteOfDay } = splitTotalMinutes(clock ? clockTotalMinutes(clock, Date.now()) : 12 * 60);
  const cycle = clock?.cycle ?? DEFAULT_CYCLE;
  return {
    day,
    time: minutesToTimeInput(minuteOfDay),
    rate: clock ? clock.rate : 1,
    running: clock ? clock.running : true,
    cycleEnabled: cycle.enabled,
    sunrise: minutesToTimeInput(cycle.sunrise),
    sunset: minutesToTimeInput(cycle.sunset),
  };
}

// The DM's settings for the table's in-game clock: the current time, the
// tick speed, and the day/night cycle. On the rail it is the World drawer's
// "Set world clock" panel, which removes the clock from its header; on a
// phone it sits in a dialog (GameView), with a Remove button of its own
// (`onRemove`). Cancel puts the fields back to the clock as it is now, then
// calls `onCancel` (the phone dialog closes).
export default function ClockForm({ clock, onSave, onRemove = null, onCancel = null }) {
  const cycle = clock?.cycle ?? DEFAULT_CYCLE;
  const [initial] = useState(() => fieldsFor(clock));

  const [day, setDay] = useState(initial.day);
  const [time, setTime] = useState(initial.time);
  const [rate, setRate] = useState(initial.rate);
  const [running, setRunning] = useState(initial.running);
  const [cycleEnabled, setCycleEnabled] = useState(initial.cycleEnabled);
  const [sunrise, setSunrise] = useState(initial.sunrise);
  const [sunset, setSunset] = useState(initial.sunset);
  const [error, setError] = useState('');

  function cancel() {
    const next = fieldsFor(clock);
    setDay(next.day);
    setTime(next.time);
    setRate(next.rate);
    setRunning(next.running);
    setCycleEnabled(next.cycleEnabled);
    setSunrise(next.sunrise);
    setSunset(next.sunset);
    setError('');
    onCancel?.();
  }

  function save() {
    const minuteOfDay = timeInputToMinutes(time);
    const sunriseMinutes = timeInputToMinutes(sunrise);
    const sunsetMinutes = timeInputToMinutes(sunset);
    if (minuteOfDay === null) return setError('Enter a valid time.');
    if (cycleEnabled && (sunriseMinutes === null || sunsetMinutes === null)) return setError('Enter a valid sunrise and sunset time.');
    if (cycleEnabled && sunsetMinutes <= sunriseMinutes) return setError('Sunset has to be after sunrise.');
    setError('');
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
    <div className="clock-form">
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
      <input className="field" type="number" min={0} step={0.01} value={rate} onChange={(e) => setRate(e.target.value)} />
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
        Maps can follow this cycle or stay always day / always night — set that per map under Day / night, where you can also override
        the phase by hand at any time. Pause or resume the clock from its readout.
      </p>

      {error && <p className="error-note" style={{ marginTop: 8 }}>{error}</p>}

      <div className="clock-form-actions">
        {clock && onRemove && (
          <button className="btn btn-danger" onClick={onRemove} title="Remove the clock from this table">
            Remove
          </button>
        )}
        <button className="btn btn-secondary" onClick={cancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save}>
          {clock ? 'Save' : 'Start clock'}
        </button>
      </div>
    </div>
  );
}
