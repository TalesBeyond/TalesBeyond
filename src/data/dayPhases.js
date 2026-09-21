// The four phases of the in-game day/night cycle (utils/gameClock.js decides
// which one the clock is in). Each has a badge icon, and all but Day tint the
// islands that follow the cycle - purely visual, like the island conditions.

import { makeIconDataUrl } from './defaultTokens.js';

const CATALOG = {
  dawn: {
    label: 'Dawn',
    color: '#d97b4a',
    icon: 'phase-dawn',
    tint: 'rgba(240, 150, 110, 0.22)',
    description: 'First light - the sun is rising.',
  },
  day: {
    label: 'Day',
    color: '#d9a441',
    icon: 'phase-day',
    tint: null,
    description: 'Full daylight.',
  },
  dusk: {
    label: 'Dusk',
    color: '#a4507a',
    icon: 'phase-dawn',
    tint: 'rgba(200, 100, 60, 0.28)',
    description: 'The light is fading - the sun is setting.',
  },
  night: {
    label: 'Night',
    color: '#23284d',
    icon: 'isle-dark',
    tint: 'rgba(10, 14, 52, 0.45)',
    description: 'Dark of night.',
  },
};

export const DAY_PHASES = Object.fromEntries(
  Object.entries(CATALOG).map(([key, phase]) => [key, { ...phase, key, imageUrl: makeIconDataUrl(phase.icon, phase.color) }])
);

// An island's per-island "Day / night" setting: follow the table's clock, or
// stay put regardless of it (a cave that is always night, say).
export const ISLAND_DAY_NIGHT_MODES = [
  { key: 'cycle', label: 'Follows the clock' },
  { key: 'day', label: 'Always day' },
  { key: 'night', label: 'Always night' },
];

// The phase an island is actually in: its own override if it has one,
// otherwise whatever the table clock's cycle says (null when there is none).
export function islandPhase(island, clockPhase) {
  if (island?.dayNight === 'day') return 'day';
  if (island?.dayNight === 'night') return 'night';
  return clockPhase ?? null;
}
