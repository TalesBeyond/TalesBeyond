import React, { useEffect, useRef, useState } from 'react';
import { playDiceSound } from '../lib/sfx.js';
import { emitFx } from '../lib/fx.js';
import { Hint, EmptyState } from './Hints.jsx';
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
import { useCatalog } from '../lib/catalog.js';
import { CHEST_SIZES, chestSlotCount } from '../data/chests.js';
import { makeIconDataUrl } from '../data/defaultTokens.js';
import { parseTrapNumber, MAX_TRAP_SIZE, DAMAGE_TYPES } from '../data/traps.js';
import { tokenSizesUpTo } from '../data/tokenSizes.js';
import ChestContentsEditor from './ChestContentsEditor.jsx';
import DiceInput from './DiceInput.jsx';
import DroppablesEditor from './DroppablesEditor.jsx';
import CreatureCard, { Editable, RemoveTokenButton } from './CreatureCard.jsx';
import { placeableArt } from '../data/placeableArt.js';
import { entityImageSrc } from '../lib/storedImages.js';
import { useImageCacheVersion } from '../lib/imageCache.js';
import SoundField from './SoundField.jsx';
import AmbushMonstersEditor from './AmbushMonstersEditor.jsx';
import { ambushMonsterCount } from '../data/ambush.js';
import { totalToHit, totalDamageLabel, acOf, attackWeapon, attackTargetsFor, defaultMobAttacks, resolveAttackRoll, ATTACK_BEAT_MS } from '../utils/combat.js';
import RollModeTabs from './RollModeTabs.jsx';

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
  customMonsters,
  onRevealAmbush,
  collapsed,
  onToggleCollapsed,
  encounterActor = null, // whose turn it is, while an encounter runs — the creature card previews their attack
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
          title="Expand the inspector"
        >
          <span className="panel-rail-chevron" aria-hidden="true">«</span>
          <span className="panel-rail-label">
            {selectedEntity ? `Inspect · ${selectedEntity.name}` : 'Inspector'}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="panel right" data-tour="inspector">
      {/* Who's at the table and the roll log live on the toolbar. */}
      <div className="panel-header">
        <span>Inspector</span>
        <button className="panel-collapse-btn" onClick={onToggleCollapsed} title="Collapse the inspector">
          »
        </button>
      </div>

      <div className="panel-scroll inspector-scroll">
        {!selectedEntity && !isHost && !Object.values(entities || {}).some((e) => e.kind === 'hero' && e.ownerId === meId) ? (
          <EmptyState icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6" /></svg>} title="You don’t have a hero yet">
            Ask your DM to pick you under <b>played by</b> on a hero’s card. It shows up here the moment they do.
          </EmptyState>
        ) : !selectedEntity ? (
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
            encounterActor={encounterActor}
          />
        ) : selectedEntity.kind === 'npc' ? (
          <NpcInspector
            key={selectedEntity.id}
            entity={selectedEntity}
            isHost={isHost}
            audio={audio}
            onUpdate={onUpdateEntity}
            onRemove={onRemoveEntity}
            entities={entities}
            encounterActor={encounterActor}
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
            players={players}
            onUpdate={onUpdateEntity}
            onRemove={onRemoveEntity}
            onGiveItem={onGiveChestItem}
            onTakeItem={onTakeChestItem}
          />
        ) : selectedEntity.kind === 'trap' ? (
          <TrapInspector entity={selectedEntity} isHost={isHost} onUpdate={onUpdateEntity} onRemove={onRemoveEntity} />
        ) : selectedEntity.kind === 'ambush' ? (
          <AmbushInspector
            entity={selectedEntity}
            customMonsters={customMonsters}
            isHost={isHost}
            onUpdate={onUpdateEntity}
            onRemove={onRemoveEntity}
            onReveal={onRevealAmbush}
          />
        ) : (
          <MobInspector
            key={selectedEntity.id}
            entity={selectedEntity}
            isHost={isHost}
            audio={audio}
            meId={meId}
            heroes={heroes}
            onUpdate={onUpdateEntity}
            onRemove={onRemoveEntity}
            onGiveItem={onGiveChestItem}
            onTakeItem={onTakeChestItem}
            entities={entities}
            encounterActor={encounterActor}
          />
        )}
      </div>
    </div>
  );
}

// ---------- shared bits ----------

// The round icons on a placeable card's title bar. Lit (gold) means locked,
// or hidden from players; the DM clicks one to flip it. `onChange` left out
// makes it a plain sign rather than a switch — a locked chest for a player,
// an ambush for the DM (it is always hidden).
const LOCK_SHUT = (
  <>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </>
);
const LOCK_OPEN = (
  <>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.6-1.8" />
  </>
);
const EYE = <path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />;
const EYE_OFF = (
  <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10 10 0 0 1 12 4c6 0 10 8 10 8a17 17 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s4 8 10 8a9.7 9.7 0 0 0 5.4-1.6" />
);

function CardIconToggle({ on, label, title, onChange, children }) {
  const icon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
  if (!onChange) {
    return (
      <span className={`card-toggle-icon static${on ? ' on' : ''}`} role="img" aria-label={label} title={title}>
        {icon}
      </span>
    );
  }
  return (
    <button type="button" className={`card-toggle-icon${on ? ' on' : ''}`} aria-pressed={on} aria-label={label} title={title} onClick={() => onChange(!on)}>
      {icon}
    </button>
  );
}

