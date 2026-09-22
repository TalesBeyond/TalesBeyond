// The in-game clock. Deliberately pure (no React, no imports) so the math can
// be tested on its own and reused anywhere.
//
// A clock is stored as an anchor, not as a ticking value: "at real time
// `baseRealMs` the in-game time was `baseMinutes`, and it advances `rate`
// in-game minutes per real second". Every client derives the current time
// from that locally, so nothing has to be sent over the wire each tick, and
// the DM changing the time or speed is a single small write.
//
//   {
//     baseMinutes: number,  // in-game minutes since Day 1, 12:00 AM, at baseRealMs
//     baseRealMs: number,   // Date.now() when the anchor was set
//     rate: number,         // the "tick": in-game minutes per real second (0 = stopped)
//     running: boolean,     // false pauses the clock at baseMinutes
//     cycle: { enabled, sunrise, sunset },  // day/night cycle; times are minutes past midnight
//   }
//
// One caveat worth knowing: each browser uses its own real clock for "now",
// so two screens can disagree by however far their system clocks differ
// (usually well under a second), scaled by the tick speed.

export const MINUTES_PER_DAY = 1440;
// Dawn starts at sunrise and dusk ends at sunset; each lasts this long.
export const TWILIGHT_MINUTES = 60;
export const DEFAULT_CYCLE = { enabled: true, sunrise: 6 * 60, sunset: 18 * 60 };

export function makeClock({ day = 1, minuteOfDay = 12 * 60, rate = 1, running = true, cycle } = {}, nowMs = Date.now()) {
  return {
    baseMinutes: (Math.max(1, Math.floor(day)) - 1) * MINUTES_PER_DAY + minuteOfDay,
    baseRealMs: nowMs,
    rate: Math.max(0, Number(rate) || 0),
    running: Boolean(running),
    cycle: { ...DEFAULT_CYCLE, ...cycle },
  };
}

// Total in-game minutes at `nowMs` (fractional while running).
export function clockTotalMinutes(clock, nowMs = Date.now()) {
  if (!clock) return 0;
  if (!clock.running || !(clock.rate > 0)) return clock.baseMinutes;
  const elapsedSeconds = Math.max(0, (nowMs - clock.baseRealMs) / 1000);
  return clock.baseMinutes + elapsedSeconds * clock.rate;
}

// Pause or resume without moving the time. The anchor is re-based to "now"
// first: flipping `running` alone would make a paused clock snap back to its
// old anchor, or a resumed one jump forward by however long it sat paused.
export function withClockRunning(clock, running, nowMs = Date.now()) {
  return { ...clock, baseMinutes: clockTotalMinutes(clock, nowMs), baseRealMs: nowMs, running: Boolean(running) };
}

// Total minutes -> { day (1-based), minuteOfDay (0-1439) }.
export function splitTotalMinutes(total) {
  const whole = Math.floor(total);
  return {
    day: Math.floor(whole / MINUTES_PER_DAY) + 1,
    minuteOfDay: ((whole % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY,
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// 870 -> "2:30 PM"
export function formatClockTime(minuteOfDay) {
  const hours24 = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${hours24 % 12 || 12}:${pad2(minutes)} ${hours24 >= 12 ? 'PM' : 'AM'}`;
}

// <input type="time"> speaks 24-hour "HH:MM".
export function minutesToTimeInput(minuteOfDay) {
  return `${pad2(Math.floor(minuteOfDay / 60))}:${pad2(minuteOfDay % 60)}`;
}

export function timeInputToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// 'dawn' | 'day' | 'dusk' | 'night' for a minute of the day.
export function dayPhase(minuteOfDay, cycle = DEFAULT_CYCLE) {
  const { sunrise, sunset } = cycle;
  if (minuteOfDay >= sunrise && minuteOfDay < sunrise + TWILIGHT_MINUTES) return 'dawn';
  if (minuteOfDay >= sunset - TWILIGHT_MINUTES && minuteOfDay < sunset) return 'dusk';
  if (minuteOfDay >= sunrise + TWILIGHT_MINUTES && minuteOfDay < sunset - TWILIGHT_MINUTES) return 'day';
  return 'night';
}

// The phase the clock is in right now, or null when there is no clock or its
// day/night cycle is switched off.
export function currentClockPhase(clock, nowMs = Date.now()) {
  if (!clock || !clock.cycle?.enabled) return null;
  const { minuteOfDay } = splitTotalMinutes(clockTotalMinutes(clock, nowMs));
  return dayPhase(minuteOfDay, clock.cycle);
}

// What one real minute is worth in-game, for the modal's live preview.
export function describeRate(rate) {
  if (!(rate > 0)) return 'The clock is stopped';
  const gameMinutes = rate * 60;
  if (gameMinutes >= 120) return `1 real minute = ${round(gameMinutes / 60)} in-game hours`;
  if (gameMinutes >= 60) return `1 real minute = ${round(gameMinutes / 60)} in-game hour`;
  return `1 real minute = ${round(gameMinutes)} in-game minute${round(gameMinutes) === 1 ? '' : 's'}`;
}

function round(n) {
  return Math.round(n * 100) / 100;
}
