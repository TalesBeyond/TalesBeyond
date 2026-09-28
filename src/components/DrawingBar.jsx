import React from 'react';

// The DM's drawing bar (desktop): floats at the map's left edge while the
// Draw tool is active. Picks the drawing tool and Snap to grid; the chosen
// settings live in GameView and are remembered in this browser.

export const DRAW_SUB_TOOLS = [
  { id: 'pencil', label: 'Pencil', hint: 'Draw freehand', path: 'M3 17l1-4L14 3l3 3L7 16zM12 5l3 3' },
  { id: 'line', label: 'Line', hint: 'Drag a straight line', path: 'M4 16L16 4' },
  { id: 'circle', label: 'Circle', hint: 'Drag out from the centre', path: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z' },
  { id: 'rect', label: 'Rectangle', hint: 'Drag from corner to corner', path: 'M4 5h12v10H4z' },
];

const SNAP_PATH = 'M3 3h14v14H3zM3 8h14M3 12h14M8 3v14M12 3v14';

export function DrawIcon({ path }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export default function DrawingBar({ settings, onChange }) {
  const set = (patch) => onChange({ ...settings, ...patch });
  return (
    <div className="draw-bar" role="toolbar" aria-label="Drawing tools">
      {DRAW_SUB_TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`draw-bar-btn${settings.subTool === t.id ? ' active' : ''}`}
          aria-pressed={settings.subTool === t.id}
          title={`${t.label} — ${t.hint}`}
          onClick={() => set({ subTool: t.id })}
        >
          <DrawIcon path={t.path} />
          <span className="visually-hidden">{t.label}</span>
        </button>
      ))}
      <span className="draw-bar-sep" aria-hidden="true" />
      <button
        type="button"
        className={`draw-bar-btn${settings.snap ? ' active' : ''}`}
        aria-pressed={settings.snap}
        title={settings.snap ? 'Snap to grid is on — shapes land on the grid' : 'Snap to grid is off — shapes follow the pointer'}
        onClick={() => set({ snap: !settings.snap })}
      >
        <DrawIcon path={SNAP_PATH} />
        <span className="visually-hidden">Snap to grid</span>
      </button>
    </div>
  );
}
