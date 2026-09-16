// Condition states a host/DM can apply to a hero (player) token. Kept as a
// small fixed catalog for now — see SPEC.md's non-goal on "automated rules
// enforcement": these are purely visual/informational markers, not enforced
// mechanics.

import { makeIconDataUrl } from './defaultTokens.js';

const CATALOG = [
  {
    key: 'poisoned',
    label: 'Poisoned',
    color: '#4a5d33',
    icon: 'poison',
    description: 'Disadvantage on attack rolls and ability checks.',
  },
  {
    key: 'stunned',
    label: 'Stunned',
    color: '#a9853f',
    icon: 'stunned',
    description: 'Incapacitated, can’t move, and automatically fails Strength and Dexterity saves.',
  },
  {
    key: 'prone',
    label: 'Prone',
    color: '#5c5648',
    icon: 'prone',
    description: 'Can only crawl; melee attacks against it have advantage, ranged attacks have disadvantage.',
  },
  {
    key: 'shocked',
    label: 'Shocked',
    color: '#3a6ea5',
    icon: 'shocked',
    description: 'Reactions are disabled and speed is halved until the shock passes.',
  },
  {
    key: 'bleeding',
    label: 'Bleeding',
    color: '#8f1f1f',
    icon: 'bleed',
    description: 'Takes ongoing damage each round until the bleeding is treated.',
  },
];

export const CONDITIONS = CATALOG.map((c) => ({ ...c, imageUrl: makeIconDataUrl(c.icon, c.color) }));

export function getCondition(key) {
  return CONDITIONS.find((c) => c.key === key);
}
