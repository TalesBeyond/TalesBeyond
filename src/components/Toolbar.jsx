import React, { useMemo, useRef, useState } from 'react';
import { clampGridDims } from '../utils/grid.js';
import { resizeImageToDataUrl } from '../utils/image.js';
import { WEAPONS, WEAPON_TYPES, DICE_TYPES as WEAPON_DICE_TYPES, CLASSES, averageDamage } from '../data/weapons.js';
import { ITEMS, ITEM_CATEGORIES } from '../data/items.js';
import { makeIconDataUrl } from '../data/defaultTokens.js';
import { defaultCharacterSheet, normalizeEquipment, normalizeCurrency, newEquipmentItem } from '../data/characterSheet.js';
import { ISLAND_CONDITIONS } from '../data/islandConditions.js';
import { ISLAND_DAY_NIGHT_MODES, DAY_PHASES } from '../data/dayPhases.js';
import ClockReadout from './ClockReadout.jsx';

const BACKGROUND_IMAGE_MAX_DIM = 1600; // fills the whole map, so keep more detail than a token

function newDiceSet(overrides = {}) {
  return { id: `set_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, title: '', sides: 20, quantity: 1, ...overrides };
}

// A small square icon card — the toolbar's basic unit. Every action (tool
// select, popover trigger, or one-shot command) is one of these instead of
// a text button or a dropdown item, so the whole bar reads as a row of
// little tiles rather than a list of menus.
function ToolCard({ icon, image, label, active, onClick, disabled, title }) {
  return (
    <button type="button" className={`tool-card ${active ? 'active' : ''}`} onClick={onClick} disabled={disabled} title={title || label}>
      <span className="tool-card-icon">{image ? <img className="tool-card-image" src={image} alt="" /> : icon}</span>
      <span className="tool-card-label">{label}</span>
    </button>
  );
}

export default function Toolbar({
  isHost,
  isGuestHost,
  layer,
  activeIsland,
  tool,
  onToolChange,
  onLayerPatch,
  onIslandPatch,
  session,
  onRegenerateCode,
  onToggleOpen,
  onSaveNow,
  clock,
  onOpenClock,
  onSetClockRunning,
  dayPhase,
  dayNightOverride,
  onSetDayNightOverride,
  onExport,
  onImport,
  onLeave,
  lastSavedLabel,
  layers,
  layerOrder,
  currentLayerId,
  layerPlayerCounts,
  onSwitchLayer,
  onCreateLayer,
  onRemoveLayer,
  activeIslandId,
  onSelectIsland,
  onCreateIsland,
  onRemoveIsland,
  onDownloadIsland,
  onDownloadIslandImage,
  onImportIsland,
  onUngroupIslands,
  onRenameGroup,
  heroes,
  onUpdateEntity,
  initiativeHeroes,
  initiativeMobs,
  onRollInitiative,
  customAssets,
  onAddCustomAsset,
  onRemoveCustomAsset,
  collapsed,
  onToggleCollapsed,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onRecenter,
}) {
  const importRef = useRef(null);
  // Only one popover open at a time — clicking a card closes the others and
  // toggles its own.
  const [showMapSettings, setShowMapSettings] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [showIslands, setShowIslands] = useState(false);
  const [showDice, setShowDice] = useState(false);
  const [showInitiative, setShowInitiative] = useState(false);
  const [showCompendium, setShowCompendium] = useState(false);
  const [showItemCompendium, setShowItemCompendium] = useState(false);
  const [showAssetStorage, setShowAssetStorage] = useState(false);
  const [showDayNight, setShowDayNight] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedHostKey, setCopiedHostKey] = useState(false);
  // Lifted out of DiceRollerPopover so the roll log and saved dice sets
  // survive closing and reopening the popover, instead of resetting every
  // time it unmounts.
  const [diceRolls, setDiceRolls] = useState([]);
  const [diceSets, setDiceSets] = useState([newDiceSet({ title: 'Quick roll' })]);

  function togglePopover(name) {
    setShowMapSettings((s) => (name === 'mapSettings' ? !s : false));
    setShowLayers((s) => (name === 'layers' ? !s : false));
    setShowIslands((s) => (name === 'islands' ? !s : false));
    setShowDice((s) => (name === 'dice' ? !s : false));
    setShowInitiative((s) => (name === 'initiative' ? !s : false));
    setShowCompendium((s) => (name === 'compendium' ? !s : false));
    setShowItemCompendium((s) => (name === 'itemCompendium' ? !s : false));
    setShowAssetStorage((s) => (name === 'assetStorage' ? !s : false));
    setShowDayNight((s) => (name === 'dayNight' ? !s : false));
  }

  function copyCode() {
    navigator.clipboard?.writeText(session.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // Used by both compendiums (weapons and items share the same hero-equipment
  // shape) — always drops the entry into Bag > Weapons & gear; "Buy" also
  // deducts its cost (rounded up to the nearest gold piece, since hero
  // currency is tracked as whole gold/silver/bronze) from the hero's gold.
  function giveItemToHero(hero, item, deduct) {
    const sheet = hero.sheet || defaultCharacterSheet();
    const equipment = normalizeEquipment(sheet.equipment);
    const currency = normalizeCurrency(sheet);
    const newItem = { ...newEquipmentItem(), name: item.name };
    const nextCurrency = deduct ? { ...currency, gold: Math.max(0, currency.gold - Math.max(1, Math.ceil(item.cost || 0))) } : currency;
    onUpdateEntity(hero.id, {
      sheet: { ...sheet, equipment: { ...equipment, gear: [...equipment.gear, newItem] }, currency: nextCurrency },
    });
  }

  function copyHostKey() {
    navigator.clipboard?.writeText(session.hostKey).then(() => {
      setCopiedHostKey(true);
      setTimeout(() => setCopiedHostKey(false), 1500);
    });
  }

  async function handleBackgroundFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const backgroundImage = await resizeImageToDataUrl(file, BACKGROUND_IMAGE_MAX_DIM, 0.78);
      onIslandPatch({ backgroundImage });
    } catch (err) {
      alert('Could not read that image — try a different file.');
    }
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    onImport(file);
    e.target.value = '';
  }

  // DM-authored weapons/items from Asset Storage (36_custom_assets.sql) —
  // each compendium below renders these alongside (never instead of) the
  // built-in WEAPONS/ITEMS catalogs.
  const customWeapons = Object.values(customAssets || {})
    .filter((item) => item.assetType === 'weapon')
    .map((item) => ({ id: item.id, ...item.data }));
  const customItems = Object.values(customAssets || {})
    .filter((item) => item.assetType === 'item')
    .map((item) => ({ id: item.id, ...item.data }));

  if (collapsed) {
    return (
      <div className="toolbar collapsed">
        <button className="toolbar-collapse-btn" onClick={onToggleCollapsed} title="Expand toolbar">
          ▾
        </button>
      </div>
    );
  }

  return (
    <div className="toolbar">
      <button className="toolbar-collapse-btn" onClick={onToggleCollapsed} title="Collapse toolbar">
        ▴
      </button>
      <div className="toolbar-group">
        <ToolCard
          icon="✥"
          label="Play"
          active={tool === 'play'}
          onClick={() => onToolChange('play')}
          title="Select and drag tokens"
        />
        {isHost && (
          <ToolCard
            icon="✎"
            label="Edit"
            active={tool === 'edit'}
            onClick={() => onToolChange('edit')}
            title="Drag islands around to reposition them"
          />
        )}
        <ToolCard
          icon="✋"
          label="Pan"
          active={tool === 'pan'}
          onClick={() => onToolChange('pan')}
          title="Click and drag to pan around the map"
        />
        <ToolCard
          icon="↔"
          label="Ruler"
          active={tool === 'ruler'}
          onClick={() => onToolChange('ruler')}
          title="Click and drag on the map to measure distance"
        />
      </div>

      <div className="toolbar-group">
        <ToolCard icon="−" label="Zoom out" onClick={onZoomOut} title="Zoom out" />
        <ToolCard icon={`${Math.round((zoom ?? 1) * 100)}%`} label="Reset" onClick={onZoomReset} title="Reset zoom to 100%" />
        <ToolCard icon="+" label="Zoom in" onClick={onZoomIn} title="Zoom in" />
        <ToolCard icon="◎" label="Recenter" onClick={onRecenter} title="Scroll back to the currently selected island" />
      </div>

      {clock && (
        <div className="toolbar-group">
          <ClockReadout
            clock={clock}
            isHost={isHost}
            onOpen={onOpenClock}
            onSetRunning={onSetClockRunning}
            phaseOverride={dayNightOverride}
          />
        </div>
      )}

      {isHost && (
        <div className="toolbar-group">
          <ToolCard icon="🗺" label="Map" active={showMapSettings} onClick={() => togglePopover('mapSettings')} title={activeIsland.name} />
          <ToolCard icon="🏝" label="Islands" active={showIslands} onClick={() => togglePopover('islands')} title={`${(layer.islandOrder || []).length} island(s) on this layer`} />
          <ToolCard icon="🗂" label="Layers" active={showLayers} onClick={() => togglePopover('layers')} title={`${(layerOrder || []).length} layer(s)`} />
          <ToolCard
            icon="⛓"
            label="Merge Islands"
            active={tool === 'group'}
            onClick={() => onToolChange(tool === 'group' ? 'edit' : 'group')}
            title="Select 2+ islands to bundle into a group that moves and titles as one"
          />
          {showMapSettings && (
            <MapSettingsPopover
              layer={layer}
              island={activeIsland}
              isHost={isHost}
              onLayerPatch={onLayerPatch}
              onIslandPatch={onIslandPatch}
              onBackgroundFile={handleBackgroundFile}
              onDownloadIsland={onDownloadIsland}
              onDownloadIslandImage={onDownloadIslandImage}
              onClose={() => setShowMapSettings(false)}
            />
          )}
          {showIslands && (
            <IslandManagerPopover
              islands={layer.islands}
              islandOrder={layer.islandOrder}
              islandGroups={layer.islandGroups || {}}
              activeIslandId={activeIslandId}
              onSelectIsland={onSelectIsland}
              onCreateIsland={onCreateIsland}
              onRemoveIsland={onRemoveIsland}
              onImportIsland={onImportIsland}
              onUngroupIslands={onUngroupIslands}
              onRenameGroup={onRenameGroup}
              onClose={() => setShowIslands(false)}
            />
          )}
          {showLayers && (
            <LayerSwitcherPopover
              layers={layers}
              layerOrder={layerOrder}
              currentLayerId={currentLayerId}
              layerPlayerCounts={layerPlayerCounts}
              onSwitchLayer={onSwitchLayer}
              onCreateLayer={onCreateLayer}
              onRemoveLayer={onRemoveLayer}
              onClose={() => setShowLayers(false)}
            />
          )}
        </div>
      )}

      {isHost && (
        <div className="toolbar-group">
          <ToolCard icon="🕒" label="Ingame time" onClick={onOpenClock} title="Set the in-game time, tick speed, and day/night cycle" />
          <ToolCard
            icon={dayPhase ? '' : '🌓'}
            image={dayPhase ? DAY_PHASES[dayPhase].imageUrl : undefined}
            label="Day / night"
            active={showDayNight}
            onClick={() => togglePopover('dayNight')}
            title="Change the day/night phase by hand, whatever the clock says"
          />
          {showDayNight && (
            <DayNightPopover
              override={dayNightOverride}
              hasClock={Boolean(clock)}
              hasCycle={Boolean(clock?.cycle?.enabled)}
              onSelect={(phase) => onSetDayNightOverride(phase)}
              onClose={() => setShowDayNight(false)}
            />
          )}
          <ToolCard icon="📖" label="Weapons" active={showCompendium} onClick={() => togglePopover('compendium')} title="Weapons Compendium" />
          <ToolCard icon="📦" label="Items" active={showItemCompendium} onClick={() => togglePopover('itemCompendium')} title="Item Compendium" />
          <ToolCard
            icon="🗃"
            label="Asset Storage"
            active={showAssetStorage}
            onClick={() => togglePopover('assetStorage')}
            title="Create custom monsters, weapons, and items for this table"
          />
          <ToolCard
            icon="👢"
            label="Initiative"
            active={showInitiative}
            onClick={() => togglePopover('initiative')}
            title="Roll for Initiative"
          />
        </div>
      )}

      {/* Every player's own private dice tray — never shared with anyone
          else's browser, same as it always was for the host (see
          diceSets/diceRolls above); just no longer gated to the host. */}
      <div className="toolbar-group">
        <ToolCard icon="🎲" label="Dice" active={showDice} onClick={() => togglePopover('dice')} title="Roll the dice" />
        {showDice && (
          <DiceRollerPopover
            sets={diceSets}
            rolls={diceRolls}
            onRoll={(roll) => setDiceRolls((prev) => [roll, ...prev])}
            onClearRolls={() => setDiceRolls([])}
            onAddSet={() => setDiceSets((prev) => [...prev, newDiceSet()])}
            onUpdateSet={(id, patch) => setDiceSets((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))}
            onRemoveSet={(id) => setDiceSets((prev) => prev.filter((s) => s.id !== id))}
            onClearSets={() => setDiceSets([])}
            onClose={() => setShowDice(false)}
          />
        )}
      </div>
      {isHost && showCompendium && (
        <WeaponsCompendiumModal
          onClose={() => setShowCompendium(false)}
          heroes={heroes || []}
          onGiveItem={giveItemToHero}
          customWeapons={customWeapons}
        />
      )}
      {isHost && showItemCompendium && (
        <ItemsCompendiumModal
          onClose={() => setShowItemCompendium(false)}
          heroes={heroes || []}
          onGiveItem={giveItemToHero}
          customItems={customItems}
        />
      )}
      {isHost && showAssetStorage && (
        <AssetStorageModal
          onClose={() => setShowAssetStorage(false)}
          customAssets={customAssets}
          onAddAsset={onAddCustomAsset}
          onRemoveAsset={onRemoveCustomAsset}
        />
      )}
      {isHost && showInitiative && (
        <InitiativeModal
          heroes={initiativeHeroes || []}
          mobs={initiativeMobs || []}
          onRoll={onRollInitiative}
          onClose={() => setShowInitiative(false)}
        />
      )}

      <div className="spacer" />

      {isHost && (
        <div className="toolbar-group">
          <ToolCard icon="💾" label="Save" onClick={onSaveNow} title={lastSavedLabel} />
          <ToolCard icon="⬇" label="Export" onClick={onExport} title="Export .json" />
          <ToolCard icon="⬆" label="Import" onClick={() => importRef.current?.click()} title="Import .json — overwrites the whole table" />
          <input ref={importRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportFile} />
        </div>
      )}

      {isHost && (
        <div className="toolbar-group">
          <div className="copyable">
            <code>{session.code}</code>
          </div>
          <ToolCard icon="📋" label={copied ? 'Copied!' : 'Copy'} onClick={copyCode} title="Copy invite code" />
          <ToolCard icon="🔄" label="New code" onClick={onRegenerateCode} title="Invalidate the old code and issue a new one" />
          <ToolCard
            icon={session.isOpen ? '🔓' : '🔒'}
            label={session.isOpen ? 'Close' : 'Reopen'}
            active={!session.isOpen}
            onClick={onToggleOpen}
            title={session.isOpen ? 'Close table to new joins' : 'Table closed — reopen'}
          />
          <ToolCard
            icon="🗝"
            label={copiedHostKey ? 'Copied!' : isGuestHost ? 'DM code' : 'Host key'}
            onClick={copyHostKey}
            title={
              isGuestHost
                ? 'Your private DM code — save it, along with an exported .json, to resume this table later via "Resume guest session" on the Landing screen'
                : 'Testing only: save this so you can rejoin as host from the landing screen if you ever get removed as host'
            }
          />
        </div>
      )}

      <div className="toolbar-group">
        <ToolCard icon="🚪" label="Leave" onClick={onLeave} title="Leave the table" />
      </div>
    </div>
  );
}

// Set the day/night phase by hand. Picking a phase overrides the clock's own
// cycle (which keeps running underneath) until "Follow the clock" hands it
// back; it works with the cycle on or off, and with no clock at all.
function DayNightPopover({ override, hasClock, hasCycle, onSelect, onClose }) {
  const isManual = Boolean(override);
  return (
    <div
      style={{
        position: 'absolute',
        top: 54,
        left: 0,
        background: 'var(--ink-800)',
        border: '1px solid var(--gold-line)',
        borderRadius: 6,
        padding: 16,
        width: 240,
        zIndex: 100,
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
      }}
    >
      <div className="popover-header">
        <span className="section-label" style={{ margin: 0 }}>
          Day / night
        </span>
        <button className="popover-close" onClick={onClose} aria-label="Close day / night" title="Close">
          ×
        </button>
      </div>
      <p className="footer-note" style={{ border: 'none', padding: '0 0 10px' }}>
        {isManual
          ? hasClock
            ? 'Set by hand — the clock keeps running, but no longer decides the phase.'
            : 'Set by hand.'
          : hasCycle
            ? 'Following the clock.'
            : 'No day/night cycle is running.'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          type="button"
          className={`btn btn-block ${!isManual ? 'btn-primary' : 'btn-secondary'}`}
          aria-pressed={!isManual}
          onClick={() => onSelect(null)}
          title="Let the clock's day/night cycle decide the phase"
        >
          Follow the clock
        </button>
        {['dawn', 'day', 'dusk', 'night'].map((key) => {
          const p = DAY_PHASES[key];
          const active = override === key;
          return (
            <button
              key={key}
              type="button"
              className={`btn btn-block daynight-option ${active ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={active}
              onClick={() => onSelect(key)}
              title={p.description}
            >
              <img src={p.imageUrl} alt="" width={20} height={20} />
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The island's condition states - fog, darkness, fire, and so on. Toggling
// one applies immediately (like a token's conditions), not via "Apply
// changes", and everyone at the table sees the resulting badges on the map.
function IslandConditionsField({ island, isHost, onPatch }) {
  const active = island.conditions || [];

  function toggle(key) {
    if (!isHost) return;
    onPatch({ conditions: active.includes(key) ? active.filter((k) => k !== key) : [...active, key] });
  }

  return (
    <>
      <label className="field-label" style={{ marginTop: 10 }}>
        Island conditions {!isHost && <span style={{ opacity: 0.6 }}>(host only can edit)</span>}
      </label>
      <div className="condition-row">
        {ISLAND_CONDITIONS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`condition-badge${active.includes(c.key) ? ' active' : ''}`}
            style={{ backgroundImage: `url(${c.imageUrl})` }}
            title={`${c.label} — ${c.description}`}
            aria-pressed={active.includes(c.key)}
            disabled={!isHost}
            onClick={() => toggle(c.key)}
          />
        ))}
      </div>
      {active.length > 0 && (
        <ul className="condition-list" style={{ marginBottom: 6 }}>
          {active.map((key) => {
            const c = ISLAND_CONDITIONS.find((cond) => cond.key === key);
            if (!c) return null;
            return (
              <li key={key} title={c.description}>
                <img src={c.imageUrl} alt="" width={16} height={16} />
                {c.label}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function MapSettingsPopover({ layer, island, isHost, onLayerPatch, onIslandPatch, onBackgroundFile, onDownloadIsland, onDownloadIslandImage, onClose }) {
  const [name, setName] = useState(island.name);
  const [cols, setCols] = useState(island.cols);
  const [rows, setRows] = useState(island.rows);
  const [feet, setFeet] = useState(layer.feetPerSquare);
  const fileRef = useRef(null);

  function apply() {
    onIslandPatch({
      name: name.trim() || 'Untitled Island',
      cols: clampGridDims(cols),
      rows: clampGridDims(rows),
    });
    onLayerPatch({ feetPerSquare: Math.max(1, parseInt(feet, 10) || 5) });
    onClose();
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 54,
        left: 0,
        background: 'var(--ink-800)',
        border: '1px solid var(--gold-line)',
        borderRadius: 6,
        padding: 16,
        width: 260,
        zIndex: 100,
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
      }}
    >
      <div className="popover-header">
        <span className="section-label" style={{ margin: 0 }}>
          Map settings
        </span>
        <button className="popover-close" onClick={onClose} aria-label="Close map settings" title="Close">
          ×
        </button>
      </div>

      <div className="section-label" style={{ marginTop: 0 }}>
        This island
      </div>
      <label className="field-label">Island name</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} disabled={!isHost} />

      <div className="field-row">
        <div>
          <label className="field-label">Width</label>
          <input className="field" type="number" value={cols} onChange={(e) => setCols(e.target.value)} disabled={!isHost} />
        </div>
        <div>
          <label className="field-label">Height</label>
          <input className="field" type="number" value={rows} onChange={(e) => setRows(e.target.value)} disabled={!isHost} />
        </div>
      </div>

      <IslandConditionsField island={island} isHost={isHost} onPatch={onIslandPatch} />

      <label className="field-label" style={{ marginTop: 10 }}>
        Day / night
      </label>
      <select
        className="field"
        value={island.dayNight || 'cycle'}
        disabled={!isHost}
        onChange={(e) => onIslandPatch({ dayNight: e.target.value })}
        title="Follow the table's in-game clock, or stay always day / always night regardless of it"
      >
        {ISLAND_DAY_NIGHT_MODES.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </select>

      <div className="section-label">This layer</div>
      <label className="field-label">Feet per square</label>
      <input className="field" type="number" value={feet} onChange={(e) => setFeet(e.target.value)} disabled={!isHost} />

      {isHost && (
        <>
          <button className="btn btn-secondary btn-block" onClick={() => fileRef.current?.click()} style={{ marginBottom: 12 }}>
            Upload island background image
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onBackgroundFile} />
          <button className="btn btn-primary btn-block" onClick={apply} style={{ marginBottom: 12 }}>
            Apply changes
          </button>
          <button
            className="btn btn-primary btn-block"
            onClick={() => onDownloadIslandImage?.()}
            title="Download this island as a PNG (background + grid) to edit in an image editor, then re-upload as a custom background"
            style={{ marginBottom: 12 }}
          >
            Download island image (.png)
          </button>
          <button className="btn btn-secondary btn-block" onClick={() => onDownloadIsland?.()} title="Download this island's grid + background as a .json file, for re-importing into Hearthbound">
            Download island data (.json)
          </button>
        </>
      )}
      {!isHost && <p className="footer-note" style={{ border: 'none', padding: '4px 0' }}>Only the host can change map settings.</p>}
    </div>
  );
}

function LayerSwitcherPopover({
  layers,
  layerOrder,
  currentLayerId,
  layerPlayerCounts,
  onSwitchLayer,
  onCreateLayer,
  onRemoveLayer,
  onClose,
}) {
  const [name, setName] = useState('');
  const [cols, setCols] = useState(20);
  const [rows, setRows] = useState(15);

  function addLayer() {
    if (!name.trim()) return;
    onCreateLayer({ name: name.trim(), cols, rows });
    setName('');
    setCols(20);
    setRows(15);
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 54,
        left: 0,
        background: 'var(--ink-800)',
        border: '1px solid var(--gold-line)',
        borderRadius: 6,
        padding: 16,
        width: 280,
        zIndex: 100,
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
      }}
    >
      <div className="popover-header">
        <span className="section-label" style={{ margin: 0 }}>
          Layers
        </span>
        <button className="popover-close" onClick={onClose} aria-label="Close layers panel" title="Close">
          ×
        </button>
      </div>
      {(layerOrder || []).map((id, i) => {
        const layer = layers?.[id];
        if (!layer) return null;
        const isBase = i === 0;
        const isCurrent = id === currentLayerId;
        return (
          <div key={id} className="player-row" style={{ justifyContent: 'space-between' }}>
            <span className="player-name">
              {layer.name} <span className="player-tag">{layerPlayerCounts?.[id] || 0}</span>
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className={`btn btn-secondary btn-sm ${isCurrent ? 'active' : ''}`}
                disabled={isCurrent}
                onClick={() => {
                  onSwitchLayer(id);
                  onClose();
                }}
              >
                {isCurrent ? 'Viewing' : 'Switch'}
              </button>
              <button
                className="btn btn-danger btn-sm"
                disabled={isBase}
                title={isBase ? 'The base layer cannot be removed' : 'Delete this layer'}
                onClick={() => onRemoveLayer(id)}
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}

      <div className="divider-word">new layer</div>

      <label className="field-label">Name</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Crypt Below" />

      <div className="field-row">
        <div>
          <label className="field-label">Width</label>
          <input className="field" type="number" value={cols} onChange={(e) => setCols(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Height</label>
          <input className="field" type="number" value={rows} onChange={(e) => setRows(e.target.value)} />
        </div>
      </div>

      <button className="btn btn-primary btn-block" onClick={addLayer} style={{ marginTop: 8 }}>
        + Add layer
      </button>
    </div>
  );
}

function IslandManagerPopover({
  islands,
  islandOrder,
  islandGroups,
  activeIslandId,
  onSelectIsland,
  onCreateIsland,
  onRemoveIsland,
  onImportIsland,
  onUngroupIslands,
  onRenameGroup,
  onClose,
}) {
  const [name, setName] = useState('');
  const [cols, setCols] = useState(20);
  const [rows, setRows] = useState(15);
  const importIslandRef = useRef(null);

  function addIsland() {
    if (!name.trim()) return;
    onCreateIsland({ name: name.trim(), cols, rows });
    setName('');
    setCols(20);
    setRows(15);
  }

  function handleImportIslandFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    onImportIsland?.(file);
    e.target.value = '';
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 54,
        left: 0,
        background: 'var(--ink-800)',
        border: '1px solid var(--gold-line)',
        borderRadius: 6,
        padding: 16,
        width: 280,
        zIndex: 100,
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
      }}
    >
      <div className="popover-header">
        <span className="section-label" style={{ margin: 0 }}>
          Islands on this layer
        </span>
        <button className="popover-close" onClick={onClose} aria-label="Close islands panel" title="Close">
          ×
        </button>
      </div>
      {(islandOrder || []).map((id, i) => {
        const island = islands?.[id];
        if (!island) return null;
        const isSole = islandOrder.length === 1;
        const isBase = i === 0 && !isSole;
        const isActive = id === activeIslandId;
        return (
          <div key={id} className="player-row" style={{ justifyContent: 'space-between' }}>
            <span className="player-name">{island.name}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className={`btn btn-secondary btn-sm ${isActive ? 'active' : ''}`}
                disabled={isActive}
                onClick={() => {
                  onSelectIsland(id);
                  onClose();
                }}
              >
                {isActive ? 'Active' : 'Select'}
              </button>
              <button
                className="btn btn-danger btn-sm"
                disabled={isBase}
                title={isBase ? 'The base island cannot be removed while other islands exist' : isSole ? 'Clear this island and start it fresh — a layer always needs at least one' : 'Delete this island'}
                onClick={() => onRemoveIsland(id)}
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}

      {Object.values(islandGroups || {}).length > 0 && (
        <>
          <div className="section-label">Groups on this layer</div>
          {Object.values(islandGroups).map((group) => (
            <GroupRow key={group.id} group={group} onRename={onRenameGroup} onUngroup={onUngroupIslands} />
          ))}
        </>
      )}

      <div className="divider-word">new island</div>

      <label className="field-label">Name</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Side Chamber" />

      <div className="field-row">
        <div>
          <label className="field-label">Width</label>
          <input className="field" type="number" value={cols} onChange={(e) => setCols(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Height</label>
          <input className="field" type="number" value={rows} onChange={(e) => setRows(e.target.value)} />
        </div>
      </div>

      <div className="field-row" style={{ marginTop: 8 }}>
        <button className="btn btn-primary" onClick={addIsland}>
          + Add island
        </button>
        <button className="btn btn-secondary" onClick={() => importIslandRef.current?.click()} title="Import a previously downloaded island .json file">
          Import island
        </button>
      </div>
      <input ref={importIslandRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportIslandFile} />
      <p className="footer-note" style={{ border: 'none', padding: '8px 0 0' }}>
        Drag an island's background on the map to reposition it.
      </p>
    </div>
  );
}

// One row per island group in IslandManagerPopover — an inline rename
// field (local-state-then-Save, same shape as MapSettingsPopover's name
// field) plus an Ungroup button. Ungrouping only dissolves the group;
// member islands are untouched.
function GroupRow({ group, onRename, onUngroup }) {
  const [name, setName] = useState(group.name);
  const dirty = name !== group.name;
  return (
    <div className="player-row" style={{ justifyContent: 'space-between' }}>
      <input className="field" style={{ marginBottom: 0 }} value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ display: 'flex', gap: 6 }}>
        {dirty && (
          <button className="btn btn-secondary btn-sm" onClick={() => onRename?.(group.id, name)}>
            Save
          </button>
        )}
        <button className="btn btn-danger btn-sm" onClick={() => onUngroup?.(group.id)}>
          Ungroup
        </button>
      </div>
    </div>
  );
}

const DICE_TYPES = [4, 6, 8, 10, 12, 20, 100];

function DiceRollerPopover({ sets, rolls, onRoll, onClearRolls, onAddSet, onUpdateSet, onRemoveSet, onClearSets, onClose }) {
  function rollSet(set) {
    const results = Array.from({ length: set.quantity }, () => 1 + Math.floor(Math.random() * set.sides));
    const total = results.reduce((sum, n) => sum + n, 0);
    onRoll({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: set.title.trim() || `${set.quantity} × d${set.sides}`,
      sides: set.sides,
      quantity: set.quantity,
      results,
      total,
    });
  }

  // Rolls every configured set in one go. Reversed so the history list (each
  // onRoll prepends) ends up reading top-to-bottom in the same order the
  // sets are listed, instead of backwards.
  function rollAll() {
    [...sets].reverse().forEach(rollSet);
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 54,
        left: 0,
        background: 'var(--ink-800)',
        border: '1px solid var(--gold-line)',
        borderRadius: 6,
        padding: 16,
        width: 300,
        maxHeight: '70vh',
        overflowY: 'auto',
        zIndex: 100,
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
      }}
    >
      <div className="popover-header">
        <span className="section-label" style={{ margin: 0 }}>
          Roll the dice
        </span>
        <button className="popover-close" onClick={onClose} aria-label="Close dice roller" title="Close">
          ×
        </button>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginBottom: 10 }}
        onClick={rollAll}
        disabled={sets.length === 0}
        title="Roll every set below at once"
      >
        🎲 Roll All ({sets.length})
      </button>

      {sets.map((set) => (
        <div className="dice-set" key={set.id}>
          <div className="dice-set-header">
            <input
              className="field dice-set-title"
              placeholder="e.g. Attack roll"
              value={set.title}
              onChange={(e) => onUpdateSet(set.id, { title: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-danger btn-sm"
              title="Remove this set"
              onClick={() => onRemoveSet(set.id)}
            >
              ×
            </button>
          </div>

          <div className="dice-type-row">
            {DICE_TYPES.map((d) => (
              <button
                key={d}
                type="button"
                className={`dice-type-btn${set.sides === d ? ' active' : ''}`}
                onClick={() => onUpdateSet(set.id, { sides: d })}
              >
                d{d}
              </button>
            ))}
          </div>

          <div className="dice-set-footer">
            <input
              type="number"
              min={1}
              max={20}
              className="field dice-set-qty"
              value={set.quantity}
              onChange={(e) => onUpdateSet(set.id, { quantity: Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)) })}
            />
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => rollSet(set)}>
              Roll {set.quantity} × d{set.sides}
            </button>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <button type="button" className="btn btn-secondary btn-block" onClick={onAddSet}>
          + Add another set
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={onClearSets}
          disabled={sets.length === 0}
          title="Remove every dice set below"
        >
          Clear all dice
        </button>
      </div>

      {rolls.length > 0 && (
        <div className="dice-history">
          <div className="popover-header" style={{ marginBottom: 4 }}>
            <span className="section-label" style={{ margin: 0 }}>
              Roll history
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClearRolls} title="Clear roll history">
              Clear
            </button>
          </div>
          {rolls.map((r) => (
            <div className="dice-roll-row" key={r.id}>
              <div>
                <span className="dice-roll-name">{r.title}</span>
                <span className="dice-roll-detail">
                  {r.quantity} × d{r.sides} ({r.results.join(', ')})
                </span>
              </div>
              <span className="dice-roll-total">{r.total}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// DM-only: pick which hero and monster/NPC tokens on the current layer are
// in this encounter, then roll a d20 for each at once. The actual roll +
// per-entity `initiativeRoll`/`initiativeTurn` stamping (rendered as the
// boot badge on the token, see MapBoard.jsx) lives in GameView's
// rollInitiative — this component is just the picker + results readout.
function InitiativeModal({ heroes, mobs, onRoll, onClose }) {
  const [participantIds, setParticipantIds] = useState([]);
  const [results, setResults] = useState(null);

  const byId = {};
  for (const e of heroes) byId[e.id] = e;
  for (const e of mobs) byId[e.id] = e;

  const availableHeroes = heroes.filter((h) => !participantIds.includes(h.id));
  const availableMobs = mobs.filter((m) => !participantIds.includes(m.id));

  function addParticipant(id) {
    if (!id || participantIds.includes(id)) return;
    setParticipantIds((prev) => [...prev, id]);
  }

  function removeParticipant(id) {
    setParticipantIds((prev) => prev.filter((pid) => pid !== id));
  }

  function handleRoll() {
    const rolled = onRoll(participantIds) || [];
    setResults(rolled.map((r) => ({ ...r, name: byId[r.id]?.name || 'Unknown' })));
  }

  function handleClear() {
    onRoll([]);
    setParticipantIds([]);
    setResults([]);
  }

  return (
    <div className="book-backdrop" onClick={onClose}>
      <div className="book-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="book-card-header">
          <span className="book-title">👢 Roll for Initiative</span>
          <button className="popover-close" onClick={onClose} aria-label="Close initiative roller" title="Close">
            ×
          </button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          <label className="field-label">Add player</label>
          <select className="field" value="" onChange={(e) => addParticipant(e.target.value)}>
            <option value="">Choose a hero…</option>
            {availableHeroes.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
                {h.ownerName ? ` (${h.ownerName})` : ''}
              </option>
            ))}
          </select>

          <label className="field-label" style={{ marginTop: 10 }}>
            Add monster / NPC
          </label>
          <select className="field" value="" onChange={(e) => addParticipant(e.target.value)}>
            <option value="">Choose a monster or NPC…</option>
            {availableMobs.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          {participantIds.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {participantIds.map((id) => (
                <div className="dice-set-header" key={id}>
                  <span className="dice-set-title" style={{ flex: 1 }}>
                    {byId[id]?.name || 'Unknown'}
                  </span>
                  <button type="button" className="btn btn-danger btn-sm" title="Remove" onClick={() => removeParticipant(id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={handleRoll}
              disabled={participantIds.length === 0}
            >
              🎲 Roll Initiative ({participantIds.length})
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleClear}
              title="Remove every initiative badge from the map"
            >
              Clear
            </button>
          </div>

          {results && results.length > 0 && (
            <div className="dice-history">
              <span className="section-label" style={{ margin: '0 0 4px' }}>
                Turn order
              </span>
              {results.map((r) => (
                <div className="dice-roll-row" key={r.id}>
                  <span className="dice-roll-name">
                    👢 {r.turn}. {r.name}
                  </span>
                  <span className="dice-roll-total">{r.roll}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function baseWeaponName(name) {
  return name.replace(/^\+\d+ /, '');
}

function weaponDiceLabel(w) {
  const mod = w.modifier ? (w.modifier > 0 ? `+${w.modifier}` : `${w.modifier}`) : '';
  return `${w.numberOfDice}${w.diceType}${mod}`;
}

function formatCost(gp) {
  if (gp >= 1) return `${Math.round(gp * 100) / 100} gp`;
  const cp = Math.round(gp * 100);
  return cp % 10 === 0 ? `${cp / 10} sp` : `${cp} cp`;
}

const WEAPON_TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'melee', label: 'Melee' },
  { key: 'ranged', label: 'Ranged' },
];

function WeaponsCompendiumModal({ onClose, heroes, onGiveItem, customWeapons }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  // The DM's custom weapons (Asset Storage) render right alongside the
  // built-in catalog — never in place of it.
  const allWeapons = useMemo(() => [...WEAPONS, ...(customWeapons || [])], [customWeapons]);

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allWeapons.filter((w) => (typeFilter === 'all' || w.type === typeFilter) && (!q || w.name.toLowerCase().includes(q))).sort(
      (a, b) => a.type.localeCompare(b.type) || baseWeaponName(a.name).localeCompare(baseWeaponName(b.name)) || a.modifier - b.modifier
    );
  }, [allWeapons, search, typeFilter]);

  let lastType = null;

  return (
    <div className="book-backdrop" onClick={onClose}>
      <div className="book-card" onClick={(e) => e.stopPropagation()}>
        <div className="book-card-header">
          <span className="book-title">📖 Weapons Compendium</span>
          <button className="popover-close" onClick={onClose} aria-label="Close compendium" title="Close">
            ×
          </button>
        </div>

        <div className="book-controls">
          <input className="field" placeholder="Search weapons…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="book-type-filter">
            {WEAPON_TYPE_FILTERS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`tool-btn ${typeFilter === t.key ? 'active' : ''}`}
                onClick={() => setTypeFilter(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="footer-note" style={{ border: 'none', padding: 0 }}>
            {entries.length} of {allWeapons.length}
          </span>
        </div>

        <div className="book-pages">
          {entries.length === 0 && (
            <p className="footer-note" style={{ border: 'none', color: 'var(--ink-700)' }}>
              No weapons match.
            </p>
          )}
          {entries.map((w) => {
            const showHeading = w.type !== lastType;
            lastType = w.type;
            return (
              <React.Fragment key={w.id || w.name}>
                {showHeading && <div className="book-page-heading">{w.type === 'melee' ? 'Melee Weapons' : 'Ranged Weapons'}</div>}
                <div className="compendium-entry">
                  <div className="compendium-entry-top">
                    <span className="compendium-entry-name">
                      {w.name}
                      {w.id && ' (Custom)'}
                    </span>
                    <span className="compendium-entry-meta">
                      {weaponDiceLabel(w)} · {formatCost(w.cost)}
                    </span>
                  </div>
                  <div className="compendium-entry-detail">{w.equipableClass.join(', ')}</div>
                  <GiveButtons item={w} heroes={heroes} onGive={onGiveItem} />
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatWeight(lb) {
  return lb > 0 ? `${lb} lb` : '—';
}

function ItemsCompendiumModal({ onClose, heroes, onGiveItem, customItems }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // The DM's custom items (Asset Storage) render right alongside the
  // built-in catalog — never in place of it.
  const allItems = useMemo(() => [...ITEMS, ...(customItems || [])], [customItems]);

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allItems.filter((it) => (categoryFilter === 'all' || it.category === categoryFilter) && (!q || it.name.toLowerCase().includes(q))).sort(
      (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
    );
  }, [allItems, search, categoryFilter]);

  let lastCategory = null;

  return (
    <div className="book-backdrop" onClick={onClose}>
      <div className="book-card" onClick={(e) => e.stopPropagation()}>
        <div className="book-card-header">
          <span className="book-title">📦 Item Compendium</span>
          <button className="popover-close" onClick={onClose} aria-label="Close compendium" title="Close">
            ×
          </button>
        </div>

        <div className="book-controls">
          <input className="field" placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="field" style={{ maxWidth: 180, marginBottom: 0 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            {ITEM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c[0].toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
          <span className="footer-note" style={{ border: 'none', padding: 0 }}>
            {entries.length} of {allItems.length}
          </span>
        </div>

        <div className="book-pages">
          {entries.length === 0 && (
            <p className="footer-note" style={{ border: 'none', color: 'var(--ink-700)' }}>
              No items match.
            </p>
          )}
          {entries.map((it) => {
            const showHeading = it.category !== lastCategory;
            lastCategory = it.category;
            return (
              <React.Fragment key={it.id || it.name}>
                {showHeading && <div className="book-page-heading">{it.category[0].toUpperCase() + it.category.slice(1)}</div>}
                <div className="compendium-entry">
                  <div className="compendium-entry-top">
                    <span className="compendium-entry-name">
                      {it.name}
                      {it.id && ' (Custom)'}
                    </span>
                    <span className="compendium-entry-meta">
                      {formatCost(it.cost)} · {formatWeight(it.weight)}
                    </span>
                  </div>
                  <div className="compendium-entry-detail">{it.description}</div>
                  <GiveButtons item={it} heroes={heroes} onGive={onGiveItem} />
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const ASSET_STORAGE_TABS = [
  { key: 'monster', label: 'Monsters' },
  { key: 'weapon', label: 'Weapons' },
  { key: 'item', label: 'Items' },
];

// A modest, hand-drawn subset of defaultTokens.js's icon set that reads as
// "creature" rather than "hero" or "object" — full parity with every icon
// there isn't the point, just enough variety for a custom monster's token art.
const MONSTER_ICON_CHOICES = ['fangs', 'skull', 'claw', 'wing', 'eye', 'dagger', 'axe', 'shield'];

function emptyMonsterDraft() {
  return { name: '', color: '#762f2f', icon: 'fangs' };
}
function emptyWeaponDraft() {
  return { name: '', type: 'melee', numberOfDice: 1, diceType: 'd6', modifier: 0, cost: 0, equipableClass: [...CLASSES] };
}
function emptyItemDraft() {
  return { name: '', category: ITEM_CATEGORIES[0], cost: 0, weight: 0, description: '' };
}

// DM-only: authors custom monsters/weapons/items and drops them into this
// table's compendiums / monster token list, alongside — never instead of —
// the app's built-in defaults. See 36_custom_assets.sql and GameView.jsx's
// addCustomAsset/removeCustomAsset.
function AssetStorageModal({ onClose, customAssets, onAddAsset, onRemoveAsset }) {
  const [tab, setTab] = useState('monster');
  const [monsterDraft, setMonsterDraft] = useState(emptyMonsterDraft);
  const [weaponDraft, setWeaponDraft] = useState(emptyWeaponDraft);
  const [itemDraft, setItemDraft] = useState(emptyItemDraft);

  const activeTab = ASSET_STORAGE_TABS.find((t) => t.key === tab);
  const ownEntries = Object.values(customAssets || {}).filter((item) => item.assetType === tab);

  function addMonster() {
    const name = monsterDraft.name.trim();
    if (!name) return;
    const imageUrl = makeIconDataUrl(monsterDraft.icon, monsterDraft.color);
    onAddAsset('monster', { name, color: monsterDraft.color, icon: monsterDraft.icon, imageUrl });
    setMonsterDraft(emptyMonsterDraft());
  }

  function addWeapon() {
    const name = weaponDraft.name.trim();
    if (!name) return;
    const numberOfDice = Math.max(1, parseInt(weaponDraft.numberOfDice, 10) || 1);
    const modifier = parseInt(weaponDraft.modifier, 10) || 0;
    const cost = Math.max(0, parseFloat(weaponDraft.cost) || 0);
    const equipableClass = weaponDraft.equipableClass.length ? weaponDraft.equipableClass : [...CLASSES];
    onAddAsset('weapon', {
      type: weaponDraft.type,
      name,
      numberOfDice,
      diceType: weaponDraft.diceType,
      modifier,
      damage: averageDamage(numberOfDice, weaponDraft.diceType, modifier),
      cost,
      equipableClass,
    });
    setWeaponDraft(emptyWeaponDraft());
  }

  function addItem() {
    const name = itemDraft.name.trim();
    if (!name) return;
    onAddAsset('item', {
      category: itemDraft.category,
      name,
      cost: Math.max(0, parseFloat(itemDraft.cost) || 0),
      weight: Math.max(0, parseFloat(itemDraft.weight) || 0),
      description: itemDraft.description.trim(),
    });
    setItemDraft(emptyItemDraft());
  }

  function toggleWeaponClass(cls) {
    setWeaponDraft((prev) => ({
      ...prev,
      equipableClass: prev.equipableClass.includes(cls)
        ? prev.equipableClass.filter((c) => c !== cls)
        : [...prev.equipableClass, cls],
    }));
  }

  return (
    <div className="book-backdrop" onClick={onClose}>
      <div className="book-card" onClick={(e) => e.stopPropagation()}>
        <div className="book-card-header">
          <span className="book-title">🗃 Asset Storage</span>
          <button className="popover-close" onClick={onClose} aria-label="Close asset storage" title="Close">
            ×
          </button>
        </div>

        <div className="book-controls">
          <div className="book-type-filter">
            {ASSET_STORAGE_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`tool-btn ${tab === t.key ? 'active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="footer-note" style={{ border: 'none', padding: 0 }}>
            Shows up in {tab === 'monster' ? 'the monster token list' : tab === 'weapon' ? 'the Weapons Compendium' : 'the Item Compendium'}
          </span>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {tab === 'monster' && (
            <>
              <label className="field-label">Name</label>
              <input
                className="field"
                value={monsterDraft.name}
                onChange={(e) => setMonsterDraft((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Swamp Troll"
              />

              <div className="field-row">
                <div>
                  <label className="field-label">Color</label>
                  <input
                    className="field"
                    type="color"
                    value={monsterDraft.color}
                    onChange={(e) => setMonsterDraft((p) => ({ ...p, color: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="field-label">Icon</label>
                  <select
                    className="field"
                    value={monsterDraft.icon}
                    onChange={(e) => setMonsterDraft((p) => ({ ...p, icon: e.target.value }))}
                  >
                    {MONSTER_ICON_CHOICES.map((icon) => (
                      <option key={icon} value={icon}>
                        {icon}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0' }}>
                <img
                  src={makeIconDataUrl(monsterDraft.icon, monsterDraft.color)}
                  alt=""
                  width={40}
                  height={40}
                  style={{ borderRadius: '50%' }}
                />
                <span className="footer-note" style={{ border: 'none', padding: 0 }}>
                  Preview
                </span>
              </div>

              <button type="button" className="btn btn-primary btn-block" onClick={addMonster}>
                + Add monster
              </button>
            </>
          )}

          {tab === 'weapon' && (
            <>
              <label className="field-label">Name</label>
              <input
                className="field"
                value={weaponDraft.name}
                onChange={(e) => setWeaponDraft((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Frostbite Cleaver"
              />

              <div className="two-col" style={{ marginBottom: 10 }}>
                {WEAPON_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`tool-btn ${weaponDraft.type === t ? 'active' : ''}`}
                    onClick={() => setWeaponDraft((p) => ({ ...p, type: t }))}
                  >
                    {t === 'melee' ? 'Melee' : 'Ranged'}
                  </button>
                ))}
              </div>

              <div className="field-row">
                <div>
                  <label className="field-label">Number of dice</label>
                  <input
                    className="field"
                    type="number"
                    min={1}
                    value={weaponDraft.numberOfDice}
                    onChange={(e) => setWeaponDraft((p) => ({ ...p, numberOfDice: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="field-label">Dice type</label>
                  <select
                    className="field"
                    value={weaponDraft.diceType}
                    onChange={(e) => setWeaponDraft((p) => ({ ...p, diceType: e.target.value }))}
                  >
                    {WEAPON_DICE_TYPES.map((d) => (
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
                    className="field"
                    type="number"
                    value={weaponDraft.modifier}
                    onChange={(e) => setWeaponDraft((p) => ({ ...p, modifier: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="field-label">Cost (gp)</label>
                  <input
                    className="field"
                    type="number"
                    min={0}
                    step="0.1"
                    value={weaponDraft.cost}
                    onChange={(e) => setWeaponDraft((p) => ({ ...p, cost: e.target.value }))}
                  />
                </div>
              </div>

              <label className="field-label">Equipable by</label>
              <div className="condition-row" style={{ flexWrap: 'wrap' }}>
                {CLASSES.map((cls) => (
                  <button
                    key={cls}
                    type="button"
                    className={`tool-btn ${weaponDraft.equipableClass.includes(cls) ? 'active' : ''}`}
                    onClick={() => toggleWeaponClass(cls)}
                  >
                    {cls}
                  </button>
                ))}
              </div>

              <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={addWeapon}>
                + Add weapon
              </button>
            </>
          )}

          {tab === 'item' && (
            <>
              <label className="field-label">Name</label>
              <input
                className="field"
                value={itemDraft.name}
                onChange={(e) => setItemDraft((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Glowing Mushroom"
              />

              <label className="field-label" style={{ marginTop: 8 }}>
                Category
              </label>
              <select
                className="field"
                value={itemDraft.category}
                onChange={(e) => setItemDraft((p) => ({ ...p, category: e.target.value }))}
              >
                {ITEM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c[0].toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>

              <div className="field-row">
                <div>
                  <label className="field-label">Cost (gp)</label>
                  <input
                    className="field"
                    type="number"
                    min={0}
                    step="0.1"
                    value={itemDraft.cost}
                    onChange={(e) => setItemDraft((p) => ({ ...p, cost: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="field-label">Weight (lb)</label>
                  <input
                    className="field"
                    type="number"
                    min={0}
                    step="0.1"
                    value={itemDraft.weight}
                    onChange={(e) => setItemDraft((p) => ({ ...p, weight: e.target.value }))}
                  />
                </div>
              </div>

              <label className="field-label">Description</label>
              <textarea
                className="field"
                rows={3}
                style={{ resize: 'vertical' }}
                value={itemDraft.description}
                onChange={(e) => setItemDraft((p) => ({ ...p, description: e.target.value }))}
              />

              <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={addItem}>
                + Add item
              </button>
            </>
          )}

          {ownEntries.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 18 }}>
                Your custom {activeTab.label.toLowerCase()}
              </div>
              {ownEntries.map((entry) => (
                <div className="player-row" key={entry.id} style={{ justifyContent: 'space-between' }}>
                  <span className="player-name">{entry.data.name}</span>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemoveAsset(entry.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Lets the DM hand a compendium entry (weapon or item — anything with a
// `.name` and `.cost`) straight to a hero's Bag > Weapons & gear list.
// "Buy" additionally deducts the cost from that hero's gold; "Give" is free.
function GiveButtons({ item, heroes, onGive }) {
  const [mode, setMode] = useState(null); // 'buy' | 'give' | null
  const [heroId, setHeroId] = useState('');
  const [feedback, setFeedback] = useState('');

  function openMode(next) {
    setMode(next);
    setHeroId((heroes[0] && heroes[0].id) || '');
  }

  function confirm() {
    const hero = heroes.find((h) => h.id === heroId);
    if (!hero) return;
    onGive(hero, item, mode === 'buy');
    setFeedback(`${mode === 'buy' ? 'Sold to' : 'Given to'} ${hero.name}`);
    setMode(null);
    setTimeout(() => setFeedback(''), 2000);
  }

  return (
    <div className="compendium-give">
      <div className="compendium-give-actions">
        <button
          type="button"
          className="compendium-give-btn"
          disabled={heroes.length === 0}
          title={heroes.length === 0 ? 'No heroes on the map yet' : `Buy for ${formatCost(item.cost)} and give to a hero`}
          onClick={() => openMode('buy')}
        >
          Buy
        </button>
        <button
          type="button"
          className="compendium-give-btn"
          disabled={heroes.length === 0}
          title={heroes.length === 0 ? 'No heroes on the map yet' : 'Give to a hero for free'}
          onClick={() => openMode('give')}
        >
          Give
        </button>
        {feedback && <span className="compendium-give-feedback">{feedback}</span>}
      </div>
      {mode && (
        <div className="compendium-give-picker">
          <select value={heroId} onChange={(e) => setHeroId(e.target.value)}>
            {heroes.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
                {h.ownerName ? ` (${h.ownerName})` : ''}
              </option>
            ))}
          </select>
          <button type="button" onClick={confirm}>
            {mode === 'buy' ? `Buy (${formatCost(item.cost)})` : 'Give'}
          </button>
          <button type="button" onClick={() => setMode(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
