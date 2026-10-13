// How close a hero must stand to use something on the map. A player opens a
// chest, walks through a door or reads a bulletin board (data/bulletins.js)
// only while a hero of theirs stands on its square or the one beside it
// (REACH squares, diagonals included). The DM is never held to it.
//
// It is a rule of the table, checked by each player's client — and, for a
// chest on a guest table, by the DM's client too (GameView.jsx's
// canPlayerUpdateEntity). The database does not enforce it.

export const REACH = 1; // how many squares away a hero may stand

// Squares of open ground between two tokens along one axis (0 when they
// touch or overlap), each token covering `size` squares from its corner.
function gap(a, aSize, b, bSize) {
  return Math.max(0, a - (b + bSize - 1) - 1, b - (a + aSize - 1) - 1);
}

// `target`: { layerId, islandId, col, row, size } — a token, or a door as it
// stands on the layer being looked at (a door has a square on each of its two
// layers).
export function isWithinReach(target, hero, reach = REACH) {
  if (!target || !hero || hero.layerId !== target.layerId || hero.islandId !== target.islandId) return false;
  return (
    gap(hero.col, hero.size || 1, target.col, target.size || 1) <= reach - 1 &&
    gap(hero.row, hero.size || 1, target.row, target.size || 1) <= reach - 1
  );
}

// `heroes`: every hero token; `playerId`: whose heroes count. The first of
// that player's heroes standing close enough, or null.
export function heroWithinReach(target, heroes, playerId, reach = REACH) {
  return (heroes || []).find((hero) => hero.ownerId === playerId && isWithinReach(target, hero, reach)) || null;
}
