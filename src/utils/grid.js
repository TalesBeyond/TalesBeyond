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

// How many feet one square of an island stands for. Each island sets its
// own when it's made (Mapping → Islands); islands from before that follow
// their layer's old value, then the D&D default of 5.
export function islandFeet(layer, islandId) {
  return layer?.islands?.[islandId]?.feetPerSquare || layer?.feetPerSquare || 5;
}

// A typed feet-per-square value, kept to a sensible whole number.
export function clampFeetPerSquare(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(1, Math.min(100, n)) : 5;
}

// A straight ruler line from p1 to p2 (screen pixels) across islands that
// may each have their own scale: every stretch counts at the scale of the
// island it passes over. A gap between islands counts half at the scale of
// the island before it and half at the one after, so the answer is the
// same whichever end the ruler starts from.
// `areas`: [{ left, top, w, h, feetPerPx }] in the same pixels, topmost
// last. Returns feet, unrounded.
export function feetAlongLine(p1, p2, areas) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);
  if (!length) return 0;
  // Where the line enters and leaves each area (Liang–Barsky clipping).
  const cuts = [0, 1];
  for (const a of areas) {
    let t0 = 0;
    let t1 = 1;
    const edges = [
      [-dx, p1.x - a.left],
      [dx, a.left + a.w - p1.x],
      [-dy, p1.y - a.top],
      [dy, a.top + a.h - p1.y],
    ];
    let inside = true;
    for (const [p, q] of edges) {
      if (p === 0) {
        if (q < 0) inside = false;
      } else {
        const t = q / p;
        if (p < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
    }
    if (inside && t0 < t1) cuts.push(t0, t1);
  }
  cuts.sort((a, b) => a - b);
  const areaAt = (t) => {
    const x = p1.x + dx * t;
    const y = p1.y + dy * t;
    for (let i = areas.length - 1; i >= 0; i--) {
      const a = areas[i];
      if (x >= a.left && x <= a.left + a.w && y >= a.top && y <= a.top + a.h) return a;
    }
    return null;
  };
  // The line as stretches, each over one island or over a gap (null).
  const stretches = [];
  for (let i = 1; i < cuts.length; i++) {
    const span = cuts[i] - cuts[i - 1];
    if (span > 0) stretches.push({ span, area: areaAt((cuts[i - 1] + cuts[i]) / 2) });
  }
  let feet = 0;
  stretches.forEach((s, i) => {
    const px = s.span * length;
    if (s.area) {
      feet += px * s.area.feetPerPx;
      return;
    }
    const before = stretches.slice(0, i).reverse().find((x) => x.area)?.area;
    const after = stretches.slice(i + 1).find((x) => x.area)?.area;
    const a = before || after;
    const b = after || before;
    if (a) feet += (px / 2) * a.feetPerPx + (px / 2) * b.feetPerPx;
  });
  return feet;
}
