// What the DM can keep from players: a monster, chest or door hidden until
// the DM shows it, a door locked until the DM unlocks it, and whatever
// stands in the fog of war.
//
// A hidden token works like an unrevealed trap (traps.js): it doesn't exist
// as far as any player's client is concerned. In cloud mode the row never
// reaches a non-host (20250101000059_hidden_tokens_locked_doors.sql), on a
// guest table the DM's client keeps it off the wire (GameView.jsx's
// toGuestBroadcastAction), and in local mode — one shared localStorage copy —
// entitiesVisibleOnLayer filters it out.
//
// A locked door is still seen by everyone; a player just can't click it or
// walk through it (MapBoard.jsx, GameView.jsx's enterDoor).

import { isHiddenTrap } from './traps.js';

export const HIDEABLE_KINDS = ['mob', 'npc', 'chest', 'door'];

export function canBeHidden(entity) {
  return HIDEABLE_KINDS.includes(entity?.kind);
}

// A token standing wholly inside the fog of war (utils/fogOfWar.js) carries
// `fogged`, written by the DM's client alone. It is kept from players the
// same three ways a hidden one is (69_fogged_tokens.sql for cloud mode).
// HIDEABLE_KINDS above is only about the DM's "Hidden from players" control:
// fog also takes a trap. A hero is never fogged.
export function isFogged(entity) {
  return Boolean(entity?.fogged) && entity.kind !== 'hero';
}

// An ambush token (ambush.js) is the DM's own marker: players never see it,
// only the monsters that come out of it.
export function isHiddenFromPlayers(entity) {
  return isHiddenTrap(entity) || entity?.kind === 'ambush' || (canBeHidden(entity) && Boolean(entity.hidden)) || isFogged(entity);
}

export function isLockedDoor(entity) {
  return entity?.kind === 'door' && Boolean(entity.locked);
}

// A chest can be locked too. Players still see it and can look at its card,
// but can't open it until it is unlocked (an unlocked one they open
// themselves); a locked chest is always a shut one (GameView.jsx's
// updateEntity keeps the two in step).
export function isLockedChest(entity) {
  return entity?.kind === 'chest' && Boolean(entity.locked);
}

// The entities a player's screen may draw from: everything for the DM,
// everything not hidden for anyone else.
export function entitiesShownTo(entities, isHost) {
  if (isHost) return entities;
  const shown = {};
  for (const [id, entity] of Object.entries(entities)) {
    if (!isHiddenFromPlayers(entity)) shown[id] = entity;
  }
  return shown;
}
