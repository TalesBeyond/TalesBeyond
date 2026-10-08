// The creature kinds of token — the ones with hit points, a sheet and a turn
// in a fight:
//   hero — a player's character. Its sheet is on the token (`sheet`), open to
//          the table, and its player manages part of it.
//   mob  — a monster. The DM's, with a monster's card (its own attacks, a
//          loot table) kept in `mobSheet`, which players never receive.
//   npc  — a character the DM runs. A hero's whole sheet (level, death saves,
//          Battle / Spells / Bag / Skills), stored the way a monster's is —
//          in `mobSheet`, with its armor class on the token — so players see
//          its name, AC, HP, size and conditions only. The DM can hide it.
// Doors, chests, traps and ambushes are the other kinds.

export const CREATURE_KINDS = ['hero', 'mob', 'npc'];

export function isCreatureKind(kind) {
  return CREATURE_KINDS.includes(kind);
}

export function isCreature(entity) {
  return isCreatureKind(entity?.kind);
}

// A monster or an NPC: the DM's to run, sheet in `mobSheet`, AC on the token.
export function isDmCreature(entity) {
  return entity?.kind === 'mob' || entity?.kind === 'npc';
}

export const NPC_ICON = 'npc';
export const NPC_COLOR = '#6f6f6f'; // grey, apart from the heroes' and monsters' colours
export const NPC_MAX_HP = 20;
