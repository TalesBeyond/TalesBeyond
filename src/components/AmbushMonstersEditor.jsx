import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCatalog } from '../lib/catalog.js';
import { monsterToDraft, customMonsterToDraft } from '../data/monsters.js';
import { newAmbushMonster, clampAmbushQty, MAX_AMBUSH_QTY } from '../data/ambush.js';

// The "which monsters, and how many of each" picker for an ambush token —
// shared between the placement modal (TokenSidebar) and the in-place editor
// on a placed ambush's inspector (RightPanel), the way ChestContentsEditor is
// for a chest. Monsters come from the compendium's bestiary and from this
// table's own custom monsters (Asset Storage).

// How many waiting monsters show before their list scrolls.
const VISIBLE_ROWS = 5;

export default function AmbushMonstersEditor({ monsters, customMonsters = [], onAdd, onRemove, onUpdateQty }) {
  const [search, setSearch] = useState('');
  const { monsters: catalogMonsters } = useCatalog();

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const builtIn = catalogMonsters.map((m) => ({ key: `m:${m.key}`, name: m.name, meta: `CR ${m.cr} · HP ${m.hp}`, draft: monsterToDraft(m) }));
    const custom = customMonsters.map((m) => ({ key: m.id, name: `${m.name} (Custom)`, meta: `HP ${m.maxHp || 15}`, draft: customMonsterToDraft(m) }));
    return [...builtIn, ...custom].filter((entry) => !q || entry.name.toLowerCase().includes(q));
  }, [search, catalogMonsters, customMonsters]);

  // Picking one that is already in the ambush adds another of it.
  function addFromList(entry) {
    const existing = monsters.find((m) => m.name === entry.draft.name && (m.mobKey || null) === (entry.draft.mobKey || null));
    if (existing) onUpdateQty(existing.id, clampAmbushQty(existing.qty + 1));
    else onAdd(newAmbushMonster(entry.draft));
  }

  const total = monsters.reduce((sum, m) => sum + clampAmbushQty(m.qty), 0);

  // Past VISIBLE_ROWS the waiting list scrolls instead of pushing "Add
  // monsters" down. Its height is measured (to the top of the first row that
  // doesn't fit) rather than fixed, since a row is taller on a phone.
  const listRef = useRef(null);
  const [listHeight, setListHeight] = useState(null);
  useLayoutEffect(() => {
    const rows = listRef.current?.children;
    setListHeight(rows && rows.length > VISIBLE_ROWS ? rows[VISIBLE_ROWS].offsetTop - rows[0].offsetTop : null);
  }, [monsters.length]);

  return (
    <div className="chest-editor">
      <div className="chest-capacity">
        {total === 0 ? 'No monsters in this ambush yet' : `${total} monster${total === 1 ? '' : 's'} waiting`}
      </div>

      {monsters.length > 0 && (
        <div className="chest-item-list ambush-waiting-list" ref={listRef} style={listHeight ? { maxHeight: listHeight } : undefined}>
          {monsters.map((m) => (
            <div className="chest-item-row" key={m.id}>
              <div className="chest-item-info">
                <span className="chest-item-name">{m.name}</span>
                <span className="chest-item-meta">
                  HP {m.maxHp}
                  {m.armorClass != null ? ` · AC ${m.armorClass}` : ''}
                </span>
              </div>
              <input
                type="number"
                className="field chest-item-qty"
                aria-label={`How many ${m.name}`}
                min={1}
                max={MAX_AMBUSH_QTY}
                value={m.qty}
                onChange={(e) => onUpdateQty(m.id, clampAmbushQty(e.target.value))}
              />
              <button type="button" className="btn btn-danger btn-sm" aria-label={`Take ${m.name} out of the ambush`} onClick={() => onRemove(m.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="section-label" style={{ marginTop: 14 }}>
        Add monsters
      </div>
      <input className="field" placeholder="Search monsters…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="chest-search-results">
        {results.length === 0 ? (
          <p className="footer-note" style={{ border: 'none', padding: '6px 4px', margin: 0 }}>
            No monster by that name.
          </p>
        ) : (
          results.map((entry) => (
            <div className="chest-search-row" key={entry.key}>
              <span className="chest-item-name">{entry.name}</span>
              <span className="chest-item-meta">{entry.meta}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => addFromList(entry)}>
                + Add
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
