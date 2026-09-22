// Condition states a host/DM can apply to an island - the map-level twin of
// the hero/monster conditions in data/conditions.js. Like those, they are
// purely visual/informational markers (see SPEC.md's non-goal on "automated
// rules enforcement"), not enforced mechanics: the badge tells everyone at
// the table what the island is like, and the DM decides what it does.

import { makeIconDataUrl } from './defaultTokens.js';

const CATALOG = [
  {
    key: 'fog',
    label: 'Fog',
    color: '#7d8790',
    icon: 'isle-fog',
    description: 'Thick fog - vision is limited, and creatures at a distance are heavily obscured.',
  },
  {
    key: 'dark',
    label: 'Darkness',
    color: '#2b2a44',
    icon: 'isle-dark',
    description: 'Little or no light - creatures without darkvision can barely see.',
  },
  {
    key: 'fire',
    label: 'Fire',
    color: '#c2481f',
    icon: 'isle-fire',
    description: 'Flames sweep the island - creatures that end their turn here risk fire damage.',
  },
  {
    key: 'unstable',
    label: 'Unstable footing',
    color: '#7a5a34',
    icon: 'isle-unstable',
    description: 'The ground shifts and cracks - moving quickly risks falling prone.',
  },
  {
    key: 'drowning',
    label: 'Drowning',
    color: '#2f6f9f',
    icon: 'isle-drowning',
    description: 'Submerged or flooding - creatures here risk drowning.',
  },
  {
    key: 'icy',
    label: 'Icy',
    color: '#3d8aa3',
    icon: 'isle-icy',
    description: 'Slick ice - hard to keep your footing, and movement may slide.',
  },
  {
    key: 'gas',
    label: 'Poison gas',
    color: '#6b7a2d',
    icon: 'isle-gas',
    description: 'Toxic vapors hang in the air - breathing them risks being poisoned.',
  },
  {
    key: 'storm',
    label: 'Storm',
    color: '#4b5a78',
    icon: 'isle-storm',
    description: 'A raging storm - wind and rain hamper ranged attacks and hearing.',
  },
  {
    key: 'rough',
    label: 'Difficult terrain',
    color: '#6f6a4a',
    icon: 'isle-rough',
    description: 'Every square of movement costs double.',
  },
  {
    key: 'cursed',
    label: 'Cursed',
    color: '#6b3a7a',
    icon: 'skull',
    description: 'A malign magic hangs over the place.',
  },
];

export const ISLAND_CONDITIONS = CATALOG.map((c) => ({ ...c, imageUrl: makeIconDataUrl(c.icon, c.color) }));

export function getIslandCondition(key) {
  return ISLAND_CONDITIONS.find((c) => c.key === key);
}
