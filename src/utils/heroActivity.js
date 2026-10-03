// The character log: what each player changed on their own hero this
// session (hit points, bag, coins, weapons, spells). Worked out on the DM's
// browser by comparing a hero before and after a change it didn't make
// itself, so nothing extra is sent and a player can't leave an edit out.
// Like the roll log it is never stored — it lives in the DM's browser.
//
// A change: { key, noun, from, to }. `from: null` reads as added,
// `to: null` as removed. `key` names the one thing that changed, so a
// run of edits to the same thing (typing a name letter by letter) folds
// into a single log line (mergeActivity).

import { CURRENCIES, SPELL_LEVELS, normalizeCurrency, normalizeSpellcasting } from '../data/characterSheet.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const num = (n) => String(n ?? 0);

function describeItem(item) {
  const name = (item.name || '').trim() || 'unnamed item';
  const qty = item.qty ?? 1;
  return qty === 1 ? name : `${name} ×${qty}`;
}

function describeAttack(attack) {
  const parts = [(attack.weaponName || '').trim() || 'unnamed weapon'];
  if (attack.additionalModifier) parts.push(`${attack.additionalModifier > 0 ? '+' : ''}${attack.additionalModifier} to hit`);
  if (attack.additionalDamage) parts.push(`${attack.additionalDamage > 0 ? '+' : ''}${attack.additionalDamage} damage`);
  return parts.join(', ');
}

function describeSpell(spell) {
  const name = (spell.name || '').trim() || 'unnamed spell';
  return spell.prepared ? `${name} (prepared)` : name;
}

// Two lists of things with ids: what was added, removed, or edited.
function diffById(before, after, keyPrefix, noun, describe, out) {
  const beforeById = new Map((before || []).map((x) => [x.id, x]));
  const afterById = new Map((after || []).map((x) => [x.id, x]));
  for (const [id, item] of afterById) {
    const old = beforeById.get(id);
    if (!old) out.push({ key: `${keyPrefix}:${id}`, noun, from: null, to: describe(item) });
    else if (!same(old, item)) {
      const from = describe(old);
      const to = describe(item);
      out.push({ key: `${keyPrefix}:${id}`, noun, from, to: from === to ? `${to} (details edited)` : to });
    }
  }
  for (const [id, item] of beforeById) {
    if (!afterById.has(id)) out.push({ key: `${keyPrefix}:${id}`, noun, from: describe(item), to: null });
  }
}

// Every change between two versions of the same hero that its owner is
// allowed to make. Anything else on the hero is the DM's and isn't logged.
export function diffHero(before, after) {
  const out = [];
  if ((before.hp ?? 0) !== (after.hp ?? 0)) out.push({ key: 'hp', noun: 'HP', from: num(before.hp), to: num(after.hp) });
  if ((before.tempHp || 0) !== (after.tempHp || 0)) out.push({ key: 'tempHp', noun: 'Temp HP', from: num(before.tempHp), to: num(after.tempHp) });

  const a = before.sheet || {};
  const b = after.sheet || {};

  if (!same(a.currency, b.currency) || a.gold !== b.gold) {
    const was = normalizeCurrency(a);
    const now = normalizeCurrency(b);
    for (const c of CURRENCIES) {
      if (was[c.key] !== now[c.key]) out.push({ key: `coin:${c.key}`, noun: c.label, from: num(was[c.key]), to: num(now[c.key]) });
    }
  }

  if (!same(a.equipment, b.equipment)) {
    const items = (eq) => [...(eq?.gear || []), ...(eq?.other || [])];
    diffById(items(a.equipment), items(b.equipment), 'item', 'Bag item', describeItem, out);
  }

  if (!same(a.attacks, b.attacks)) {
    // Weapons carry no id, so they are matched by their place in the list.
    const was = a.attacks || [];
    const now = b.attacks || [];
    for (let i = 0; i < Math.max(was.length, now.length); i++) {
      if (same(was[i], now[i])) continue;
      out.push({ key: `attack:${i}`, noun: 'Weapon', from: was[i] ? describeAttack(was[i]) : null, to: now[i] ? describeAttack(now[i]) : null });
    }
  }

  if (!same(a.spellcasting, b.spellcasting)) {
    const was = normalizeSpellcasting(a.spellcasting);
    const now = normalizeSpellcasting(b.spellcasting);
    const fields = [
      ['class', 'Spellcasting class'],
      ['ability', 'Spellcasting ability'],
      ['saveDC', 'Spell save DC'],
      ['attackBonus', 'Spell attack bonus'],
    ];
    for (const [field, noun] of fields) {
      if (was[field] !== now[field]) out.push({ key: `spell:${field}`, noun, from: String(was[field] || '—'), to: String(now[field] || '—') });
    }
    for (const lvl of SPELL_LEVELS) {
      const x = was.levels[lvl];
      const y = now.levels[lvl];
      if (same(x, y)) continue;
      const tier = lvl === 0 ? 'Cantrip' : `Level ${lvl}`;
      if (x.slotsTotal !== y.slotsTotal) out.push({ key: `slots:${lvl}:total`, noun: `${tier} spell slots`, from: num(x.slotsTotal), to: num(y.slotsTotal) });
      if (x.slotsExpended !== y.slotsExpended) out.push({ key: `slots:${lvl}:used`, noun: `${tier} slots used`, from: num(x.slotsExpended), to: num(y.slotsExpended) });
      diffById(x.spells, y.spells, `spellname:${lvl}`, lvl === 0 ? 'Cantrip' : `${tier} spell`, describeSpell, out);
    }
  }

  return out;
}

export function activityText(change) {
  if (change.from === null) return `Added ${change.noun.toLowerCase()}: ${change.to}`;
  if (change.to === null) return `Removed ${change.noun.toLowerCase()}: ${change.from}`;
  return `${change.noun}: ${change.from} → ${change.to}`;
}

// How long a second edit to the same thing still counts as the same line.
const MERGE_WINDOW_MS = 15000;
const MAX_ENTRIES = 200;

// Adds changes to the log (newest first). An entry: { id, at, playerId,
// name, color, heroId, heroName, key, noun, from, to }.
export function mergeActivity(log, who, changes, now = Date.now()) {
  let next = log;
  for (const change of changes) {
    const at = next.findIndex((e) => e.heroId === who.heroId && e.key === change.key);
    const last = at >= 0 ? next[at] : null;
    if (last && now - last.at < MERGE_WINDOW_MS) {
      const merged = { ...last, at: now, to: change.to };
      const rest = next.filter((_, i) => i !== at);
      // Changed and changed straight back (or added then removed): nothing to say.
      next = merged.from === merged.to ? rest : [merged, ...rest];
    } else {
      next = [{ id: `act_${now}_${Math.random().toString(36).slice(2, 7)}`, at: now, ...who, ...change }, ...next];
    }
  }
  return next.slice(0, MAX_ENTRIES);
}
