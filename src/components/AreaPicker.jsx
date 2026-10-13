import React, { useState } from 'react';
import { AREA_SHAPES, AREA_SIZE_MIN, AREA_SIZE_MAX, AREA_WIDTH_MAX, clampAreaSize } from '../utils/areaOfEffect.js';
import { COVER_LEVELS, COVER_SHAPES, coverLevelOf } from '../data/cover.js';

// What to lay on the map: an area of effect's shape and size (utils/
// areaOfEffect.js). The choice goes to GameView, which hands it to the map's
// Area tool to be aimed. `casterName`: the token it comes from, when one is
// selected. `cover`: the DM is laying a cover instead (data/cover.js) — its
// level and one of a cover's shapes, and the choice carries `cover`, the level.

const GLYPHS = {
  cone: <path d="M3 12L20 5v14z" />,
  cube: <path d="M6 6h12v12H6z" />,
  line: <path d="M3 10h18v4H3z" />,
  sphere: <circle cx="12" cy="12" r="8" />,
  cylinder: <path d="M5 7c0-1.700 3.100-3 7-3s7 1.300 7 3v10c0 1.700-3.100 3-7 3s-7-1.300-7-3zM5 7c0 1.700 3.100 3 7 3s7-1.300 7-3" />,
  emanation: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="8.500" strokeDasharray="3 3" />
    </>
  ),
};

export default function AreaPicker({ casterName = null, initial = null, cover = false, onAim }) {
  const shapes = cover ? COVER_SHAPES : AREA_SHAPES;
  const first = shapes.find((s) => s.key === initial?.shape) || shapes[0];
  const [shapeKey, setShapeKey] = useState(first.key);
  const [size, setSize] = useState(initial?.size || first.defaultSize);
  const [width, setWidth] = useState(initial?.width || 5);
  const [level, setLevel] = useState(coverLevelOf(initial?.cover).key);
  const shape = shapes.find((s) => s.key === shapeKey);
  const needsToken = shape.aim === 'self' && !casterName;

  function pickShape(next) {
    setShapeKey(next.key);
    setSize(next.defaultSize);
  }

  const action =
    shape.aim === 'self' ? `Place around ${casterName || 'a token'}` : shape.aim === 'point' ? 'Choose the point on the map' : 'Aim on the map';

  return (
    <div className="area-picker">
      {cover && (
        <div className="area-field">
          <span className="area-field-label" id="cover-level-label">
            Cover
          </span>
          <div className="area-sizes" role="group" aria-labelledby="cover-level-label">
            {COVER_LEVELS.map((l) => (
              <button key={l.key} type="button" className={l.key === level ? 'active' : ''} aria-pressed={l.key === level} onClick={() => setLevel(l.key)}>
                {l.short}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="area-shapes" role="radiogroup" aria-label="Shape">
        {shapes.map((s) => (
          <button key={s.key} type="button" role="radio" aria-checked={s.key === shapeKey} className={s.key === shapeKey ? 'active' : ''} onClick={() => pickShape(s)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
              {GLYPHS[s.key]}
            </svg>
            {s.label}
          </button>
        ))}
      </div>
      <p className="area-rule">{shape.rule}</p>

      <div className="area-field">
        <span className="area-field-label" id="area-size-label">
          {shape.sizeLabel}
        </span>
        <div className="area-sizes" role="group" aria-labelledby="area-size-label">
          {shape.sizes.map((n) => (
            <button key={n} type="button" className={Number(size) === n ? 'active' : ''} aria-pressed={Number(size) === n} onClick={() => setSize(n)}>
              {n} ft
            </button>
          ))}
          <label className="area-number">
            <span>Other</span>
            <input type="number" inputMode="numeric" min={AREA_SIZE_MIN} max={AREA_SIZE_MAX} step="5" value={size} onChange={(e) => setSize(e.target.value)} />
            <span>ft</span>
          </label>
        </div>
      </div>

      {shapeKey === 'line' && (
        <div className="area-field">
          <span className="area-field-label">Width</span>
          <label className="area-number">
            <input type="number" inputMode="numeric" min={AREA_SIZE_MIN} max={AREA_WIDTH_MAX} step="5" value={width} onChange={(e) => setWidth(e.target.value)} />
            <span>ft</span>
          </label>
        </div>
      )}

      <p className="area-note">
        {cover
          ? 'Everyone at the table sees it once it is placed, and it stays until you take it off. It changes no roll: what it does to an attack is yours to rule.'
          : needsToken
          ? 'An emanation surrounds a creature. Select a token you control first.'
          : casterName
            ? `From ${casterName}. Everyone at the table sees it once it is placed.`
            : 'No token selected: you choose where it starts on the map. Everyone at the table sees it once it is placed.'}
      </p>
      <button
        type="button"
        className="area-go"
        disabled={needsToken}
        onClick={() => onAim({ shape: shapeKey, size: clampAreaSize(size), width: clampAreaSize(width, AREA_WIDTH_MAX), ...(cover ? { cover: level } : {}) })}
      >
        {action}
      </button>
    </div>
  );
}
