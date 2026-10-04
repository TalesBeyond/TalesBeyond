// The DM's Draw tool — pure helpers shared by the map (MapBoard.jsx), the
// drawing bar and the phone screens. A drawing is
// { id, islandId, kind: 'pencil' | 'line' | 'circle' | 'rect' | 'fill', geometry, style }
// with geometry in grid squares from its island's top-left corner (see
// supabase/migrations/20250101000052_drawings.sql for each kind's shape), so
// zoom and the island's cell size never change it. A 'fill' has no geometry:
// it paints its whole island one colour, under the grid.

// Line thickness presets, as a fraction of one grid square — chalk on the
// floor, so it scales with the map. A style's `width` is a preset's id or,
// from the Pencil's Thickness slider, a number of squares.
export const DRAW_WIDTHS = [
  { id: 'fine', label: 'Fine', squares: 0.06 },
  { id: 'medium', label: 'Medium', squares: 0.12 },
  { id: 'bold', label: 'Bold', squares: 0.2 },
  { id: 'heavy', label: 'Heavy', squares: 0.32 },
];

// `opacity` is Fill's: how much of the map art shows through (1 = solid).
export const DEFAULT_DRAW_STYLE = { color: '#c0392b', width: 'medium', fill: false, opacity: 1 };

// How see-through a filled circle or rectangle is.
export const DRAW_FILL_OPACITY = 0.28;

// A pencil stroke keeps at most this many points after simplifying.
export const PENCIL_MAX_POINTS = 400;
// Points closer than this to the simplified line (in squares) are dropped.
const PENCIL_TOLERANCE = 0.04;

// The Thickness slider's range, in squares.
export const DRAW_WIDTH_MIN = 0.03;
export const DRAW_WIDTH_MAX = 0.6;

