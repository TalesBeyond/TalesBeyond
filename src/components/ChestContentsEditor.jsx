import React, { useMemo, useState } from 'react';
import { DICE_TYPES } from '../data/weapons.js';
import { useCatalog } from '../lib/catalog.js';
import { newChestItem } from '../data/chests.js';

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

// The searchable "pick from a compendium" + "type a custom one" item
// picker, plus the running list of what's already in the chest — shared
// between the placement modal (TokenSidebar) and the in-place editor shown
// on an existing chest's inspector while the Edit tool is active
// (RightPanel), so both stay identical instead of drifting apart.
export default function ChestContentsEditor({ items, capacity, onAddItem, onRemoveItem, onUpdateQty }) {
  const [search, setSearch] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customDice, setCustomDice] = useState(0);
  const [customDiceType, setCustomDiceType] = useState('d6');
  const [customModifier, setCustomModifier] = useState(0);
  const [customCost, setCustomCost] = useState(0);

  const full = items.length >= capacity;

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
    if (full) return;
    onAddItem(newChestItem(entry));
    setSearch('');
  }

  function addCustom() {
    if (full || !customName.trim()) return;
    onAddItem(
      newChestItem({
        name: customName.trim(),
        numberOfDice: parseInt(customDice, 10) || 0,
        diceType: parseInt(customDice, 10) > 0 ? customDiceType : null,
        modifier: parseInt(customModifier, 10) || 0,
        cost: Math.max(0, parseFloat(customCost) || 0),
      })
    );
    setCustomName('');
    setCustomDice(0);
    setCustomModifier(0);
    setCustomCost(0);
  }

  return (
    <div className="chest-editor">
      <div className="chest-capacity">
        {items.length} / {capacity} slot{capacity === 1 ? '' : 's'} used
      </div>

      {items.length > 0 && (
        <div className="chest-item-list">
          {items.map((item) => (
            <div className="chest-item-row" key={item.id}>
              <div className="chest-item-info">
                <span className="chest-item-name">{item.name}</span>
                <span className="chest-item-meta">
                  {diceLabel(item) ? `${diceLabel(item)} · ` : ''}
                  {formatCost(item.cost)}
                </span>
              </div>
              <input
                type="number"
                className="field chest-item-qty"
                min={1}
                value={item.qty}
                onChange={(e) => onUpdateQty(item.id, Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
              <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemoveItem(item.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {!showCustom && (
        <>
          <div className="section-label" style={{ marginTop: 14 }}>
            Add from compendium
          </div>
          <input
            className="field"
            placeholder={full ? 'Chest is full' : 'Search weapons & items…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={full}
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
                  <button type="button" className="btn btn-secondary btn-sm" disabled={full} onClick={() => addFromCatalog(entry)}>
                    + Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="section-label" style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
          <input className="field" placeholder="Item name" value={customName} onChange={(e) => setCustomName(e.target.value)} disabled={full} />
          <div className="field-row">
            <div>
              <label className="field-label">Number of dice</label>
              <input
                type="number"
                className="field"
                min={0}
                value={customDice}
                onChange={(e) => setCustomDice(e.target.value)}
                disabled={full}
              />
            </div>
            <div>
              <label className="field-label">Dice type</label>
              <select className="field" value={customDiceType} onChange={(e) => setCustomDiceType(e.target.value)} disabled={full}>
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
              <input
                type="number"
                className="field"
                value={customModifier}
                onChange={(e) => setCustomModifier(e.target.value)}
                disabled={full}
              />
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
                disabled={full}
              />
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 4 }} disabled={full || !customName.trim()} onClick={addCustom}>
            + Add custom item
          </button>
        </>
      )}
    </div>
  );
}
