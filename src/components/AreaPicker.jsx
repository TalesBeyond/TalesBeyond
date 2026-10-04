import React, { useState } from 'react';
import { AREA_SHAPES, AREA_SIZE_MIN, AREA_SIZE_MAX, AREA_WIDTH_MAX, areaShape, clampAreaSize } from '../utils/areaOfEffect.js';

// What to lay on the map: an area of effect's shape and size (utils/
// areaOfEffect.js). The choice goes to GameView, which hands it to the map's
// Area tool to be aimed. `casterName`: the token it comes from, when one is
// selected.

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

export default function AreaPicker({ casterName = null, initial = null, onAim }) {
  const [shapeKey, setShapeKey] = useState(initial?.shape || 'cone');
  const [size, setSize] = useState(initial?.size || areaShape(initial?.shape || 'cone').defaultSize);
  const [width, setWidth] = useState(initial?.width || 5);
  const shape = areaShape(shapeKey);
  const needsToken = shape.aim === 'self' && !casterName;

  function pickShape(next) {
    setShapeKey(next.key);
    setSize(next.defaultSize);
  }

  const action =
    shape.aim === 'self' ? `Place around ${casterName || 'a token'}` : shape.aim === 'point' ? 'Choose the point on the map' : 'Aim on the map';

  return (
    <div className="area-picker">
      <div className="area-shapes" role="radiogroup" aria-label="Shape">
        {AREA_SHAPES.map((s) => (
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
        {needsToken
          ? 'An emanation surrounds a creature. Select a token you control first.'
          : casterName
            ? `From ${casterName}. Everyone at the table sees it once it is placed.`
            : 'No token selected: you choose where it starts on the map. Everyone at the table sees it once it is placed.'}
      </p>
      <button
        type="button"
        className="area-go"
        disabled={needsToken}
        onClick={() => onAim({ shape: shapeKey, size: clampAreaSize(size), width: clampAreaSize(width, AREA_WIDTH_MAX) })}
      >
        {action}
      </button>
    </div>
  );
}
