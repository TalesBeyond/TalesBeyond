import { getCatalog } from '../lib/catalog.js';
import { playSfx } from '../lib/sfx.js';
import { emitFx, markCrit } from '../lib/fx.js';
import { parseMonsterAttacks } from '../data/monsters.js';
import { defaultCharacterSheet } from '../data/characterSheet.js';

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

// The weapon behind one Battle Equipment entry. A monster's attack carries
// its own dice (data/monsters.js parseMonsterAttacks), with its whole to-hit
// and damage bonus in the entry's additionalModifier / additionalDamage; a
// hero's names a weapon and takes the catalog's dice.
export function attackWeapon(attack) {
  if (attack?.diceType) return { name: attack.weaponName, numberOfDice: attack.numberOfDice || 1, diceType: attack.diceType, modifier: 0 };
  return weaponStatsFor(attack?.weaponName);
}

// The attacks a monster of this name starts with: the compendium entry's own
// (a "Goblin 2" is still a goblin), else one plain strike, so no enemy is
// ever placed with nothing to attack with.
export function defaultMobAttacks(name) {
  const wanted = (name || '').trim().toLowerCase();
  const match = getCatalog()
    .monsters.filter((m) => wanted === m.name.toLowerCase() || wanted.startsWith(`${m.name.toLowerCase()} `))
    .sort((a, b) => b.name.length - a.name.length)[0];
  const attacks = match ? parseMonsterAttacks(match.attack) : [];
  return attacks.length ? attacks : [{ weaponName: 'Strike', numberOfDice: 1, diceType: 'd6', additionalModifier: 3, additionalDamage: 1 }];
}

// A monster's sheet as it is placed: its own attacks if the draft brought
// any, else the defaults above.
export function mobSheetWithAttacks(sheet, name) {
  const base = sheet || defaultCharacterSheet();
  return base.attacks?.length ? base : { ...base, attacks: defaultMobAttacks(name) };
}

// How an attack's d20 is thrown: once (normal), or twice keeping the higher
// (advantage) or the lower (disadvantage). In the order the tabs show them.
export const ROLL_MODES = [
  ['disadvantage', 'Disadvantage'],
  ['normal', 'Normal'],
  ['advantage', 'Advantage'],
];

// What an attack would likely do: the chance its d20 + bonus meets the
// target's AC (a hit is total >= AC, as resolveAttack rolls it) — with
// advantage either of two throws may hit, with disadvantage both must — and
// the average damage on a hit.
export function attackPreview(attack, target, mode = 'normal') {
  const weapon = attackWeapon(attack);
  const toHit = totalToHit(weapon, attack.additionalModifier);
  const ac = acOf(target);
  const once = Math.max(0, Math.min(1, (21 - (ac - toHit)) / 20));
  const hitChance = mode === 'advantage' ? 1 - (1 - once) ** 2 : mode === 'disadvantage' ? once ** 2 : once;
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

// The pause before the dice sound, and again before the result, when an
// attack is rolled from a sheet.
export const ATTACK_BEAT_MS = 700;

// Rolls one attack against a target and plays it out: the big d20, a MISS
// or critical float, the combat-log line, and on a hit the damage (temporary
// hit points soak it first, 51_temp_hp.sql) handed to applyDamage as an
// entity patch. Returns what happened, for the sheet to show.
// `mode` (ROLL_MODES): with advantage or disadvantage the d20 is thrown twice
// and the higher or lower one counts; both throws go in `throws`, and every
// log line says which way the attack was rolled.
export function resolveAttackRoll(attack, target, { attackerName, playSounds = false, applyDamage, mode = 'normal' }) {
  const weapon = attackWeapon(attack);
  const toHitMod = totalToHit(weapon, attack.additionalModifier);
  const twice = mode === 'advantage' || mode === 'disadvantage';
  const throws = twice ? [rollDie(20), rollDie(20)] : [rollDie(20)];
  const d20 = mode === 'advantage' ? Math.max(...throws) : Math.min(...throws);
  const attackTotal = d20 + toHitMod;
  const targetAC = acOf(target);
  const hit = attackTotal >= targetAC;
  const rollMode = twice ? mode : 'normal';
  let result = { targetName: target.name, d20, toHitMod, attackTotal, targetAC, hit, mode: rollMode, throws: twice ? throws : null };

  if (playSounds) playSfx(hit ? 'hit' : 'miss');

  emitFx({
    type: 'die',
    value: d20,
    detail: `${twice ? `${rollMode} ${throws.join(' / ')} · ` : ''}${d20} ${toHitMod < 0 ? '−' : '+'} ${Math.abs(toHitMod)} = ${attackTotal} vs AC ${targetAC}`,
    caption: hit ? 'Hit' : 'Miss',
  });
  if (hit && d20 === 20) markCrit(target.id);
  if (!hit) emitFx({ type: 'float', entityId: target.id, kind: 'miss' });
  emitFx({
    type: 'log',
    tone: hit ? 'hit' : 'miss',
    text: `${attackerName || 'Attack'} → ${target.name} (${twice ? `${rollMode}, ${throws.join(' and ')}` : 'normal'}): ${attackTotal} vs AC ${targetAC}, ${hit ? 'hit' : 'miss'}${d20 === 20 ? ' (natural 20)' : d20 === 1 ? ' (natural 1)' : ''}`,
  });

  emitFx({
    type: 'rolled',
    what: `an attack on ${target.name}`,
    dice: `1d20${toHitMod < 0 ? '−' : '+'}${Math.abs(toHitMod)} (${rollMode})`,
    detail: `${twice ? `[${throws.join(' / ')}] keep ` : ''}${d20} ${toHitMod < 0 ? '−' : '+'} ${Math.abs(toHitMod)} · ${hit ? 'hit' : 'miss'} vs AC ${targetAC}`,
    total: attackTotal,
    flag: d20 === 20 ? 'Natural 20' : d20 === 1 ? 'Natural 1' : null,
  });

  if (hit) {
    const sides = parseInt(weapon.diceType.slice(1), 10);
    let diceTotal = 0;
    for (let n = 0; n < weapon.numberOfDice; n++) diceTotal += rollDie(sides);
    const flatDamage = (weapon.modifier || 0) + (attack.additionalDamage || 0);
    const damageTotal = Math.max(0, diceTotal + flatDamage);
    const tempHp = target.tempHp || 0;
    const soaked = Math.min(tempHp, damageTotal);
    const newHp = Math.max(0, (target.hp ?? target.maxHp ?? 0) - (damageTotal - soaked));
    applyDamage(target.id, soaked ? { hp: newHp, tempHp: tempHp - soaked } : { hp: newHp });
    result = { ...result, damageTotal, newHp, maxHp: target.maxHp };
  }
  return result;
}
