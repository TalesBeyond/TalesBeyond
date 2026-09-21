import React from 'react';
import { DICE_SIDES, parseDice, formatDice } from '../data/traps.js';

// A "how many" number box next to a dice-type dropdown (d4, d20, ...).
// Fully controlled by a dice string like "2d6" so it drops into anywhere
// that already stores dice as text — the number box may be blank while
// someone is retyping it, which is why the string can briefly be "d6".
export default function DiceInput({ value, onChange, disabled }) {
  const parsed = parseDice(value) || { count: '', sides: 20 };
  const sideOptions = DICE_SIDES.includes(parsed.sides) ? DICE_SIDES : [...DICE_SIDES, parsed.sides].sort((a, b) => a - b);

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input
        className="field"
        type="number"
        min={1}
        max={99}
        placeholder="1"
        aria-label="Number of dice"
        style={{ width: 64, flex: 'none' }}
        value={parsed.count}
        disabled={disabled}
        onChange={(e) => onChange(formatDice(e.target.value, parsed.sides))}
      />
      <select
        className="field"
        aria-label="Type of dice"
        style={{ flex: 1, minWidth: 0 }}
        value={parsed.sides}
        disabled={disabled}
        onChange={(e) => onChange(formatDice(parsed.count, parseInt(e.target.value, 10)))}
      >
        {sideOptions.map((sides) => (
          <option key={sides} value={sides}>
            d{sides}
          </option>
        ))}
      </select>
    </div>
  );
}
