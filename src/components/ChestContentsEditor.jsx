import React, { useEffect, useMemo, useState } from 'react';
import { DICE_TYPES } from '../data/weapons.js';
import { useCatalog } from '../lib/catalog.js';
import { useGameState } from '../state/store.jsx';
import { newChestItem } from '../data/chests.js';
import { WARE_SOURCES, landsInOtherItems, sourceEntries, wareMeta } from '../data/merchants.js';

// The compendium chapters a chest is filled from. Not Spells: a spell is
// taught (the Wizard's shop), not found in a box.
const CHEST_SOURCES = ['weapons', 'items', 'tomes', 'foods', 'potions', 'ingredients'];
// How many entries of a chapter the list shows at once. The rest are a
// search away.
const BROWSE_LIMIT = 40;

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

// One compendium entry as it sits in a chest. A tome, a dish, a potion or an
// ingredient remembers its chapter, so looting it puts it under Other items,
// a tome or a potion with its text (GameView's giveChestItemToHero); a weapon
// or an item goes to Weapons & gear as it always has.
function chestItemFromEntry(source, entry) {
  const weapon = source === 'weapons';
  return newChestItem({
    name: entry.name,
    cost: entry.cost || 0,
    numberOfDice: weapon ? entry.numberOfDice || 0 : 0,
    diceType: weapon ? entry.diceType || null : null,
    modifier: weapon ? entry.modifier || 0 : 0,
    ...(landsInOtherItems(source) ? { source } : {}),
  });
}

// The running list of what's already in the chest, then two tabs for adding
// to it: a compendium chapter to browse and search (with one picked at random
// for a quick fill), or a custom item to type — shared between the
// placement modal (TokenSidebar) and the in-place editor shown on an existing
// chest's inspector while the Edit tool is active (RightPanel), so both stay
// identical instead of drifting apart.
//
// onPendingCustomChange (optional): told the name of a custom item that has
// been typed but not added yet ('' when there is none), so the placement
// modal can hold "Place chest" back until it is added or cleared — a typed
// item is easy to lose by placing the chest first.
export default function ChestContentsEditor({ items, capacity, onAddItem, onRemoveItem, onUpdateQty, onPendingCustomChange }) {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState(CHEST_SOURCES[0]);
  const [tab, setTab] = useState('compendium'); // 'compendium' | 'custom'
  const [customName, setCustomName] = useState('');
  const [customDice, setCustomDice] = useState(0);
  const [customDiceType, setCustomDiceType] = useState('d6');
  const [customModifier, setCustomModifier] = useState(0);
  const [customCost, setCustomCost] = useState(0);

  const full = items.length >= capacity;

  // A named custom item still waiting for "Add custom item". Not while the
  // chest is full: nothing can be added then, so there is nothing to wait for.
  const pendingCustom = tab === 'custom' && !full ? customName.trim() : '';
  useEffect(() => {
    onPendingCustomChange?.(pendingCustom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCustom]);

  // The chapter being browsed: the app's own entries, then this table's
  // (Asset Storage), narrowed by the search.
  const catalog = useCatalog();
  const { customAssets } = useGameState();
  const entries = useMemo(() => sourceEntries(source, catalog, customAssets), [source, catalog, customAssets]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? entries.filter((entry) => entry.name.toLowerCase().includes(q)) : entries;
  }, [entries, search]);
  // Already inside: its quantity is changed in the list above, not by adding it twice.
  const held = useMemo(() => new Set(items.map((item) => item.name)), [items]);
  const spare = matches.filter((entry) => !held.has(entry.name));
  const chapter = WARE_SOURCES[source].label.toLowerCase();

  function addFromCatalog(entry) {
    if (full || held.has(entry.name)) return;
    onAddItem(chestItemFromEntry(source, entry));
  }

  // One of what the list is showing, picked at random.
  function addRandom() {
    if (full || !spare.length) return;
    addFromCatalog(spare[Math.floor(Math.random() * spare.length)]);
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

      <div className="dm-seg chest-add-tabs" role="tablist" aria-label="Add an item">
        <button type="button" role="tab" aria-selected={tab === 'compendium'} className={tab === 'compendium' ? 'on' : ''} onClick={() => setTab('compendium')}>
          From the compendium
        </button>
        <button type="button" role="tab" aria-selected={tab === 'custom'} className={tab === 'custom' ? 'on' : ''} onClick={() => setTab('custom')}>
          Custom item
        </button>
      </div>

      {tab === 'compendium' && (
        <div className="chest-add-panel" role="tabpanel" aria-label="From the compendium">
          <div className="shop-source-chips" role="group" aria-label="Which chapter">
            {CHEST_SOURCES.map((key) => (
              <button key={key} type="button" className={`tool-btn${source === key ? ' active' : ''}`} aria-pressed={source === key} onClick={() => setSource(key)}>
                {WARE_SOURCES[key].label}
              </button>
            ))}
          </div>
          <div className="shop-search-row">
            <input className="field" placeholder={full ? 'Chest is full' : `Search ${chapter}…`} value={search} onChange={(e) => setSearch(e.target.value)} disabled={full} />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={full || spare.length === 0}
              title={full ? 'The chest is full' : search.trim() ? `Add one of the ${chapter} found, picked at random` : `Add one of the ${chapter}, picked at random`}
              onClick={addRandom}
            >
              + 1 at random
            </button>
          </div>
          <div className="chest-search-results">
            {matches.slice(0, BROWSE_LIMIT).map((entry, i) => {
              const has = held.has(entry.name);
              const meta = wareMeta(source, entry);
              return (
                <div className="chest-search-row" key={`${entry.name}-${i}`}>
                  <span className="chest-item-name">{entry.name}</span>
                  <span className="chest-item-meta">
                    {meta ? `${meta} · ` : ''}
                    {formatCost(entry.cost || 0)}
                  </span>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={full || has} onClick={() => addFromCatalog(entry)}>
                    {has ? 'In chest' : '+ Add'}
                  </button>
                </div>
              );
            })}
            {matches.length === 0 && <p className="shop-empty">Nothing by that name.</p>}
            {matches.length > BROWSE_LIMIT && (
              <p className="shop-empty">
                Showing {BROWSE_LIMIT} of {matches.length}. Search to narrow it down.
              </p>
            )}
          </div>
        </div>
      )}

      {tab === 'custom' && (
        <div className="chest-add-panel" role="tabpanel" aria-label="Custom item">
          <label className="field-label">Item name</label>
          <input className="field" placeholder={full ? 'Chest is full' : 'e.g. Rusty key'} value={customName} onChange={(e) => setCustomName(e.target.value)} disabled={full} />
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
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 4 }}
            disabled={full || !customName.trim()}
            title={full ? 'The chest is full' : !customName.trim() ? 'Give the item a name first' : 'Put this item in the chest'}
            onClick={addCustom}
          >
            + Add custom item
          </button>
        </div>
      )}
    </div>
  );
}
