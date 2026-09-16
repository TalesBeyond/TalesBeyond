// All grid math in one place so the board, ruler, and token layer
// agree on how a (col, row) cell maps to pixel coordinates.

export function clampGridDims(value, min = 4, max = 60) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function cellToPixelCenter(col, row, cellSize) {
  return {
    x: col * cellSize + cellSize / 2,
    y: row * cellSize + cellSize / 2,
  };
}

export function pixelToCell(x, y, cellSize, cols, rows) {
  const col = Math.min(cols - 1, Math.max(0, Math.floor(x / cellSize)));
  const row = Math.min(rows - 1, Math.max(0, Math.floor(y / cellSize)));
  return { col, row };
}

// Extra world-space room (un-zoomed px) kept around every island's bounding
// box, in every direction, so panning never hits a hard edge — the map
// feels like an infinite canvas without actually being one. Shared by
// MapBoard (rendering) and GameView (recentering the scroll position) so
// both agree on where an island actually sits within the scrollable area.
export const CANVAS_PAN_PADDING = 4000;

export function computeCanvasBounds(islands) {
  const list = Object.values(islands || {});
  const originX = Math.min(0, ...list.map((isl) => isl.x)) - CANVAS_PAN_PADDING;
  const originY = Math.min(0, ...list.map((isl) => isl.y)) - CANVAS_PAN_PADDING;
  const maxX = Math.max(0, ...list.map((isl) => isl.x + isl.cols * isl.cellSize)) + CANVAS_PAN_PADDING;
  const maxY = Math.max(0, ...list.map((isl) => isl.y + isl.rows * isl.cellSize)) + CANVAS_PAN_PADDING;
  return { originX, originY, maxX, maxY };
}

// Distance between two grid cells using D&D 5e's "5-10-5" diagonal rule
// (every second diagonal step costs an extra square), returned in feet
// at the given feet-per-square scale. Divide by feetPerSquare for squares.
export function feetDistance(a, b, feetPerSquare = 5) {
  const dx = Math.abs(a.col - b.col);
  const dy = Math.abs(a.row - b.row);
  const diagonal = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diagonal;
  const diagonalPairs = Math.floor(diagonal / 2);
  const diagonalRemainder = diagonal % 2;
  const squares = straight + diagonal + diagonalPairs; // every 2nd diagonal adds +1 square
  return squares * feetPerSquare;
}
