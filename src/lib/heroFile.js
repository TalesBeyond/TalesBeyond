// A premade hero: a character someone builds on the Characters screen
// (components/CharacterBuilder.jsx), with or without a table. It is a hero
// token that stands on no map yet:
//   { name, imageUrl, color, size, maxHp, sheet }
// `sheet` is the hero's own sheet (data/characterSheet.js), the one its card
// edits on a table.
//
// It is kept in a .tlsbyd file, which is JSON:
//   { format: 'talesbeyond-hero', version: 1, hero: { name, image, color, size, maxHp, sheet } }
// `image` is a built-in picture's reference (`icon:<name>:<#color>`) or, for a
// picture someone added, its data URL.
//
// Nothing read from a file, from another browser or from storage is trusted:
// sanitizeHero rebuilds the hero field by field, and a file's own picture is
// redrawn at token size and put through the picture filter (utils/image.js)
// before it is used.

import {
  ABILITIES,
  CURRENCIES,
  SKILLS,
  SPELL_LEVELS,
  abilityModifier,
  defaultCharacterSheet,
  normalizeCheckEntry,
  normalizeCurrency,
  normalizeEquipment,
  normalizeSpellcasting,
} from '../data/characterSheet.js';
import { DEFAULT_HEROES, iconRefForUrl, iconUrlForRef } from '../data/defaultTokens.js';
import '../data/spriteTokens.js'; // adds the animated heroes' icons before any reference is read
import { slugify } from '../data/slugify.js';
import { isImageRef } from './imageCache.js';
import { resizeImageToDataUrl } from '../utils/image.js';

export const HERO_FILE_EXTENSION = '.tlsbyd';
export const HERO_IMAGE_MAX_DIM = 256; // the size a token's own picture is kept at (CreatureCard.jsx's TokenPictureButton)

const FORMAT = 'talesbeyond-hero';
const VERSION = 1;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
// A hero offered to the DM travels in one Broadcast message (256 KB at most
// on the free tier); its picture goes separately, by fingerprint.
const MAX_OFFER_CHARS = 100000;
const DRAFT_KEY = 'hearthbound:herodraft';

const MAX_NAME = 120;
const MAX_TEXT = 8000; // a tome in the Bag carries its text
const MAX_ROW_FIELDS = 24;
const MAX_ATTACKS = 30;
const MAX_BAG_ROWS = 150;
const MAX_SPELLS = 60;

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const DATA_IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export class HeroFileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HeroFileError';
  }
}

export function heroFileErrorMessage(err) {
  return err instanceof HeroFileError ? err.message : 'Could not read that file. Try another one.';
}

export function newHero() {
  const look = DEFAULT_HEROES[0];
  return { name: 'New hero', imageUrl: look.imageUrl, color: look.color, size: 1, maxHp: 20, sheet: defaultCharacterSheet() };
}

// ---- Sanitizing ----

