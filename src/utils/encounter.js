import { feetDistance } from './grid.js';

// An encounter is the turn-by-turn fight that starts once initiative is
// rolled with "Start encounter" ticked (Toolbar.jsx's InitiativeModal). It is
// one table-wide value, synced like the clock (49_encounter.sql):
//
//   {
//     round: 1,                         // 1-based
//     turn: 0,                          // index into `order` of whoever is acting
//     order: [{ id, roll }],            // highest roll first
//     turnStart: { id, islandId, col, row } | null,
//                                       // where the acting token stood when its
//                                       // turn began — the movement range is
//                                       // measured from here, not from wherever
//                                       // it has walked to since
//   }
//
// null means no encounter is running.

export function createEncounter(rolled, entities) {
  const order = rolled.map(({ id, roll }) => ({ id, roll }));
  const first = order.findIndex((entry) => entities[entry.id]);
  if (first === -1) return null;
  return { round: 1, turn: first, order, turnStart: turnStartFor(entities[order[first].id]) };
}

function turnStartFor(entity) {
  if (!entity) return null;
  return { id: entity.id, islandId: entity.islandId, col: entity.col, row: entity.row };
}

export function currentActorId(encounter) {
  return encounter?.order?.[encounter.turn]?.id ?? null;
}

// The next living participant's turn, wrapping into a new round. Tokens that
// were removed mid-fight are skipped rather than taken out of `order`, so
// every client agrees on the indices.
export function advanceEncounter(encounter, entities) {
  if (!encounter?.order?.length) return encounter;
  const n = encounter.order.length;
  for (let step = 1; step <= n; step++) {
    const index = (encounter.turn + step) % n;
    const entity = entities[encounter.order[index].id];
    if (!entity) continue;
    const wrapped = encounter.turn + step >= n;
    return {
      ...encounter,
      round: encounter.round + (wrapped ? 1 : 0),
      turn: index,
      turnStart: turnStartFor(entity),
    };
  }
  return encounter;
}

export function speedOf(entity) {
  if (!entity) return 30;
  const sheet = entity.kind === 'hero' ? entity.sheet : entity.mobSheet;
  const speed = Number(sheet?.speed);
  return Number.isFinite(speed) && speed > 0 ? speed : 30;
}

// Where the acting token can still reach this turn: every square of its
// island within its speed of where the turn started, by the same 5-10-5
// diagonal rule the ruler uses. Walls aren't modelled, so this is a guide,
// not a rule the map enforces.
export function reachableCells(island, start, speedFeet, feetPerSquare) {
  if (!island || !start) return [];
  const squares = Math.floor(speedFeet / (feetPerSquare || 5));
  const cells = [];
  const minCol = Math.max(0, start.col - squares);
  const maxCol = Math.min(island.cols - 1, start.col + squares);
  const minRow = Math.max(0, start.row - squares);
  const maxRow = Math.min(island.rows - 1, start.row + squares);
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (feetDistance(start, { col, row }, feetPerSquare) <= speedFeet) cells.push({ col, row });
    }
  }
  return cells;
}

// Feet already walked this turn, measured from the turn's starting square.
export function feetMoved(encounter, entity, feetPerSquare) {
  const start = encounter?.turnStart;
  if (!start || !entity || start.id !== entity.id) return 0;
  if (start.islandId !== entity.islandId) return null; // crossed onto another island — no common grid to measure on
  return feetDistance(start, entity, feetPerSquare);
}
