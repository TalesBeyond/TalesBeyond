// Bulletin boards (data/bulletins.js) on a cloud table are never written to
// the database. The DM's browser keeps them (state/persistence.js's
// saveTableBoards) and tells the players' browsers about the ones they may
// see over the table's channel (lib/realtime.js's 'boards'), like dice rolls:
//   { op: 'set', board }   the DM: one board, in full
//   { op: 'only', ids }    the DM: the boards there are; drop any other
//   { op: 'ask' }          a player who just connected: say them all again
// So a player sees the boards only while the DM's browser is at the table,
// and the DM has them only in the browser they were made in.
//
// A board travels as plain fields with its picture as a reference
// (lib/storedImages.js) and is read back field by field, so whatever arrives
// on the channel can only ever become a bulletin board.

import { BULLETIN_COLOR, MAX_BULLETINS, MAX_BULLETIN_TITLE, MAX_BULLETIN_TEXT, bulletinsOf, isBulletinBoard } from '../data/bulletins.js';
import { toStoredImage, fromStoredImage } from './storedImages.js';

const MAX_ID = 80;
const MAX_NAME = 80;
const MAX_SIZE = 4;

export function boardToWire(board) {
  return {
    id: board.id,
    name: board.name,
    image: toStoredImage(board.imageUrl),
    color: board.color,
    col: board.col,
    row: board.row,
    size: board.size,
    layerId: board.layerId,
    islandId: board.islandId,
    bulletins: bulletinsOf(board),
  };
}

function isId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID;
}

function isSquare(value) {
  return Number.isInteger(value) && value >= 0;
}

// The board a message describes, or null when it doesn't describe one.
export function boardFromWire(raw) {
  if (!raw || !isId(raw.id) || !isId(raw.layerId) || !isId(raw.islandId) || !isSquare(raw.col) || !isSquare(raw.row)) return null;
  const color = /^#[0-9a-fA-F]{3,8}$/.test(raw.color || '') ? raw.color : BULLETIN_COLOR;
  const bulletins = (Array.isArray(raw.bulletins) ? raw.bulletins : [])
    .filter((b) => b && isId(b.id))
    .slice(0, MAX_BULLETINS)
    .map((b) => ({ id: b.id, title: String(b.title ?? '').slice(0, MAX_BULLETIN_TITLE), text: String(b.text ?? '').slice(0, MAX_BULLETIN_TEXT) }));
  return {
    id: raw.id,
    kind: 'bulletin',
    name: String(raw.name ?? '').slice(0, MAX_NAME),
    imageUrl: fromStoredImage(typeof raw.image === 'string' ? raw.image : '', { kind: 'bulletin', color }),
    color,
    col: raw.col,
    row: raw.row,
    size: Number.isInteger(raw.size) && raw.size >= 1 && raw.size <= MAX_SIZE ? raw.size : 1,
    layerId: raw.layerId,
    islandId: raw.islandId,
    // Only a board players may see is ever announced.
    hidden: false,
    fogged: false,
    bulletins,
  };
}

export function boardsIn(state) {
  return Object.values(state.entities).filter(isBulletinBoard);
}

// A table read from the database has no boards. This puts back the ones this
// browser holds, where the map they stand on is still there.
export function withBoardsKept(state, boards) {
  const kept = boards.filter((b) => isBulletinBoard(b) && isId(b.id) && !state.entities[b.id] && state.layers[b.layerId]?.islands?.[b.islandId]);
  if (!kept.length) return state;
  return {
    ...state,
    entities: { ...state.entities, ...Object.fromEntries(kept.map((b) => [b.id, b])) },
    entityOrder: [...state.entityOrder, ...kept.map((b) => b.id)],
  };
}
