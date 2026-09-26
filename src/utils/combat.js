import { getCatalog } from '../lib/catalog.js';

// Attack math shared by the hero sheet's Battle Equipment tab (RightPanel.jsx)
// and the inspector's creature card (CreatureCard.jsx), so the attack preview
// always agrees with what a real roll would do.

export function totalToHit(weapon, additionalModifier) {
  return (weapon.modifier || 0) + (additionalModifier || 0);
}

export function totalDamageLabel(weapon, additionalDamage) {
  const flat = (weapon.modifier || 0) + (additionalDamage || 0);
  const mod = flat !== 0 ? (flat > 0 ? `+${flat}` : `${flat}`) : '';
  return `${weapon.numberOfDice}${weapon.diceType}${mod}`;
}

export function rollDie(sides) {
  return 1 + Math.floor(Math.random() * sides);
}

// A hero's AC lives on its sheet; a monster's on the entity itself.
export function acOf(target) {
  return target.kind === 'hero' ? target.sheet?.armorClass ?? 10 : target.armorClass ?? 10;
}

// Battle Equipment only offers weapons the hero already carries (Bag's
// "Weapons & gear" list), never a fixed catalog — see PITFALLS.md #1. A
// bag item's name is matched against the weapon catalog for real combat
// dice; a homebrew name with no catalog match still equips, just with a
// plain 1d4/no-modifier baseline the player can tune via Mod/Dmg.
export function weaponStatsFor(name) {
  const match = getCatalog().weapons.find((w) => w.name.toLowerCase() === (name || '').trim().toLowerCase());
  if (match) return match;
  return { name, numberOfDice: 1, diceType: 'd4', modifier: 0 };
}

// What an attack would likely do: the chance its d20 + bonus meets the
// target's AC (a hit is total >= AC, as resolveAttack rolls it), and the
// average damage on a hit.
export function attackPreview(attack, target) {
  const weapon = weaponStatsFor(attack.weaponName);
  const toHit = totalToHit(weapon, attack.additionalModifier);
  const ac = acOf(target);
  const hitChance = Math.max(0, Math.min(1, (21 - (ac - toHit)) / 20));
  const sides = parseInt(String(weapon.diceType).slice(1), 10) || 4;
  const flat = (weapon.modifier || 0) + (attack.additionalDamage || 0);
  const averageDamage = Math.max(0, (weapon.numberOfDice * (sides + 1)) / 2 + flat);
  return {
    weaponName: weapon.name,
    hitChance,
    damageLabel: totalDamageLabel(weapon, attack.additionalDamage),
    averageDamage,
  };
}
