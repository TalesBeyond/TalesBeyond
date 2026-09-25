import React, { useState } from 'react';
import ModalShell from './ModalShell.jsx';

const SIDES = [4, 6, 8, 10, 12, 20, 100];
const MAX_PER_TYPE = 20;

const DIE_PATHS = {
  4: 'M12 3 3 20h18z',
  6: 'M5 5h14v14H5z',
  8: 'M12 2 21 12 12 22 3 12z',
  10: 'M12 2 21 9 17 21H7L3 9z',
  12: 'M12 2l8 5.5v9L12 22l-8-5.5v-9z',
  20: 'M12 2l9 5v10l-9 5-9-5V7z',
  100: 'M12 2l9 5v10l-9 5-9-5V7z',
};

const d = (sides) => 1 + Math.floor(Math.random() * sides);
const signed = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

// "1d20 + 2d8 + 5" — the label on the roll button and the default history title.
function describePool(pool, modifier) {
  const parts = SIDES.filter((s) => pool[s] > 0).map((s) => `${pool[s]}d${s}`);
  if (!parts.length) return '';
  let text = parts.join(' + ');
  if (modifier) text += ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}`;
  return text;
}

// Rolls the pool. With advantage/disadvantage, the first d20 is rolled twice
// and the higher/lower one kept.
function rollPool(pool, modifier, mode, name) {
  let total = modifier;
  const groups = [];
  let flag = null;
  for (const sides of SIDES) {
    const count = pool[sides] || 0;
    if (!count) continue;
    const results = Array.from({ length: count }, () => d(sides));
    let text;
    let sum = results.reduce((a, b) => a + b, 0);
    if (sides === 20 && mode !== 'normal') {
      const second = d(20);
      const kept = mode === 'advantage' ? Math.max(results[0], second) : Math.min(results[0], second);
      const rest = results.slice(1);
      sum = kept + rest.reduce((a, b) => a + b, 0);
      text = `${count}d20 (${results[0]}, ${second}${rest.length ? `, ${rest.join(', ')}` : ''}) keep ${kept}`;
      results[0] = kept;
    } else {
      text = `${count}d${sides} (${results.join(', ')})`;
    }
    if (sides === 20 && count === 1) {
      if (results[0] === 20) flag = 'Natural 20';
      else if (results[0] === 1) flag = 'Natural 1';
    }
    total += sum;
    groups.push(text);
  }
  const detail = groups.join(' + ') + (modifier ? ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}` : '');
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: name.trim() || describePool(pool, modifier),
    detail,
    total,
    flag,
  };
}

