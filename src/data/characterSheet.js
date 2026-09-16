// D&D 5e character sheet fields for hero tokens — kept as a plain data
// catalog (ability list, skill-to-ability mapping, defaults) so the
// Inspector's tabs can stay declarative rather than hand-rolling each row.

export const ABILITIES = [
  { key: 'str', label: 'Strength' },
  { key: 'dex', label: 'Dexterity' },
  { key: 'con', label: 'Constitution' },
  { key: 'int', label: 'Intelligence' },
  { key: 'wis', label: 'Wisdom' },
  { key: 'cha', label: 'Charisma' },
];

export const SKILLS = [
  { key: 'acrobatics', label: 'Acrobatics', ability: 'dex' },
  { key: 'animalHandling', label: 'Animal Handling', ability: 'wis' },
  { key: 'arcana', label: 'Arcana', ability: 'int' },
  { key: 'athletics', label: 'Athletics', ability: 'str' },
  { key: 'deception', label: 'Deception', ability: 'cha' },
  { key: 'history', label: 'History', ability: 'int' },
  { key: 'insight', label: 'Insight', ability: 'wis' },
  { key: 'intimidation', label: 'Intimidation', ability: 'cha' },
  { key: 'investigation', label: 'Investigation', ability: 'int' },
  { key: 'medicine', label: 'Medicine', ability: 'wis' },
  { key: 'nature', label: 'Nature', ability: 'int' },
  { key: 'perception', label: 'Perception', ability: 'wis' },
  { key: 'performance', label: 'Performance', ability: 'cha' },
  { key: 'persuasion', label: 'Persuasion', ability: 'cha' },
  { key: 'religion', label: 'Religion', ability: 'int' },
  { key: 'sleightOfHand', label: 'Sleight of Hand', ability: 'dex' },
  { key: 'stealth', label: 'Stealth', ability: 'dex' },
  { key: 'survival', label: 'Survival', ability: 'wis' },
];

export function abilityModifier(score) {
  return Math.floor(((score ?? 10) - 10) / 2);
}

export function formatModifier(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// A saving throw / skill row is a checkbox (proficient?) plus its own
// editable bonus number — `value` starts out auto-computed from the ability
// modifier (+ proficiency bonus, if proficient) but can be hand-adjusted
// afterward (e.g. for Expertise, class features the simple formula can't
// capture) without the checkbox fighting the manual edit.
function defaultCheckEntry() {
  return { proficient: false, value: 0 };
}

// Normalizes an older boolean-only entry (`{ str: true }`) into the current
// `{ proficient, value }` shape, so hero tokens created before this change
// don't break.
export function normalizeCheckEntry(raw, computedValue) {
  if (raw && typeof raw === 'object') return { proficient: !!raw.proficient, value: raw.value ?? computedValue };
  return { proficient: !!raw, value: computedValue };
}

export const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function defaultSpellLevel() {
  return { slotsTotal: 0, slotsExpended: 0, spells: [] };
}

export function defaultSpellcasting() {
  return {
    class: '',
    ability: '',
    saveDC: 0,
    attackBonus: 0,
    levels: Object.fromEntries(SPELL_LEVELS.map((lvl) => [lvl, defaultSpellLevel()])),
  };
}

// Older hero tokens (or a level added after the catalog grows) may be
// missing fields — fill in defaults around whatever's already there rather
// than replacing it outright.
export function normalizeSpellcasting(raw) {
  const base = defaultSpellcasting();
  if (!raw || typeof raw !== 'object') return base;
  const levels = { ...base.levels };
  for (const lvl of SPELL_LEVELS) {
    if (raw.levels?.[lvl]) levels[lvl] = { ...defaultSpellLevel(), ...raw.levels[lvl] };
  }
  return { ...base, ...raw, levels };
}

export function newSpellEntry() {
  return { id: `spell_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', prepared: false };
}

export const CURRENCIES = [
  { key: 'bronze', label: 'Bronze' },
  { key: 'silver', label: 'Silver' },
  { key: 'gold', label: 'Gold' },
];

export function defaultCurrency() {
  return { bronze: 0, silver: 0, gold: 0 };
}

// Older hero tokens stored a single flat `gold` number on the sheet — fold
// it into the new gold denomination instead of losing it.
export function normalizeCurrency(sheet) {
  const base = defaultCurrency();
  if (sheet?.currency && typeof sheet.currency === 'object') return { ...base, ...sheet.currency };
  if (typeof sheet?.gold === 'number') return { ...base, gold: sheet.gold };
  return base;
}

export function defaultCharacterSheet() {
  return {
    level: 1,
    armorClass: 10,
    initiative: 0,
    speed: 30,
    deathSaves: { successes: 0, failures: 0 },
    proficiencyBonus: 2,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    savingThrows: Object.fromEntries(ABILITIES.map((a) => [a.key, defaultCheckEntry()])),
    skills: Object.fromEntries(SKILLS.map((s) => [s.key, defaultCheckEntry()])),
    attacks: [],
    equipment: { gear: [], other: [] },
    currency: defaultCurrency(),
    spellcasting: defaultSpellcasting(),
  };
}

export function newEquipmentItem() {
  return { id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', qty: 1 };
}

// Older hero tokens stored equipment as one free-text blob — fold it into
// the "Other items" list (as a single entry) instead of silently dropping it.
export function normalizeEquipment(raw) {
  if (raw && typeof raw === 'object' && Array.isArray(raw.gear) && Array.isArray(raw.other)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    return { gear: [], other: [{ id: 'legacy', name: raw.trim(), qty: 1 }] };
  }
  return { gear: [], other: [] };
}
