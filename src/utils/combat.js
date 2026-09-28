import { getCatalog } from '../lib/catalog.js';
import { playSfx } from '../lib/sfx.js';
import { emitFx, markCrit } from '../lib/fx.js';

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

// The pause before the dice sound, and again before the result, when an
// attack is rolled from a sheet.
export const ATTACK_BEAT_MS = 700;

// Rolls one attack against a target and plays it out: the big d20, a MISS
// or critical float, the combat-log line, and on a hit the damage (temporary
// hit points soak it first, 51_temp_hp.sql) handed to applyDamage as an
// entity patch. Returns what happened, for the sheet to show.
export function resolveAttackRoll(attack, target, { attackerName, playSounds = false, applyDamage }) {
  const weapon = weaponStatsFor(attack.weaponName);
  const toHitMod = totalToHit(weapon, attack.additionalModifier);
  const d20 = rollDie(20);
  const attackTotal = d20 + toHitMod;
  const targetAC = acOf(target);
  const hit = attackTotal >= targetAC;
  let result = { targetName: target.name, d20, toHitMod, attackTotal, targetAC, hit };

  if (playSounds) playSfx(hit ? 'hit' : 'miss');

  emitFx({
    type: 'die',
    value: d20,
    detail: `${d20} ${toHitMod < 0 ? '−' : '+'} ${Math.abs(toHitMod)} = ${attackTotal} vs AC ${targetAC}`,
    caption: hit ? 'Hit' : 'Miss',
  });
  if (hit && d20 === 20) markCrit(target.id);
  if (!hit) emitFx({ type: 'float', entityId: target.id, kind: 'miss' });
  emitFx({
    type: 'log',
    tone: hit ? 'hit' : 'miss',
    text: `${attackerName || 'Attack'} → ${target.name}: ${attackTotal} vs AC ${targetAC}, ${hit ? 'hit' : 'miss'}${d20 === 20 ? ' (natural 20)' : d20 === 1 ? ' (natural 1)' : ''}`,
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