export function drawWidthSquares(width) {
  if (typeof width === 'number' && Number.isFinite(width)) return Math.max(DRAW_WIDTH_MIN, Math.min(DRAW_WIDTH_MAX, width));
  return (DRAW_WIDTHS.find((w) => w.id === width) || DRAW_WIDTHS[1]).squares;
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

// ---- Lines, circles and rectangles ----

const snapHalf = (v) => Math.round(v * 2) / 2; // a grid corner or a square's centre
const snapPoint = ([x, y]) => [snapHalf(x), snapHalf(y)];
const MIN_SIZE = 0.1; // squares — anything smaller is a click, not a shape

// The geometry of a line, circle or rectangle dragged from `start` to `end`
// (island squares), or null when it has no size. With `snap`, line ends and
// circle centres land on grid corners or square centres, a circle's radius
// is whole squares, and rectangle corners land on grid corners.
export function shapeGeometry(kind, start, end, snap) {
  if (kind === 'line') {
    const from = snap ? snapPoint(start) : start.map(round2);
    const to = snap ? snapPoint(end) : end.map(round2);
    return Math.hypot(to[0] - from[0], to[1] - from[1]) < MIN_SIZE ? null : { from, to };
  }
  if (kind === 'circle') {
    const center = snap ? snapPoint(start) : start.map(round2);
    const reach = Math.hypot(end[0] - center[0], end[1] - center[1]);
    if (reach < MIN_SIZE) return null;
    return { center, radius: snap ? Math.max(1, Math.round(reach)) : round2(reach) };
  }
  if (kind === 'rect') {
    const [ax, ay] = snap ? start.map(Math.round) : start;
    const [bx, by] = snap ? end.map(Math.round) : end;
    const w = Math.abs(bx - ax);
    const h = Math.abs(by - ay);
    if (w < MIN_SIZE || h < MIN_SIZE) return null;
    return { x: round2(Math.min(ax, bx)), y: round2(Math.min(ay, by)), w: round2(w), h: round2(h) };
  }
  return null;
}

// The size read-out shown while a shape is drawn or resized, and where it
// sits (island squares): above a circle, above a rectangle, at a line's
// middle. A snapped line uses the ruler's 5-10-5 diagonal rule.
export function shapeFeetLabel(kind, geometry, feetPerSquare, snap) {
  const ft = (squares) => Math.round(squares * feetPerSquare);
  if (kind === 'line') {
    const dx = Math.abs(geometry.to[0] - geometry.from[0]);
    const dy = Math.abs(geometry.to[1] - geometry.from[1]);
    let feet;
    if (snap) {
      const a = Math.round(dx);
      const b = Math.round(dy);
      const diagonal = Math.min(a, b);
      feet = (Math.max(a, b) + Math.floor(diagonal / 2)) * feetPerSquare;
    } else {
      feet = ft(Math.hypot(dx, dy));
    }
    const at = [(geometry.from[0] + geometry.to[0]) / 2, (geometry.from[1] + geometry.to[1]) / 2];
    return { text: `${feet} ft`, at };
  }
  if (kind === 'circle') {
    return { text: `${ft(geometry.radius)} ft radius`, at: [geometry.center[0], geometry.center[1] - geometry.radius] };
  }
  if (kind === 'rect') {
    return { text: `${ft(geometry.w)} × ${ft(geometry.h)} ft`, at: [geometry.x + geometry.w / 2, geometry.y] };
  }
  return null;
}

// ---- Island fill ----

// The CSS colour an island fill paints with: its colour at its opacity.
export function islandFillColour(style = {}) {
  const n = parseInt(String(style.color || '#c0392b').replace('#', ''), 16) || 0;
  const opacity = Math.max(0, Math.min(1, style.opacity ?? 1));
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
}

// ---- Colour ----

// The quick swatches under the colour wheel.
export const DRAW_SWATCHES = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2e86de', '#8e44ad', '#1d1a16', '#f5f0e6'];
export const RECENT_COLOURS_MAX = 5;

// '#rrggbb' <-> { h: 0-360, s: 0-1, v: 0-1 }
export function hexToHsv(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return { h: 0, s: 1, v: 1 };
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }) {
  const f = (k) => {
    const x = (k + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(x, 4 - x, 1));
  };
  return '#' + [f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

// The recent-colours list after using `colour`: newest first, no repeats.
export function withRecentColour(recent, colour) {
  return [colour, ...(recent || []).filter((c) => c !== colour)].slice(0, RECENT_COLOURS_MAX);
}

// ---- Hit-testing, handles, moving and resizing ----

function distToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function rectCorners({ x, y, w, h }) {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

// Whether island point `p` (squares) touches a drawing: its line (within
// `tolerance` squares plus half its thickness), or its inside when filled.
// An island fill never does — Select and the Eraser pass over it; Fill
// again with the same colour, or Clear, takes it off.
export function hitsDrawing(drawing, p, tolerance) {
  const { kind, geometry, style = {} } = drawing;
  if (kind === 'fill') return false;
  const reach = tolerance + drawWidthSquares(style.width) / 2;
  if (kind === 'pencil') {
    const pts = geometry.points || [];
    for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= reach) return true;
    return false;
  }
  if (kind === 'line') return distToSegment(p, geometry.from, geometry.to) <= reach;
  if (kind === 'circle') {
    const d = Math.hypot(p[0] - geometry.center[0], p[1] - geometry.center[1]);
    return Math.abs(d - geometry.radius) <= reach || (style.fill && d <= geometry.radius);
  }
  if (kind === 'rect') {
    const c = rectCorners(geometry);
    for (let i = 0; i < 4; i++) if (distToSegment(p, c[i], c[(i + 1) % 4]) <= reach) return true;
    const inside = p[0] >= geometry.x && p[0] <= geometry.x + geometry.w && p[1] >= geometry.y && p[1] <= geometry.y + geometry.h;
    return Boolean(style.fill && inside);
  }
  return false;
}

// The drawing's bounding box in island squares: [minX, minY, maxX, maxY].
export function drawingBounds({ kind, geometry }) {
  let pts;
  if (kind === 'pencil') pts = geometry.points || [];
  else if (kind === 'line') pts = [geometry.from, geometry.to];
  else if (kind === 'circle') {
    const [cx, cy] = geometry.center;
    const r = geometry.radius;
    pts = [[cx - r, cy - r], [cx + r, cy + r]];
  } else pts = rectCorners(geometry);
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// Where a selected drawing's resize handles sit (island squares). A pencil
// stroke has none — it can only be moved.
export function drawingHandles({ kind, geometry }) {
  if (kind === 'line') return [{ id: 'from', at: geometry.from }, { id: 'to', at: geometry.to }];
  if (kind === 'circle') return [{ id: 'radius', at: [geometry.center[0] + geometry.radius, geometry.center[1]] }];
  if (kind === 'rect') {
    const [nw, ne, se, sw] = rectCorners(geometry);
    return [{ id: 'nw', at: nw }, { id: 'ne', at: ne }, { id: 'se', at: se }, { id: 'sw', at: sw }];
  }
  return [];
}

// A drawing moved by (dx, dy) squares. Snapped, the move is in whole squares
// for rectangles (corners stay on grid corners) and half squares otherwise;
// a pencil stroke never snaps.
export function movedGeometry({ kind, geometry }, dx, dy, snap) {
  if (snap && kind !== 'pencil') {
    const step = kind === 'rect' ? 1 : 0.5;
    dx = Math.round(dx / step) * step;
    dy = Math.round(dy / step) * step;
  }
  const move = ([x, y]) => [round2(x + dx), round2(y + dy)];
  if (kind === 'pencil') return { points: geometry.points.map(move) };
  if (kind === 'line') return { from: move(geometry.from), to: move(geometry.to) };
  if (kind === 'circle') return { ...geometry, center: move(geometry.center) };
  if (kind === 'rect') return { ...geometry, x: round2(geometry.x + dx), y: round2(geometry.y + dy) };
  return geometry;
}

// A drawing with one handle dragged to island point `p`, or null when that
// would leave it with no size.
export function resizedGeometry({ kind, geometry }, handle, p, snap) {
  if (kind === 'line') {
    const fixed = handle === 'from' ? geometry.to : geometry.from;
    const g = shapeGeometry('line', fixed, p, snap);
    if (!g) return null;
    // shapeGeometry snaps both ends; keep the fixed end exactly where it was.
    return handle === 'from' ? { from: g.to, to: fixed } : { from: fixed, to: g.to };
  }
  if (kind === 'circle') {
    const reach = Math.hypot(p[0] - geometry.center[0], p[1] - geometry.center[1]);
    if (reach < MIN_SIZE) return null;
    return { ...geometry, radius: snap ? Math.max(1, Math.round(reach)) : round2(reach) };
  }
  if (kind === 'rect') {
    const [nw, ne, se, sw] = rectCorners(geometry);
    const opposite = { nw: se, ne: sw, se: nw, sw: ne }[handle];
    return shapeGeometry('rect', opposite, p, snap);
  }
  return null;
}