function whole(value, min, max, fallback) {
  if (value == null || value === '') return fallback;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function text(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

// One row of a list on the sheet (an attack, a thing in the Bag, a spell):
// its plain values only, whatever fields the catalog gave it.
function cleanRow(raw) {
  const row = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return row;
  for (const [key, value] of Object.entries(raw).slice(0, MAX_ROW_FIELDS)) {
    if (key === '__proto__' || key.length > 40) continue;
    if (typeof value === 'string') row[key] = value.slice(0, MAX_TEXT);
    else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) row[key] = value;
  }
  return row;
}

function rows(value, max) {
  return Array.isArray(value) ? value.slice(0, max).map(cleanRow) : [];
}

// The Bag and Spells tabs find a row by its id, so every row has one of its own.
function withIds(list, prefix) {
  const seen = new Set();
  return list.map((row, i) => {
    let id = text(row.id, 60);
    if (!id || seen.has(id)) id = `${prefix}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`;
    seen.add(id);
    return { ...row, id };
  });
}

// A sheet rebuilt from whatever was handed in: every field the app knows,
// within bounds, and nothing else. A premade hero starts with no death saves.
export function sanitizeSheet(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const abilities = Object.fromEntries(ABILITIES.map((a) => [a.key, whole(src.abilities?.[a.key], 1, 30, 10)]));
  const check = (entry, abilityKey) => {
    const { proficient, value } = normalizeCheckEntry(entry, abilityModifier(abilities[abilityKey]));
    return { proficient, value: whole(value, -99, 99, 0) };
  };
  const bag = (list) =>
    withIds(rows(list, MAX_BAG_ROWS), 'item').map((it) => ({ ...it, name: text(it.name, MAX_NAME), qty: whole(it.qty, 0, 9999, 1) }));
  // Each half of the Bag on its own, so one that is broken doesn't cost the other.
  const equipment = src.equipment && typeof src.equipment === 'object' ? src.equipment : normalizeEquipment(src.equipment);
  const currency = normalizeCurrency(src);
  const casting = normalizeSpellcasting(src.spellcasting);

  return {
    level: whole(src.level, 1, 20, 1),
    armorClass: whole(src.armorClass, 0, 99, 10),
    initiative: whole(src.initiative, -99, 99, 0),
    speed: whole(src.speed, 0, 999, 30),
    deathSaves: { successes: 0, failures: 0 },
    proficiencyBonus: whole(src.proficiencyBonus, -99, 99, 2),
    abilities,
    savingThrows: Object.fromEntries(ABILITIES.map((a) => [a.key, check(src.savingThrows?.[a.key], a.key)])),
    skills: Object.fromEntries(SKILLS.map((s) => [s.key, check(src.skills?.[s.key], s.ability)])),
    attacks: rows(src.attacks, MAX_ATTACKS).map((a) => ({
      ...a,
      weaponName: text(a.weaponName, MAX_NAME),
      additionalModifier: whole(a.additionalModifier, -99, 99, 0),
      additionalDamage: whole(a.additionalDamage, -99, 99, 0),
    })),
    equipment: { gear: bag(equipment.gear), other: bag(equipment.other) },
    currency: Object.fromEntries(CURRENCIES.map((c) => [c.key, whole(currency[c.key], 0, 99999999, 0)])),
    spellcasting: {
      class: text(casting.class, MAX_NAME),
      ability: ABILITIES.some((a) => a.key === casting.ability) ? casting.ability : '',
      saveDC: whole(casting.saveDC, 0, 99, 0),
      attackBonus: whole(casting.attackBonus, -99, 99, 0),
      levels: Object.fromEntries(
        SPELL_LEVELS.map((lvl) => {
          const level = casting.levels[lvl] || {};
          const slotsTotal = whole(level.slotsTotal, 0, 99, 0);
          return [
            lvl,
            {
              slotsTotal,
              slotsExpended: whole(level.slotsExpended, 0, slotsTotal, 0),
              spells: withIds(rows(level.spells, MAX_SPELLS), 'spell').map((s) => ({ ...s, name: text(s.name, MAX_NAME), prepared: !!s.prepared })),
            },
          ];
        })
      ),
    },
  };
}

// A hero rebuilt from a file's (or a message's, or storage's) `hero`, or null
// when there is nothing to rebuild. Its picture is a built-in one unless the
// caller says which other kinds it takes:
//   dataImages: a picture's own data URL (a file, this browser's storage)
//   imageRefs:  a picture's fingerprint, `img:<sha-256>` (another browser's offer)
// Anything else falls back to the first default hero's picture.
export function sanitizeHero(raw, { dataImages = false, imageRefs = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const fallback = DEFAULT_HEROES[0];
  const image = typeof raw.image === 'string' ? raw.image : typeof raw.imageUrl === 'string' ? raw.imageUrl : '';
  const imageUrl =
    iconUrlForRef(image) ||
    (iconRefForUrl(image) ? image : null) ||
    (imageRefs && isImageRef(image) ? image : null) ||
    (dataImages && DATA_IMAGE_RE.test(image) ? image : null);
  return {
    name: text(raw.name, 60).trim() || 'New hero',
    imageUrl: imageUrl || fallback.imageUrl,
    color: COLOR_RE.test(raw.color || '') ? raw.color : fallback.color,
    size: whole(raw.size, 1, 4, 1),
    maxHp: whole(raw.maxHp, 1, 9999, 20),
    sheet: sanitizeSheet(raw.sheet),
  };
}

// ---- The file ----

// The hero as a file (or a message) carries it: a built-in picture goes by its
// short reference, not by its drawing.
function heroToFile(hero) {
  return {
    name: hero.name,
    image: iconRefForUrl(hero.imageUrl) || hero.imageUrl,
    color: hero.color,
    size: hero.size,
    maxHp: hero.maxHp,
    sheet: hero.sheet,
  };
}

export function heroFileName(hero) {
  return `${slugify(hero.name || '') || 'hero'}${HERO_FILE_EXTENSION}`;
}

export function downloadHeroFile(hero) {
  const blob = new Blob([JSON.stringify({ format: FORMAT, version: VERSION, hero: heroToFile(hero) })], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = heroFileName(hero);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Reads a .tlsbyd file: { hero, pictureError }. A picture the file brought
// along is redrawn at token size and scored by the picture filter, like one
// picked from disk; when that fails the hero still loads, with the default
// picture, and `pictureError` says why (lib/imageSafety.js's imageErrorMessage).
// Rejects with a HeroFileError when the file is not a hero at all.
export async function readHeroFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new HeroFileError('That file is too large to be a hero.');
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new HeroFileError(`That is not a hero file. Pick a ${HERO_FILE_EXTENSION} file exported from the Characters screen.`);
  }
  if (parsed?.format !== FORMAT) throw new HeroFileError(`That is not a hero file. Pick a ${HERO_FILE_EXTENSION} file exported from the Characters screen.`);
  if (typeof parsed.version === 'number' && parsed.version > VERSION) {
    throw new HeroFileError('That hero was saved by a newer version of the app. Reload this page and try again.');
  }
  const hero = sanitizeHero(parsed.hero, { dataImages: true });
  if (!hero) throw new HeroFileError('That hero file is empty.');
  if (iconRefForUrl(hero.imageUrl)) return { hero, pictureError: null };
  try {
    const blob = await (await fetch(hero.imageUrl)).blob();
    return { hero: { ...hero, imageUrl: await resizeImageToDataUrl(blob, HERO_IMAGE_MAX_DIM) }, pictureError: null };
  } catch (err) {
    return { hero: { ...hero, imageUrl: DEFAULT_HEROES[0].imageUrl }, pictureError: err };
  }
}

// ---- The hero being worked on, kept in this browser between visits ----

export function loadHeroDraft() {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? sanitizeHero(JSON.parse(raw), { dataImages: true }) : null;
  } catch {
    return null;
  }
}

export function saveHeroDraft(hero) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(heroToFile(hero)));
  } catch {
    // storage blocked or full: the hero just won't survive closing the page
  }
}

// ---- Onto a table ----

// What GameView.jsx's addEntity takes to stand the hero on the map, played by
// `ownerId` (a seated player's id) or by nobody yet.
export function heroTokenDraft(hero, ownerId = null) {
  return { kind: 'hero', name: hero.name, imageUrl: hero.imageUrl, color: hero.color, size: hero.size, maxHp: hero.maxHp, sheet: hero.sheet, ownerId };
}

// The hero as a player offers it to the DM over the table's channel, or null
// when its sheet is too long for one message. An added picture must already
// be a fingerprint by then (imageCache.js's storeImage): the DM's browser
// asks for its bytes like any other shared picture.
export function heroOfferPayload(hero) {
  const payload = heroToFile(hero);
  return JSON.stringify(payload).length > MAX_OFFER_CHARS ? null : payload;
}

// The hero in an offer the DM's browser received, or null.
export function heroFromOffer(payload) {
  try {
    if (JSON.stringify(payload).length > MAX_OFFER_CHARS) return null;
  } catch {
    return null;
  }
  return sanitizeHero(payload, { imageRefs: true });
}
