// Animated tokens. A sprite token is a built-in icon like the others — stored
// as `icon:<name>:<#color>` (lib/storedImages.js) — whose picture is a bundled
// file: `still` is what the token looks like everywhere, and `sheet` is its
// frames side by side, played on the map while the pointer is over the token.
//
// The still is a data: URL like every drawn icon (kept as text in a
// `.still.js` file beside the picture): a table saved in this browser or
// exported to a file keeps the same picture from one build to the next, which
// a bundled file's hashed address would not.

import { useSyncExternalStore } from 'react';
import { makeIconDataUrl, registerIconImage } from './defaultTokens.js';
import warriorStill from '../assets/sprites/sprite-warrior.still.js';
import warriorSheet from '../assets/sprites/sprite-warrior-sheet.png';
import rogueStill from '../assets/sprites/sprite-rogue.still.js';
import rogueSheet from '../assets/sprites/sprite-rogue-sheet.png';
import rangerStill from '../assets/sprites/sprite-ranger.still.js';
import rangerSheet from '../assets/sprites/sprite-ranger-sheet.png';
import wizardStill from '../assets/sprites/sprite-wizard.still.js';
import wizardSheet from '../assets/sprites/sprite-wizard-sheet.png';
import bardStill from '../assets/sprites/sprite-bard.still.js';
import bardSheet from '../assets/sprites/sprite-bard-sheet.png';
import barbarianStill from '../assets/sprites/sprite-barbarian.still.js';
import barbarianSheet from '../assets/sprites/sprite-barbarian-sheet.png';
import clericStill from '../assets/sprites/sprite-cleric.still.js';
import clericSheet from '../assets/sprites/sprite-cleric-sheet.png';
import mageStill from '../assets/sprites/sprite-mage.still.js';
import mageSheet from '../assets/sprites/sprite-mage-sheet.png';

const SPRITES = {
  'sprite-warrior': { still: warriorStill, sheet: warriorSheet, frames: 2 },
  'sprite-rogue': { still: rogueStill, sheet: rogueSheet, frames: 2 },
  'sprite-ranger': { still: rangerStill, sheet: rangerSheet, frames: 2 },
  'sprite-wizard': { still: wizardStill, sheet: wizardSheet, frames: 2 },
  'sprite-bard': { still: bardStill, sheet: bardSheet, frames: 2 },
  'sprite-barbarian': { still: barbarianStill, sheet: barbarianSheet, frames: 2 },
  'sprite-cleric': { still: clericStill, sheet: clericSheet, frames: 2 },
  'sprite-mage': { still: mageStill, sheet: mageSheet, frames: 2 },
};

for (const [icon, sprite] of Object.entries(SPRITES)) registerIconImage(icon, sprite.still);

const spriteByStill = new Map(Object.values(SPRITES).map((sprite) => [sprite.still, sprite]));

// The sprite a token picture belongs to ({ still, sheet, frames }), or null
// for every other picture.
export function spriteForUrl(url) {
  return spriteByStill.get(url) ?? null;
}

// Which token the map is playing right now — the one under the pointer, the
// one being dragged — so the inspector can play the same token's picture in
// step. Local to this browser, like the animation itself; nothing is synced.
const playing = { hover: null, drag: null };
const listeners = new Set();

// `reason` is 'hover' or 'drag'; `entityId` is the token, or null to stop.
export function setSpritePlaying(reason, entityId) {
  if (playing[reason] === entityId) return;
  playing[reason] = entityId;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// True while the map is playing this token's frames.
export function useSpritePlaying(entityId) {
  return useSyncExternalStore(subscribe, () => playing.hover === entityId || playing.drag === entityId);
}

// Placed from the Default heroes gallery, after DEFAULT_HEROES.
export const SPRITE_HEROES = [
  { key: 'sprite-warrior', name: 'Sprite Warrior', color: '#2f3a4f', icon: 'sprite-warrior' },
  { key: 'sprite-rogue', name: 'Sprite Rogue', color: '#2f3a4f', icon: 'sprite-rogue' },
  { key: 'sprite-ranger', name: 'Sprite Ranger', color: '#2f3a4f', icon: 'sprite-ranger' },
  { key: 'sprite-wizard', name: 'Sprite Wizard', color: '#2f3a4f', icon: 'sprite-wizard' },
  { key: 'sprite-bard', name: 'Sprite Bard', color: '#2f3a4f', icon: 'sprite-bard' },
  { key: 'sprite-barbarian', name: 'Sprite Barbarian', color: '#2f3a4f', icon: 'sprite-barbarian' },
  { key: 'sprite-cleric', name: 'Sprite Cleric', color: '#2f3a4f', icon: 'sprite-cleric' },
  { key: 'sprite-mage', name: 'Sprite Mage', color: '#2f3a4f', icon: 'sprite-mage' },
].map((h) => ({ ...h, imageUrl: makeIconDataUrl(h.icon, h.color) }));
