// No picture is ever saved to Supabase. At the database boundary (mappers.js)
// a token's image is stored as a short reference: a built-in icon —
// `icon:<name>:<#color>`, drawn from the project's own files on the way back
// in — or a DM upload's fingerprint — `img:<sha-256>`, whose bytes live only
// in browsers (imageCache.js, imageExchange.js). Anything else becomes '' and
// falls back to its kind's default icon. A map background is stored only as
// a fingerprint. The database enforces the same rule
// (20250101000055_no_stored_images.sql).

import { iconRefForUrl, iconUrlForRef, makeIconDataUrl } from '../data/defaultTokens.js';
import '../data/spriteTokens.js'; // adds the animated tokens' icons before any reference is read
import { isImageRef, resolveImage } from './imageCache.js';

const FALLBACK = {
  hero: ['shield', '#3a3226'],
  mob: ['fangs', '#45573f'],
  npc: ['npc', '#6f6f6f'],
  door: ['door', '#5c4a2e'],
  chest: ['chest', '#c98a3b'],
  trap: ['trap', '#8f1f1f'],
  ambush: ['skull', '#7a1f2b'],
};

export function toStoredImage(url) {
  if (isImageRef(url)) return url;
  return iconRefForUrl(url) ?? '';
}

export function toStoredBackground(value) {
  return isImageRef(value) ? value : null;
}

export function fromStoredImage(stored, row) {
  if (isImageRef(stored)) return stored;
  const url = iconUrlForRef(stored);
  if (url) return url;
  const [icon, defaultColor] = FALLBACK[row.kind] || FALLBACK.hero;
  const color = /^#[0-9a-fA-F]{3,8}$/.test(row.color || '') ? row.color : defaultColor;
  return makeIconDataUrl(row.kind === 'chest' && row.opened ? 'chest-open' : icon, color);
}

// What to draw for a token right now: its picture, or — while a shared
// picture is still on its way from another browser — its kind's default icon.
// Callers re-render on arrival via useImageCacheVersion().
export function entityImageSrc(entity) {
  return resolveImage(entity.imageUrl) || fromStoredImage('', entity);
}

// A whole table with every picture that isn't a built-in icon or a shared
// fingerprint removed: such tokens fall back to their kind's icon, and such
// map backgrounds are cleared. For state entering a cloud or guest table
// from a file.
export function stripCustomImages(state) {
  const entities = {};
  for (const [id, e] of Object.entries(state.entities || {})) {
    entities[id] = iconRefForUrl(e.imageUrl) || isImageRef(e.imageUrl) ? e : { ...e, imageUrl: fromStoredImage('', e) };
  }
  const layers = {};
  for (const [id, layer] of Object.entries(state.layers || {})) {
    const islands = {};
    for (const [islandId, island] of Object.entries(layer.islands || {})) {
      islands[islandId] = island.backgroundImage && !isImageRef(island.backgroundImage) ? { ...island, backgroundImage: null } : island;
    }
    layers[id] = { ...layer, islands };
  }
  return { ...state, entities, layers };
}

// A custom asset's `data` (custom_assets.data): a monster keeps `icon` and
// `color`, so its picture is dropped on the way out and redrawn on the way in.
export function customAssetDataToDb(data) {
  if (!data || !('imageUrl' in data)) return data;
  const { imageUrl: _drop, ...rest } = data;
  return rest;
}

export function customAssetDataFromDb(assetType, data) {
  if (assetType !== 'monster' || !data?.icon) return data;
  return { ...data, imageUrl: makeIconDataUrl(data.icon, data.color || FALLBACK.mob[1]) };
}
