import React, { useEffect, useRef, useState } from 'react';
import { PALETTES } from '../state/theme.js';

// App-wide palette switcher — lives in the top bar (not the in-table
// Toolbar) so it's reachable from Landing too, and applies instantly to
// every screen via the CSS variables swapped in state/theme.js.
export default function PalettesMenu({ theme, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div className="palette-btn-wrap" ref={rootRef}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)} title="Choose a color palette">
        🎨 Palettes
      </button>
      {open && (
        <div className="palette-menu">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`palette-option${theme === p.id ? ' active' : ''}`}
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
            >
              <span className="palette-swatch">
                {p.swatch.map((c, i) => (
                  <span key={i} style={{ background: c }} />
                ))}
              </span>
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