// `what`: "door" or "chest", for the tooltip.
function LockToggle({ locked, what, onChange }) {
  return (
    <CardIconToggle
      on={locked}
      label="Locked"
      title={onChange ? (locked ? `Locked — click to unlock this ${what}` : `Unlocked — click to lock this ${what}`) : `This ${what} is locked`}
      onChange={onChange}
    >
      {locked ? LOCK_SHUT : LOCK_OPEN}
    </CardIconToggle>
  );
}

function VisibilityToggle({ hidden, onChange, staticTitle }) {
  return (
    <CardIconToggle
      on={hidden}
      label="Hidden from players"
      title={onChange ? (hidden ? 'Hidden from players — click to show it' : 'Players can see it — click to hide it') : staticTitle}
      onChange={onChange}
    >
      {hidden ? EYE_OFF : EYE}
    </CardIconToggle>
  );
}

// The card a door, chest, trap or ambush is inspected on — the same
// collectible card a hero or monster gets (CreatureCard.jsx's classes): its
// name on the title bar (click to rename, for the DM) beside its `controls`
// (the lock and visibility icons below) and the DM's remove-from-table, its
// picture (data/placeableArt.js, else the token's own icon), a type line,
// `plaques` ({ label, value } or { label, node }; `text` for words rather
// than a number), and the rest as children on the parchment.
function PlaceableCard({ entity, isHost, onUpdate, onRemove, art, artLabel, controls = null, typeLine, plaques = [], children }) {
  useImageCacheVersion(); // redraw when a shared picture arrives
  return (
    <div className="creature-card">
      <article className="target-card ally placeable-card">
        <header className="target-card-title">
          {/* The Grimoire palette's illuminated capital — hidden in every other palette. */}
          <span className="inspector-dropcap" aria-hidden="true">
            {(entity.name || '').trim().charAt(0) || '?'}
          </span>
          <Editable
            type="text"
            label="Name"
            value={entity.name}
            disabled={!isHost}
            className="card-name on-dark"
            inputClassName="card-name-input"
            onCommit={(name) => name.trim() && onUpdate(entity.id, { name: name.trim() })}
          />
          {controls}
          {isHost && <RemoveTokenButton name={entity.name} onRemove={() => onRemove(entity.id)} />}
        </header>

        <div
          className={`target-card-art placeable-card-art${art ? ' painted' : ''}`}
          style={{ backgroundImage: `url(${art || entityImageSrc(entity)})` }}
          role="img"
          aria-label={artLabel}
        />

        <div className="target-card-type">
          <span>{typeLine}</span>
        </div>

        {plaques.length > 0 && (
          <div className="card-plaques" style={{ gridTemplateColumns: `repeat(${plaques.length}, minmax(0, 1fr))` }}>
            {plaques.map((p) => (
              <div key={p.label} className="card-plaque">
                {p.node ?? <span className={`card-ed static card-plaque-value${p.text ? ' placeable-plaque-text' : ''}`}>{p.value}</span>}
                <span className="card-plaque-label">{p.label}</span>
              </div>
            ))}
          </div>
        )}

        {children && <div className="card-tab-body placeable-card-body">{children}</div>}
      </article>
    </div>
  );
}

// The DM's "players can't see this" switch on a monster, chest or door
// (data/visibility.js). Hidden, the token is gone from every player's map
// until the DM shows it again.
export function HiddenField({ entity, onUpdate, style }) {
  return (
    <label className="checkbox-row" style={style}>
      <input type="checkbox" checked={Boolean(entity.hidden)} onChange={(e) => onUpdate(entity.id, { hidden: e.target.checked })} />
      Hidden from players
    </label>
  );
}

// ---------- door ----------

export function DoorInspector({ entity, layers, layerOrder, isHost, onUpdate, onRemove }) {
  const locked = Boolean(entity.locked);
  const destination = entity.targetLayerId ? layers?.[entity.targetLayerId]?.name || 'Untitled layer' : null;

  return (
    <PlaceableCard
      entity={entity}
      isHost={isHost}
      onUpdate={onUpdate}
      onRemove={onRemove}
      art={placeableArt(locked ? 'door-locked' : 'door', 'door')}
      artLabel={locked ? 'A locked door' : 'A door'}
      controls={
        isHost ? (
          <>
            <LockToggle locked={locked} what="door" onChange={(next) => onUpdate(entity.id, { locked: next })} />
            <VisibilityToggle hidden={Boolean(entity.hidden)} onChange={(hidden) => onUpdate(entity.id, { hidden })} />
          </>
        ) : null
      }
      typeLine={`Door · square (${entity.col}, ${entity.row})${locked ? ' · locked' : ''}${isHost && entity.hidden ? ' · hidden from players' : ''}`}
      plaques={[{ label: 'Leads to', value: destination || 'Nowhere yet', text: true }]}
    >
      {isHost && (
        <>
          <label className="field-label">Linked layer</label>
          <select
            className="field"
            value={entity.targetLayerId || ''}
            onChange={(e) => onUpdate(entity.id, { targetLayerId: e.target.value || null, targetCol: null, targetRow: null })}
          >
            <option value="">— not linked —</option>
            {(layerOrder || []).map((id) => (
              <option key={id} value={id}>
                {layers?.[id]?.name || 'Untitled layer'}
              </option>
            ))}
          </select>
        </>
      )}
    </PlaceableCard>
  );
}

