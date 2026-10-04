// Areas of effect (D&D 5e): the shapes a spell, a breath or an aura covers,
// laid over the map as a template. `aim` says how one is placed:
//   'direction' — it starts at its origin (a token, or a point) and extends
//                 the way you aim it: cone, cube, line.
//   'point'     — it is centred on a point you choose: sphere, cylinder.
//   'self'      — it surrounds a creature and moves with it: emanation.
// Geometry here is in squares on one island's grid; MapBoard turns it into
// pixels and works out which squares and creatures are inside.

export const AREA_SHAPES = [
  {
    key: 'cone',
    label: 'Cone',
    sizeLabel: 'Length',
    sizes: [15, 30, 60],
    defaultSize: 15,
    aim: 'direction',
    rule: 'Spreads from its origin in the direction you choose. At any point along its length it is as wide as that point is far from the origin.',
  },
  {
    key: 'cube',
    label: 'Cube',
    sizeLabel: 'Side',
    sizes: [5, 10, 15, 20, 30],
    defaultSize: 10,
    aim: 'direction',
    rule: 'Its origin lies on one face and it extends away from there. The size is the length of each side.',
  },
  {
    key: 'line',
    label: 'Line',
    sizeLabel: 'Length',
    sizes: [30, 60, 100],
    defaultSize: 30,
    aim: 'direction',
    rule: 'Runs straight from its origin for its length, as wide as the spell says (usually 5 ft).',
  },
  {
    key: 'sphere',
    label: 'Sphere',
    sizeLabel: 'Radius',
    sizes: [5, 10, 15, 20, 30],
    defaultSize: 20,
    aim: 'point',
    rule: 'Spreads out from a point you choose, as far as its radius in every direction.',
  },
  {
    key: 'cylinder',
    label: 'Cylinder',
    sizeLabel: 'Radius',
    sizes: [5, 10, 20, 40],
    defaultSize: 10,
    aim: 'point',
    rule: 'A circle of its radius around a point you choose, rising as high as the spell says.',
  },
  {
    key: 'emanation',
    label: 'Emanation',
    sizeLabel: 'Distance',
    sizes: [5, 10, 15, 30],
    defaultSize: 10,
    aim: 'self',
    rule: 'Reaches out from a creature in every direction and moves with it. The creature itself isn’t inside.',
  },
];

export const AREA_SIZE_MIN = 5;
export const AREA_SIZE_MAX = 300;
export const AREA_WIDTH_MAX = 60;
export const MAX_AREAS = 20; // on a table at once; the oldest goes first

export function areaShape(key) {
  return AREA_SHAPES.find((s) => s.key === key) || null;
}

export function clampAreaSize(value, max = AREA_SIZE_MAX) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(AREA_SIZE_MIN, Math.min(max, n)) : AREA_SIZE_MIN;
}

// "Cone 15 ft", "Line 60 ft × 10 ft".
export function areaLabel(area) {
  const shape = areaShape(area.shape);
  if (!shape) return '';
  const wide = area.shape === 'line' && area.width && area.width !== 5 ? ` × ${area.width} ft` : '';
  return `${shape.label} ${area.size} ft${wide}`;
}

const text = (value, max) => (typeof value === 'string' && value.length > 0 && value.length <= max ? value : null);
const point = (value) => (Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) ? [value[0], value[1]] : null);

// A template as it arrives from someone else's browser: only the fields a
// template has, each checked. Null when it isn't one.
export function sanitizeArea(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const shape = areaShape(raw.shape);
  const id = text(raw.id, 80);
  const byId = text(raw.byId, 80);
  const layerId = text(raw.layerId, 80);
  if (!shape || !id || !byId || !layerId) return null;
  const area = {
    id,
    byId,
    layerId,
    name: text(raw.name, 40) || 'Someone',
    color: typeof raw.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(raw.color) ? raw.color : null,
    shape: shape.key,
    size: clampAreaSize(raw.size),
    width: clampAreaSize(raw.width, AREA_WIDTH_MAX),
    entityId: text(raw.entityId, 80),
    islandId: text(raw.islandId, 80),
    origin: point(raw.origin),
    aim: point(raw.aim),
    angle: Number.isFinite(raw.angle) ? raw.angle : 0,
  };
  if (shape.aim === 'self' && !area.entityId) return null;
  if (shape.aim === 'point' && !(area.aim && area.islandId)) return null;
  if (shape.aim === 'direction' && !area.entityId && !(area.origin && area.islandId)) return null;
  return area;
}

// The template's outline, in squares: a circle, or a polygon's corners. `at`
// is where it starts — a token's centre, or a free point — and `half` is half
// that token's width (0 for a point): a shape cast from a token starts at the
// edge of its space, and an emanation is measured from there too.
export function areaOutline(area, at, half, feetPerSquare) {
  const shape = areaShape(area.shape);
  if (!shape || !at) return null;
  const size = area.size / feetPerSquare;
  if (shape.aim === 'self') return { circle: true, cx: at[0], cy: at[1], r: size + half };
  if (shape.aim === 'point') {
    const centre = area.aim || at;
    return { circle: true, cx: centre[0], cy: centre[1], r: size };
  }
  const dx = Math.cos(area.angle);
  const dy = Math.sin(area.angle);
  const startX = at[0] + dx * half;
  const startY = at[1] + dy * half;
  const endX = startX + dx * size;
  const endY = startY + dy * size;
  // Half the width at the far end, and at the origin (a cone starts at a point).
  const far = area.shape === 'line' ? (area.width || 5) / feetPerSquare / 2 : size / 2;
  const near = area.shape === 'cone' ? 0 : far;
  return {
    circle: false,
    points: [
      [startX - dy * near, startY + dx * near],
      [endX - dy * far, endY + dx * far],
      [endX + dy * far, endY - dx * far],
      [startX + dy * near, startY - dx * near],
    ],
  };
}

export function outlineBounds(outline) {
  if (outline.circle) return { minX: outline.cx - outline.r, minY: outline.cy - outline.r, maxX: outline.cx + outline.r, maxY: outline.cy + outline.r };
  const xs = outline.points.map((p) => p[0]);
  const ys = outline.points.map((p) => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

// Whether a point (a square's centre) is inside the outline.
export function outlineContains(outline, x, y) {
  if (outline.circle) return Math.hypot(x - outline.cx, y - outline.cy) <= outline.r + 1e-6;
  const pts = outline.points;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
