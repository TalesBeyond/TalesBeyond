// Shopkeeper NPCs: an NPC token (data/tokenKinds.js) that also keeps a shop.
// The DM stocks the shop as the token is placed and from its card afterward;
// a player buys from it into their own hero.
//
// The shop sits on the token itself, where every player can read it:
//   shop: { role, wares: [{ id, name, price, source, meta, description?, spellLevel? }] }
// `role` is one of MERCHANTS below and decides which compendiums it stocks
// from. `price` is in whole gold pieces, the DM's to change, and is what a
// sale takes from the hero's gold. `source` is the compendium a ware came
// from ('maps' and 'custom' are written by the DM). Only a ware the DM wrote
// carries its own `description`; the rest are read from their compendium by
// name when shown (wareDescription), so a long tome is never copied into
// every shop that sells it.
//
// A plain NPC has no `shop`.
//
// A Potion Brewer and a Food Salesman also make what they sell: a hero
// carrying everything in a recipe (data/potions.js, data/foods.js) can have
// it made for no gold (sheetAfterMaking below).

import { normalizeCurrency, normalizeEquipment, normalizeSpellcasting, newEquipmentItem, newSpellEntry } from './characterSheet.js';
import { spellLevelLabel } from './spells.js';
import { INGREDIENT_CATEGORY } from './potions.js';

// `sources`: the compendiums the shop is stocked from, in the order its
// editor lists them. The cartographer has none: every map is the DM's own.
// `thing`: what one custom ware is called in that shop's editor.
// `makes`: it makes what it sells from the buyer's own ingredients too;
// `verb` is on the button, `done` what the buyer is told afterwards.
export const MERCHANTS = [
  { key: 'weapons', name: 'Weapon Salesman', icon: 'anvil', color: '#6b2a22', sources: ['weapons'], thing: 'weapon', blurb: 'Sells weapons from the Weapons Compendium.' },
  { key: 'tomes', name: 'Librarian', icon: 'book', color: '#3d4f6b', sources: ['tomes'], thing: 'tome', blurb: 'Sells books from the Tomes chapter, your own included.' },
  { key: 'food', name: 'Food Salesman', icon: 'mug', color: '#8a5a2b', sources: ['foods'], thing: 'dish', makes: { verb: 'Make', done: 'Made' }, blurb: 'Sells food and drink, your own included, and makes a dish for a hero who brings its ingredients.' },
  { key: 'spells', name: 'Wizard', icon: 'hat', color: '#4a3a7a', sources: ['spells'], thing: 'spell', blurb: 'Teaches spells from the Spells chapter, your own included.' },
  { key: 'wandering', name: 'Wandering Salesman', icon: 'pack', color: '#45573f', sources: ['weapons', 'items', 'tomes', 'foods', 'spells', 'potions', 'ingredients'], thing: 'item', blurb: 'Sells anything, from any chapter of the compendium.' },
  { key: 'potions', name: 'Potion Brewer', icon: 'flask', color: '#7a2f55', sources: ['potions'], thing: 'potion', makes: { verb: 'Brew', done: 'Brewed' }, blurb: 'Sells potions, elixirs, magic potions and venoms, your own included, and brews one for a hero who brings its ingredients.' },
  { key: 'maps', name: 'Cartographer', icon: 'map', color: '#2f6a66', sources: [], thing: 'map', blurb: 'Sells only maps, which you write yourself.' },
];

// What each source is called, and which half of the Bag a ware from it lands
// in ('gear' is Weapons & gear, 'other' is Other items). A spell goes to the
// Spells tab instead. `keepsText`: the buyer keeps its description to read.
// 'ingredients' is what potions and dishes are made from: the reagents of
// the Potions chapter (data/potions.js) and the larder of Food & Drink
// (data/foods.js) together.
export const WARE_SOURCES = {
  weapons: { label: 'Weapons', bag: 'gear' },
  items: { label: 'Items', bag: 'gear' },
  tomes: { label: 'Tomes', bag: 'other', keepsText: true },
  foods: { label: 'Food & drink', bag: 'other' },
  spells: { label: 'Spells' },
  potions: { label: 'Potions', bag: 'other', keepsText: true },
  ingredients: { label: 'Ingredients', bag: 'other', keepsText: true },
  maps: { label: 'Maps', bag: 'other', keepsText: true },
  custom: { label: 'Custom', bag: 'other', keepsText: true },
};

// Whether something from that source lands under Other items in the Bag (a
// chest remembers the source of what it holds for this, see
// ChestContentsEditor.jsx).
export function landsInOtherItems(source) {
  return WARE_SOURCES[source]?.bag === 'other';
}

