// Mock weapon database (100 entries). Built from the 37 canonical D&D 5e
// PHB weapons (real damage dice + a simplified, roughly-accurate class
// proficiency mapping), each also present as a "+1" magic variant, and a
// subset as a "+2" variant, to reach exactly 100 rows deterministically
// (37 base + 37 +1 + 26 +2 = 100) rather than hand-authoring 100 one-offs.
//
// RightPanel.jsx's Battle Equipment tab matches a bag item's name against
// this catalog to find its combat dice — see weaponStatsFor there.

export const WEAPON_TYPES = ['melee', 'ranged'];

export const DICE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12'];

export const CLASSES = [
  'barbarian',
  'bard',
  'cleric',
  'druid',
  'fighter',
  'monk',
  'paladin',
  'ranger',
  'rogue',
  'sorcerer',
  'warlock',
  'wizard',
];

// Simplified proficiency groups (not a 100%-precise ruling for every
// class/subclass feature, e.g. College of Swords Bard or War Cleric — good
// enough for mock data).
const ALL_CLASSES = CLASSES;
const SIMPLE_ONLY = ALL_CLASSES.filter((c) => c !== 'sorcerer' && c !== 'wizard');
const MARTIAL_CORE = ['barbarian', 'fighter', 'paladin', 'ranger'];
const FINESSE_ADD = ['rogue', 'bard'];

