// Trap tokens: a hidden hazard the DM places on the map. Until the DM ticks
// "Reveal trap" the token doesn't exist as far as any player's client is
// concerned — see entitiesVisibleOnLayer and toGuestBroadcastAction
// (GameView.jsx) and, in cloud mode, 20250101000028_traps.sql's entities
// SELECT policy, which keeps the row itself from ever reaching a non-host.

export function isHiddenTrap(entity) {
  return entity?.kind === 'trap' && !entity.trapRevealed;
}

// The mechanics fields a trap carries, as the modal/inspector edit them.
// save/fail are the two numbers the DM calls out for the roll; dice is what
// gets rolled (e.g. "1d20"); damage is free text so "2d6" and "5" both fit.
// What kind of damage a trap deals. 'none' is a trap that only has a
// side effect (or whose damage is described in its text).
export const DAMAGE_TYPES = [
  { key: 'none', label: 'None' },
  { key: 'acid', label: 'Acid' },
  { key: 'bludgeoning', label: 'Bludgeoning' },
  { key: 'cold', label: 'Cold' },
  { key: 'electric', label: 'Electric' },
  { key: 'fire', label: 'Fire' },
  { key: 'force', label: 'Force' },
  { key: 'necrotic', label: 'Necrotic' },
  { key: 'piercing', label: 'Piercing' },
  { key: 'poison', label: 'Poison' },
  { key: 'psychic', label: 'Psychic' },
  { key: 'radiant', label: 'Radiant' },
  { key: 'slashing', label: 'Slashing' },
  { key: 'thunder', label: 'Thunder' },
];

// A trap covers a square footprint, from a single tile (a tripwire, a pit
// trap) up to 5x5 (a collapsing floor, a gas-filled room). Other tokens top
// out at 4x4 — the 5 is allowed for traps only, in the database too
// (20250101000034_trap_size.sql). The dropdown's options come from
// tokenSizes.js, the same list monsters use.
export const MAX_TRAP_SIZE = 5;

// Anything that isn't a whole number from 1 to MAX_TRAP_SIZE reads as a
// single tile.
export function clampTrapSize(size) {
  const n = parseInt(size, 10);
  return Number.isFinite(n) ? Math.min(MAX_TRAP_SIZE, Math.max(1, n)) : 1;
}

export function emptyTrapDraft() {
  return {
    name: 'Trap',
    description: '',
    size: 1,
    saveNumber: null,
    failNumber: null,
    dice: '1d20',
    damage: '',
    damageType: 'none',
  };
}

// The dice a trap can roll. d20 is the default; the list is the standard
// tabletop set.
export const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100];

// "2d6" -> { count: 2, sides: 6 }. The count may be blank ("d6") while
// someone is mid-edit in DiceInput. Returns null for anything else
// (empty, or free text saved before this control existed).
export function parseDice(text) {
  const match = /^(\d*)d(\d+)$/i.exec((text || '').trim());
  if (!match) return null;
  return { count: match[1] === '' ? '' : parseInt(match[1], 10), sides: parseInt(match[2], 10) };
}

export function formatDice(count, sides) {
  const n = parseInt(count, 10);
  return `${Number.isFinite(n) && n > 0 ? Math.min(n, 99) : ''}d${sides}`;
}

// A placed trap should never store a blank count ("d20" means nothing to
// roll) — read a blank count as one die.
export function normalizeDice(text) {
  const parsed = parseDice(text);
  if (!parsed) return (text || '').trim();
  return formatDice(parsed.count === '' ? 1 : parsed.count, parsed.sides);
}

// A number input's raw string -> the number a trap stores, or null when
// the field is blank or not a number (so clearing a field really clears it).
export function parseTrapNumber(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}
