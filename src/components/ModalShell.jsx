import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ModalIcon from './ModalIcon.jsx';

// Where a click counts as "outside" a side panel: the map and the inspector.
// Clicks anywhere else leave it open — the rail, whose tabs open and close the
// panels themselves, and the dialogs, confirms and menus a panel opens, which
// aren't inside it.
const OUTSIDE_SIDE_PANEL = '.game-center, .panel.right';

// Closes the side panel `ref` points at when the table is clicked outside it.
export function useCloseOnOutsideClick(ref, onClose, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    function onPointerDown(e) {
      const target = e.target;
      if (!(target instanceof Element) || ref.current?.contains(target)) return;
      if (target.closest(OUTSIDE_SIDE_PANEL)) onClose();
    }
    // Capture phase: the map stops some of its pointer events from bubbling.
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [ref, onClose, enabled]);
}

// Shared frame for the book-style modals: dimmed backdrop, titled header with
// an icon badge and close button, scrolling body. Portaled to <body> so it
// centers on the screen no matter where the trigger lives. Click outside or
// Escape closes it.
//
// `side`: the same header and body as a side panel instead — standing beside
// the toolbar rail, over the left of the map, with no backdrop. A click on the
// map or the inspector closes it (useCloseOnOutsideClick), as do its tab and
// its close button; Escape doesn't. Every side panel is the same width
// (.side-panel in styles.css). `enter={false}` skips its slide-in, for a panel
// that replaces another in the same place (the Mapping drawer's tabs).
// `footer`: a side panel's foot, pinned under the scrolling body — for the
// one action that should stay in reach however long the list above it grows.
// `headerAction`: a button beside the close button (the Dice panel's Logs).
export default function ModalShell({ title, icon, closeLabel = 'Close', maxWidth = 480, flush = false, side = false, enter = true, footer = null, headerAction = null, onClose, children }) {
  const sideRef = useRef(null);
  useCloseOnOutsideClick(sideRef, onClose, side);
  useEffect(() => {
    if (side) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, side]);

  const closeButton = (
    <button className="popover-close" onClick={onClose} aria-label={closeLabel} title="Close">
      ×
    </button>
  );
  const header = (
    <div className="book-card-header">
      <span className="book-title">
        {icon && <ModalIcon name={icon} />}
        {title}
      </span>
      {headerAction ? (
        <span className="book-card-header-end">
          {headerAction}
          {closeButton}
        </span>
      ) : (
        closeButton
      )}
    </div>
  );

  if (side) {
    return createPortal(
      <aside className={`side-panel${enter ? '' : ' no-enter'}`} role="dialog" aria-label={title} ref={sideRef}>
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
