import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import ModalIcon from './ModalIcon.jsx';

// Shared frame for the book-style modals: dimmed backdrop, titled header with
// an icon badge and close button, scrolling body. Portaled to <body> so it
// centers on the screen no matter where the trigger lives. Click outside or
// Escape closes it.
//
// `side`: the same header and body as a side panel instead — standing beside
// the toolbar rail, over the left of the map, with no backdrop. It stays open
// while the table is played (a click on the map doesn't close it, nor does
// Escape) until its tab or its close button is pressed. `width` is its width.
// `footer`: a side panel's foot, pinned under the scrolling body — for the
// one action that should stay in reach however long the list above it grows.
export default function ModalShell({ title, icon, closeLabel = 'Close', maxWidth = 480, flush = false, side = false, width = 340, footer = null, onClose, children }) {
  useEffect(() => {
    if (side) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, side]);

  const header = (
    <div className="book-card-header">
      <span className="book-title">
        {icon && <ModalIcon name={icon} />}
        {title}
      </span>
      <button className="popover-close" onClick={onClose} aria-label={closeLabel} title="Close">
        ×
      </button>
    </div>
  );

  if (side) {
    return createPortal(
      <aside className="side-panel" role="dialog" aria-label={title} style={{ '--side-w': `${width}px` }}>
        {header}
        <div className="side-panel-body" style={{ padding: flush ? 0 : 16 }}>
          {children}
        </div>
        {footer && <div className="side-panel-footer">{footer}</div>}
      </aside>,
      document.body
    );
  }

  return createPortal(
    <div className="book-backdrop" onClick={onClose}>
      <div
        className="book-card"
        role="dialog"
        aria-label={title}
        style={{ maxWidth, background: 'linear-gradient(180deg, var(--ink-900), var(--ink-800))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {header}
        <div style={{ padding: flush ? 0 : 20, flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
