import React, { useState } from 'react';
import { CONDITIONS } from '../data/conditions.js';
import { playDiceSound } from '../lib/diceSound.js';
import {
  ABILITIES,
  SKILLS,
  SPELL_LEVELS,
  abilityModifier,
  formatModifier,
  defaultCharacterSheet,
  normalizeCheckEntry,
  normalizeEquipment,
  newEquipmentItem,
  normalizeSpellcasting,
  newSpellEntry,
  CURRENCIES,
  normalizeCurrency,
} from '../data/characterSheet.js';
import { WEAPONS } from '../data/weapons.js';
import { CHEST_SIZES, chestSlotCount } from '../data/chests.js';
import { makeIconDataUrl } from '../data/defaultTokens.js';
import { parseTrapNumber, MAX_TRAP_SIZE, DAMAGE_TYPES } from '../data/traps.js';
import { tokenSizesUpTo } from '../data/tokenSizes.js';
import ChestContentsEditor from './ChestContentsEditor.jsx';
import DiceInput from './DiceInput.jsx';
import DroppablesEditor from './DroppablesEditor.jsx';
import SoundField from './SoundField.jsx';

// Seats at a table: the DM plus up to nine players.
const MAX_SEATS = 10;

export default function RightPanel({
  audio,
  players,
  hostId,
  layers,
  layerOrder,
  entities,
  selectedEntity,
  isHost,
  meId,
  onUpdateEntity,
  onRemoveEntity,
  tool,
  heroes,
  onGiveChestItem,
  onTakeChestItem,
  collapsed,
  onToggleCollapsed,
}) {
  if (collapsed) {
    return (
      <div className="panel right collapsed">
        {/* Names the selected token on the rail, so a pick on the map is
            still acknowledged while the inspector is folded away. */}
        <button
          type="button"
          className={`panel-rail${selectedEntity ? ' has-selection' : ''}`}
          onClick={onToggleCollapsed}
          title="Expand players & inspector panel"
        >
          <span className="panel-rail-chevron" aria-hidden="true">«</span>
          <span className="panel-rail-label">
            {selectedEntity ? `Inspect · ${selectedEntity.name}` : 'Players & inspector'}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="panel right">
      <div className="panel-header">
        <span>Players</span>
        <span className="panel-header-note">{Object.values(players).length} of {MAX_SEATS} seats</span>
        <button className="panel-collapse-btn" onClick={onToggleCollapsed} title="Collapse players & inspector panel">
          »
        </button>
      </div>
      <div className="panel-scroll" style={{ flex: 'none', maxHeight: '38%' }}>
        {Object.values(players).length === 0 ? (
          <div className="empty-state">No one here yet.</div>
        ) : (
          Object.values(players).map((p) => {
            const hero = Object.values(entities || {}).find((e) => e.kind === 'hero' && e.ownerId === p.id);
            const role = p.id === hostId ? 'Dungeon Master' : hero?.name || '';
            const tag = [role, p.connected ? '' : 'away'].filter(Boolean).join(', ');
            return (
              <div className="player-row" key={p.id}>
                <span className={`player-dot${p.connected ? ' online' : ''}`} style={{ background: p.color }} />
                <span className="player-name">{p.name}</span>
                {tag && <span className="player-tag">{tag}</span>}
              </div>
            );
          })
        )}
      </div>

      <div className="panel-scroll inspector-scroll">
        <div className="cap">Inspector</div>
        {!selectedEntity ? (
          <div className="empty-state">Select a token on the map to see its details here.</div>
        ) : selectedEntity.kind === 'hero' ? (
          <HeroInspector
            key={selectedEntity.id}
            entity={selectedEntity}
            isHost={isHost}
            audio={audio}
            meId={meId}
            onUpdate={onUpdateEntity}
            onRemove={onRemoveEntity}
            entities={entities}
            players={players}
          />
        ) : selectedEntity.kind === 'door' ? (
          <DoorInspector
            entity={selectedEntity}
            layers={layers}
            layerOrder={layerOrder}
            isHost={isHost}
            onUpdate={onUpdateEntity}
            onRemove={onRemoveEntity}
          />
        ) : selectedEntity.kind === 'chest' ? (
          <ChestInspector
            entity={selectedEntity}
            tool={tool}
            heroes={heroes}
            isHost={isHost}
            meId={meId}
            onUpdate={onUpdateEntity}
            onRemove={onRemoveEntity}
            onGiveItem={onGiveChestItem}
            onTakeItem={onTakeChestItem}
          />
        ) : selectedEntity.kind === 'trap' ? (
          <TrapInspector entity={selectedEntity} isHost={isHost} onUpdate={onUpdateEntity} onRemove={onRemoveEntity} />
        ) : (
          <MobInspector
            key={selectedEntity.id}
            entity={selectedEntity}
            isHost={isHost}
            audio={audio}
            onUpdate={onUpdateEntity}
            onRemove={onRemoveEntity}
            entities={entities}
          />
        )}
      </div>
    </div>
  );
}

// ---------- shared bits ----------

function NameField({ entity, onUpdate, disabled }) {
  return (
    <>
      <label className="field-label">Name</label>
      <input
        className="field"
        value={entity.name}
        disabled={disabled}
        onChange={(e) => onUpdate(entity.id, { name: e.target.value })}
      />
    </>
  );
}

function CollapsibleField({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" className="sidebar-section-header" onClick={() => setOpen((o) => !o)}>
        <span className="field-label" style={{ margin: 0 }}>
          {title}
        </span>
        <span className="sidebar-section-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && children}
    </div>
  );
}

function DmNotesField({ entity, onUpdate, placeholder }) {
  return (
    <>
      <label className="field-label" style={{ marginTop: 14 }}>
        DM notes <span style={{ opacity: 0.6 }}>(only visible to you)</span>
      </label>
      <textarea
        className="field"
        rows={4}
        style={{ resize: 'vertical' }}
        placeholder={placeholder}
        value={entity.dmNotes || ''}
        onChange={(e) => onUpdate(entity.id, { dmNotes: e.target.value })}
      />
    </>
  );
}

// Lets the DM link a hero token to whichever seated player controls it —
// needed since placing tokens is host-only now (see PITFALLS.md #1), so a
// hero would otherwise never end up owned by anyone but the DM. Only once
// `ownerId` matches a player does GameView.jsx's canMoveEntity let them
// drag that hero around.
function OwnerField({ entity, players, isHost, onUpdate }) {
  return (
    <>
      <label className="field-label" style={{ marginTop: 10 }}>
        Owner {!isHost && <span style={{ opacity: 0.6 }}>(host only can edit)</span>}
      </label>
      <select
        className="field"
        value={entity.ownerId || ''}
        disabled={!isHost}
        onChange={(e) => onUpdate(entity.id, { ownerId: e.target.value || null })}
      >
        <option value="">— unassigned (DM controls) —</option>
        {Object.values(players || {}).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.isHost ? ' (DM)' : ''}
          </option>
        ))}
      </select>
    </>
  );
}

