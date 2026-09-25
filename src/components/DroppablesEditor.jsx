import React, { useMemo, useState } from 'react';
import { DICE_TYPES } from '../data/weapons.js';
import { useCatalog } from '../lib/catalog.js';
import { newDroppableItem, dropThreshold } from '../data/droppables.js';

function formatCost(gp) {
  if (gp >= 1) return `${Math.round(gp * 100) / 100} gp`;
  const cp = Math.round(gp * 100);
  return cp % 10 === 0 ? `${cp / 10} sp` : `${cp} cp`;
}

function diceLabel(item) {
  if (!item.numberOfDice || !item.diceType) return null;
  const mod = item.modifier ? (item.modifier > 0 ? `+${item.modifier}` : `${item.modifier}`) : '';
  return `${item.numberOfDice}${item.diceType}${mod}`;
}

function rollD20() {
  return 1 + Math.floor(Math.random() * 20);
}

// The searchable "pick from a compendium" + "type a custom one" loot
// picker for a mob's Droppables section, plus a per-item d20 drop roll.
// Mirrors ChestContentsEditor's shape (same item fields, same compendium
// search, same custom-item-behind-a-checkbox pattern) with one addition:
// every entry also carries a dropChance %, and can be rolled against a d20.
export default function DroppablesEditor({ items, onAddItem, onRemoveItem, onUpdateItem }) {
  const [search, setSearch] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDice, setCustomDice] = useState(0);
  const [customDiceType, setCustomDiceType] = useState('d6');
  const [customModifier, setCustomModifier] = useState(0);
  const [customCost, setCustomCost] = useState(0);
  const [customChance, setCustomChance] = useState(50);
  const [rollResults, setRollResults] = useState({});

  const { weapons, items: catalogItems } = useCatalog();
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const weaponMatches = weapons.filter((w) => w.name.toLowerCase().includes(q)).map((w) => ({
      name: w.name,
      cost: w.cost,
      numberOfDice: w.numberOfDice,
      diceType: w.diceType,
      modifier: w.modifier,
    }));
    const itemMatches = catalogItems.filter((it) => it.name.toLowerCase().includes(q)).map((it) => ({
      name: it.name,
      cost: it.cost,
      numberOfDice: 0,
      diceType: null,
      modifier: 0,
    }));
    return [...weaponMatches, ...itemMatches].slice(0, 20);
  }, [search, weapons, catalogItems]);

  function addFromCatalog(entry) {
    onAddItem(newDroppableItem({ ...entry, dropChance: 50 }));
    setSearch('');
  }

  function addCustom() {
    if (!customName.trim()) return;
    onAddItem(
      newDroppableItem({
        name: customName.trim(),
        numberOfDice: parseInt(customDice, 10) || 0,
        diceType: parseInt(customDice, 10) > 0 ? customDiceType : null,
        modifier: parseInt(customModifier, 10) || 0,
        cost: Math.max(0, parseFloat(customCost) || 0),
        dropChance: Math.max(0, Math.min(100, parseInt(customChance, 10) || 0)),
      })
    );
    setCustomName('');
    setCustomDice(0);
    setCustomModifier(0);
    setCustomCost(0);
    setCustomChance(50);
  }

  function rollOne(item) {
    const roll = rollD20();
    setRollResults((prev) => ({ ...prev, [item.id]: { roll, dropped: roll <= dropThreshold(item.dropChance) } }));
  }

  function rollAll() {
    const next = {};
    items.forEach((item) => {
      const roll = rollD20();
      next[item.id] = { roll, dropped: roll <= dropThreshold(item.dropChance) };
    });
    setRollResults(next);
  }

  return (
    <div className="chest-editor">
      {items.length > 0 && (
        <>
          <button type="button" className="btn btn-primary btn-block" style={{ marginBottom: 10 }} onClick={rollAll}>
            🎲 Roll all drops (d20)
          </button>
          <div className="droppable-list">
            {items.map((item) => {
              const result = rollResults[item.id];
              return (
                <div key={item.id} style={{ marginBottom: 10 }}>
                  <div className="droppable-row">
                    <div className="droppable-info">
                      <span className="droppable-name">{item.name}</span>
                      <span className="droppable-meta">
                        {diceLabel(item) ? `${diceLabel(item)} · ` : ''}
                        {formatCost(item.cost)}
                        {item.qty > 1 ? ` · × ${item.qty}` : ''}
                      </span>
                    </div>
                    <input
                      type="number"
                      className="field droppable-chance-input"
                      min={0}
                      max={100}
                      title="Drop chance (%)"
                      value={item.dropChance}
                      onChange={(e) =>
                        onUpdateItem(item.id, { dropChance: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) })
                      }
                    />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => rollOne(item)}>
                      Roll
                    </button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemoveItem(item.id)}>
                      ×
                    </button>
                  </div>
                  <div className="footer-note" style={{ border: 'none', padding: '0 0 4px' }}>
                    {item.dropChance}% chance · drops on {dropThreshold(item.dropChance)} or under on a d20
                  </div>
                  {result && (
                    <div className={`attack-result ${result.dropped ? 'hit' : 'miss'}`}>
                      d20 → {result.roll} {result.dropped ? `— dropped ${item.name}!` : '— no drop.'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {!showCustom && (
        <>
          <div className="section-label" style={{ marginTop: 14 }}>
            Add from compendium
          </div>
          <input
            className="field"
            placeholder="Search weapons & items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {results.length > 0 && (
            <div className="chest-search-results">
              {results.map((entry, i) => (
                <div className="chest-search-row" key={`${entry.name}-${i}`}>
                  <span className="chest-item-name">{entry.name}</span>
                  <span className="chest-item-meta">
                    {diceLabel(entry) ? `${diceLabel(entry)} · ` : ''}
                    {formatCost(entry.cost)}
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => addFromCatalog(entry)}>
                    + Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div
        className="section-label"
        style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span>Add a custom item</span>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'none', letterSpacing: 'normal', opacity: 1, cursor: 'pointer', fontSize: 12 }}
        >
          <input type="checkbox" checked={showCustom} onChange={(e) => setShowCustom(e.target.checked)} />
          Custom
        </label>
      </div>

      {showCustom && (
        <>
          <input className="field" placeholder="Item name" value={customName} onChange={(e) => setCustomName(e.target.value)} />
          <div className="field-row">
            <div>
              <label className="field-label">Number of dice</label>
              <input type="number" className="field" min={0} value={customDice} onChange={(e) => setCustomDice(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Dice type</label>
              <select className="field" value={customDiceType} onChange={(e) => setCustomDiceType(e.target.value)}>
                {DICE_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div>
              <label className="field-label">Modifier</label>
              <input type="number" className="field" value={customModifier} onChange={(e) => setCustomModifier(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Cost (gp, if sold)</label>
              <input
                type="number"
                className="field"
                min={0}
                step="0.01"
                value={customCost}
                onChange={(e) => setCustomCost(e.target.value)}
              />
            </div>
          </div>
          <label className="field-label">Drop chance (%)</label>
          <input
            type="number"
            className="field"
            min={0}
            max={100}
            value={customChance}
            onChange={(e) => setCustomChance(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ marginTop: 4 }}
            disabled={!customName.trim()}
            onClick={addCustom}
          >
            + Add custom item
          </button>
        </>
      )}
    </div>
  );
}
