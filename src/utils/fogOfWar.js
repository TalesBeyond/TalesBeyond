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
