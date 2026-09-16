// Chest capacity tiers — a "slot" is one item entry (name + quantity), not
// one physical unit, so "Ammo x12" fills a single small-chest slot just as
// "Greatsword x2" would.

export const CHEST_SIZES = [
  { key: 'small', label: 'Small', slots: 1 },
  { key: 'medium', label: 'Medium', slots: 5 },
  { key: 'large', label: 'Large', slots: 8 },
  { key: 'xlarge', label: 'Extra Large', slots: 12 },
];

export function chestSlotCount(chestSize) {
  return CHEST_SIZES.find((s) => s.key === chestSize)?.slots ?? 1;
}

// One item sitting inside a chest. Whether it came from the weapon
// compendium, the item compendium, or was hand-typed, it always ends up in
// this same shape — the weapon compendium's fields (dice/modifier) plus
// the item compendium's (cost), so a custom entry can describe either kind
// of thing without needing a separate schema.
export function newChestItem(overrides = {}) {
  return {
    id: `chestitem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    qty: 1,
    cost: 0,
    numberOfDice: 0,
    diceType: null,
    modifier: 0,
    ...overrides,
  };
}
