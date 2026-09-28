import React, { useEffect, useRef, useState } from 'react';
import DrawStylePanel from './DrawStyle.jsx';
import { drawWidthSquares } from '../utils/drawing.js';

// The DM's drawing bar (desktop): floats at the map's left edge while the
// Draw tool is active. Picks the drawing tool, the style (colour button →
// popover) and Snap to grid; the chosen settings live in GameView and are
// remembered in this browser.

export const DRAW_SUB_TOOLS = [
  { id: 'pencil', label: 'Pencil', hint: 'Draw freehand', path: 'M3 17l1-4L14 3l3 3L7 16zM12 5l3 3' },
  { id: 'line', label: 'Line', hint: 'Drag a straight line', path: 'M4 16L16 4' },
  { id: 'circle', label: 'Circle', hint: 'Drag out from the centre', path: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z' },
  { id: 'rect', label: 'Rectangle', hint: 'Drag from corner to corner', path: 'M4 5h12v10H4z' },
  { id: 'select', label: 'Select', hint: 'Pick a drawing to move it or drag its handles', path: 'M5 3l10 7-5 1-2 5z' },
  { id: 'eraser', label: 'Eraser', hint: 'Drag across drawings to remove them', path: 'M3 13l7-7 6 6-4 4H6zM9 17h8' },
];

const SNAP_PATH = 'M3 3h14v14H3zM3 8h14M3 12h14M8 3v14M12 3v14';
const UNDO_PATH = 'M7 5L3 9l4 4M3 9h9a5 5 0 0 1 0 10H9';
const REDO_PATH = 'M13 5l4 4-4 4M17 9H8a5 5 0 0 0 0 10h3';
const CLEAR_PATH = 'M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11';

// "Clear this island" / "Clear this map", each behind a confirm naming how
// many drawings go. Shared with the phone's drawing style sheet.
export function DrawClearMenu({ islandName, mapName, islandCount, mapCount, onClearIsland, onClearMap, onDone }) {
  const [asking, setAsking] = useState(null); // 'island' | 'map' | null
  if (asking) {
    const count = asking === 'island' ? islandCount : mapCount;
    const where = asking === 'island' ? islandName : mapName;
    return (
      <div className="draw-clear" role="alertdialog" aria-label="Confirm clearing drawings">
        <p>
          Clear {count} drawing{count === 1 ? '' : 's'} from {where}? Everyone at the table stops seeing them.
        </p>
        <div className="draw-clear-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setAsking(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (asking === 'island') onClearIsland();
              else onClearMap();
              setAsking(null);
              onDone?.();
            }}
          >
            Clear
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="draw-clear">
      <button type="button" className="draw-clear-option" disabled={!islandCount} onClick={() => setAsking('island')}>
        Clear this island <small>{islandName} · {islandCount}</small>
      </button>
      <button type="button" className="draw-clear-option" disabled={!mapCount} onClick={() => setAsking('map')}>
        Clear this map <small>{mapName} · {mapCount}</small>
      </button>
    </div>
  );
}

export function DrawIcon({ path }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export default function DrawingBar({ settings, onChange, recentColours, canUndo, canRedo, onUndo, onRedo, ...clear }) {
  const set = (patch) => onChange({ ...settings, ...patch });
  const [open, setOpen] = useState(null); // 'style' | 'clear' | null
  const styleOpen = open === 'style';
  const setStyleOpen = (next) => setOpen((o) => ((typeof next === 'function' ? next(o === 'style') : next) ? 'style' : null));
  const barRef = useRef(null);

  // A popover closes on Esc or a press anywhere outside the bar.
  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      if (!barRef.current?.contains(e.target)) setOpen(null);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(null);
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const dotSize = 10 + drawWidthSquares(settings.style.width) * 30;

  return (
    <div ref={barRef} className="draw-bar" role="toolbar" aria-label="Drawing tools">
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
        className={`draw-bar-btn draw-bar-colour${styleOpen ? ' active' : ''}`}
        aria-expanded={styleOpen}
        title="Colour, thickness and fill"
        onClick={() => setStyleOpen((o) => !o)}
      >
        <span
          className={`draw-colour-dot${settings.style.fill ? ' filled' : ''}`}
          style={{ width: dotSize, height: dotSize, borderColor: settings.style.color, '--dot-colour': settings.style.color }}
          aria-hidden="true"
        />
        <span className="visually-hidden">Drawing style</span>
      </button>
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
      <span className="draw-bar-sep" aria-hidden="true" />
      <button type="button" className="draw-bar-btn" disabled={!canUndo} title="Undo (Ctrl+Z)" onClick={onUndo}>
        <DrawIcon path={UNDO_PATH} />
        <span className="visually-hidden">Undo</span>
      </button>
      <button type="button" className="draw-bar-btn" disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" onClick={onRedo}>
        <DrawIcon path={REDO_PATH} />
        <span className="visually-hidden">Redo</span>
      </button>
      <button
        type="button"
        className={`draw-bar-btn${open === 'clear' ? ' active' : ''}`}
        aria-expanded={open === 'clear'}
        title="Clear drawings"
        onClick={() => setOpen((o) => (o === 'clear' ? null : 'clear'))}
      >
        <DrawIcon path={CLEAR_PATH} />
        <span className="visually-hidden">Clear drawings</span>
      </button>
      {open === 'clear' && (
        <div className="draw-style-popover draw-clear-popover" role="dialog" aria-label="Clear drawings">
          <DrawClearMenu {...clear} onDone={() => setOpen(null)} />
        </div>
      )}
      {styleOpen && (
        <div className="draw-style-popover" role="dialog" aria-label="Drawing style">
          <DrawStylePanel style={settings.style} recent={recentColours} onChange={(style) => set({ style })} />
        </div>
      )}
    </div>
  );
}