export const MAX_SHOP_WARES = 60;
// The longest description the DM can type onto a ware of their own.
export const WARE_TEXT_MAX = 600;

export function merchantRole(entity) {
  const role = entity?.shop?.role;
  return (role && MERCHANTS.find((m) => m.key === role)) || null;
}

export function isMerchant(entity) {
  return entity?.kind === 'npc' && Boolean(merchantRole(entity));
}

export function shopWares(entity) {
  return entity?.shop?.wares || [];
}

// A compendium price as a shop charges it: whole gold, rounded up, never
// free. The same rounding the compendium's own Buy uses (Toolbar.jsx).
export function shopPrice(cost) {
  return Math.max(1, Math.ceil(Number(cost) || 0));
}

// What a ware costs at the counter. The DM may set it to 0 to give it away.
export function warePrice(ware) {
  return Math.max(0, Math.round(Number(ware?.price) || 0));
}

export function newWare(overrides = {}) {
  return {
    id: `ware_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    price: 1,
    source: 'custom',
    meta: '',
    ...overrides,
  };
}

function diceLabel(w) {
  const mod = w.modifier ? (w.modifier > 0 ? `+${w.modifier}` : `${w.modifier}`) : '';
  return `${w.numberOfDice}${w.diceType}${mod}`;
}

// The short line under a ware's name.
export function wareMeta(source, entry) {
  switch (source) {
    case 'weapons':
      return `${diceLabel(entry)} · ${entry.type}`;
    case 'tomes':
      return entry.author ? `${entry.category} · ${entry.author}` : entry.category;
    case 'spells':
      return `${spellLevelLabel(entry.level)} · ${entry.school}`;
    default:
      return entry.category || '';
  }
}

// Everything a shop can stock from one compendium: the app's own entries,
// then this table's (Toolbar.jsx's Asset Storage). `catalog` is
// lib/catalog.js's; `customAssets` is the table state's. A table's own
// ingredient is saved as a 'food' or a 'potion' of the kind Ingredient, and
// is listed with the ingredients, not with what is made from them.
export function sourceEntries(source, catalog, customAssets) {
  const own = (assetType) =>
    Object.values(customAssets || {})
      .filter((asset) => asset.assetType === assetType)
      .map((asset) => asset.data);
  const isIngredient = (entry) => entry.category === INGREDIENT_CATEGORY;
  const made = (assetType) => own(assetType).filter((entry) => !isIngredient(entry));
  switch (source) {
    case 'weapons':
      return [...catalog.weapons, ...own('weapon')];
    case 'items':
      return [...catalog.items, ...own('item')];
    case 'tomes':
      return [...catalog.tomes, ...own('tome')];
    case 'foods':
      return [...catalog.foods, ...made('food')];
    case 'spells':
      return [...catalog.spells, ...own('spell')];
    case 'potions':
      return [...catalog.potions, ...made('potion')];
    case 'ingredients':
      return [...catalog.ingredients, ...catalog.foodIngredients, ...[...own('potion'), ...own('food')].filter(isIngredient)];
    default:
      return [];
  }
}

export function wareFromEntry(source, entry) {
  return newWare({
    name: entry.name,
    price: shopPrice(entry.cost),
    source,
    meta: wareMeta(source, entry),
    ...(source === 'spells' ? { spellLevel: entry.level } : {}),
  });
}

export function wareDescription(ware, catalog, customAssets) {
  if (ware.description) return ware.description;
  return sourceEntries(ware.source, catalog, customAssets).find((entry) => entry.name === ware.name)?.description || '';
}

// ---- Handing something to a hero ----
//
// "Goods" are one thing on its way onto a hero's sheet, from a shop's counter
// or from the compendium's Give and Buy:
//   { name, bag: 'gear' | 'other', spellLevel?, description? }

export function entryGoods(source, entry) {
  const kind = WARE_SOURCES[source] || WARE_SOURCES.custom;
  return {
    name: entry.name,
    bag: kind.bag || 'other',
    spellLevel: source === 'spells' ? entry.level ?? 0 : undefined,
    description: kind.keepsText ? entry.description || '' : '',
  };
}

export function wareGoods(ware, description) {
  return entryGoods(ware.source, { name: ware.name, level: ware.spellLevel, description });
}

export function knowsSpell(sheet, goods) {
  if (goods.spellLevel == null) return false;
  const name = goods.name.trim().toLowerCase();
  return normalizeSpellcasting(sheet?.spellcasting).levels[goods.spellLevel].spells.some((s) => (s.name || '').trim().toLowerCase() === name);
}

// The sheet once the hero has the goods. A spell is written into the Spells
// tab at its level, once. Anything else goes in the Bag, and a second one of
// the same name adds to the stack.
export function sheetWithGoods(sheet, goods) {
  if (goods.spellLevel != null) {
    if (knowsSpell(sheet, goods)) return sheet;
    const spellcasting = normalizeSpellcasting(sheet.spellcasting);
    const level = spellcasting.levels[goods.spellLevel];
    const spells = [...level.spells, { ...newSpellEntry(), name: goods.name }];
    return { ...sheet, spellcasting: { ...spellcasting, levels: { ...spellcasting.levels, [goods.spellLevel]: { ...level, spells } } } };
  }
  const equipment = normalizeEquipment(sheet.equipment);
  const key = goods.bag === 'gear' ? 'gear' : 'other';
  const held = equipment[key].find((it) => it.name === goods.name);
  const list = held
    ? equipment[key].map((it) => (it === held ? { ...it, qty: (it.qty || 0) + 1 } : it))
    : [...equipment[key], { ...newEquipmentItem(), name: goods.name, ...(goods.description ? { description: goods.description } : {}) }];
  return { ...sheet, equipment: { ...equipment, [key]: list } };
}

export function goldOf(sheet) {
  return normalizeCurrency(sheet).gold;
}

// The sheet once the hero has paid for a ware and taken it, or null when it
// hasn't the gold. `description` is the ware's (wareDescription).
export function sheetAfterPurchase(sheet, ware, description) {
  const currency = normalizeCurrency(sheet);
  const price = warePrice(ware);
  if (currency.gold < price) return null;
  return { ...sheetWithGoods(sheet, wareGoods(ware, description)), currency: { ...currency, gold: currency.gold - price } };
}

// ---- Making (the Potion Brewer, the Food Salesman) ----

// What a ware is made from: the recipe of the potion or dish of that name in
// its chapter, this table's own included, or [] for anything else (a ware
// typed straight onto the shelves has none, and nor does an apple).
export function wareRecipe(ware, catalog, customAssets) {
  if (ware?.source !== 'potions' && ware?.source !== 'foods') return [];
  return sourceEntries(ware.source, catalog, customAssets).find((entry) => entry.name === ware.name)?.recipe || [];
}

// The most ingredients one recipe may name (Asset Storage's recipe editor).
export const RECIPE_MAX_PARTS = 8;

// A recipe as typed, made fit to save: names trimmed, blanks dropped, the same
// ingredient named twice added up, quantities whole and at least 1.
export function cleanRecipe(parts) {
  const recipe = [];
  for (const part of parts || []) {
    const name = (part.name || '').trim().slice(0, 60);
    if (!name) continue;
    const qty = Math.min(99, Math.max(1, Math.round(Number(part.qty) || 1)));
    const held = recipe.find((it) => it.name.toLowerCase() === name.toLowerCase());
    if (held) held.qty = Math.min(99, held.qty + qty);
    else recipe.push({ name, qty });
  }
  return recipe.slice(0, RECIPE_MAX_PARTS);
}

// The things in `entries` (potions, dishes) that something goes into, by
// name.
export function recipesUsing(name, entries) {
  return entries.filter((entry) => (entry.recipe || []).some((part) => part.name === name)).map((entry) => entry.name);
}

function sameName(a, b) {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

// How many of something a hero carries, in both halves of the Bag.
export function bagCount(sheet, name) {
  const equipment = normalizeEquipment(sheet?.equipment);
  return [...equipment.gear, ...equipment.other].reduce((sum, it) => (sameName(it.name, name) ? sum + Math.max(0, Number(it.qty) || 0) : sum), 0);
}

export function hasIngredients(sheet, recipe) {
  return recipe.length > 0 && recipe.every((part) => bagCount(sheet, part.name) >= part.qty);
}

// The sheet once the recipe's ingredients are out of the Bag and what they
// make is in it, or null when the hero is short of one. No gold changes hands.
// `description` is the ware's (wareDescription).
export function sheetAfterMaking(sheet, ware, recipe, description) {
  if (!hasIngredients(sheet, recipe)) return null;
  let equipment = normalizeEquipment(sheet.equipment);
  for (const part of recipe) {
    let owed = part.qty;
    // A stack used up leaves the Bag; one only dipped into keeps the rest.
    const take = (list) =>
      list.flatMap((it) => {
        const held = Math.max(0, Number(it.qty) || 0);
        if (!owed || !held || !sameName(it.name, part.name)) return [it];
        const used = Math.min(owed, held);
        owed -= used;
        return used === held ? [] : [{ ...it, qty: held - used }];
      });
    const other = take(equipment.other);
    equipment = { ...equipment, other, gear: take(equipment.gear) };
  }
  return sheetWithGoods({ ...sheet, equipment }, wareGoods(ware, description));
}
