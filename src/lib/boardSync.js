// Bulletin boards (data/bulletins.js) and portals (data/portals.js) on a cloud
// table are never written to the database. The DM's browser keeps them
// (state/persistence.js's saveTableBoards) and tells the players' browsers
// about the ones they may see over the table's channel (lib/realtime.js's
// 'boards'), like dice rolls:
//   { op: 'set', board }   the DM: one board or portal, in full
//   { op: 'only', ids }    the DM: the ones there are; drop any other
//   { op: 'ask' }          a player who just connected: say them all again
// So a player sees them only while the DM's browser is at the table, and the
// DM has them only in the browser they were made in.
//
// Each change to one is announced a second way too, as it is made, with every
// other token's (lib/fastSync.js's 'entity'): that is what shows it on a
// player's screen at once. The messages above say it again as a whole a
// moment later, and are how a player who connects afterwards gets it.
//
// Each travels as plain fields with its picture as a reference
// (lib/storedImages.js) and is read back field by field, so whatever arrives
// on the channel can only ever become a bulletin board or a portal.

import { BULLETIN_COLOR, MAX_BULLETINS, MAX_BULLETIN_TITLE, MAX_BULLETIN_TEXT, bulletinsOf, isBulletinBoard } from '../data/bulletins.js';
import { PORTAL_COLOR, isPortal } from '../data/portals.js';
import { toStoredImage, fromStoredImage } from './storedImages.js';

const MAX_ID = 80;
const MAX_NAME = 80;
const MAX_SIZE = 4;

// A token of a kind that has no row in the database.
export function isOffDatabase(entity) {
  return isBulletinBoard(entity) || isPortal(entity);
}

export function boardToWire(board) {
  return {
    id: board.id,
    kind: board.kind,
    name: board.name,
    image: toStoredImage(board.imageUrl),
    color: board.color,
    col: board.col,
    row: board.row,
    size: board.size,
    layerId: board.layerId,
    islandId: board.islandId,
    ...(isBulletinBoard(board) ? { bulletins: bulletinsOf(board) } : { linkId: board.linkId, locked: Boolean(board.locked) }),
  };
}

function isId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID;
}

function isSquare(value) {
  return Number.isInteger(value) && value >= 0;
}

// The fields of one that an edit may change, and what boardToWire calls each.
const EDITABLE = {
  name: 'name',
  imageUrl: 'image',
  color: 'color',
  col: 'col',
  row: 'row',
  size: 'size',
  layerId: 'layerId',
  islandId: 'islandId',
  bulletins: 'bulletins',
  locked: 'locked',
};

// An edit of a board or portal as it travels: boardToWire's fields, and only
// the ones the edit names. `board`: as it is before the edit.
export function boardPatchToWire(board, patch) {
  const whole = boardToWire({ ...board, ...patch });
  const wire = {};
  for (const [key, wireKey] of Object.entries(EDITABLE)) if (key in patch && wireKey in whole) wire[wireKey] = whole[wireKey];
  return wire;
}

// `board` after an edit that arrived, or null when what arrived leaves no
// board. Read back as a whole, so an edit can only leave what it was.
export function boardWithWirePatch(board, wirePatch) {
  const wire = boardToWire(board);
  for (const wireKey of Object.values(EDITABLE)) if (wirePatch && wireKey in wirePatch && wireKey in wire) wire[wireKey] = wirePatch[wireKey];
  return boardFromWire(wire);
}

// The board or portal a message describes, or null when it doesn't describe one.
export function boardFromWire(raw) {
  if (!raw || !isId(raw.id) || !isId(raw.layerId) || !isId(raw.islandId) || !isSquare(raw.col) || !isSquare(raw.row)) return null;
  const kind = raw.kind === 'portal' ? 'portal' : 'bulletin';
  const color = /^#[0-9a-fA-F]{3,8}$/.test(raw.color || '') ? raw.color : kind === 'portal' ? PORTAL_COLOR : BULLETIN_COLOR;
  const token = {
    id: raw.id,
    kind,
    name: String(raw.name ?? '').slice(0, MAX_NAME),
    imageUrl: fromStoredImage(typeof raw.image === 'string' ? raw.image : '', { kind, color }),
    color,
    col: raw.col,
    row: raw.row,
    size: Number.isInteger(raw.size) && raw.size >= 1 && raw.size <= MAX_SIZE ? raw.size : 1,
    layerId: raw.layerId,
    islandId: raw.islandId,
    // Only one players may see is ever announced.
    hidden: false,
    fogged: false,
  };
  // A portal's other end (data/portals.js), and whether this end is locked.
  if (kind === 'portal') return { ...token, linkId: isId(raw.linkId) ? raw.linkId : null, locked: Boolean(raw.locked) };
  const bulletins = (Array.isArray(raw.bulletins) ? raw.bulletins : [])
    .filter((b) => b && isId(b.id))
    .slice(0, MAX_BULLETINS)
    .map((b) => ({ id: b.id, title: String(b.title ?? '').slice(0, MAX_BULLETIN_TITLE), text: String(b.text ?? '').slice(0, MAX_BULLETIN_TEXT) }));
  return { ...token, bulletins };
}

// Every board and portal on the table.
export function boardsIn(state) {
  return Object.values(state.entities).filter(isOffDatabase);
}

// A table read from the database has no boards or portals. This puts back the
// ones this browser holds, where the map they stand on is still there.
export function withBoardsKept(state, boards) {
  const kept = boards.filter((b) => isOffDatabase(b) && isId(b.id) && !state.entities[b.id] && state.layers[b.layerId]?.islands?.[b.islandId]);
  if (!kept.length) return state;
  return {
    ...state,
    entities: { ...state.entities, ...Object.fromEntries(kept.map((b) => [b.id, b])) },
    entityOrder: [...state.entityOrder, ...kept.map((b) => b.id)],
  };
}
