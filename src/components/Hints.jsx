import React, { useSyncExternalStore } from 'react';
import { loadHintPrefs, saveHintPrefs } from '../state/persistence.js';

// Hints: say why something can't be used yet, then where to fix it.
//
// - Hint: under a control that can't be used yet; offers the fix when it's
//   one step away. Always shown — it's how the control explains itself.
// - EmptyState: where a list or the map has nothing in it yet.
// - ModeBar: across the top of the map while a tool changes what a press
//   does. Each can be hidden with its ×, and all go with "Show hints and
//   tips" off.
// - Tip: points at something new once per device; "Got it" retires it.
//
// The on/off switch and what was dismissed live in this browser only
// (persistence.js, `hearthbound:hints`).

let prefs = null;
const listeners = new Set();

function current() {
  if (!prefs) {
    const raw = loadHintPrefs();
    prefs = { show: raw.show ?? true, dismissed: Array.isArray(raw.dismissed) ? raw.dismissed : [] };
  }
  return prefs;
}

function update(next) {
  prefs = next;
  saveHintPrefs(next);
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useHintPrefs() {
  const p = useSyncExternalStore(subscribe, current, current);
  return {
    show: p.show,
    anyDismissed: p.dismissed.length > 0,
    setShow: (show) => update({ ...current(), show }),
    // "Show all tips again": forget every dismissed tip and mode bar.
    resetDismissed: () => update({ ...current(), dismissed: [] }),
  };
}

function useDismissable(id) {
  const p = useSyncExternalStore(subscribe, current, current);
  return {
    visible: p.show && !p.dismissed.includes(id),
    dismiss: () => update({ ...current(), dismissed: [...current().dismissed.filter((d) => d !== id), id] }),
    turnOff: () => update({ ...current(), show: false }),
  };
}

function Bulb() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Hint({ children, action, onAction, className = '' }) {
  return (
    <div role="note" className={`hint ${className}`}>
      <span className="hint-icon">
        <Bulb />
      </span>
      <div className="hint-body">
        <p>{children}</p>
        {action && onAction && (
          <button type="button" className="hint-action" onClick={onAction}>
            {action}
            <Arrow />
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action, onAction, className = '' }) {
  return (
    <div className={`hint-empty ${className}`}>
      {icon && <span className="hint-empty-icon">{icon}</span>}
      <b>{title}</b>
      <p>{children}</p>
      {action && onAction && (
        <button type="button" className="hint-empty-action" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

export function ModeBar({ id, label, children, doneLabel, onDone, className = '' }) {
  const { visible, dismiss } = useDismissable(`bar:${id}`);
  if (!visible) return null;
  return (
    <div role="status" className={`mode-bar ${className}`}>
      <svg className="mode-bar-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />
      </svg>
      <span className="mode-bar-text">
        <b>{label}</b> {children}
      </span>
      {doneLabel && onDone && (
        <button type="button" className="mode-bar-done" onClick={onDone}>
          {doneLabel}
        </button>
      )}
      <button type="button" className="mode-bar-close" aria-label="Hide this hint" title="Hide this hint" onClick={dismiss}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

export function Tip({ id, title, children, className = '' }) {
  const { visible, dismiss, turnOff } = useDismissable(`tip:${id}`);
  if (!visible) return null;
  return (
    <div role="dialog" aria-label={`Tip: ${title}`} className={`tip ${className}`}>
      <span className="tip-arrow" aria-hidden="true" />
      <span className="tip-kicker">Tip</span>
      <b className="tip-title">{title}</b>
      <p>{children}</p>
      <div className="tip-actions">
        <button type="button" className="tip-off" onClick={turnOff}>
          Turn off tips
        </button>
        <button type="button" className="tip-ok" onClick={dismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
