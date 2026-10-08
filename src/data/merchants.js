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

import { normalizeCurrency, normalizeEquipment, normalizeSpellcasting, newEquipmentItem, newSpellEntry } from './characterSheet.js';
import { spellLevelLabel } from './spells.js';

// `sources`: the compendiums the shop is stocked from, in the order its
// editor lists them. The cartographer has none: every map is the DM's own.
// `thing`: what one custom ware is called in that shop's editor.
export const MERCHANTS = [
  { key: 'weapons', name: 'Weapon Salesman', icon: 'anvil', color: '#6b2a22', sources: ['weapons'], thing: 'weapon', blurb: 'Sells weapons from the Weapons Compendium.' },
  { key: 'tomes', name: 'Librarian', icon: 'book', color: '#3d4f6b', sources: ['tomes'], thing: 'tome', blurb: 'Sells books from the Tomes chapter, your own included.' },
  { key: 'food', name: 'Food Salesman', icon: 'mug', color: '#8a5a2b', sources: ['foods'], thing: 'dish', blurb: 'Sells food and drink.' },
  { key: 'spells', name: 'Wizard', icon: 'hat', color: '#4a3a7a', sources: ['spells'], thing: 'spell', blurb: 'Teaches spells from the Spells chapter.' },
  { key: 'wandering', name: 'Wandering Salesman', icon: 'pack', color: '#45573f', sources: ['weapons', 'items', 'tomes', 'foods', 'spells'], thing: 'item', blurb: 'Sells anything, from any chapter of the compendium.' },
  { key: 'maps', name: 'Cartographer', icon: 'map', color: '#2f6a66', sources: [], thing: 'map', blurb: 'Sells only maps, which you write yourself.' },
];

// What each source is called, and which half of the Bag a ware from it lands
// in ('gear' is Weapons & gear, 'other' is Other items). A spell goes to the
// Spells tab instead. `keepsText`: the buyer keeps its description to read.
export const WARE_SOURCES = {
  weapons: { label: 'Weapons', bag: 'gear' },
  items: { label: 'Items', bag: 'gear' },
  tomes: { label: 'Tomes', bag: 'other', keepsText: true },
  foods: { label: 'Food & drink', bag: 'other' },
  spells: { label: 'Spells' },
  maps: { label: 'Maps', bag: 'other', keepsText: true },
  custom: { label: 'Custom', bag: 'other', keepsText: true },
};

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
// lib/catalog.js's; `customAssets` is the table state's.
export function sourceEntries(source, catalog, customAssets) {
  const own = (assetType) =>
    Object.values(customAssets || {})
      .filter((asset) => asset.assetType === assetType)
      .map((asset) => asset.data);
  switch (source) {
    case 'weapons':
      return [...catalog.weapons, ...own('weapon')];
    case 'items':
      return [...catalog.items, ...own('item')];
    case 'tomes':
      return [...catalog.tomes, ...own('tome')];
    case 'foods':
      return catalog.foods;
    case 'spells':
      return catalog.spells;
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
