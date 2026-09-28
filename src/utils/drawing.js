// The DM's Draw tool — pure helpers shared by the map (MapBoard.jsx), the
// drawing bar and the phone screens. A drawing is
// { id, islandId, kind: 'pencil' | 'line' | 'circle' | 'rect', geometry, style }
// with geometry in grid squares from its island's top-left corner (see
// supabase/migrations/20250101000052_drawings.sql for each kind's shape), so
// zoom and the island's cell size never change it.

// Line thickness presets, as a fraction of one grid square — chalk on the
// floor, so it scales with the map.
export const DRAW_WIDTHS = [
  { id: 'fine', label: 'Fine', squares: 0.06 },
  { id: 'medium', label: 'Medium', squares: 0.12 },
  { id: 'bold', label: 'Bold', squares: 0.2 },
  { id: 'heavy', label: 'Heavy', squares: 0.32 },
];

export const DEFAULT_DRAW_STYLE = { color: '#c0392b', width: 'medium', fill: false };

// How see-through a filled circle or rectangle is.
export const DRAW_FILL_OPACITY = 0.28;

// A pencil stroke keeps at most this many points after simplifying.
export const PENCIL_MAX_POINTS = 400;
// Points closer than this to the simplified line (in squares) are dropped.
const PENCIL_TOLERANCE = 0.04;

export function drawWidthSquares(widthId) {
  return (DRAW_WIDTHS.find((w) => w.id === widthId) || DRAW_WIDTHS[1]).squares;
}

const round2 = (n) => Math.round(n * 100) / 100;

// Ramer–Douglas–Peucker: drops points that barely bend the line.
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  let maxDist = -1;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const dist = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  if (maxDist <= tolerance) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

// The stored form of a pencil stroke: simplified, rounded to 1/100 of a
// square, and capped. Null when there's nothing to keep (a click without a
// drag).
export function finishPencilPoints(raw) {
  if (raw.length < 2) return null;
  let tolerance = PENCIL_TOLERANCE;
  let points = simplify(raw, tolerance);
  while (points.length > PENCIL_MAX_POINTS) {
    tolerance *= 2;
    points = simplify(raw, tolerance);
  }
  points = points.map(([x, y]) => [round2(x), round2(y)]);
  const moved = points.some(([x, y]) => x !== points[0][0] || y !== points[0][1]);
  return moved ? points : null;
}

// SVG path data for a pencil stroke, in pixels at `cellPx` per square.
export function pencilPath(points, cellPx) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * cellPx).toFixed(1)} ${(y * cellPx).toFixed(1)}`).join('');
}
