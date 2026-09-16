// Starter "droppable loot" seeded onto each of our six default monster
// tokens (defaultTokens.js's DEFAULT_MOBS) the moment one is placed. The
// PHB itself doesn't publish monster loot tables (that's the DMG/Monster
// Manual's job) — these are flavor-appropriate picks built from the PHB
// weapon/equipment prices already in weapons.js/items.js, plus a few
// hand-priced trophy items for beasts and monsters that don't wield PHB
// gear. Every entry uses the same shape as a chest item (see chests.js)
// plus a dropChance percentage, so the same dice/modifier/cost rules from
// the weapon and item compendiums apply — the DM can freely edit, remove,
// or add more via the Droppables section on a mob's inspector card.

let counter = 0;
export function newDroppableItem(overrides = {}) {
  counter += 1;
  return {
    id: `drop_${Date.now()}_${counter}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    qty: 1,
    cost: 0,
    numberOfDice: 0,
    diceType: null,
    modifier: 0,
    dropChance: 50,
    ...overrides,
  };
}

export const DEFAULT_MOB_DROPPABLES = {
  goblin: [
    { name: 'Scimitar', numberOfDice: 1, diceType: 'd6', modifier: 0, cost: 25, dropChance: 45 },
    { name: 'Shortbow', numberOfDice: 1, diceType: 'd6', modifier: 0, cost: 25, dropChance: 30 },
    { name: 'Gold Pieces', qty: 3, cost: 1, dropChance: 60 },
  ],
  skeleton: [
    { name: 'Shortsword', numberOfDice: 1, diceType: 'd6', modifier: 0, cost: 10, dropChance: 40 },
    { name: 'Shortbow', numberOfDice: 1, diceType: 'd6', modifier: 0, cost: 25, dropChance: 25 },
  ],
  orc: [
    { name: 'Greataxe', numberOfDice: 1, diceType: 'd12', modifier: 0, cost: 30, dropChance: 40 },
    { name: 'Javelin', qty: 2, numberOfDice: 1, diceType: 'd6', modifier: 0, cost: 0.5, dropChance: 55 },
  ],
  wolf: [
    { name: 'Wolf Pelt', cost: 2, dropChance: 50 },
    { name: 'Wolf Fang', cost: 1, dropChance: 35 },
  ],
  dragon: [
    { name: 'Gold Hoard', cost: 250, dropChance: 70 },
    { name: 'Uncut Gemstone', cost: 100, dropChance: 40 },
  ],
  beholder: [
    { name: 'Preserved Eyestalk', cost: 150, dropChance: 30 },
    { name: 'Spellbook', cost: 50, dropChance: 20 },
  ],
};

export function defaultDroppablesFor(mobKey) {
  const table = DEFAULT_MOB_DROPPABLES[mobKey];
  if (!table) return [];
  return table.map((entry) => newDroppableItem(entry));
}

// A dropChance of N% drops on a d20 roll of N/5 or lower (each face is a
// flat 5%), so 100% always drops (threshold 20) and 0% never does
// (threshold 0) — a d20-flavored stand-in for a percentile roll, matching
// this app's other rolls (attacks, dice tray) which are always d-something.
export function dropThreshold(dropChance) {
  return Math.round((Math.max(0, Math.min(100, dropChance)) / 100) * 20);
}
