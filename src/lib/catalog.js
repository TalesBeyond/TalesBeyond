// The Default catalog (REQ-010): weapons, items, monsters, songs and dice
// images that every table shares. Each list starts as the data built into the
// app (src/data/*) so nothing ever waits on the network, and is replaced
// wholesale, once, when Supabase returns rows for that type. A failed or empty
// fetch leaves the built-in data in place. Local demo mode never fetches.

import { useSyncExternalStore } from 'react';
import { supabase, isSupabaseConfigured } from './supabaseClient.js';
import { WEAPONS } from '../data/weapons.js';
import { ITEMS } from '../data/items.js';
import { MONSTERS } from '../data/monsters.js';
import { makeIconDataUrl } from '../data/defaultTokens.js';
import { compendiumImage } from '../data/compendiumImages.js';

const IMAGE_BUCKET = 'catalog-images';
const AUDIO_BUCKET = 'catalog-audio';

let current = {
  weapons: WEAPONS,
  items: ITEMS,
  monsters: MONSTERS,
  audio: [], // songs have no built-in fallback: the picker is simply empty
  diceImages: [], // nor do dice pictures: a tile without one keeps its outline
  // Public picture URLs by kind, keyed by the entry's name (monsters: key).
  images: { weapons: {}, items: {}, monsters: {}, diceImages: {} },
};
const listeners = new Set();

export function getCatalog() {
  return current;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(patch) {
  current = { ...current, ...patch };
  listeners.forEach((listener) => listener());
}

// Re-renders the component whenever a catalog list is replaced.
export function useCatalog() {
  return useSyncExternalStore(subscribe, getCatalog, getCatalog);
}

function publicUrl(bucket, path) {
  if (!supabase || !path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// A picture for one entry: the catalog's own, else the bundled compendium
// folder, else null. `key` is the name (weapons, items) or key (monsters).
export function entryImage(kind, key, bundledName = key) {
  return current.images[kind]?.[key] || compendiumImage(kind, bundledName);
}

const mapWeapon = (row) => ({
  type: row.type,
  name: row.name,
  numberOfDice: row.number_of_dice,
  diceType: row.dice_type,
  modifier: row.modifier,
  damage: Number(row.damage),
  cost: Number(row.cost),
  equipableClass: row.equipable_class || [],
});

const mapItem = (row) => ({
  category: row.category,
  name: row.name,
  cost: Number(row.cost),
  weight: Number(row.weight),
  description: row.description || '',
});

const mapMonster = (row) => ({
  key: row.slug,
  name: row.name,
  kind: row.kind,
  cr: row.cr,
  hp: row.hp,
  ac: row.ac,
  speed: row.speed,
  abilities: row.abilities,
  size: row.size,
  icon: row.icon,
  color: row.color,
  attack: row.attack || '',
  description: row.description || '',
  imageUrl: makeIconDataUrl(row.icon, row.color),
});

const mapAudio = (row) => ({
  slug: row.slug,
  name: row.name,
  mime: row.mime,
  sizeBytes: Number(row.size_bytes),
  url: publicUrl(AUDIO_BUCKET, row.audio_path),
});

const mapDiceImage = (row) => ({ slug: row.slug, name: row.name, dieType: row.die_type });

// The catalog's picture for a die ("d20"), or null.
export function dieImage(dieType) {
  return current.images.diceImages?.[dieType] || null;
}

// One entry per catalog list: which table feeds it, how a row becomes the
// shape the app already uses, and which field keys its picture map.
const SOURCES = [
  { kind: 'weapons', table: 'catalog_weapons', map: mapWeapon, imageKey: (row) => row.name },
  { kind: 'items', table: 'catalog_items', map: mapItem, imageKey: (row) => row.name },
  { kind: 'monsters', table: 'catalog_monsters', map: mapMonster, imageKey: (row) => row.slug },
  { kind: 'audio', table: 'catalog_audio', map: mapAudio },
  { kind: 'diceImages', table: 'catalog_dice_images', map: mapDiceImage, imageKey: (row) => row.die_type },
];

async function loadSource({ kind, table, map, imageKey }) {
  try {
    const { data, error } = await supabase.from(table).select('*').order('name');
    if (error || !data?.length) return;
    const patch = { [kind]: data.map(map).filter((entry) => entry.url !== null) };
    if (imageKey) {
      const images = {};
      for (const row of data) {
        const url = publicUrl(IMAGE_BUCKET, row.image_path);
        if (url) images[imageKey(row)] = url;
      }
      patch.images = { ...current.images, [kind]: images };
    }
    update(patch);
  } catch (err) {
    console.warn(`catalog ${table}:`, err);
  }
}

let started = false;

// Fetches every catalog list once per page load. Safe to call repeatedly.
export function loadCatalog() {
  if (started || !isSupabaseConfigured) return Promise.resolve();
  started = true;
  return Promise.all(SOURCES.map(loadSource));
}