// cost is in gold pieces (gp), the real PHB purchase price — magic (+1/+2)
// variants keep the same cost as their mundane base (this mock economy
// doesn't model magic-item pricing).
const BASE_WEAPONS = [
  // ---- Simple melee ----
  { type: 'melee', name: 'Club', numberOfDice: 1, diceType: 'd4', cost: 0.1, equipableClass: ALL_CLASSES },
  { type: 'melee', name: 'Dagger', numberOfDice: 1, diceType: 'd4', cost: 2, equipableClass: ALL_CLASSES },
  { type: 'melee', name: 'Greatclub', numberOfDice: 1, diceType: 'd8', cost: 0.2, equipableClass: SIMPLE_ONLY },
  { type: 'melee', name: 'Handaxe', numberOfDice: 1, diceType: 'd6', cost: 5, equipableClass: SIMPLE_ONLY },
  { type: 'melee', name: 'Javelin', numberOfDice: 1, diceType: 'd6', cost: 0.5, equipableClass: SIMPLE_ONLY },
  { type: 'melee', name: 'Light Hammer', numberOfDice: 1, diceType: 'd4', cost: 2, equipableClass: SIMPLE_ONLY },
  { type: 'melee', name: 'Mace', numberOfDice: 1, diceType: 'd6', cost: 5, equipableClass: SIMPLE_ONLY },
  { type: 'melee', name: 'Quarterstaff', numberOfDice: 1, diceType: 'd6', cost: 0.2, equipableClass: ALL_CLASSES },
  { type: 'melee', name: 'Sickle', numberOfDice: 1, diceType: 'd4', cost: 1, equipableClass: SIMPLE_ONLY },
  { type: 'melee', name: 'Spear', numberOfDice: 1, diceType: 'd6', cost: 1, equipableClass: SIMPLE_ONLY },

  // ---- Simple ranged ----
  { type: 'ranged', name: 'Light Crossbow', numberOfDice: 1, diceType: 'd8', cost: 25, equipableClass: ALL_CLASSES },
  { type: 'ranged', name: 'Dart', numberOfDice: 1, diceType: 'd4', cost: 0.05, equipableClass: ALL_CLASSES },
  { type: 'ranged', name: 'Shortbow', numberOfDice: 1, diceType: 'd6', cost: 25, equipableClass: SIMPLE_ONLY },
  { type: 'ranged', name: 'Sling', numberOfDice: 1, diceType: 'd4', cost: 0.1, equipableClass: ALL_CLASSES },

  // ---- Martial melee ----
  { type: 'melee', name: 'Battleaxe', numberOfDice: 1, diceType: 'd8', cost: 10, equipableClass: MARTIAL_CORE },
  { type: 'melee', name: 'Flail', numberOfDice: 1, diceType: 'd8', cost: 10, equipableClass: MARTIAL_CORE },
  { type: 'melee', name: 'Glaive', numberOfDice: 1, diceType: 'd10', cost: 20, equipableClass: MARTIAL_CORE },
  { type: 'melee', name: 'Greataxe', numberOfDice: 1, diceType: 'd12', cost: 30, equipableClass: MARTIAL_CORE },
  { type: 'melee', name: 'Greatsword', numberOfDice: 2, diceType: 'd6', cost: 50, equipableClass: MARTIAL_CORE },
  { type: 'melee', name: 'Halberd', numberOfDice: 1, diceType: 'd10', cost: 20, equipableClass: MARTIAL_CORE },
  { type: 'melee', name: 'Lance', numberOfDice: 1, diceType: 'd12', cost: 10, equipableClass: ['fighter', 'paladin', 'ranger'] },
  { type: 'melee', name: 'Longsword', numberOfDice: 1, diceType: 'd8', cost: 15, equipableClass: [...MARTIAL_CORE, 'bard'] },
  { type: 'melee', name: 'Maul', numberOfDice: 2, diceType: 'd6', cost: 10, equipableClass: MARTIAL_CORE },
  { type: 'melee', name: 'Morningstar', numberOfDice: 1, diceType: 'd8', cost: 15, equipableClass: MARTIAL_CORE },
  { type: 'melee', name: 'Pike', numberOfDice: 1, diceType: 'd10', cost: 5, equipableClass: MARTIAL_CORE },
  { type: 'melee', name: 'Rapier', numberOfDice: 1, diceType: 'd8', cost: 25, equipableClass: [...MARTIAL_CORE, ...FINESSE_ADD] },
  { type: 'melee', name: 'Scimitar', numberOfDice: 1, diceType: 'd6', cost: 25, equipableClass: [...MARTIAL_CORE, ...FINESSE_ADD] },
  { type: 'melee', name: 'Shortsword', numberOfDice: 1, diceType: 'd6', cost: 10, equipableClass: [...MARTIAL_CORE, ...FINESSE_ADD, 'monk'] },
  { type: 'melee', name: 'Trident', numberOfDice: 1, diceType: 'd6', cost: 5, equipableClass: MARTIAL_CORE },
  { type: 'melee', name: 'War Pick', numberOfDice: 1, diceType: 'd8', cost: 5, equipableClass: MARTIAL_CORE },
  { type: 'melee', name: 'Warhammer', numberOfDice: 1, diceType: 'd8', cost: 15, equipableClass: MARTIAL_CORE },
  { type: 'melee', name: 'Whip', numberOfDice: 1, diceType: 'd4', cost: 2, equipableClass: [...MARTIAL_CORE, ...FINESSE_ADD] },

  // ---- Martial ranged ----
  { type: 'ranged', name: 'Blowgun', numberOfDice: 1, diceType: 'd4', cost: 10, equipableClass: ['fighter', 'ranger', 'rogue'] },
  { type: 'ranged', name: 'Hand Crossbow', numberOfDice: 1, diceType: 'd6', cost: 75, equipableClass: ['fighter', 'ranger', 'rogue', 'bard'] },
  { type: 'ranged', name: 'Heavy Crossbow', numberOfDice: 1, diceType: 'd10', cost: 50, equipableClass: ['fighter', 'ranger'] },
  { type: 'ranged', name: 'Longbow', numberOfDice: 1, diceType: 'd8', cost: 50, equipableClass: ['fighter', 'ranger'] },
  { type: 'ranged', name: 'Net', numberOfDice: 1, diceType: 'd4', cost: 1, equipableClass: ['fighter', 'ranger', 'rogue'] },
];

// Exported so a DM's custom weapon (Toolbar.jsx's Asset Storage) can compute
// the same `damage` figure this catalog uses for its own entries.
export function averageDamage(numberOfDice, diceType, modifier) {
  const sides = parseInt(diceType.slice(1), 10);
  const avgPerDie = (sides + 1) / 2;
  return Math.round((numberOfDice * avgPerDie + modifier) * 10) / 10;
}

function withModifier(base, modifier) {
  return {
    type: base.type,
    name: modifier > 0 ? `+${modifier} ${base.name}` : base.name,
    numberOfDice: base.numberOfDice,
    diceType: base.diceType,
    modifier,
    damage: averageDamage(base.numberOfDice, base.diceType, modifier),
    cost: base.cost,
    equipableClass: base.equipableClass,
  };
}

const mundane = BASE_WEAPONS.map((w) => withModifier(w, 0));
const plusOne = BASE_WEAPONS.map((w) => withModifier(w, 1));
const plusTwo = BASE_WEAPONS.slice(0, 26).map((w) => withModifier(w, 2)); // 37 + 37 + 26 = 100

export const WEAPONS = [...mundane, ...plusOne, ...plusTwo];
