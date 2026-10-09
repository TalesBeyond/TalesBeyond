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

const SPRITES = {
  'sprite-warrior': { still: warriorStill, sheet: warriorSheet, frames: 2 },
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
].map((h) => ({ ...h, imageUrl: makeIconDataUrl(h.icon, h.color) }));