// The "Roll the dice" modal: tap dice into a pool, add a modifier and
// advantage/disadvantage, roll once. Saved rolls reload a pool in one tap.
export default function DiceModal({ saved, rolls, onRoll, onClearRolls, onSave, onRemoveSaved, onClose }) {
  const [pool, setPool] = useState({ 20: 1 });
  const [modifier, setModifier] = useState(0);
  const [mode, setMode] = useState('normal');
  const [name, setName] = useState('');

  const label = describePool(pool, modifier);
  const canRoll = label !== '';
  const hasD20 = (pool[20] || 0) > 0;
  const latest = rolls[0];

  function bump(sides, delta) {
    setPool((prev) => {
      const next = Math.max(0, Math.min(MAX_PER_TYPE, (prev[sides] || 0) + delta));
      const copy = { ...prev, [sides]: next };
      if (!next) delete copy[sides];
      return copy;
    });
  }

  function roll() {
    if (!canRoll) return;
    onRoll(rollPool(pool, modifier, hasD20 ? mode : 'normal', name));
  }

  function loadSaved(s) {
    setPool(s.pool);
    setModifier(s.modifier);
    setName(s.name);
    setMode('normal');
  }

  function saveCurrent() {
    if (!canRoll) return;
    onSave({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim() || label,
      pool,
      modifier,
    });
  }

  return (
    <ModalShell title="Roll the dice" icon="dice" closeLabel="Close dice roller" maxWidth={900} flush onClose={onClose}>
      <div className="dm-main">
        <div className="dm-left">
          <div>
            <span className="dm-label">Saved rolls</span>
            <div className="dm-chips">
              {saved.map((s) => (
                <span className="dm-chip-wrap" key={s.id}>
                  <button type="button" className="dm-chip" onClick={() => loadSaved(s)} title="Load this roll">
                    {s.name}
                  </button>
                  <button type="button" className="dm-chip-x" onClick={() => onRemoveSaved(s.id)} aria-label={`Remove saved roll ${s.name}`}>
                    ×
                  </button>
                </span>
              ))}
              <button type="button" className="dm-chip dm-chip-add" onClick={saveCurrent} disabled={!canRoll}>
                + Save current
              </button>
            </div>
          </div>

          <div>
            <span className="dm-label">Pick your dice · tap to add</span>
            <div className="dm-tray">
              {SIDES.map((sides) => {
                const count = pool[sides] || 0;
                return (
                  <div className="dm-die-wrap" key={sides}>
                    <button
                      type="button"
                      className={`dm-die${count ? ' on' : ''}`}
                      onClick={() => bump(sides, 1)}
                      aria-label={`Add a d${sides}`}
                    >
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
                        <path d={DIE_PATHS[sides]} />
                      </svg>
                      <span>d{sides}</span>
                    </button>
                    {count > 0 && <span className="dm-count">{count}</span>}
                    {count > 0 && (
                      <button type="button" className="dm-minus" onClick={() => bump(sides, -1)} aria-label={`Remove a d${sides}`}>
                        −
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dm-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <label className="dm-label" htmlFor="dm-name">
                Name (optional)
              </label>
              <input id="dm-name" className="dm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Longsword attack" />
            </div>
            <div>
              <span className="dm-label">Modifier</span>
              <div className="dm-stepper">
                <button type="button" onClick={() => setModifier((m) => Math.max(-99, m - 1))} aria-label="Decrease modifier">
                  −
                </button>
                <span>{signed(modifier)}</span>
                <button type="button" onClick={() => setModifier((m) => Math.min(99, m + 1))} aria-label="Increase modifier">
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="dm-seg" role="group" aria-label="Roll mode" title={hasD20 ? undefined : 'Advantage and disadvantage apply to a d20'}>
            {[
              ['disadvantage', 'Disadvantage'],
              ['normal', 'Normal'],
              ['advantage', 'Advantage'],
            ].map(([key, text]) => (
              <button key={key} type="button" className={mode === key ? 'on' : ''} disabled={!hasD20 && key !== 'normal'} onClick={() => setMode(key)}>
                {text}
              </button>
            ))}
          </div>

          <div className="dm-row" style={{ marginTop: 'auto' }}>
            <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => { setPool({}); setModifier(0); setMode('normal'); setName(''); }}>
              Clear dice
            </button>
            <button type="button" className="dm-roll" onClick={roll} disabled={!canRoll}>
              {canRoll ? `Roll ${label}` : 'Pick a die to roll'}
            </button>
          </div>
        </div>

        <div className="dm-right">
          <div className="dm-result" aria-live="polite">
            {latest ? (
              <>
                <div className="dm-sub">{latest.title}</div>
                <div className="dm-total">{latest.total}</div>
                {latest.flag && <span className={`dm-flag${latest.flag === 'Natural 1' ? ' bad' : ''}`}>{latest.flag}</span>}
                <div className="dm-sub">{latest.detail}</div>
              </>
            ) : (
              <div className="dm-sub" style={{ padding: '36px 0' }}>Your roll will show up here.</div>
            )}
          </div>
          <div className="dm-hist">
            <span className="dm-label">History</span>
            {rolls.map((r) => (
              <div className="dm-h" key={r.id}>
                <div style={{ minWidth: 0 }}>
                  <div className="dm-h-name">{r.title}</div>
                  <div className="dm-h-detail">{r.detail}</div>
                </div>
                <div className="dm-h-total">{r.total}</div>
              </div>
            ))}
          </div>
          <div className="dm-foot">
            <span className="dm-hint">Rolls stay on your screen.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClearRolls} disabled={rolls.length === 0}>
              Clear history
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
