// Fog of war: the DM covers parts of an island with rectangular fog chunks
// (68_fog_chunks.sql). Everything here is a pure rule over plain data, so
// MapBoard (drawing and picking), GameView (what gets written) and the guest
// DM's validation of a player's move all agree.
//
// A fog chunk: { id, islandId, x, y, w, h, revealed, revealOnEnter } — its
// rectangle in whole grid squares from the island's top-left corner. Squares
// that fall outside the island's current cols/rows are ignored everywhere;
// the stored rectangle is never rewritten when the island is resized.
//
// A square is fogged while at least one unrevealed chunk covers it. This is
// "Fog of war", not the Fog island condition (data/islandConditions.js).

// The part of a chunk that lies on its island, as the squares
// [x0, x1) × [y0, y1), or null when none of it does.
export function clippedFogChunk(chunk, island) {
  if (!chunk || !island) return null;
  const x0 = Math.max(0, chunk.x);
  const y0 = Math.max(0, chunk.y);
  const x1 = Math.min(island.cols, chunk.x + chunk.w);
  const y1 = Math.min(island.rows, chunk.y + chunk.h);
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
}

// A drag's two corners (each [x, y] in squares from the island's top-left
// corner, fractions included) as the rectangle of every square the drag
// touched, clipped to the island: { x, y, w, h }, or null when the drag never
// crossed the island.
export function fogChunkRectFromDrag(from, to, island) {
  if (!from || !to || !island) return null;
  const x0 = Math.max(0, Math.floor(Math.min(from[0], to[0])));
  const y0 = Math.max(0, Math.floor(Math.min(from[1], to[1])));
  const x1 = Math.min(island.cols - 1, Math.floor(Math.max(from[0], to[0])));
  const y1 = Math.min(island.rows - 1, Math.floor(Math.max(from[1], to[1])));
  if (x1 < x0 || y1 < y0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// One island's chunks, in creation order.
export function fogChunksOnIsland(fogChunks, fogChunkOrder, islandId) {
  const onIsland = [];
  for (const id of fogChunkOrder || []) {
    const chunk = fogChunks?.[id];
    if (chunk && chunk.islandId === islandId) onIsland.push(chunk);
  }
  return onIsland;
}

function coversSquare(chunk, island, col, row) {
  const box = clippedFogChunk(chunk, island);
  return Boolean(box) && col >= box.x0 && col < box.x1 && row >= box.y0 && row < box.y1;
}

// `chunks` are the island's own (fogChunksOnIsland).
export function isSquareFogged(chunks, island, col, row) {
  return chunks.some((chunk) => !chunk.revealed && coversSquare(chunk, island, col, row));
}

// The chunk a click on a square picks: where several overlap, the one with
// the smallest area on the island (the newest of equals). `unrevealedOnly`
// leaves revealed chunks out.
export function smallestFogChunkAt(chunks, island, col, row, { unrevealedOnly = false } = {}) {
  let best = null;
  let bestArea = Infinity;
  for (const chunk of chunks) {
    if (unrevealedOnly && chunk.revealed) continue;
    const box = clippedFogChunk(chunk, island);
    if (!box || col < box.x0 || col >= box.x1 || row < box.y0 || row >= box.y1) continue;
    const area = (box.x1 - box.x0) * (box.y1 - box.y0);
    if (area <= bestArea) {
      best = chunk;
      bestArea = area;
    }
  }
  return best;
}

// ---- Tokens in fog ----
// `world` below is the table's state, or anything shaped like the part of it
// these rules read: { layers, fogChunks, fogChunkOrder }.

function findIsland(layers, islandId) {
  for (const layer of Object.values(layers || {})) {
    if (layer.islands?.[islandId]) return layer.islands[islandId];
  }
  return null;
}

function unrevealedOn(world, islandId) {
  return fogChunksOnIsland(world.fogChunks, world.fogChunkOrder, islandId).filter((chunk) => !chunk.revealed);
}

// Whether a token's whole footprint (size × size squares from col, row) is
// fogged. Squares hanging off the island's edge don't count either way; a
// footprint with no square on the island is not fogged.
export function isFootprintFogged(world, islandId, col, row, size = 1) {
  const island = findIsland(world.layers, islandId);
  if (!island) return false;
  const chunks = unrevealedOn(world, islandId);
  if (!chunks.length) return false;
  let onIsland = 0;
  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) {
      const c = col + dx;
      const r = row + dy;
      if (c < 0 || r < 0 || c >= island.cols || r >= island.rows) continue;
      onIsland += 1;
      if (!chunks.some((chunk) => coversSquare(chunk, island, c, r))) return false;
    }
  }
  return onIsland > 0;
}

// A door is one token with two sides: its home square, and a second square
// on its target layer's base island (GameView.jsx's entitiesVisibleOnLayer).
// Null for anything else, and for a door that leads nowhere.
export function doorTargetSide(world, door) {
  if (door?.kind !== 'door' || !door.targetLayerId || door.targetLayerId === door.layerId) return null;
  const islandId = world.layers?.[door.targetLayerId]?.islandOrder?.[0];
  if (!islandId) return null;
  return { islandId, col: door.targetCol ?? door.col, row: door.targetRow ?? door.row };
}