function RemoveButton({ entity, onRemove }) {
  return (
    <button className="btn btn-danger btn-block" style={{ marginTop: 14 }} onClick={() => onRemove(entity.id)}>
      Remove from map
    </button>
  );
}

function ConditionsField({ entity, isHost, onUpdate }) {
  const activeConditions = entity.conditions || [];
  const [adding, setAdding] = useState(false);

  function toggleCondition(key) {
    if (!isHost) return;
    const next = activeConditions.includes(key) ? activeConditions.filter((c) => c !== key) : [...activeConditions, key];
    onUpdate(entity.id, { conditions: next });
  }

  const chip = (c, active) => (
    <button
      key={c.key}
      type="button"
      className={`condition-chip${active ? ' active' : ''}`}
      title={`${c.label} — ${c.description}`}
      disabled={!isHost}
      aria-pressed={active}
      onClick={() => toggleCondition(c.key)}
    >
      <span className="condition-chip-icon" style={{ backgroundImage: `url(${c.imageUrl})` }} aria-hidden="true" />
      {c.label}
      {active && isHost && <span aria-hidden="true">×</span>}
    </button>
  );

  return (
    <>
      <div className="cap inspector-cap">Conditions {!isHost && <span className="cap-note">(host only can edit)</span>}</div>
      <div className="condition-chips" aria-label="Active conditions">
        {activeConditions.length === 0 && !isHost && <span className="condition-none">None applied</span>}
        {CONDITIONS.filter((c) => activeConditions.includes(c.key)).map((c) => chip(c, true))}
        {isHost && (
          <button type="button" className="condition-chip add" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
            {adding ? 'Done' : '+ Condition'}
          </button>
        )}
      </div>
      {isHost && adding && (
        <div className="condition-chips condition-picker">{CONDITIONS.filter((c) => !activeConditions.includes(c.key)).map((c) => chip(c, false))}</div>
      )}
    </>
  );
}

function SizeField({ entity, onUpdate, disabled, maxSize }) {
  return (
    <>
      <label className="field-label" style={{ marginTop: 10 }}>
        Token size (squares wide)
      </label>
      <select
        className="field"
        value={entity.size || 1}
        disabled={disabled}
        onChange={(e) => onUpdate(entity.id, { size: parseInt(e.target.value, 10) })}
      >
        {tokenSizesUpTo(maxSize).map((s) => (
          <option key={s.size} value={s.size}>
            {s.label}
          </option>
        ))}
      </select>
    </>
  );
}

// The inspector's top block: the token's own face, its name, and one line of
// context ("Hero, level 3 · square (4, 2)").
function InspectorHeader({ entity, sub, onUpdate, disabled }) {
  return (
    <div className="inspector-head">
      <span
        className={`inspector-disc${entity.kind === 'hero' ? ' round' : ''}`}
        style={{ backgroundImage: `url(${entity.imageUrl})`, '--token-color': entity.color || 'transparent' }}
        aria-hidden="true"
      />
      <div className="inspector-head-text">
        <input
          className="inspector-name"
          aria-label="Name"
          value={entity.name}
          disabled={disabled}
          onChange={(e) => onUpdate(entity.id, { name: e.target.value })}
        />
        <span className="inspector-sub">{sub}</span>
      </div>
    </div>
  );
}