// ---------- trap ----------

// A player only ever gets here once the DM has revealed the trap (an
// unrevealed one never reaches their client - see GameView's
// entitiesVisibleOnLayer), and sees the same fields read-only.
export function TrapInspector({ entity, isHost, onUpdate, onRemove }) {
  const revealed = Boolean(entity.trapRevealed);
  const sizes = tokenSizesUpTo(MAX_TRAP_SIZE);
  const sizeLabel = sizes.find((s) => s.size === (entity.size || 1))?.label || `${entity.size || 1} squares`;

  return (
    <PlaceableCard
      entity={entity}
      isHost={isHost}
      onUpdate={onUpdate}
      onRemove={onRemove}
      art={placeableArt('trap')}
      artLabel="A trap"
      controls={isHost ? <VisibilityToggle hidden={!revealed} onChange={(hidden) => onUpdate(entity.id, { trapRevealed: !hidden })} /> : null}
      typeLine={`Trap · square (${entity.col}, ${entity.row})${isHost && !revealed ? ' · hidden from players' : ''}`}
      plaques={[
        {
          label: 'Size',
          node: (
            <Editable
              label="Token size"
              type="select"
              value={String(entity.size || 1)}
              display={sizeLabel}
              options={sizes.map((s) => ({ value: String(s.size), label: s.label }))}
              disabled={!isHost}
              className="card-plaque-value placeable-plaque-text"
              inputClassName="card-plaque-input"
              onCommit={(v) => onUpdate(entity.id, { size: parseInt(v, 10) })}
            />
          ),
        },
        { label: 'Dice', value: entity.trapDice || '—' },
      ]}
    >
      <label className="field-label">Description</label>
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
    </PlaceableCard>
  );
}

// ---------- ambush ----------

