import React, { useRef } from 'react';
import { DRAW_SWATCHES, DRAW_WIDTHS, hexToHsv, hsvToHex } from '../utils/drawing.js';

// The Draw tool's style controls: colour (wheel, brightness, swatches, recent
// colours), line thickness and fill. Shown in the desktop drawing bar's
// popover and in the phone's "Drawing style" sheet.

// Hue runs clockwise from the top; saturation grows from the white centre to
// the rim. Brightness is its own slider underneath.
function ColourWheel({ colour, onChange }) {
  const ref = useRef(null);
  const hsv = hexToHsv(colour);
  const v = hsv.v || 0.0001;

  function pickAt(e) {
    const rect = ref.current.getBoundingClientRect();
    const r = rect.width / 2;
    const dx = e.clientX - rect.left - r;
    const dy = e.clientY - rect.top - r;
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(dx, dy) / r);
    onChange(hsvToHex({ h, s, v: hsv.v || 1 }));
  }

  function onPointerDown(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pickAt(e);
  }

  const angle = (hsv.h * Math.PI) / 180;
  const markerX = 50 + Math.sin(angle) * hsv.s * 50;
  const markerY = 50 - Math.cos(angle) * hsv.s * 50;

  return (
    <div className="draw-wheel-wrap">
      <div
        ref={ref}
        className="draw-wheel"
        role="slider"
        aria-label="Colour wheel"
        aria-valuetext={colour}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => e.buttons && pickAt(e)}
      >
        <span className="draw-wheel-shade" style={{ opacity: 1 - v }} />
        <span className="draw-wheel-marker" style={{ left: `${markerX}%`, top: `${markerY}%`, background: colour }} />
      </div>
      <label className="draw-brightness">
        <span>Brightness</span>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(hsv.v * 100)}
          style={{ '--draw-hue': hsvToHex({ h: hsv.h, s: hsv.s, v: 1 }) }}
          onChange={(e) => onChange(hsvToHex({ ...hsv, v: Number(e.target.value) / 100 }))}
        />
      </label>
    </div>
  );
}

function SwatchRow({ label, colours, current, onPick }) {
  if (!colours.length) return null;
  return (
    <div className="draw-swatch-row">
      <span>{label}</span>
      <div className="draw-swatches">
        {colours.map((c) => (
          <button
            key={c}
            type="button"
            className={`draw-swatch${c.toLowerCase() === current.toLowerCase() ? ' active' : ''}`}
            style={{ background: c }}
            title={c}
            aria-label={`Colour ${c}`}
            onClick={() => onPick(c)}
          />
        ))}
      </div>
    </div>
  );
}

export default function DrawStylePanel({ style, recent = [], onChange }) {
  const set = (patch) => onChange({ ...style, ...patch });
  return (
    <div className="draw-style">
      <ColourWheel colour={style.color} onChange={(color) => set({ color })} />
      <SwatchRow label="Colours" colours={DRAW_SWATCHES} current={style.color} onPick={(color) => set({ color })} />
      <SwatchRow label="Recent" colours={recent} current={style.color} onPick={(color) => set({ color })} />
      <div className="draw-swatch-row">
        <span>Thickness</span>
        <div className="draw-widths" role="radiogroup" aria-label="Thickness">
          {DRAW_WIDTHS.map((w, i) => (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={style.width === w.id}
              className={`draw-width${style.width === w.id ? ' active' : ''}`}
              title={w.label}
              onClick={() => set({ width: w.id })}
            >
              <span style={{ height: 2 + i * 2.5, background: style.color }} />
              <span className="visually-hidden">{w.label}</span>
            </button>
          ))}
        </div>
      </div>
      <label className="draw-fill">
        <input type="checkbox" checked={Boolean(style.fill)} onChange={(e) => set({ fill: e.target.checked })} />
        <span>
          Fill circles and rectangles
          <small>A see-through fill in the same colour</small>
        </span>
      </label>
    </div>
  );
}