// Hit points and armor class in one card, above the sheet tabs. A hero's AC
// lives on its sheet; a monster's on the entity (players see it, and hero
// attacks roll against it).
function VitalsCard({ entity, sheet, onUpdate, updateSheet, disabled }) {
  const isMob = entity.kind === 'mob';
  const hpPct = entity.maxHp ? Math.max(0, Math.min(100, (entity.hp / entity.maxHp) * 100)) : 0;
  const ac = isMob ? entity.armorClass ?? 10 : sheet.armorClass;
  // A monster's sheet is DM-only, so players only see its HP and armor.
  const showSheetStats = !(isMob && disabled);
  function setAc(value) {
    const n = parseInt(value, 10) || 0;
    if (isMob) onUpdate(entity.id, { armorClass: n });
    else updateSheet({ armorClass: n });
  }
  function stepHp(delta) {
    onUpdate(entity.id, { hp: Math.max(0, (entity.hp || 0) + delta) });
  }
  return (
    <div className="vitals-card">
      <div className="vitals-hp-row">
        <button type="button" className="vitals-step" aria-label="Lose 1 hit point" disabled={disabled} onClick={() => stepHp(-1)}>
          −
        </button>
        <div className="vitals-hp-main">
          <span className="vitals-hp">
            <input type="number" aria-label="Current hit points" value={entity.hp} disabled={disabled} onChange={(e) => onUpdate(entity.id, { hp: parseInt(e.target.value, 10) || 0 })} />
            <span className="vitals-sep">/</span>
            <input type="number" aria-label="Maximum hit points" value={entity.maxHp} disabled={disabled} onChange={(e) => onUpdate(entity.id, { maxHp: parseInt(e.target.value, 10) || 0 })} />
          </span>
          <span className="cap">Hit points</span>
        </div>
        <button type="button" className="vitals-step" aria-label="Gain 1 hit point" disabled={disabled} onClick={() => stepHp(1)}>
          +
        </button>
      </div>
      <div className="hp-bar-track">
        <div className="hp-bar-fill" style={{ width: `${hpPct}%`, background: hpPct < 40 ? 'var(--danger)' : 'var(--moss)' }} />
      </div>
      <div className="vitals-tiles">
        <label className="vitals-tile">
          <input type="number" className="vitals-ac" aria-label="Armor class" value={ac} disabled={disabled} onChange={(e) => setAc(e.target.value)} />
          <span>Armor</span>
        </label>
        {showSheetStats && (
          <>
            <label className="vitals-tile">
              <input type="number" aria-label="Initiative" value={sheet.initiative} disabled={disabled} onChange={(e) => updateSheet({ initiative: parseInt(e.target.value, 10) || 0 })} />
              <span>Initiative</span>
            </label>
            <label className="vitals-tile">
              <input type="number" aria-label="Speed in feet" value={sheet.speed} disabled={disabled} onChange={(e) => updateSheet({ speed: parseInt(e.target.value, 10) || 0 })} />
              <span>Speed ft</span>
            </label>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- door ----------

function DoorInspector({ entity, layers, layerOrder, isHost, onUpdate, onRemove }) {
  return (
    <div className="inspector-card">
      <h4>{entity.name}</h4>
      <div className="section-label" style={{ margin: '0 0 8px' }}>
        Door · square ({entity.col}, {entity.row})
      </div>
      <NameField entity={entity} onUpdate={onUpdate} disabled={!isHost} />

      <label className="field-label" style={{ marginTop: 10 }}>
        Linked layer {!isHost && <span style={{ opacity: 0.6 }}>(host only can edit)</span>}
      </label>
      <select
        className="field"
        value={entity.targetLayerId || ''}
        disabled={!isHost}
        onChange={(e) => onUpdate(entity.id, { targetLayerId: e.target.value || null, targetCol: null, targetRow: null })}
      >
        <option value="">— not linked —</option>
        {(layerOrder || []).map((id) => (
          <option key={id} value={id}>
            {layers?.[id]?.name || 'Untitled layer'}
          </option>
        ))}
      </select>

      {isHost && <RemoveButton entity={entity} onRemove={onRemove} />}
    </div>
  );
}

// ---------- trap ----------

// A player only ever gets here once the DM has revealed the trap (an
// unrevealed one never reaches their client - see GameView's
// entitiesVisibleOnLayer), and sees the same fields read-only.
function TrapInspector({ entity, isHost, onUpdate, onRemove }) {
  const revealed = Boolean(entity.trapRevealed);

  return (
    <div className="inspector-card">
      <h4>{entity.name}</h4>
      <div className="section-label" style={{ margin: '0 0 8px' }}>
        Trap &middot; square ({entity.col}, {entity.row})
        {isHost && !revealed ? ' \u00b7 hidden from players' : ''}
      </div>
      <NameField entity={entity} onUpdate={onUpdate} disabled={!isHost} />

      <SizeField entity={entity} onUpdate={onUpdate} disabled={!isHost} maxSize={MAX_TRAP_SIZE} />

      {isHost && (
        <label className="checkbox-row" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={revealed}
            onChange={(e) => onUpdate(entity.id, { trapRevealed: e.target.checked })}
          />
          Reveal trap
        </label>
      )}

      <label className="field-label" style={{ marginTop: isHost ? 0 : 10 }}>
        Description
      </label>
      <textarea
        className="field"
        rows={3}
        style={{ resize: 'vertical' }}
        value={entity.trapDescription || ''}
        disabled={!isHost}
        onChange={(e) => onUpdate(entity.id, { trapDescription: e.target.value })}
      />

      <div className="two-col" style={{ marginTop: 10 }}>
        <div>
          <label className="field-label">Save number</label>
          <input
            className="field"
            type="number"
            value={entity.trapSave ?? ''}
            disabled={!isHost}
            onChange={(e) => onUpdate(entity.id, { trapSave: parseTrapNumber(e.target.value) })}
          />
        </div>
        <div>
          <label className="field-label">Fail number</label>
          <input
            className="field"
            type="number"
            value={entity.trapFail ?? ''}
            disabled={!isHost}
            onChange={(e) => onUpdate(entity.id, { trapFail: parseTrapNumber(e.target.value) })}
          />
        </div>
      </div>

      {/* Full-width rows, not a two-column grid like save/fail above: the
          inspector is narrow enough that the dice type dropdown would be
          squeezed too small to read beside the count box. */}
      <label className="field-label" style={{ marginTop: 10 }}>
        Dice to roll
      </label>
      <DiceInput value={entity.trapDice || ''} disabled={!isHost} onChange={(dice) => onUpdate(entity.id, { trapDice: dice })} />

      <label className="field-label" style={{ marginTop: 10 }}>
        Damage
      </label>
      <input
        className="field"
        value={entity.trapDamage || ''}
        disabled={!isHost}
        onChange={(e) => onUpdate(entity.id, { trapDamage: e.target.value })}
      />

      <label className="field-label" style={{ marginTop: 10 }}>
        Damage type
      </label>
      <select
        className="field"
        value={entity.trapDamageType || 'none'}
        disabled={!isHost}
        onChange={(e) => onUpdate(entity.id, { trapDamageType: e.target.value })}
      >
        {DAMAGE_TYPES.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>

      {isHost && <RemoveButton entity={entity} onRemove={onRemove} />}
    </div>
  );
}

// ---------- chest ----------

function chestCostLabel(gp) {
  if (gp >= 1) return `${Math.round(gp * 100) / 100} gp`;
  const cp = Math.round((gp || 0) * 100);
  return cp % 10 === 0 ? `${cp / 10} sp` : `${cp} cp`;
}

// Lets the DM hand one chest item straight to a hero's Bag > Weapons &
// gear list, once the chest has been opened — mirrors the compendium
// Give buttons (Toolbar.jsx's GiveButtons), just without a "Buy" side
// since chest loot doesn't cost anything.
function GiveChestItemButton({ item, heroes, onGive }) {
  const [picking, setPicking] = useState(false);
  const [heroId, setHeroId] = useState('');
  const [feedback, setFeedback] = useState('');

  function openPicker() {
    setPicking(true);
    setHeroId((heroes[0] && heroes[0].id) || '');
  }

  function confirm() {
    const hero = heroes.find((h) => h.id === heroId);
    if (!hero) return;
    onGive(hero.id);
    setFeedback(`Given to ${hero.name}`);
    setPicking(false);
    setTimeout(() => setFeedback(''), 2000);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={heroes.length === 0}
        title={heroes.length === 0 ? 'No heroes on the map yet' : 'Give this to a hero'}
        onClick={openPicker}
      >
        Give
      </button>
      {feedback && <span style={{ fontSize: 11, color: 'var(--moss-dim)', fontWeight: 600 }}>{feedback}</span>}
      {picking && (
        <div className="attack-target-picker" style={{ margin: 0 }}>
          <select className="field" value={heroId} onChange={(e) => setHeroId(e.target.value)}>
            {heroes.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
                {h.ownerName ? ` (${h.ownerName})` : ''}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary btn-sm" onClick={confirm}>
            Confirm
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPicking(false)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}

// A player's own "Take" on an opened chest's item — mirrors
// GiveChestItemButton but has nowhere to pick a hero: it always loots into
// whichever hero the DM has assigned this viewer (RightPanel's `meId`), so
// it's just a button, disabled with an explanatory title until one exists.
function TakeChestItemButton({ disabled, onTake }) {
  const [feedback, setFeedback] = useState('');

  function handleClick() {
    onTake();
    setFeedback('Added to Bag');
    setTimeout(() => setFeedback(''), 2000);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={disabled}
        title={disabled ? 'You need your own hero on the map first' : 'Add this to your Bag'}
        onClick={handleClick}
      >
        Take
      </button>
      {feedback && <span style={{ fontSize: 11, color: 'var(--moss-dim)', fontWeight: 600 }}>{feedback}</span>}
    </div>
  );
}

function ChestInspector({ entity, tool, heroes, isHost, meId, onUpdate, onRemove, onGiveItem, onTakeItem }) {
  const items = entity.items || [];
  const capacity = chestSlotCount(entity.chestSize);
  const sizeLabel = CHEST_SIZES.find((s) => s.key === entity.chestSize)?.label || 'Small';
  const myHero = (heroes || []).find((h) => h.ownerId === meId);

  function toggleOpen() {
    const opened = !entity.opened;
    onUpdate(entity.id, { opened, imageUrl: makeIconDataUrl(opened ? 'chest-open' : 'chest', entity.color) });
  }

  return (
    <div className="inspector-card">
      <h4>{entity.name}</h4>
      <div className="section-label" style={{ margin: '0 0 8px' }}>
        {sizeLabel} chest · square ({entity.col}, {entity.row})
      </div>
      <NameField entity={entity} onUpdate={onUpdate} disabled={!isHost} />

      <label className="field-label" style={{ marginTop: 10 }}>
        State
      </label>
      <button type="button" className={`btn btn-block ${entity.opened ? 'btn-secondary' : 'btn-primary'}`} onClick={toggleOpen}>
        {entity.opened ? 'Close chest' : 'Open chest'}
      </button>

      {isHost && entity.opened && (
        <>
          <label className="field-label" style={{ marginTop: 14 }}>
            Give to a player
          </label>
          {items.length === 0 ? (
            <p className="footer-note" style={{ border: 'none', padding: '4px 0' }}>
              Nothing left to give.
            </p>
          ) : (
            <div className="chest-item-list">
              {items.map((item) => (
                <div className="chest-item-row" key={item.id} style={{ gridTemplateColumns: '1fr auto' }}>
                  <div className="chest-item-info">
                    <span className="chest-item-name">
                      {item.name}
                      {item.qty > 1 ? ` × ${item.qty}` : ''}
                    </span>
                  </div>
                  <GiveChestItemButton item={item} heroes={heroes || []} onGive={(heroId) => onGiveItem(entity, item, heroId)} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {isHost && tool === 'edit' ? (
        <>
          <label className="field-label" style={{ marginTop: 14 }}>
            Contents (editing — select the Edit tool to change)
          </label>
          <ChestContentsEditor
            items={items}
            capacity={capacity}
            onAddItem={(item) => onUpdate(entity.id, { items: [...items, item] })}
            onRemoveItem={(id) => onUpdate(entity.id, { items: items.filter((it) => it.id !== id) })}
            onUpdateQty={(id, qty) => onUpdate(entity.id, { items: items.map((it) => (it.id === id ? { ...it, qty } : it)) })}
          />
        </>
      ) : !isHost && !entity.opened ? (
        <>
          <label className="field-label" style={{ marginTop: 14 }}>
            Contents
          </label>
          <p className="footer-note" style={{ border: 'none', padding: '4px 0' }}>
            Open the chest to see what's inside.
          </p>
        </>
      ) : (
        <>
          <label className="field-label" style={{ marginTop: 14 }}>
            Contents {items.length}/{capacity}
            {isHost ? ' — switch to the Edit tool to change' : ''}
          </label>
          {items.length === 0 ? (
            <p className="footer-note" style={{ border: 'none', padding: '4px 0' }}>
              This chest is empty.
            </p>
          ) : isHost ? (
            <ul className="condition-list">
              {items.map((item) => (
                <li key={item.id}>
                  {item.name} × {item.qty} ({chestCostLabel(item.cost)} each)
                </li>
              ))}
            </ul>
          ) : (
            <div className="chest-item-list">
              {items.map((item) => (
                <div className="chest-item-row" key={item.id} style={{ gridTemplateColumns: '1fr auto' }}>
                  <div className="chest-item-info">
                    <span className="chest-item-name">
                      {item.name}
                      {item.qty > 1 ? ` × ${item.qty}` : ''}
                    </span>
                  </div>
                  <TakeChestItemButton disabled={!myHero} onTake={() => onTakeItem(entity, item)} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {isHost && <RemoveButton entity={entity} onRemove={onRemove} />}
    </div>
  );
}

// ---------- monster ----------

// A player only ever sees a monster's public face: name, AC, HP, size, and
// conditions. The DM gets the same six sheet tabs a hero has, kept in
// `mobSheet` - which lives in entity_dm_data's host-only RLS in cloud mode
// and is stripped from a guest table's broadcasts, so it never reaches a
// player's client.
function MobInspector({ entity, isHost, audio, onUpdate, onRemove, entities }) {
  const droppables = entity.droppables || [];
  const sheet = entity.mobSheet || defaultCharacterSheet();
  // A monster's Battle Equipment attacks heroes, mirroring how a hero's
  // attacks monsters.
  const heroTargets = Object.values(entities || {}).filter((e) => e.kind === 'hero');

  function updateSheet(patch) {
    onUpdate(entity.id, { mobSheet: { ...sheet, ...patch } });
  }

  return (
    <div className="inspector-card">
      <InspectorHeader entity={entity} sub={`Monster · square (${entity.col}, ${entity.row})`} onUpdate={onUpdate} disabled={!isHost} />
      <VitalsCard entity={entity} sheet={sheet} onUpdate={onUpdate} updateSheet={updateSheet} disabled={!isHost} />
      <ConditionsField entity={entity} isHost={isHost} onUpdate={onUpdate} />
      {isHost ? (
        <SheetTabs entity={entity} sheet={sheet} isHost={isHost} onUpdate={onUpdate} updateSheet={updateSheet} targets={heroTargets} />
      ) : (
        <SizeField entity={entity} onUpdate={onUpdate} disabled />
      )}
      {isHost && (
        <CollapsibleField title="Droppables">
          <DroppablesEditor
            items={droppables}
            onAddItem={(item) => onUpdate(entity.id, { droppables: [...droppables, item] })}
            onRemoveItem={(id) => onUpdate(entity.id, { droppables: droppables.filter((it) => it.id !== id) })}
            onUpdateItem={(id, patch) =>
              onUpdate(entity.id, { droppables: droppables.map((it) => (it.id === id ? { ...it, ...patch } : it)) })
            }
          />
        </CollapsibleField>
      )}
      {isHost && (
        <CollapsibleField title="DM tools">
          <SoundField audio={audio} targetKind="entity" targetId={entity.id} label="Token sound (played by the DM, heard by everyone)" />
          <DmNotesField entity={entity} onUpdate={onUpdate} placeholder="Private notes about this monster…" />
          <RemoveButton entity={entity} onRemove={onRemove} />
        </CollapsibleField>
      )}
    </div>
  );
}

// ---------- hero (full 5e-flavored sheet, tabbed) ----------

const TABS = [
  { key: 'overview', label: 'Overview', title: 'Overview' },
  { key: 'abilities', label: 'Abilities', title: 'Abilities' },
  { key: 'saves', label: 'Skills', title: 'Saves & Skills' },
  { key: 'attacks', label: 'Battle', title: 'Battle Equipment' },
  { key: 'spells', label: 'Spells', title: 'Spells' },
  { key: 'bag', label: 'Bag', title: 'Bag' },
];

const TAB_ICONS = {
  overview: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
    </>
  ),
  abilities: (
    <>
      <path d="M12 2l9 5v10l-9 5-9-5V7z" />
      <path d="M12 8v8M8 10l8 4M16 10l-8 4" />
    </>
  ),
  saves: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </>
  ),
  attacks: (
    <>
      <path d="M14 4l6-1-1 6-9 9-3-3z" />
      <path d="M6 15l-3 3 3 3 3-3" />
    </>
  ),
  spells: (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z" />
    </>
  ),
  bag: (
    <>
      <path d="M7 8a5 5 0 0 1 10 0" />
      <rect x="4" y="8" width="16" height="13" rx="3" />
      <path d="M9 14h6" />
    </>
  ),
};

// The six-tab character sheet shared by heroes and monsters. `targets` is
// who this creature's Battle Equipment can attack: monsters for a hero,
// heroes for a monster. `isOwner` (a hero's own player, never true for a
// monster) unlocks just the Battle Equipment, Spells, and Bag tabs — see
// PITFALLS.md #1.
// The tab row scrolls sideways when the panel is narrower than the tabs. Arrow
// buttons appear on whichever side still has tabs hidden, and scroll a
// page at a time.
function SheetTabs({ entity, sheet, isHost, isOwner, onUpdate, updateSheet, targets }) {
  const [tab, setTab] = useState('overview');
  const canEditOwnTabs = isHost || isOwner;
  const isOwnedTab = tab === 'attacks' || tab === 'spells' || tab === 'bag';

  return (
    <>
      <div className="sheet-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            title={t.title}
            className={`sheet-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {TAB_ICONS[t.key]}
            </svg>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {!isHost && (
        <p className="footer-note" style={{ padding: '8px 2px', border: 'none' }}>
          {canEditOwnTabs
            ? 'Only the DM can edit the rest of a character sheet — Battle Equipment, Spells, and Bag are yours to manage.'
            : 'Only the DM can edit a character sheet — you can still look through every tab.'}
        </p>
      )}
      {isOwnedTab ? (
        <fieldset disabled={!canEditOwnTabs} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
          {tab === 'attacks' && <BattleEquipmentTab sheet={sheet} updateSheet={updateSheet} targets={targets} onAttackTarget={onUpdate} />}
          {tab === 'spells' && <SpellsTab sheet={sheet} updateSheet={updateSheet} />}
          {tab === 'bag' && <BagTab sheet={sheet} updateSheet={updateSheet} />}
        </fieldset>
      ) : (
        <fieldset disabled={!isHost} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
          {tab === 'overview' && <OverviewTab entity={entity} sheet={sheet} isHost={isHost} onUpdate={onUpdate} updateSheet={updateSheet} />}
          {tab === 'abilities' && <AbilitiesTab sheet={sheet} updateSheet={updateSheet} />}
          {tab === 'saves' && <SavesSkillsTab sheet={sheet} updateSheet={updateSheet} />}
        </fieldset>
      )}
    </>
  );
}

function HeroInspector({ entity, isHost, audio, meId, onUpdate, onRemove, entities, players }) {
  const sheet = entity.sheet || defaultCharacterSheet();
  const mobs = Object.values(entities || {}).filter((e) => e.kind === 'mob');
  const isOwner = !!meId && entity.ownerId === meId;

  function updateSheet(patch) {
    onUpdate(entity.id, { sheet: { ...sheet, ...patch } });
  }

  return (
    <div className="inspector-card">
      <InspectorHeader
        entity={entity}
        sub={`Hero · Level ${sheet.level}${players?.[entity.ownerId] ? ` · played by ${players[entity.ownerId].name}` : ''}`}
        onUpdate={onUpdate}
        disabled={!isHost}
      />
      <OwnerField entity={entity} players={players} isHost={isHost} onUpdate={onUpdate} />
      <VitalsCard entity={entity} sheet={sheet} onUpdate={onUpdate} updateSheet={updateSheet} disabled={!isHost} />
      <ConditionsField entity={entity} isHost={isHost} onUpdate={onUpdate} />

      <SheetTabs entity={entity} sheet={sheet} isHost={isHost} isOwner={isOwner} onUpdate={onUpdate} updateSheet={updateSheet} targets={mobs} />

      {isHost && (
        <CollapsibleField title="DM tools">
          <SoundField audio={audio} targetKind="entity" targetId={entity.id} label="Token sound (played by the DM, heard by everyone)" />
          <DmNotesField entity={entity} onUpdate={onUpdate} placeholder="Private notes about this player…" />
          <RemoveButton entity={entity} onRemove={onRemove} />
        </CollapsibleField>
      )}
    </div>
  );
}

function OverviewTab({ entity, sheet, isHost, onUpdate, updateSheet }) {
  function setDeathSave(kind, count) {
    updateSheet({ deathSaves: { ...sheet.deathSaves, [kind]: count } });
  }

  return (
    <>
      <div className="field-row" style={{ marginTop: 10 }}>
        <div>
          <label className="field-label">Level</label>
          <input type="number" className="field" min={1} max={20} value={sheet.level} onChange={(e) => updateSheet({ level: parseInt(e.target.value, 10) || 1 })} />
        </div>
      </div>

      <label className="field-label" style={{ marginTop: 10 }}>
        Death saves
      </label>
      <div className="death-save-row">
        <DeathSaveDots label="Successes" count={sheet.deathSaves.successes} colorClass="success" onSet={(n) => setDeathSave('successes', n)} />
        <DeathSaveDots label="Failures" count={sheet.deathSaves.failures} colorClass="failure" onSet={(n) => setDeathSave('failures', n)} />
      </div>

      <SizeField entity={entity} onUpdate={onUpdate} />
    </>
  );
}

function DeathSaveDots({ label, count, colorClass, onSet }) {
  return (
    <div className="death-save-group">
      <span className="death-save-label">{label}</span>
      <div className="death-save-dots">
        {[1, 2, 3].map((i) => (
          <button
            key={i}
            type="button"
            className={`death-dot ${colorClass}${count >= i ? ' filled' : ''}`}
            aria-label={`${label} ${i}`}
            onClick={() => onSet(count >= i ? i - 1 : i)}
          />
        ))}
      </div>
    </div>
  );
}

function AbilitiesTab({ sheet, updateSheet }) {
  function setAbility(key, value) {
    updateSheet({ abilities: { ...sheet.abilities, [key]: value } });
  }

  return (
    <div className="ability-grid" style={{ marginTop: 10 }}>
      {ABILITIES.map((a) => {
        const score = sheet.abilities[a.key] ?? 10;
        return (
          <div className="ability-cell" key={a.key}>
            <label className="field-label" title={a.label} htmlFor={`ability-${a.key}`}>
              {a.label.slice(0, 3)}
            </label>
            <span className="ability-mod">{formatModifier(abilityModifier(score))}</span>
            <div className="stepper">
              <button type="button" aria-label={`Lower ${a.label}`} onClick={() => setAbility(a.key, score - 1)}>
                −
              </button>
              <input id={`ability-${a.key}`} type="number" value={score} onChange={(e) => setAbility(a.key, parseInt(e.target.value, 10) || 0)} />
              <button type="button" aria-label={`Raise ${a.label}`} onClick={() => setAbility(a.key, score + 1)}>
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SavesSkillsTab({ sheet, updateSheet }) {
  const profBonus = sheet.proficiencyBonus ?? 2;

  function computedBonus(abilityKey, proficient) {
    return abilityModifier(sheet.abilities[abilityKey] ?? 10) + (proficient ? profBonus : 0);
  }

  function toggleSave(key, abilityKey) {
    const entry = normalizeCheckEntry(sheet.savingThrows[key], computedBonus(abilityKey, false));
    const proficient = !entry.proficient;
    updateSheet({
      savingThrows: { ...sheet.savingThrows, [key]: { proficient, value: computedBonus(abilityKey, proficient) } },
    });
  }
  function setSaveValue(key, value) {
    const entry = normalizeCheckEntry(sheet.savingThrows[key], 0);
    updateSheet({ savingThrows: { ...sheet.savingThrows, [key]: { ...entry, value } } });
  }
  function toggleSkill(key, abilityKey) {
    const entry = normalizeCheckEntry(sheet.skills[key], computedBonus(abilityKey, false));
    const proficient = !entry.proficient;
    updateSheet({ skills: { ...sheet.skills, [key]: { proficient, value: computedBonus(abilityKey, proficient) } } });
  }
  function setSkillValue(key, value) {
    const entry = normalizeCheckEntry(sheet.skills[key], 0);
    updateSheet({ skills: { ...sheet.skills, [key]: { ...entry, value } } });
  }

  return (
    <>
      <label className="field-label" style={{ marginTop: 10 }}>
        Proficiency bonus
      </label>
      <input
        type="number"
        className="field"
        style={{ maxWidth: 90 }}
        value={profBonus}
        onChange={(e) => updateSheet({ proficiencyBonus: parseInt(e.target.value, 10) || 0 })}
      />

      <div className="section-label" style={{ marginTop: 14 }}>
        Saving throws
      </div>
      <ul className="check-list">
        {ABILITIES.map((a) => {
          const entry = normalizeCheckEntry(sheet.savingThrows[a.key], computedBonus(a.key, false));
          return (
            <li key={a.key}>
              <label>
                <input type="checkbox" checked={entry.proficient} onChange={() => toggleSave(a.key, a.key)} />
                {a.label}
              </label>
              <input
                type="number"
                className="check-bonus-input"
                value={entry.value}
                onChange={(e) => setSaveValue(a.key, parseInt(e.target.value, 10) || 0)}
              />
            </li>
          );
        })}
      </ul>

      <div className="section-label" style={{ marginTop: 14 }}>
        Skills
      </div>
      <ul className="check-list">
        {SKILLS.map((s) => {
          const entry = normalizeCheckEntry(sheet.skills[s.key], computedBonus(s.ability, false));
          const ability = ABILITIES.find((a) => a.key === s.ability);
          return (
            <li key={s.key}>
              <label>
                <input type="checkbox" checked={entry.proficient} onChange={() => toggleSkill(s.key, s.ability)} />
                {s.label} <span className="check-ability">({ability?.label.slice(0, 3)})</span>
              </label>
              <input
                type="number"
                className="check-bonus-input"
                value={entry.value}
                onChange={(e) => setSkillValue(s.key, parseInt(e.target.value, 10) || 0)}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}

function totalToHit(weapon, additionalModifier) {
  return (weapon.modifier || 0) + (additionalModifier || 0);
}

function totalDamageLabel(weapon, additionalDamage) {
  const flat = (weapon.modifier || 0) + (additionalDamage || 0);
  const mod = flat !== 0 ? (flat > 0 ? `+${flat}` : `${flat}`) : '';
  return `${weapon.numberOfDice}${weapon.diceType}${mod}`;
}

function rollDie(sides) {
  return 1 + Math.floor(Math.random() * sides);
}

// A hero's AC lives on its sheet; a monster's on the entity itself.
function acOf(target) {
  return target.kind === 'hero' ? target.sheet?.armorClass ?? 10 : target.armorClass ?? 10;
}

// Battle Equipment only offers weapons the hero already carries (Bag's
// "Weapons & gear" list), never a fixed catalog — see PITFALLS.md #1. A
// bag item's name is matched against the weapon catalog for real combat
// dice; a homebrew name with no catalog match still equips, just with a
// plain 1d4/no-modifier baseline the player can tune via Mod/Dmg.
function weaponStatsFor(name) {
  const match = WEAPONS.find((w) => w.name.toLowerCase() === (name || '').trim().toLowerCase());
  if (match) return match;
  return { name, numberOfDice: 1, diceType: 'd4', modifier: 0 };
}

function BattleEquipmentTab({ sheet, updateSheet, targets, onAttackTarget }) {
  const items = sheet.attacks || [];
  const bagWeapons = normalizeEquipment(sheet.equipment).gear.filter((it) => it.name && it.name.trim());
  const [pickingIndex, setPickingIndex] = useState(null);
  const [pickTargetId, setPickTargetId] = useState('');
  const [results, setResults] = useState({});

  function addItem() {
    if (bagWeapons.length === 0) return;
    updateSheet({ attacks: [...items, { weaponName: bagWeapons[0].name, additionalModifier: 0, additionalDamage: 0 }] });
  }
  function updateItem(index, patch) {
    updateSheet({ attacks: items.map((it, i) => (i === index ? { ...it, ...patch } : it)) });
  }
  function removeItem(index) {
    updateSheet({ attacks: items.filter((_, i) => i !== index) });
    setResults((prev) => {
      const { [index]: _drop, ...rest } = prev;
      return rest;
    });
    if (pickingIndex === index) setPickingIndex(null);
  }

  function openTargetPicker(index) {
    setPickingIndex(index);
    setPickTargetId((targets[0] && targets[0].id) || '');
  }

  function confirmAttack(index) {
    const target = targets.find((t) => t.id === pickTargetId);
    if (!target) return;
    const it = items[index];
    const weapon = weaponStatsFor(it.weaponName);
    const toHitMod = totalToHit(weapon, it.additionalModifier);
    playDiceSound();
    const d20 = rollDie(20);
    const attackTotal = d20 + toHitMod;
    const targetAC = acOf(target);
    const hit = attackTotal >= targetAC;
    let result = { targetName: target.name, d20, toHitMod, attackTotal, targetAC, hit };

    if (hit) {
      const sides = parseInt(weapon.diceType.slice(1), 10);
      let diceTotal = 0;
      for (let n = 0; n < weapon.numberOfDice; n++) diceTotal += rollDie(sides);
      const flatDamage = (weapon.modifier || 0) + (it.additionalDamage || 0);
      const damageTotal = Math.max(0, diceTotal + flatDamage);
      const newHp = Math.max(0, (target.hp ?? target.maxHp ?? 0) - damageTotal);
      onAttackTarget(target.id, { hp: newHp });
      result = { ...result, damageTotal, newHp, maxHp: target.maxHp };
    }

    setResults((prev) => ({ ...prev, [index]: result }));
    setPickingIndex(null);
  }

  return (
    <div style={{ marginTop: 10 }}>
      {items.length === 0 && (
        <p className="footer-note" style={{ border: 'none', padding: '4px 0' }}>
          {bagWeapons.length === 0
            ? 'No battle equipment added yet — add a weapon under the Bag tab first.'
            : 'No battle equipment added yet.'}
        </p>
      )}
      {items.map((it, i) => {
        const weapon = weaponStatsFor(it.weaponName);
        // Keep the currently-equipped weapon selectable even if it's since
        // been removed from the bag, so an existing attack never silently
        // jumps to a different weapon out from under the player.
        const weaponOptions = bagWeapons.some((w) => w.name === it.weaponName)
          ? bagWeapons
          : [{ id: 'current', name: it.weaponName }, ...bagWeapons];
        const result = results[i];
        return (
          <div className="attack-item" key={i}>
            <div className="attack-head">
              <select className="field" aria-label="Weapon" value={weapon.name} onChange={(e) => updateItem(i, { weaponName: e.target.value })}>
                {weaponOptions.map((w) => (
                  <option key={w.id} value={w.name}>
                    {w.name}
                  </option>
                ))}
              </select>
              <button type="button" className="icon-btn" aria-label="Remove this attack" onClick={() => removeItem(i)}>
                ×
              </button>
            </div>
            <div className="attack-stats">
              <div>
                <b>{formatModifier(totalToHit(weapon, it.additionalModifier))}</b>
                <span>To hit</span>
              </div>
              <div>
                <b>{totalDamageLabel(weapon, it.additionalDamage)}</b>
                <span>Damage</span>
              </div>
            </div>
            <div className="field-row">
              <div>
                <label className="field-label">Extra to hit</label>
                <input
                  type="number"
                  className="field"
                  title="Stacks on top of the weapon's own bonus for the attack roll"
                  value={it.additionalModifier ?? 0}
                  onChange={(e) => updateItem(i, { additionalModifier: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
              <div>
                <label className="field-label">Extra damage</label>
                <input
                  type="number"
                  className="field"
                  title="Stacks on top of the weapon's own damage"
                  value={it.additionalDamage ?? 0}
                  onChange={(e) => updateItem(i, { additionalDamage: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={targets.length === 0}
              title={targets.length === 0 ? 'No creatures on this map to attack' : 'Pick a creature and roll this attack'}
              onClick={() => openTargetPicker(i)}
            >
              Roll attack
            </button>

            {pickingIndex === i && (
              <div className="attack-target-picker">
                <select className="field" value={pickTargetId} onChange={(e) => setPickTargetId(e.target.value)}>
                  {targets.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.hp}/{m.maxHp} HP, AC {acOf(m)}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => confirmAttack(i)}>
                  Roll d20
                </button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setPickingIndex(null)}>
                  Cancel
                </button>
              </div>
            )}

            {result && (
              <div className={`attack-result ${result.hit ? 'hit' : 'miss'}`}>
                {result.hit
                  ? `Hit! d20 ${result.d20} + ${result.toHitMod} = ${result.attackTotal} vs AC ${result.targetAC} on ${result.targetName}. ` +
                    `Damage ${result.damageTotal} → ${result.targetName} now ${result.newHp}/${result.maxHp} HP.`
                  : `Miss. d20 ${result.d20} + ${result.toHitMod} = ${result.attackTotal} vs AC ${result.targetAC} on ${result.targetName}.`}
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-secondary btn-block"
        style={{ marginTop: 8 }}
        disabled={bagWeapons.length === 0}
        title={bagWeapons.length === 0 ? 'Add a weapon under the Bag tab first' : 'Equip a weapon from your bag'}
        onClick={addItem}
      >
        + Add battle equipment
      </button>
    </div>
  );
}

function SpellsTab({ sheet, updateSheet }) {
  const spellcasting = normalizeSpellcasting(sheet.spellcasting);
  const [activeLevel, setActiveLevel] = useState(0);
  const level = spellcasting.levels[activeLevel];

  function updateCasting(patch) {
    updateSheet({ spellcasting: { ...spellcasting, ...patch } });
  }
  function updateLevel(lvl, patch) {
    updateCasting({ levels: { ...spellcasting.levels, [lvl]: { ...spellcasting.levels[lvl], ...patch } } });
  }
  function addSpell(lvl) {
    const level = spellcasting.levels[lvl];
    updateLevel(lvl, { spells: [...level.spells, newSpellEntry()] });
  }
  function updateSpell(lvl, id, patch) {
    const level = spellcasting.levels[lvl];
    updateLevel(lvl, { spells: level.spells.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }
  function removeSpell(lvl, id) {
    const level = spellcasting.levels[lvl];
    updateLevel(lvl, { spells: level.spells.filter((s) => s.id !== id) });
  }

  return (
    <div style={{ marginTop: 10 }}>
      <label className="field-label">Spellcasting class</label>
      <input
        className="field"
        value={spellcasting.class}
        onChange={(e) => updateCasting({ class: e.target.value })}
        placeholder="e.g. Wizard"
      />

      <div className="field-row">
        <div>
          <label className="field-label">Ability</label>
          <select className="field" value={spellcasting.ability} onChange={(e) => updateCasting({ ability: e.target.value })}>
            <option value="">—</option>
            {ABILITIES.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Save DC</label>
          <input
            type="number"
            className="field"
            value={spellcasting.saveDC}
            onChange={(e) => updateCasting({ saveDC: parseInt(e.target.value, 10) || 0 })}
          />
        </div>
        <div>
          <label className="field-label">Attack bonus</label>
          <input
            type="number"
            className="field"
            value={spellcasting.attackBonus}
            onChange={(e) => updateCasting({ attackBonus: parseInt(e.target.value, 10) || 0 })}
          />
        </div>
      </div>

      <div className="spell-level-tabs">
        {SPELL_LEVELS.map((lvl) => {
          const count = spellcasting.levels[lvl].spells.length;
          return (
            <button
              key={lvl}
              type="button"
              className={`spell-level-tab${activeLevel === lvl ? ' active' : ''}`}
              onClick={() => setActiveLevel(lvl)}
              title={lvl === 0 ? 'Cantrips' : `Level ${lvl}`}
            >
              {lvl}
              {count > 0 && <span className="spell-level-count">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="spell-level">
        <div className="spell-level-header">
          <span className="section-label" style={{ margin: 0 }}>
            {activeLevel === 0 ? 'Cantrips' : `Level ${activeLevel}`}
          </span>
          {activeLevel > 0 && (
            <div className="spell-slots">
              <div className="slot-pips" role="group" aria-label="Spell slots — tap to spend or restore">
                {Array.from({ length: Math.min(level.slotsTotal, 9) }, (_, i) => {
                  const available = Math.max(0, level.slotsTotal - level.slotsExpended);
                  const filled = i < available;
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`slot-pip${filled ? ' filled' : ''}`}
                      aria-label={`Slot ${i + 1}, ${filled ? 'available' : 'spent'}`}
                      onClick={() => updateLevel(activeLevel, { slotsExpended: level.slotsTotal - (filled ? i : i + 1) })}
                    />
                  );
                })}
              </div>
              <span className="slot-count">
                {Math.max(0, level.slotsTotal - level.slotsExpended)}/{level.slotsTotal}
              </span>
              <input
                type="number"
                min={0}
                title="Total slots at this level"
                aria-label="Total slots at this level"
                value={level.slotsTotal}
                onChange={(e) => updateLevel(activeLevel, { slotsTotal: parseInt(e.target.value, 10) || 0, slotsExpended: 0 })}
              />
            </div>
          )}
        </div>
        {level.spells.length === 0 && (
          <p className="footer-note" style={{ border: 'none', padding: '4px 0' }}>
            No {activeLevel === 0 ? 'cantrips' : `level ${activeLevel} spells`} added yet.
          </p>
        )}
        {level.spells.map((s) => (
          <div className="spell-row" key={s.id}>
            <input
              type="checkbox"
              checked={s.prepared}
              title="Prepared"
              onChange={() => updateSpell(activeLevel, s.id, { prepared: !s.prepared })}
            />
            <input
              className="field"
              placeholder="Spell name"
              value={s.name}
              onChange={(e) => updateSpell(activeLevel, s.id, { name: e.target.value })}
            />
            <button type="button" className="btn btn-danger btn-sm" onClick={() => removeSpell(activeLevel, s.id)}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-secondary btn-block spell-add-btn" onClick={() => addSpell(activeLevel)}>
          + Add spell
        </button>
      </div>
    </div>
  );
}

const EQUIPMENT_CATEGORIES = [
  { key: 'gear', label: 'Weapons & gear', hint: 'Swords, bows, armor, shields…' },
  { key: 'other', label: 'Other items', hint: 'Rations, rope, potions, trinkets…' },
];

function BagTab({ sheet, updateSheet }) {
  const equipment = normalizeEquipment(sheet.equipment);
  const currency = normalizeCurrency(sheet);
  const [activeCategory, setActiveCategory] = useState('gear');
  const category = EQUIPMENT_CATEGORIES.find((c) => c.key === activeCategory);

  function updateCategory(key, nextItems) {
    updateSheet({ equipment: { ...equipment, [key]: nextItems } });
  }
  function addItem(key) {
    updateCategory(key, [...equipment[key], newEquipmentItem()]);
  }
  function updateItem(key, id, patch) {
    updateCategory(key, equipment[key].map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function removeItem(key, id) {
    updateCategory(key, equipment[key].filter((it) => it.id !== id));
  }
  function setCurrency(key, value) {
    updateSheet({ currency: { ...currency, [key]: value } });
  }

  return (
    <div style={{ marginTop: 10 }}>
      <label className="field-label">Currency</label>
      <div className="currency-row">
        {CURRENCIES.map((c) => (
          <div key={c.key} className={`currency-cell currency-${c.key}`}>
            <label className="field-label">{c.label}</label>
            <input
              type="number"
              className="field"
              min={0}
              value={currency[c.key]}
              onChange={(e) => setCurrency(c.key, parseInt(e.target.value, 10) || 0)}
            />
          </div>
        ))}
      </div>

      <div className="equipment-cat-tabs">
        {EQUIPMENT_CATEGORIES.map((c) => {
          const count = equipment[c.key].length;
          return (
            <button
              key={c.key}
              type="button"
              className={`equipment-cat-tab${activeCategory === c.key ? ' active' : ''}`}
              onClick={() => setActiveCategory(c.key)}
            >
              {c.label}
              {count > 0 && <span className="equipment-cat-count">{count}</span>}
            </button>
          );
        })}
      </div>

      <EquipmentCategory
        hint={category.hint}
        items={equipment[activeCategory]}
        onAdd={() => addItem(activeCategory)}
        onUpdate={(id, patch) => updateItem(activeCategory, id, patch)}
        onRemove={(id) => removeItem(activeCategory, id)}
      />
    </div>
  );
}

function EquipmentCategory({ hint, items, onAdd, onUpdate, onRemove }) {
  return (
    <>
      {items.length === 0 && (
        <p className="footer-note" style={{ border: 'none', padding: '4px 0' }}>
          {hint}
        </p>
      )}
      {items.map((item) => (
        <div className="equipment-row" key={item.id}>
          <input
            className="field"
            placeholder="Item name"
            value={item.name}
            onChange={(e) => onUpdate(item.id, { name: e.target.value })}
          />
          <div className="stepper">
            <button type="button" aria-label="Fewer" onClick={() => onUpdate(item.id, { qty: Math.max(0, item.qty - 1) })}>
              −
            </button>
            <input type="number" aria-label="Quantity" min={0} value={item.qty} onChange={(e) => onUpdate(item.id, { qty: parseInt(e.target.value, 10) || 0 })} />
            <button type="button" aria-label="More" onClick={() => onUpdate(item.id, { qty: item.qty + 1 })}>
              +
            </button>
          </div>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemove(item.id)}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 4 }} onClick={onAdd}>
        + Add item
      </button>
    </>
  );
}