// Which of a door's sides are wholly in fog. A player's screen leaves such a
// side out, even while the door itself is still theirs to see from the other.
export function isDoorHomeSideFogged(door, world) {
  return isFootprintFogged(world, door.islandId, door.col, door.row, door.size || 1);
}

export function isDoorTargetSideFogged(door, world) {
  const target = doorTargetSide(world, door);
  return Boolean(target) && isFootprintFogged(world, target.islandId, target.col, target.row, door.size || 1);
}

// A token is fogged when it is not a hero and every square it occupies is
// fogged — for a door, every square on both of its sides. This is the value
// the DM's client stores as `entity.fogged`; a fogged token does not exist
// for players, like a hidden one (data/visibility.js).
export function isEntityFogged(entity, world) {
  if (!entity || entity.kind === 'hero') return false;
  if (!isFootprintFogged(world, entity.islandId, entity.col, entity.row, entity.size || 1)) return false;
  const target = doorTargetSide(world, entity);
  return !target || isFootprintFogged(world, target.islandId, target.col, target.row, entity.size || 1);
}

// ---- Reveals when entered, and held-back chunks ----
// A chunk's `revealOnEnter` setting. On: the DM's client reveals the chunk
// while any hero occupies one of its squares, whoever moved the hero and
// however long ago. Off: the chunk is held back — it opens only by the DM's
// hand, and a player may not move their own hero into it.

function footprintTouches(box, col, row, size) {
  return col < box.x1 && col + size > box.x0 && row < box.y1 && row + size > box.y0;
}

// Whether any hero occupies at least one of a chunk's squares.
export function isFogChunkOccupied(chunk, world, entities) {
  const box = clippedFogChunk(chunk, findIsland(world.layers, chunk?.islandId));
  if (!box) return false;
  return Object.values(entities || {}).some(
    (entity) => entity.kind === 'hero' && entity.islandId === chunk.islandId && footprintTouches(box, entity.col, entity.row, entity.size || 1)
  );
}

// The ids of the unrevealed chunks, setting on, that a hero stands in: the
// ones the DM's client reveals.
export function fogChunksToRevealOnEnter(world, entities) {
  const ids = [];
  for (const id of world.fogChunkOrder || []) {
    const chunk = world.fogChunks?.[id];
    if (!chunk || chunk.revealed || chunk.revealOnEnter === false) continue;
    if (isFogChunkOccupied(chunk, world, entities)) ids.push(id);
  }
  return ids;
}

// Whether a hero moved to (col, row) on an island would stand on any square
// of a held-back chunk: an unrevealed one with the setting off. A player may
// not make that move with their own hero; the DM is never restricted. Only
// the destination is tested, so a hero already inside can always walk out.
export function isHeldBackDestination(world, islandId, col, row, size = 1) {
  const island = findIsland(world.layers, islandId);
  if (!island) return false;
  return unrevealedOn(world, islandId).some((chunk) => {
    if (chunk.revealOnEnter !== false) return false;
    const box = clippedFogChunk(chunk, island);
    return Boolean(box) && footprintTouches(box, col, row, size);
  });
}

// ---- Moving and resizing a chunk (the Fog of war tool) ----

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// The DM dragging the chunk they picked, from `from` to `to` (each [x, y] in
// squares from the island's top-left corner, fractions included). `box` is
// the chunk's clipped box when the drag began. `edges` names the sides a
// handle moves ({ l, t, r, b }); null moves the whole chunk. The result is
// { x, y, w, h } in whole squares, on the island, never under one square.
export function fogChunkRectFromEdit(box, edges, from, to, island) {
  if (!edges) {
    const w = box.x1 - box.x0;
    const h = box.y1 - box.y0;
    return {
      x: clamp(box.x0 + Math.round(to[0] - from[0]), 0, island.cols - w),
      y: clamp(box.y0 + Math.round(to[1] - from[1]), 0, island.rows - h),
      w,
      h,
    };
  }
  let { x0, y0, x1, y1 } = box;
  if (edges.l) x0 = clamp(Math.round(to[0]), 0, x1 - 1);
  if (edges.r) x1 = clamp(Math.round(to[0]), x0 + 1, island.cols);
  if (edges.t) y0 = clamp(Math.round(to[1]), 0, y1 - 1);
  if (edges.b) y1 = clamp(Math.round(to[1]), y0 + 1, island.rows);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// What a press at `point` (in squares) takes hold of on a picked chunk's
// clipped `box`: the sides a handle there moves ({ l, t, r, b } — a corner
// moves two, the middle of a side one), null for the chunk's body, or
// undefined for a press that misses it. `reach` is a handle's half-size in
// squares.
export function fogChunkGrabAt(box, point, reach) {
  const [px, py] = point;
  if (px < box.x0 - reach || px > box.x1 + reach || py < box.y0 - reach || py > box.y1 + reach) return undefined;
  const near = (a, b) => Math.abs(a - b) <= reach;
  const l = near(px, box.x0);
  const r = !l && near(px, box.x1);
  const t = near(py, box.y0);
  const b = !t && near(py, box.y1);
  if ((l || r) && (t || b)) return { l, r, t, b };
  if ((l || r) && near(py, (box.y0 + box.y1) / 2)) return { l, r, t: false, b: false };
  if ((t || b) && near(px, (box.x0 + box.x1) / 2)) return { l: false, r: false, t, b };
  return px >= box.x0 && px < box.x1 && py >= box.y0 && py < box.y1 ? null : undefined;
}
