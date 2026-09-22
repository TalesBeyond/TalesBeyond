import { useEffect, useState } from 'react';
import { currentClockPhase } from '../utils/gameClock.js';

// Re-renders the calling component every `intervalMs` with a fresh "now" - for
// the toolbar readout, which is the only thing that needs to tick smoothly.
export function useNow(intervalMs = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// The clock's current day/night phase, as state that only changes when the
// phase itself does - so the map can react to dusk arriving without the whole
// game screen re-rendering every second.
export function useDayPhase(clock) {
  const [phase, setPhase] = useState(() => currentClockPhase(clock));
  useEffect(() => {
    setPhase(currentClockPhase(clock));
    if (!clock || !clock.running || !(clock.rate > 0)) return undefined;
    const id = setInterval(() => setPhase(currentClockPhase(clock)), 1000);
    return () => clearInterval(id);
  }, [clock]);
  return phase;
}
