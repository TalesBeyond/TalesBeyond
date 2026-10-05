// Ambush tokens: a marker the DM places on the map that holds a band of
// monsters and is never shown to players (data/visibility.js). "Reveal the
// ambush" on its inspector puts every monster it holds on the squares around
// it and takes the marker itself off the map (GameView.jsx's revealAmbush).
//
// What it holds is a list of monster drafts — the same draft a compendium
// monster is placed from (data/monsters.js's monsterToDraft) — each with a
// count: [{ id, qty, name, imageUrl, color, maxHp, armorClass, size, ... }].

export const AMBUSH_ICON = 'skull';
export const AMBUSH_COLOR = '#7a1f2b';
export const MAX_AMBUSH_QTY = 20; // of one monster — an ambush, not an army

export function newAmbushMonster(draft) {
  const { kind: _kind, ...rest } = draft;
  return { id: `ambushmob_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, qty: 1, ...rest };
}

export function clampAmbushQty(qty) {
  const n = parseInt(qty, 10);
  return Number.isFinite(n) ? Math.min(MAX_AMBUSH_QTY, Math.max(1, n)) : 1;
}

// How many monsters come out when it is revealed.
export function ambushMonsterCount(entity) {
  return (entity?.ambushMonsters || []).reduce((sum, m) => sum + clampAmbushQty(m.qty), 0);
}

// One addEntity-style draft per monster that comes out, in list order.
export function ambushDrafts(entity) {
  const drafts = [];
  for (const monster of entity?.ambushMonsters || []) {
    const { id: _id, qty, ...draft } = monster;
    for (let i = 0; i < clampAmbushQty(qty); i++) drafts.push({ ...draft, kind: 'mob' });
  }
  return drafts;
}

function footprint(col, row, size) {
  const cells = [];
  for (let dc = 0; dc < size; dc++) {
    for (let dr = 0; dr < size; dr++) cells.push(`${col + dc},${row + dr}`);
  }
  return cells;
}

// Every square a token covers, as "col,row" keys.
export function cellsCoveredBy(entities) {
  const covered = new Set();
  for (const e of entities) for (const key of footprint(e.col, e.row, e.size || 1)) covered.add(key);
  return covered;
}

// The squares at exactly `radius` steps from the centre, clockwise from the
// top-left corner.
function ringAround(center, radius) {
  const cells = [];
  const { col, row } = center;
  for (let c = col - radius; c <= col + radius; c++) cells.push({ col: c, row: row - radius });
  for (let r = row - radius + 1; r <= row + radius; r++) cells.push({ col: col + radius, row: r });
  for (let c = col + radius - 1; c >= col - radius; c--) cells.push({ col: c, row: row + radius });
  for (let r = row + radius - 1; r > row - radius; r--) cells.push({ col: col - radius, row: r });
  return cells;
}

// Where each monster lands: the free squares closest to the ambush token,
// ring by ring outward, never on the token's own square and never on top of
// something already there (`occupied`, from cellsCoveredBy). A monster wider
// than one square needs its whole footprint free and on the map. Only when
// the map has no room left at all do the rest pile onto the token's square.
// Returns [{ draft, col, row, size }] in the drafts' order.
export function placeAroundAmbush(center, drafts, island, occupied) {
  const taken = new Set(occupied);
  taken.add(`${center.col},${center.row}`);
  const maxRadius = Math.max(island.cols, island.rows);
  return drafts.map((draft) => {
    const size = Math.max(1, Math.min(parseInt(draft.size, 10) || 1, 4));
    for (let radius = 1; radius <= maxRadius; radius++) {
      for (const cell of ringAround(center, radius)) {
        if (cell.col < 0 || cell.row < 0 || cell.col + size > island.cols || cell.row + size > island.rows) continue;
        const cells = footprint(cell.col, cell.row, size);
        if (cells.some((key) => taken.has(key))) continue;
        for (const key of cells) taken.add(key);
        return { draft, col: cell.col, row: cell.row, size };
      }
    }
    return { draft, col: Math.max(0, Math.min(center.col, island.cols - size)), row: Math.max(0, Math.min(center.row, island.rows - size)), size };
  });
}
