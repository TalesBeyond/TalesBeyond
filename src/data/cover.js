// Cover: a part of a map the DM marks as cover — a low wall, a pillar, an
// overturned table — at one of three levels: quarter, half or full. It is
// laid the way an area of effect is (utils/areaOfEffect.js): the DM picks a
// level, a shape and a size (AreaPicker.jsx), aims it on the map with the
// Area tool and places it. Everyone at the table sees the squares it takes in
// a faint yellow wash inside a yellow outline, with a tag naming its level;
// the DM's tag has the button that takes it off (MapBoard.jsx).
//
// The level is only there for the table to see. Nothing is added to or taken
// from any roll: what a cover does to an attack is the DM's to rule.
//
// Unlike a spell's template a cover stays. It is kept as a token of kind
// 'cover' that the map never draws as one, so it is saved and carried between
// browsers as tokens are: `coverLevel` is its level, `coverShape`,
// `coverSize`, `coverWidth`, `coverAt` and `coverAngle` the template it was
// laid as, and `col` and `row` the square that template starts on (what the
// fog of war goes by). Like a bulletin board it is never written to the
// database: on a cloud table it lives in the DM's browser and reaches players
// over the table's channel (lib/boardSync.js).

import { AREA_WIDTH_MAX, areaShape, clampAreaSize } from '../utils/areaOfEffect.js';

export const COVER_COLOR = '#ecc94b';

// `fill`: how solid the yellow wash is — a little more for more cover.
export const COVER_LEVELS = [
  { key: 'quarter', label: 'Quarter cover', short: 'Quarter', fill: 0.1 },
  { key: 'half', label: 'Half cover', short: 'Half', fill: 0.17 },
  { key: 'full', label: 'Full cover', short: 'Full', fill: 0.26 },
];
export const DEFAULT_COVER_LEVEL = 'half';

// The shapes a cover is laid in: three of an area of effect's, aimed the same
// way, named and sized for things that stand on a map.
export const COVER_SHAPES = [
  {
    key: 'line',
    label: 'Line',
    sizeLabel: 'Length',
    sizes: [10, 15, 20, 30, 60],
    defaultSize: 15,
    aim: 'direction',
    rule: 'Runs straight from where you press, the way you drag: a wall, a fence, a hedge.',
  },
  {
    key: 'cube',
    label: 'Square',
    sizeLabel: 'Side',
    sizes: [5, 10, 15, 20],
    defaultSize: 5,
    aim: 'direction',
    rule: 'Starts where you press and extends the way you drag: a crate, a cart, a heap of rubble.',
  },
  {
    key: 'sphere',
    label: 'Circle',
    sizeLabel: 'Radius',
    sizes: [5, 10, 15, 20],
    defaultSize: 5,
    aim: 'point',
    rule: 'Spreads out from the point you press: a pillar, a tree, a boulder.',
  },
];

export function isCover(entity) {
  return entity?.kind === 'cover';
}

// The level by its key, or the default one for anything else.
export function coverLevelOf(key) {
  return COVER_LEVELS.find((level) => level.key === key) || COVER_LEVELS.find((level) => level.key === DEFAULT_COVER_LEVEL);
}

const point = (value) => (Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) ? [value[0], value[1]] : null);

// The template a cover was laid as, each field checked. Null when `raw`
// doesn't hold one.
export function coverTemplate(raw) {
  const shape = COVER_SHAPES.find((s) => s.key === raw?.coverShape);
  const at = point(raw?.coverAt);
  if (!shape || !at) return null;
  return {
    coverShape: shape.key,
    coverSize: clampAreaSize(raw.coverSize),
    coverWidth: clampAreaSize(raw.coverWidth, AREA_WIDTH_MAX),
    coverAt: at,
    coverAngle: Number.isFinite(raw.coverAngle) ? raw.coverAngle : 0,
  };
}

// A cover as MapBoard draws it: an area of effect's fields, plus `cover`, its
// level. Null for a token that isn't a cover.
export function coverAsArea(entity) {
  const template = isCover(entity) ? coverTemplate(entity) : null;
  if (!template) return null;
  return {
    id: entity.id,
    layerId: entity.layerId,
    islandId: entity.islandId,
    entityId: null,
    cover: coverLevelOf(entity.coverLevel).key,
    color: COVER_COLOR,
    shape: template.coverShape,
    size: template.coverSize,
    width: template.coverWidth,
    origin: template.coverAt,
    aim: template.coverAt,
    angle: template.coverAngle,
  };
}

// What a cover's token holds, from the draft the Area tool aimed (an area of
// effect's fields, plus `cover`) on `island`. Null while it hasn't been aimed.
export function coverFromDraft(draft, island) {
  const at = point(areaShape(draft?.shape)?.aim === 'point' ? draft.aim : draft?.origin);
  const template = at && coverTemplate({ coverShape: draft.shape, coverSize: draft.size, coverWidth: draft.width, coverAt: at, coverAngle: draft.angle });
  if (!template || !island) return null;
  const square = (value, count) => Math.max(0, Math.min(count - 1, Math.floor(value)));
  return { coverLevel: coverLevelOf(draft.cover).key, ...template, col: square(at[0], island.cols), row: square(at[1], island.rows) };
}
