import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import ModalIcon from './ModalIcon.jsx';

// Shared frame for the book-style modals: dimmed backdrop, titled header with
// an icon badge and close button, scrolling body. Portaled to <body> so it
// centers on the screen no matter where the trigger lives. Click outside or
// Escape closes it.
export default function ModalShell({ title, icon, closeLabel = 'Close', maxWidth = 480, flush = false, onClose, children }) {
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="book-backdrop" onClick={onClose}>
      <div
        className="book-card"
        role="dialog"
        aria-label={title}
        style={{ maxWidth, background: 'linear-gradient(180deg, var(--ink-900), var(--ink-800))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="book-card-header">
          <span className="book-title">
            <ModalIcon name={icon} />
            {title}
          </span>
          <button className="popover-close" onClick={onClose} aria-label={closeLabel} title="Close">
            ×
          </button>
        </div>
        <div style={{ padding: flush ? 0 : 20, flex: 1, minHeight: 0, overflowY: 'auto' }}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
