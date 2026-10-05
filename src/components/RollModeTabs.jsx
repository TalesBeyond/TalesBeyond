import React from 'react';
import { ROLL_MODES } from '../utils/combat.js';

// Disadvantage · Normal · Advantage for an attack's d20: thrown once, or
// twice with the lower or higher one kept (utils/combat.js resolveAttackRoll).
export default function RollModeTabs({ mode, onChange, disabled = false, className = 'dm-seg' }) {
  return (
    <div
      className={`${className} roll-mode-tabs`}
      role="radiogroup"
      aria-label="Roll mode"
      title="Advantage and disadvantage throw the d20 twice and keep the higher or the lower one"
    >
      {ROLL_MODES.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={mode === key}
          className={mode === key ? 'on active' : ''}
          disabled={disabled}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
