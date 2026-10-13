// Bulletin boards: a token the DM pins notices to — news, rumours, quests —
// for the party to read. Each bulletin is a title and some text:
// [{ id, title, text }], kept on the token as `bulletins`.
//
// A board is never written to the database. On a cloud table it lives in the
// DM's browser and reaches players over the table's channel
// (lib/boardSync.js); a guest or local table carries it like any other token.
//
// Only the DM pins, edits or takes down a bulletin. Anyone can see the board
// on the map, but a player reads it only while a hero of theirs stands on or
// next to it (BULLETIN_REACH squares, diagonals included). That is a rule of
// the table, checked by each client before the board opens (GameView.jsx's
// openBulletinBoard) — the bulletins themselves travel with the token, so
// they are not a secret the way a DM's notes are.

import { REACH, isWithinReach, heroWithinReach } from './reach.js';

export const BULLETIN_ICON = 'bulletin';
export const BULLETIN_COLOR = '#6b4a2b';
export const BULLETIN_REACH = REACH; // the same reach as a chest or a door
export const MAX_BULLETINS = 12;
export const MAX_BULLETIN_TITLE = 60;
export const MAX_BULLETIN_TEXT = 600;

export function newBulletin({ title = '', text = '' } = {}) {
  return {
    id: `bulletin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: title.trim().slice(0, MAX_BULLETIN_TITLE) || 'Untitled',
    text: text.trim().slice(0, MAX_BULLETIN_TEXT),
  };
}

export function isBulletinBoard(entity) {
  return entity?.kind === 'bulletin';
}

export function bulletinsOf(entity) {
  return Array.isArray(entity?.bulletins) ? entity.bulletins : [];
}

// Whether a hero stands close enough to read the board: on the same map, and
// on the board's square or one beside it (data/reach.js).
export function isWithinBulletinReach(board, hero) {
  return isWithinReach(board, hero, BULLETIN_REACH);
}

// `heroes`: every hero token; `playerId`: whose heroes count.
export function canReadBulletinBoard(board, heroes, playerId) {
  return Boolean(heroWithinReach(board, heroes, playerId, BULLETIN_REACH));
}