// Only the DM ever gets here: an ambush token never reaches a player's
// client (data/visibility.js). Revealing it puts its monsters on the map
// around it and removes the token (GameView.jsx's revealAmbush).
export function AmbushInspector({ entity, customMonsters, isHost, onUpdate, onRemove, onReveal }) {
  if (!isHost) return null;
  const monsters = entity.ambushMonsters || [];
  const count = ambushMonsterCount(entity);

  return (
    <PlaceableCard
      entity={entity}
      isHost
      onUpdate={onUpdate}
      onRemove={onRemove}
      art={placeableArt('ambush')}
      artLabel="An ambush lying in wait"
      controls={<VisibilityToggle hidden staticTitle="An ambush is always hidden from players — reveal it to put its monsters on the map" />}
      typeLine={`Ambush · square (${entity.col}, ${entity.row}) · hidden from players`}
      plaques={[
        { label: count === 1 ? 'Monster' : 'Monsters', value: count },
        { label: monsters.length === 1 ? 'Kind' : 'Kinds', value: monsters.length },
      ]}
    >
      <button type="button" className="btn btn-primary btn-block" disabled={count === 0} onClick={() => onReveal(entity.id)}>
        Reveal the ambush
      </button>
      <p className="footer-note" style={{ border: 'none', padding: '6px 0 0' }}>
        {count === 0
          ? 'Add monsters below, then reveal it when the trap is sprung.'
          : `Puts ${count === 1 ? 'its monster' : `all ${count} monsters`} on the squares around this token, then takes the token off the map.`}
      </p>

      <label className="field-label" style={{ marginTop: 14 }}>
        Monsters in the ambush
      </label>
      <AmbushMonstersEditor
        monsters={monsters}
        customMonsters={customMonsters}
        onAdd={(monster) => onUpdate(entity.id, { ambushMonsters: [...monsters, monster] })}
        onRemove={(id) => onUpdate(entity.id, { ambushMonsters: monsters.filter((m) => m.id !== id) })}
        onUpdateQty={(id, qty) => onUpdate(entity.id, { ambushMonsters: monsters.map((m) => (m.id === id ? { ...m, qty } : m)) })}
      />
    </PlaceableCard>
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
export function GiveChestItemButton({ item, heroes, onGive }) {
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
export function TakeChestItemButton({ disabled, onTake }) {
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

// Opening a chest is the DM's call: a player asks, the DM allows it or not
// (GameView.jsx's chestAsks). Shared by the phone chest sheet, which passes
// its own button classes.
export function ChestOpenButton({
  entity,
  isHost,
  meId,
  players,
  onUpdate,
  primaryClass = 'btn btn-block btn-primary',
  secondaryClass = 'btn btn-block btn-secondary',
  quietClass = 'btn btn-block btn-quiet',
}) {
  function toggleOpen() {
    const opened = !entity.opened;
    onUpdate(entity.id, { opened, imageUrl: makeIconDataUrl(opened ? 'chest-open' : 'chest', entity.color) });
  }
  if (isHost || entity.opened) {
    return (
      <button type="button" className={entity.opened ? secondaryClass : primaryClass} onClick={toggleOpen}>
        {entity.opened ? 'Close chest' : entity.locked ? 'Unlock and open chest' : 'Open chest'}
      </button>
    );
  }
  // Locked (data/visibility.js): there is nothing for a player to ask yet.
  if (entity.locked) {
    return (
      <button type="button" className={secondaryClass} disabled>
        Locked
      </button>
    );
  }
  const asker = players?.[entity.openRequestBy] || null;
  if (!asker) {
    return (
      <button type="button" className={primaryClass} onClick={() => onUpdate(entity.id, { openRequestBy: meId })}>
        Ask the DM to open it
      </button>
    );
  }
  const mine = asker.id === meId;
  return (
    <>
      <button type="button" className={secondaryClass} disabled>
        {mine ? 'Waiting for the DM…' : `${asker.name} is asking the DM…`}
      </button>
      {mine && (
        <button type="button" className={quietClass} style={{ marginTop: 6 }} onClick={() => onUpdate(entity.id, { openRequestBy: null })}>
          Cancel
        </button>
      )}
    </>
  );
}

// A chest's inspector, on the same card (PlaceableCard above): whether it is
// open, its picture, its size and how full it is, then opening it and what
// is inside.
function ChestInspector({ entity, tool, heroes, isHost, meId, players, onUpdate, onRemove, onGiveItem, onTakeItem }) {
  const items = entity.items || [];
  const capacity = chestSlotCount(entity.chestSize);
  const sizeLabel = CHEST_SIZES.find((s) => s.key === entity.chestSize)?.label || 'Small';
  const myHero = (heroes || []).find((h) => h.ownerId === meId);
  // A player learns what a chest holds only once it is open.
  const seesInside = isHost || entity.opened;
  const locked = Boolean(entity.locked);

  return (
    <PlaceableCard
      entity={entity}
      isHost={isHost}
      onUpdate={onUpdate}
      onRemove={onRemove}
      art={placeableArt(entity.opened ? 'chest-open' : 'chest', 'chest')}
      artLabel={entity.opened ? 'An open chest' : 'A shut chest'}
      controls={
        isHost ? (
          <>
            <LockToggle locked={locked} what="chest" onChange={(next) => onUpdate(entity.id, { locked: next })} />
            <VisibilityToggle hidden={Boolean(entity.hidden)} onChange={(hidden) => onUpdate(entity.id, { hidden })} />
          </>
        ) : locked ? (
          <LockToggle locked what="chest" />
        ) : null
      }
      typeLine={`${sizeLabel} chest · ${entity.opened ? 'open' : locked ? 'locked' : 'shut'} · square (${entity.col}, ${entity.row})${isHost && entity.hidden ? ' · hidden from players' : ''}`}
      plaques={[
        { label: 'Size', value: sizeLabel, text: true },
        { label: seesInside ? 'Slots filled' : 'Inside', value: seesInside ? `${items.length}/${capacity}` : '?' },
      ]}
    >
      <ChestOpenButton entity={entity} isHost={isHost} meId={meId} players={players} onUpdate={onUpdate} />

      {isHost && entity.opened && (
        <>
          <label className="field-label" style={{ marginTop: 14 }}>
            Give to a player
          </label>
          {items.length > 0 && (heroes || []).length === 0 && (
            <Hint className="hint-tight" action="Open Tokens" onAction={() => emitFx({ type: 'open', panel: 'tokens' })}>
              Loot goes to a hero. Place one from <b>Tokens → Default heroes</b> first.
            </Hint>
          )}
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
        <p className="card-tab-note" style={{ margin: '12px 0 0' }}>
          {locked
            ? 'It’s locked. Only the DM can unlock it.'
            : 'The DM decides whether it opens. Ask, and you’ll see what’s inside once they allow it.'}
        </p>
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
              {!myHero && <Hint className="hint-tight">You need a hero to carry loot. Ask your DM to link one to you.</Hint>}
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
    </PlaceableCard>
  );
}

// ---------- monster ----------

// A player only ever sees a monster's public face: name, AC, HP, size, and
// conditions. The DM gets the rest of the card — initiative, speed, ability
// scores and the Battle / Loot / Skills / DM tabs — all kept in `mobSheet`,
// `droppables` and `dmNotes`, which live in entity_dm_data's host-only RLS in
// cloud mode and are stripped from a guest table's broadcasts, so they never
// reach a player's client.
// What a defeated monster dropped. Its loot is rolled once, the moment its
// hit points reach 0 (GameView.jsx's loot roll), and from then on anyone can
// see it: a player takes a stack into their own hero's Bag, the DM hands one
// to any hero — the same Take and Give a chest has. `phone` swaps in the
// phone sheet's rows.
export function MobLoot({ entity, isHost, heroes, meId, onGive, onTake, phone = false }) {
  if (entity.kind !== 'mob' || entity.hp !== 0 || !Array.isArray(entity.loot)) return null;
  const loot = entity.loot;
  const myHero = (heroes || []).find((h) => h.ownerId === meId);
  const needsHero = !isHost && !myHero && loot.length > 0;
  const label = (item) => `${item.name}${item.qty > 1 ? ` × ${item.qty}` : ''}`;
  const action = (item) =>
    isHost ? (
      <GiveChestItemButton item={item} heroes={heroes || []} onGive={(heroId) => onGive(entity, item, heroId)} />
    ) : (
      <TakeChestItemButton disabled={!myHero} onTake={() => onTake(entity, item)} />
    );

  if (phone) {
    return (
      <section className="phone-chest-items" aria-label="Loot">
        <span className="phone-label">Loot · dropped when defeated</span>
        {loot.length === 0 ? (
          <p className="phone-caption phone-caption-flush">Nothing to loot.</p>
        ) : (
          loot.map((item) => (
            <div className="phone-chest-row" key={item.id}>
              <span>{label(item)}</span>
              {action(item)}
            </div>
          ))
        )}
        {needsHero && <p className="phone-caption phone-caption-flush">You need a hero to carry loot. Ask your DM to link one to you.</p>}
      </section>
    );
  }

  return (
    <div className="inspector-card" style={{ marginBottom: 12 }}>
      <h4>Loot</h4>
      <div className="section-label" style={{ margin: '0 0 8px' }}>
        Dropped by {entity.name} when defeated
      </div>
      {loot.length === 0 ? (
        <p className="footer-note" style={{ border: 'none', padding: '4px 0' }}>
          Nothing to loot.
        </p>
      ) : (
        <div className="chest-item-list">
          {needsHero && <Hint className="hint-tight">You need a hero to carry loot. Ask your DM to link one to you.</Hint>}
          {loot.map((item) => (
            <div className="chest-item-row" key={item.id} style={{ gridTemplateColumns: '1fr auto' }}>
              <div className="chest-item-info">
                <span className="chest-item-name">{label(item)}</span>
              </div>
              {action(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MobInspector({ entity, isHost, audio, meId, heroes, onUpdate, onRemove, onGiveItem, onTakeItem, entities, encounterActor }) {
  const droppables = entity.droppables || [];
  const sheet = entity.mobSheet || defaultCharacterSheet();
  // A monster's Battle Equipment attacks heroes (and NPCs), mirroring how a
  // hero's attacks monsters. It is the monster's own attacks (it has no bag),
  // set when it was placed and the DM's to change.
  const heroTargets = attackTargetsFor(entity, entities);

  function updateSheet(patch) {
    onUpdate(entity.id, { mobSheet: { ...sheet, ...patch } });
  }

  const tabs = isHost
    ? [
        {
          key: 'battle',
          label: 'Battle',
          content: (
            <BattleEquipmentTab
              sheet={sheet}
              updateSheet={updateSheet}
              targets={heroTargets}
              onAttackTarget={onUpdate}
              attackerName={entity.name}
              ownAttacks
              defaultAttacks={defaultMobAttacks(entity.name)}
            />
          ),
        },
        {
          key: 'loot',
          label: 'Loot',
          content: (
            <DroppablesEditor
              items={droppables}
              onAddItem={(item) => onUpdate(entity.id, { droppables: [...droppables, item] })}
              onRemoveItem={(id) => onUpdate(entity.id, { droppables: droppables.filter((it) => it.id !== id) })}
              onUpdateItem={(id, patch) =>
                onUpdate(entity.id, { droppables: droppables.map((it) => (it.id === id ? { ...it, ...patch } : it)) })
              }
            />
          ),
        },
        { key: 'skills', label: 'Skills', content: <SavesSkillsTab sheet={sheet} updateSheet={updateSheet} /> },
        {
          key: 'dm',
          label: 'DM',
          content: <DmTab entity={entity} audio={audio} onUpdate={onUpdate} placeholder="Private notes about this monster…" />,
        },
      ]
    : [];

  return (
    <>
    <MobLoot entity={entity} isHost={isHost} heroes={heroes} meId={meId} onGive={onGiveItem} onTake={onTakeItem} />
    <CreatureCard
      entity={entity}
      sheet={sheet}
      updateSheet={updateSheet}
      onUpdate={onUpdate}
      canEdit={isHost}
      onRemove={isHost ? onRemove : null}
      showStats={isHost}
      typeLine={`Monster · square (${entity.col}, ${entity.row})${isHost && entity.hidden ? ' · hidden from players' : ''}`}
      notice={isHost ? <HiddenField entity={entity} onUpdate={onUpdate} style={{ margin: 0 }} /> : null}
      actor={encounterActor}
      tabs={tabs}
    />
    </>
  );
}

// ---------- NPC ----------

// A character the DM runs (data/tokenKinds.js): a hero's whole card — level,
// ability scores, death saves and the Battle / Spells / Bag / Skills tabs —
// with nobody playing it. Its sheet is kept the way a monster's is
// (`mobSheet`, which players never receive), so a player sees an NPC's public
// face alone: name, AC, HP, size and conditions. The DM can hide it from
// players altogether.
function NpcInspector({ entity, isHost, audio, onUpdate, onRemove, entities, encounterActor }) {
  const sheet = entity.mobSheet || defaultCharacterSheet();
  const targets = attackTargetsFor(entity, entities);

  function updateSheet(patch) {
    onUpdate(entity.id, { mobSheet: { ...sheet, ...patch } });
  }

  const tabs = isHost
    ? [
        {
          key: 'battle',
          label: 'Battle',
          content: <BattleEquipmentTab sheet={sheet} updateSheet={updateSheet} targets={targets} onAttackTarget={onUpdate} playSoundOnHit attackerName={entity.name} />,
        },
        { key: 'spells', label: 'Spells', content: <SpellsTab sheet={sheet} updateSheet={updateSheet} /> },
        { key: 'bag', label: 'Bag', content: <BagTab sheet={sheet} updateSheet={updateSheet} /> },
        { key: 'skills', label: 'Skills', content: <SavesSkillsTab sheet={sheet} updateSheet={updateSheet} /> },
        { key: 'dm', label: 'DM', content: <DmTab entity={entity} audio={audio} onUpdate={onUpdate} placeholder="Private notes about this NPC…" /> },
      ]
    : [];

  return (
    <CreatureCard
      entity={entity}
      sheet={sheet}
      updateSheet={updateSheet}
      onUpdate={onUpdate}
      canEdit={isHost}
      onRemove={isHost ? onRemove : null}
      showStats={isHost}
      showDeathSaves={isHost}
      typeLine={`NPC · square (${entity.col}, ${entity.row})${isHost && entity.hidden ? ' · hidden from players' : ''}`}
      notice={isHost ? <HiddenField entity={entity} onUpdate={onUpdate} style={{ margin: 0 }} /> : null}
      actor={encounterActor}
      tabs={tabs}
    />
  );
}

// ---------- hero ----------

// The DM edits the whole card. A hero's own player edits everything in the
// Battle, Spells, Bag and Skills tabs (see PITFALLS.md #1); everyone else can
// look through every tab but change nothing.
function HeroInspector({ entity, isHost, audio, meId, onUpdate, onRemove, entities, players, encounterActor }) {
  const sheet = entity.sheet || defaultCharacterSheet();
  const mobs = attackTargetsFor(entity, entities);
  const isOwner = !!meId && entity.ownerId === meId;
  const canEditOwnTabs = isHost || isOwner;

  function updateSheet(patch) {
    onUpdate(entity.id, { sheet: { ...sheet, ...patch } });
  }

  const locked = (editable, node) => (
    <fieldset disabled={!editable} className="card-fieldset">
      {node}
    </fieldset>
  );

  const tabs = [
    {
      key: 'battle',
      label: 'Battle',
      content: locked(
        canEditOwnTabs,
        <BattleEquipmentTab sheet={sheet} updateSheet={updateSheet} targets={mobs} onAttackTarget={onUpdate} playSoundOnHit attackerName={entity.name} />
      ),
    },
    { key: 'spells', label: 'Spells', content: locked(canEditOwnTabs, <SpellsTab sheet={sheet} updateSheet={updateSheet} />) },
    { key: 'bag', label: 'Bag', content: locked(canEditOwnTabs, <BagTab sheet={sheet} updateSheet={updateSheet} />) },
    { key: 'skills', label: 'Skills', content: locked(canEditOwnTabs, <SavesSkillsTab sheet={sheet} updateSheet={updateSheet} />) },
    ...(isHost
      ? [{ key: 'dm', label: 'DM', content: <DmTab entity={entity} audio={audio} onUpdate={onUpdate} placeholder="Private notes about this player…" /> }]
      : []),
  ];

  // Linking a hero to the seated player who controls it — placing tokens is
  // host-only (PITFALLS.md #1), so without this a hero would never be owned
  // by anyone but the DM. GameView's canMoveEntity keys off `ownerId`.
  const ownerName = players?.[entity.ownerId]?.name;
  const owner = isHost ? (
    <label className="card-owner">
      <span>played by</span>
      <select value={entity.ownerId || ''} aria-label="Played by" onChange={(e) => onUpdate(entity.id, { ownerId: e.target.value || null })}>
        <option value="">nobody (DM)</option>
        {Object.values(players || {}).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.isHost ? ' (DM)' : ''}
          </option>
        ))}
      </select>
    </label>
  ) : (
    <span>{ownerName ? ` · played by ${ownerName}` : ''}</span>
  );

  return (
    <CreatureCard
      entity={entity}
      sheet={sheet}
      updateSheet={updateSheet}
      onUpdate={onUpdate}
      canEdit={isHost}
      canEditLife={canEditOwnTabs}
      onRemove={isHost ? onRemove : null}
      showDeathSaves
      typeLine={`Hero · square (${entity.col}, ${entity.row})`}
      owner={owner}
      notice={
        isHost && !entity.ownerId ? <Hint>Pick a player under <b>played by</b> so they can move this hero. Until then, only you can.</Hint> : null
      }
      actor={encounterActor}
      tabs={tabs}
      tabNote={
        isHost
          ? null
          : canEditOwnTabs
            ? 'Battle, Spells, Bag and Skills are yours to manage — the DM edits the rest.'
            : 'Only the DM can edit this sheet — you can still look through every tab.'
      }
    />
  );
}

// The DM-only tab on a hero's or monster's card: its sound and private notes
// (click-to-edit, like the rest of the card). Removing the token is the trash
// icon at the top of the card.
export function DmTab({ entity, audio, onUpdate, placeholder }) {
  return (
    <div className="card-dm">
      <span className="card-dm-badge">Only you see this</span>
      <SoundField audio={audio} targetKind="entity" targetId={entity.id} label="Token sound (played by you, heard by everyone)" />
      <div className="card-dm-notes">
        <span className="card-mini-label">DM notes</span>
        <Editable
          type="textarea"
          label="DM notes"
          value={entity.dmNotes || ''}
          display={entity.dmNotes ? `“${entity.dmNotes}”` : <span className="card-none">{placeholder}</span>}
          placeholder={placeholder}
          className="card-notes"
          inputClassName="card-notes-input"
          onCommit={(dmNotes) => onUpdate(entity.id, { dmNotes })}
        />
      </div>
    </div>
  );
}

export function SavesSkillsTab({ sheet, updateSheet }) {
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


// The dice a monster's own attack can roll.
const ATTACK_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

// `ownAttacks`: a monster's tab. Its attacks aren't weapons out of a bag but
// its own — a name, dice and bonuses the DM can edit — and `defaultAttacks`
// are the ones a monster of its kind starts with, to put back in one press.
export function BattleEquipmentTab({ sheet, updateSheet, targets, onAttackTarget, playSoundOnHit, attackerName, ownAttacks = false, defaultAttacks = [] }) {
  useCatalog(); // re-render when the catalog's weapons arrive, so stats resolve
  const items = sheet.attacks || [];
  const bagWeapons = normalizeEquipment(sheet.equipment).gear.filter((it) => it.name && it.name.trim());
  // Each attack keeps its own target and roll mode in view, ready to roll:
  // index -> { targetId, mode }. Until a target is picked (or once the picked
  // one has left the map) it aims at the first creature in the list, and it
  // rolls normally unless advantage or disadvantage is picked for that roll.
  const [picks, setPicks] = useState({});
  const [results, setResults] = useState({});

  function pickFor(index) {
    const pick = picks[index] || {};
    const targetId = targets.some((t) => t.id === pick.targetId) ? pick.targetId : (targets[0] && targets[0].id) || '';
    return { targetId, mode: pick.mode || 'normal' };
  }
  function setPick(index, patch) {
    setPicks((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }));
  }

  function addItem() {
    if (ownAttacks) {
      updateSheet({ attacks: [...items, { weaponName: 'Attack', numberOfDice: 1, diceType: 'd6', additionalModifier: 0, additionalDamage: 0 }] });
      return;
    }
    if (bagWeapons.length === 0) return;
    updateSheet({ attacks: [...items, { weaponName: bagWeapons[0].name, additionalModifier: 0, additionalDamage: 0 }] });
  }
  function updateItem(index, patch) {
    updateSheet({ attacks: items.map((it, i) => (i === index ? { ...it, ...patch } : it)) });
  }
  function removeItem(index) {
    updateSheet({ attacks: items.filter((_, i) => i !== index) });
    // The attacks after it move up one, so what was picked and rolled by
    // position no longer lines up.
    setResults({});
    setPicks({});
  }

  // An attack plays out in beats: a pause, the dice sound, another pause,
  // then the result appears with its hit/miss sound. The roll itself happens
  // at the end, against the target's HP as it is by then. Leaving the tab
  // mid-roll cancels the attack.
  const [rollingIndex, setRollingIndex] = useState(null);
  const timers = useRef([]);
  const latest = useRef({ items, targets });
  latest.current = { items, targets };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function confirmAttack(index) {
    const { targetId, mode } = pickFor(index);
    if (!targets.some((t) => t.id === targetId)) return;
    // Advantage and disadvantage are for this one roll; the target stays.
    setPick(index, { mode: 'normal' });
    setRollingIndex(index);
    setResults((prev) => {
      const { [index]: _drop, ...rest } = prev;
      return rest;
    });
    timers.current = [
      setTimeout(playDiceSound, ATTACK_BEAT_MS),
      setTimeout(() => {
        setRollingIndex(null);
        resolveAttack(index, targetId, mode);
      }, ATTACK_BEAT_MS * 2),
    ];
  }

  function resolveAttack(index, targetId, mode) {
    const { items, targets } = latest.current;
    const target = targets.find((t) => t.id === targetId);
    const it = items[index];
    if (!target || !it) return;
    const result = resolveAttackRoll(it, target, { attackerName, playSounds: playSoundOnHit, applyDamage: onAttackTarget, mode });
    setResults((prev) => ({ ...prev, [index]: result }));
  }

  return (
    <div style={{ marginTop: 10 }}>
      {items.length === 0 && (
        <p className="footer-note" style={{ border: 'none', padding: '4px 0' }}>
          {ownAttacks
            ? 'No attacks yet.'
            : bagWeapons.length === 0
              ? 'No battle equipment added yet — add a weapon under the Bag tab first.'
              : 'No battle equipment added yet.'}
        </p>
      )}
      {ownAttacks && items.length === 0 && defaultAttacks.length > 0 && (
        <button
          type="button"
          className="btn btn-primary btn-block"
          title={defaultAttacks.map((a) => `${a.weaponName} ${formatModifier(a.additionalModifier)}, ${totalDamageLabel(attackWeapon(a), a.additionalDamage)}`).join(' · ')}
          onClick={() => updateSheet({ attacks: defaultAttacks })}
        >
          Give {attackerName || 'it'} its usual attacks
        </button>
      )}
      {items.map((it, i) => {
        const weapon = attackWeapon(it);
        // Keep the currently-equipped weapon selectable even if it's since
        // been removed from the bag, so an existing attack never silently
        // jumps to a different weapon out from under the player.
        const weaponOptions = bagWeapons.some((w) => w.name === it.weaponName)
          ? bagWeapons
          : [{ id: 'current', name: it.weaponName }, ...bagWeapons];
        const result = results[i];
        const pick = pickFor(i);
        return (
          <div className="attack-item" key={i}>
            <div className="attack-head">
              {ownAttacks ? (
                <input className="field" aria-label="Attack name" value={it.weaponName ?? ''} placeholder="Attack name" onChange={(e) => updateItem(i, { weaponName: e.target.value })} />
              ) : (
                // Picking a weapon takes its dice from the catalog again.
                <select className="field" aria-label="Weapon" value={weapon.name} onChange={(e) => updateItem(i, { weaponName: e.target.value, numberOfDice: undefined, diceType: undefined })}>
                  {weaponOptions.map((w) => (
                    <option key={w.id} value={w.name}>
                      {w.name}
                    </option>
                  ))}
                </select>
              )}
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
            {ownAttacks && (
              <div className="field-row">
                <div>
                  <label className="field-label">Dice</label>
                  <input
                    type="number"
                    className="field"
                    min="1"
                    max="20"
                    title="How many dice the attack rolls for damage"
                    value={weapon.numberOfDice}
                    onChange={(e) => updateItem(i, { numberOfDice: Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)), diceType: weapon.diceType })}
                  />
                </div>
                <div>
                  <label className="field-label">Die</label>
                  <select className="field" aria-label="Damage die" value={weapon.diceType} onChange={(e) => updateItem(i, { numberOfDice: weapon.numberOfDice, diceType: e.target.value })}>
                    {ATTACK_DICE.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div className="field-row">
              <div>
                <label className="field-label">{ownAttacks ? 'To hit bonus' : 'Extra to hit'}</label>
                <input
                  type="number"
                  className="field"
                  title={ownAttacks ? 'Added to the d20 of the attack roll' : "Stacks on top of the weapon's own bonus for the attack roll"}
                  value={it.additionalModifier ?? 0}
                  onChange={(e) => updateItem(i, { additionalModifier: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
              <div>
                <label className="field-label">{ownAttacks ? 'Damage bonus' : 'Extra damage'}</label>
                <input
                  type="number"
                  className="field"
                  title={ownAttacks ? 'Added to the damage dice' : "Stacks on top of the weapon's own damage"}
                  value={it.additionalDamage ?? 0}
                  onChange={(e) => updateItem(i, { additionalDamage: parseInt(e.target.value, 10) || 0 })}
                />
              </div>
            </div>
            {targets.length > 0 && (
              <div className="attack-target-picker">
                <RollModeTabs mode={pick.mode} onChange={(mode) => setPick(i, { mode })} disabled={rollingIndex !== null} />
                <select
                  className="field"
                  aria-label="Target"
                  title="Who this attack is aimed at"
                  value={pick.targetId}
                  disabled={rollingIndex !== null}
                  onChange={(e) => setPick(i, { targetId: e.target.value })}
                >
                  {targets.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.hp}/{m.maxHp} HP, AC {acOf(m)}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-primary btn-block" disabled={rollingIndex !== null} onClick={() => confirmAttack(i)}>
                  {rollingIndex === i ? 'Rolling…' : pick.mode === 'normal' ? 'Roll d20' : 'Roll 2d20'}
                </button>
              </div>
            )}

            {result && (
              <div className={`attack-result ${result.hit ? 'hit' : 'miss'}`}>
                {result.throws && (
                  <b className="attack-result-mode">
                    {result.mode === 'advantage' ? 'Advantage' : 'Disadvantage'}: rolled {result.throws.join(' and ')}, kept {result.d20}.{' '}
                  </b>
                )}
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
        disabled={!ownAttacks && bagWeapons.length === 0}
        title={ownAttacks ? 'Add another attack of its own' : bagWeapons.length === 0 ? 'Add a weapon under the Bag tab first' : 'Equip a weapon from your bag'}
        onClick={addItem}
      >
        {ownAttacks ? '+ Add attack' : '+ Add battle equipment'}
      </button>
      {!ownAttacks && bagWeapons.length === 0 && (
        <Hint className="hint-tight" action="Open the Bag" onAction={() => emitFx({ type: 'cardTab', key: 'bag' })}>
          Equipment comes from the bag. Add a weapon under the <b>Bag</b> tab, then equip it here.
        </Hint>
      )}
      {items.length > 0 && targets.length === 0 && <Hint className="hint-tight">There’s nothing to attack in this world yet.</Hint>}
    </div>
  );
}

export function SpellsTab({ sheet, updateSheet }) {
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

export function BagTab({ sheet, updateSheet }) {
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
