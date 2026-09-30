import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ModalIcon from './ModalIcon.jsx';
import ModalShell from './ModalShell.jsx';
import { Hint, Tip, useHintPrefs } from './Hints.jsx';
import DiceModal from './DiceModal.jsx';
import { clampGridDims } from '../utils/grid.js';
import { resizeImageToDataUrl } from '../utils/image.js';
import { WEAPONS, WEAPON_TYPES, DICE_TYPES as WEAPON_DICE_TYPES, CLASSES, averageDamage } from '../data/weapons.js';
import { ITEMS, ITEM_CATEGORIES } from '../data/items.js';
import { makeIconDataUrl } from '../data/defaultTokens.js';
import { defaultCharacterSheet, normalizeEquipment, normalizeCurrency, newEquipmentItem } from '../data/characterSheet.js';
import { ISLAND_CONDITIONS } from '../data/islandConditions.js';
import { ISLAND_DAY_NIGHT_MODES, DAY_PHASES } from '../data/dayPhases.js';
import ClockReadout from './ClockReadout.jsx';
import SoundField from './SoundField.jsx';
import CompendiumBook from './CompendiumBook.jsx';
import { useFx } from '../lib/fx.js';

const BACKGROUND_IMAGE_MAX_DIM = 1600; // fills the whole map, so keep more detail than a token

function formatCountdown(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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

// A grouped toolbar entry: one trigger card that opens a small row of
// ToolCards below it. Closes on an outside click or Escape. `popovers` render
// in the same relatively-positioned wrapper, so a menu item can hand off to a
// popover that opens exactly where the menu was.
// `align="end"` opens the menu leftward from the trigger's right edge — for
// entries near the right end of the bar, whose menus would otherwise run
// off-screen.
function ToolMenu({ icon, label, title, active, open, onToggle, onClose, popovers, children, className = '', align }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(e) {
      if (!ref.current?.contains(e.target)) onClose();
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className={`toolbar-group ${className}`} ref={ref}>
      <ToolCard icon={icon} label={label} active={open || active} onClick={onToggle} title={title} />
      {open && <div className={`toolbar-menu${align === 'end' ? ' align-end' : ''}`}>{children}</div>}
      {popovers}
    </div>
  );
}

// A code readout that copies itself when clicked (player code, host key).
function CodeChip({ caption, value, copied, onCopy, title }) {
  return (
    <button type="button" className="code-chip" onClick={onCopy} title={title}>
      <span className="code-chip-caption">{copied ? 'Copied!' : caption}</span>
      <span className="code-chip-value">{value}</span>
    </button>
  );
}

const ICON_PATHS = {
  tools: 'M5 3l10 7-5 1-2 5z',
  play: 'M5 3l10 7-5 1-2 5z',
  edit: 'M4 16l1-4L14 3l3 3-9 9zM12 5l3 3',
  pan: 'M10 2v16M2 10h16M10 2L7.5 4.5M10 2l2.5 2.5M10 18l-2.5-2.5M10 18l2.5-2.5M2 10l2.5-2.5M2 10l2.5 2.5M18 10l-2.5-2.5M18 10l-2.5 2.5',
  ruler: 'M3 15L15 3l2 2L5 17zM6 11l2 2M9 8l2 2M12 5l2 2',
  group: 'M8 12a3 3 0 0 0 4 0l3-3a3 3 0 0 0-4-4l-1 1M12 8a3 3 0 0 0-4 0l-3 3a3 3 0 0 0 4 4l1-1',
  draw: 'M3 17c2-1 3-3 5-3M13 3l4 4-8 8-4 1 1-4z',
  hidedraw: 'M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6zM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3 17L17 3',
  storage: 'M3 6h14v3H3zM4 9v8h12V9M8 12h4',
  layout: 'M3 3h14v14H3zM3 10h14M10 3v14',
  recenter: 'M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10 2v3M10 15v3M2 10h3M15 10h3',
  mapping: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM13 7l-2 4-4 2 2-4z',
  map: 'M2 5l5-2 6 2 5-2v12l-5 2-6-2-5 2zM7 3v12M13 5v12',
  islands: 'M3 16h14M5 16c0-4 2-7 5-7s5 3 5 7',
  layers: 'M10 3l8 4-8 4-8-4zM2 11l8 4 8-4M2 14l8 4 8-4',
  world: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM2 10h16M10 2c-3 3-3 13 0 16M10 2c3 3 3 13 0 16',
  clock: 'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM10 5v5l3 2',
  daynight: 'M15 11a6 6 0 1 1-6-8 5 5 0 0 0 6 8z',
  library: 'M4 3h9a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3zM4 14a3 3 0 0 1 3-3h9',
  weapons: 'M16 3h1v1L9 12l-3 1 1-3zM5 14l-2 2M4 12l4 4',
  items: 'M3 6l7-3 7 3v8l-7 3-7-3zM3 6l7 3 7-3M10 9v8',
  initiative: 'M4 5h12M4 10h12M4 15h8',
  music: 'M8 15V4l8-2v11M8 15a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM16 13a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  dice: 'M4 4h12v12H4zM7.5 7.5h.01M12.5 12.5h.01M12.5 7.5h.01M7.5 12.5h.01',
  refresh: 'M16 10a6 6 0 1 1-2-4.5M16 3v3.5h-3.5',
  config: 'M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4',
  save: 'M4 3h10l3 3v11H4zM7 3v5h6V3M7 17v-5h6v5',
  export: 'M10 3v10M6 9l4 4 4-4M4 17h12',
  import: 'M10 13V3M6 7l4-4 4 4M4 17h12',
  lock: 'M5 9h10v8H5zM7 9V6a3 3 0 0 1 6 0v3',
  unlock: 'M5 9h10v8H5zM7 9V6a3 3 0 0 1 5.5-1.5',
  leave: 'M8 3H4v14h4M8 10h9M14 7l3 3-3 3',
  timer: 'M10 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM10 8v4M8 2h4',
  invite: 'M7 13a3 3 0 1 1 2.8-4H17v3h-2v2h-2v-2H9.8A3 3 0 0 1 7 13z',
  hints: 'M8 16h4M8.5 18.5h3M10 2.5a5 5 0 0 0-3.3 8.8c.7.6.8 1.2.8 2.2h5c0-1 .1-1.6.8-2.2A5 5 0 0 0 10 2.5z',
};

// How the bar sheds width when it can't fit on one row, cheapest first. Each
// step keeps everything the previous one applied; the tokens are matched in
// CSS with [data-density~='…'].
const TOOLBAR_DENSITIES = ['', 'codes', 'codes icons', 'codes icons tight'];

// Line icons for the toolbar (replaces the old emoji glyphs so the bar reads
// as one consistent set and follows the palette's text color).
function Icon({ name }) {
  return (
    <svg className="tool-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

const TOOL_ICONS = {
  play: <Icon name="play" />,
  edit: <Icon name="edit" />,
  pan: <Icon name="pan" />,
  ruler: <Icon name="ruler" />,
  group: <Icon name="group" />,
  draw: <Icon name="draw" />,
};
const TOOL_LABELS = { play: 'Play', edit: 'Edit', pan: 'Pan', ruler: 'Ruler', group: 'Merge Islands', draw: 'Draw' };

export default function Toolbar({
  // The roll log and saved dice sets, kept in GameView so they survive
  // closing the popover and the phone dice screen shares them.
  dice,
  isHost,
  isGuestHost,
  layer,
  activeIsland,
  tool,
  onToolChange,
  revealRolls = false,
  onRevealRollsChange,
  hideDrawings = false,
  onToggleHideDrawings,
  onLayerPatch,
  onIslandPatch,
  session,
  onRegenerateCode,
  onToggleOpen,
  onSaveNow,
  autosaveSecondsLeft,
  clock,
  onOpenClock,
  audio,
  onOpenMusic,
  musicHint = 'Music plays on cloud and guest tables. This one is a local demo, so it stays quiet.',
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
  onDownloadIslandImage,
  onUpdateIsland,
  onUngroupIslands,
  onRenameGroup,
  onIslandConditions,
  onGroupConditions,
  heroes,
  onUpdateEntity,
  initiativeHeroes,
  initiativeMobs,
  onRollInitiative,
  encounterActive,
  onToggleEncounter,
  customAssets,
  onAddEntity,
  onAddCustomAsset,
  onRemoveCustomAsset,
  collapsed,
  onToggleCollapsed,
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
  const [showMonsterCompendium, setShowMonsterCompendium] = useState(false);
  const [showAssetStorage, setShowAssetStorage] = useState(false);
  const [showDayNight, setShowDayNight] = useState(false);
  const [showAmbience, setShowAmbience] = useState(false);
  // The island whose settings the Islands dialog opens on (the phone's
  // "… settings" button in Edit mode).
  const [islandsFocusId, setIslandsFocusId] = useState(null);
  // Which grouped menu (tools / mapping / world / library) is open.
  const [openMenu, setOpenMenu] = useState(null);
  const hintPrefs = useHintPrefs();
  const [showMusicHint, setShowMusicHint] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedHostKey, setCopiedHostKey] = useState(false);
  // Keep the bar on a single row: try each density from roomiest to
  // tightest and settle on the first where Leave (always the last item) ends
  // inside the bar. Only if even the tightest overflows is it allowed to wrap.
  // Written straight onto the DOM node, before paint, so there is no flash
  // of the wrong density and no extra render.
  const barRef = useRef(null);
  const leaveRef = useRef(null);
  const fitToolbar = useCallback(() => {
    const bar = barRef.current;
    const leave = leaveRef.current;
    if (!bar || !leave) return;
    delete bar.dataset.overflow;
    for (const density of TOOLBAR_DENSITIES) {
      bar.dataset.density = density;
      const limit = bar.getBoundingClientRect().right - parseFloat(getComputedStyle(bar).paddingRight);
      if (leave.getBoundingClientRect().right <= limit + 0.5) return;
    }
    bar.dataset.overflow = 'wrap';
  }, []);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === 'undefined') return undefined;
    // Only refit on a width change: a density swap changes the bar's height,
    // and reacting to that would just recompute the same answer.
    let lastWidth = null;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      if (width === lastWidth) return;
      lastWidth = width;
      fitToolbar();
    });
    observer.observe(bar);
    // Web fonts landing late change every label's width.
    document.fonts?.ready.then(fitToolbar);
    return () => observer.disconnect();
  }, [collapsed, fitToolbar]);

  // Content that changes the bar's width without resizing it.
  useLayoutEffect(fitToolbar, [fitToolbar, collapsed, isHost, isGuestHost, Boolean(clock), dayPhase, lastSavedLabel, session.isOpen]);

  function closePopovers() {
    setShowMapSettings(false);
    setShowLayers(false);
    setShowIslands(false);
    setShowDice(false);
    setShowInitiative(false);
    setShowCompendium(false);
    setShowItemCompendium(false);
    setShowAssetStorage(false);
    setShowDayNight(false);
  }

  const closeMenu = useCallback(() => setOpenMenu(null), []);

  function toggleMenu(name) {
    closePopovers();
    setOpenMenu((m) => (m === name ? null : name));
  }

  // Runs a menu item's action and folds the menu away (used by items that
  // are one-shot picks, not by zoom, which you tend to click repeatedly).
  function pick(action) {
    setOpenMenu(null);
    action();
  }

  function togglePopover(name) {
    setOpenMenu(null);
    setShowMapSettings((s) => (name === 'mapSettings' ? !s : false));
    setShowLayers((s) => (name === 'layers' ? !s : false));
    setShowIslands((s) => (name === 'islands' ? !s : false));
    setShowDice((s) => (name === 'dice' ? !s : false));
    setShowInitiative((s) => (name === 'initiative' ? !s : false));
    setShowCompendium((s) => (name === 'compendium' ? !s : false));
    setShowItemCompendium((s) => (name === 'itemCompendium' ? !s : false));
    setShowAssetStorage((s) => (name === 'assetStorage' ? !s : false));
    setShowDayNight((s) => (name === 'dayNight' ? !s : false));
    setShowAmbience((s) => (name === 'ambience' ? !s : false));
    if (name !== 'islands') setIslandsFocusId(null);
  }

  // The Grimoire palette's index tabs (BookTabs.jsx) open these same
  // panels from the edge of the map page — they ask over lib/fx.js rather
  // than reaching into this component's state.
  useFx((event) => {
    if (event.type !== 'open') return;
    if (event.panel === 'dice') togglePopover('dice');
    else if (event.panel === 'music') onOpenMusic?.();
    else if (!isHost) return;
    else if (event.panel === 'map') togglePopover('mapSettings');
    else if (event.panel === 'armory') togglePopover('compendium');
    // The phone layout opens the rest of the host's panels the same way.
    else if (event.panel === 'items') togglePopover('itemCompendium');
    else if (event.panel === 'islands') {
      setIslandsFocusId(event.islandId || null);
      togglePopover('islands');
    } else if (['layers', 'initiative', 'assetStorage', 'ambience'].includes(event.panel)) togglePopover(event.panel);
    else if (event.panel === 'clock') onOpenClock?.();
    else if (event.panel === 'bestiary') {
      const open = showMonsterCompendium;
      togglePopover(null);
      setShowMonsterCompendium(!open);
    }
  });

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

  // An island's background image, from its settings in the Islands
  // dialog — applied as soon as it's read, no Apply step.
  async function uploadIslandBackground(islandId, file) {
    try {
      const backgroundImage = await resizeImageToDataUrl(file, BACKGROUND_IMAGE_MAX_DIM, 0.78);
      onUpdateIsland(islandId, { backgroundImage });
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
  const customMonsters = Object.values(customAssets || {})
    .filter((item) => item.assetType === 'monster')
    .map((item) => ({ id: item.id, ...item.data }));
  const customItems = Object.values(customAssets || {})
    .filter((item) => item.assetType === 'item')
    .map((item) => ({ id: item.id, ...item.data }));

  const codeChips = isHost && (
    <>
      <CodeChip
        caption="Player code"
        value={session.code}
        copied={copied}
        onCopy={copyCode}
        title="Click to copy the invite code players join with"
      />
      {/* Local and guest tables only: a signed-in cloud table has no host
          key (fetchTableSnapshot never returns one — the DM's own account
          re-seats them), so the chip would just copy "undefined". */}
      {session.hostKey && (
        <CodeChip
          caption={isGuestHost ? 'DM code' : 'Host key'}
          value={session.hostKey}
          copied={copiedHostKey}
          onCopy={copyHostKey}
          title={
            isGuestHost
              ? 'Click to copy your private DM code — save it, along with an exported .bmp, to resume this table later via "Resume guest session" on the Landing screen'
              : 'Click to copy. Testing only: save this so you can rejoin as host from the landing screen if you ever get removed as host'
          }
        />
      )}
      {/* Regenerating isn't supported for a guest table (GameView.jsx's
          regenerateCode just alerts and bails — the invite code doubles
          as the peer broadcast channel's name, so rotating it would
          strand anyone already connected) — hide the button rather than
          offer a dead end. */}
      {!isGuestHost && (
        <ToolCard icon={<Icon name="refresh" />} label="New code" onClick={onRegenerateCode} title="Invalidate the old code and issue a new one" />
      )}
    </>
  );

  // Once, the first time someone hosts: which code to share. Shown by the
  // inline codes or, when the bar folds them away, by the Invite menu — CSS
  // shows whichever of the two is on screen.
  const codesTip = isHost && (
    <Tip id="codes" title="Share the player code" className="toolbar-codes-tip">
      Players join with the player code. Keep the {isGuestHost ? 'DM code' : 'host key'} to yourself — it’s how you get the table back.
    </Tip>
  );

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
    <div className="toolbar" ref={barRef}>
      <button className="toolbar-collapse-btn" onClick={onToggleCollapsed} title="Collapse toolbar">
        ▴
      </button>

      {/* The trigger shows the active tool's icon, so the current mode is
          still visible with the menu folded away. */}
      <ToolMenu
        icon={TOOL_ICONS[tool] || <Icon name="tools" />}
        label="Tools"
        title={`Tools — current: ${TOOL_LABELS[tool] || tool}`}
        active={showAssetStorage}
        open={openMenu === 'tools'}
        onToggle={() => toggleMenu('tools')}
        onClose={closeMenu}
      >
        <ToolCard
          icon={TOOL_ICONS.play}
          label="Play"
          active={tool === 'play'}
          onClick={() => pick(() => onToolChange('play'))}
          title="Select and drag tokens"
        />
        <ToolCard
          icon={TOOL_ICONS.pan}
          label="Pan"
          active={tool === 'pan'}
          onClick={() => pick(() => onToolChange('pan'))}
          title="Click and drag to pan around the map"
        />
        <ToolCard
          icon={TOOL_ICONS.ruler}
          label="Ruler"
          active={tool === 'ruler'}
          onClick={() => pick(() => onToolChange('ruler'))}
          title="Click and drag on the map to measure distance"
        />
        <ToolCard
          icon={<Icon name="hidedraw" />}
          label={hideDrawings ? 'Show drawings' : 'Hide drawings'}
          active={hideDrawings}
          onClick={() => pick(() => onToggleHideDrawings?.())}
          title={hideDrawings ? 'Drawings are hidden in this browser — show them again' : 'Hide the DM\'s drawings in this browser only'}
        />
        {isHost && (
          <>
            <ToolCard
              icon={TOOL_ICONS.draw}
              label="Draw"
              active={tool === 'draw'}
              onClick={() => pick(() => onToolChange('draw'))}
              title="Draw on the map — everyone at the table sees it"
            />
            <ToolCard
              icon={TOOL_ICONS.edit}
              label="Edit"
              active={tool === 'edit'}
              onClick={() => pick(() => onToolChange('edit'))}
              title="Drag islands around to reposition them"
            />
            <ToolCard
              icon={TOOL_ICONS.group}
              label="Merge Islands"
              active={tool === 'group'}
              onClick={() => pick(() => onToolChange(tool === 'group' ? 'edit' : 'group'))}
              title="Select 2+ islands to bundle into a group that moves and titles as one"
            />
            <ToolCard
              icon={<Icon name="storage" />}
              label="Storage"
              active={showAssetStorage}
              onClick={() => togglePopover('assetStorage')}
              title="Asset Storage — create custom monsters, weapons, and items for this table"
            />
          </>
        )}
      </ToolMenu>

      {isHost && (
        <ToolMenu
          icon={<Icon name="world" />}
          label="World state"
          title="In-game time, day / night, ambience, and the map, its islands and layers"
          active={showDayNight || showAmbience || showMapSettings || showIslands || showLayers}
          open={openMenu === 'world'}
          onToggle={() => toggleMenu('world')}
          onClose={closeMenu}
          popovers={
            <>
              {showDayNight && (
                <DayNightPopover
                  override={dayNightOverride}
                  hasClock={Boolean(clock)}
                  hasCycle={Boolean(clock?.cycle?.enabled)}
                  onSelect={(phase) => onSetDayNightOverride(phase)}
                  island={activeIsland}
                  onIslandDayNight={(dayNight) => onIslandPatch({ dayNight })}
                  onClose={() => setShowDayNight(false)}
                />
              )}
              {showAmbience && <AmbiencePopover layer={layer} audio={audio} onClose={() => setShowAmbience(false)} />}
              {showMapSettings && (
                <MapSettingsPopover layer={layer} isHost={isHost} onLayerPatch={onLayerPatch} onClose={() => setShowMapSettings(false)} />
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
                  onUngroupIslands={onUngroupIslands}
                  onRenameGroup={onRenameGroup}
                  onIslandConditions={onIslandConditions}
                  onGroupConditions={onGroupConditions}
                  onUpdateIsland={onUpdateIsland}
                  onUploadBackground={uploadIslandBackground}
                  onDownloadIslandImage={onDownloadIslandImage}
                  focusIslandId={islandsFocusId}
                  onSwitchToEdit={() => {
                    onToolChange('edit');
                    setShowIslands(false);
                  }}
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
            </>
          }
        >
          <ToolCard icon={<Icon name="clock" />} label="Ingame time" onClick={() => pick(onOpenClock)} title="Set the in-game time, tick speed, and day/night cycle" />
          <ToolCard
            icon={dayPhase ? '' : <Icon name="daynight" />}
            image={dayPhase ? DAY_PHASES[dayPhase].imageUrl : undefined}
            label="Day / night"
            active={showDayNight}
            onClick={() => togglePopover('dayNight')}
            title="Change the day/night phase by hand, and whether this island follows it"
          />
          <ToolCard
            icon={<Icon name="music" />}
            label="Ambience"
            active={showAmbience}
            onClick={() => togglePopover('ambience')}
            title="The sound that plays for players on this map"
          />
          <ToolCard icon={<Icon name="map" />} label="Map" active={showMapSettings} onClick={() => togglePopover('mapSettings')} title="This map's feet per square" />
          <ToolCard icon={<Icon name="islands" />} label="Islands" active={showIslands} onClick={() => togglePopover('islands')} title={`${(layer.islandOrder || []).length} island(s) on this layer`} />
          <ToolCard icon={<Icon name="layers" />} label="Layers" active={showLayers} onClick={() => togglePopover('layers')} title={`${(layerOrder || []).length} layer(s)`} />
        </ToolMenu>
      )}

      {/* Not a button: the readout is how every player sees the in-game time. */}
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
          <ToolCard
            icon={<Icon name="library" />}
            label="Compendium"
            active={showCompendium || showItemCompendium || showMonsterCompendium}
            onClick={() => {
              const open = showCompendium || showItemCompendium || showMonsterCompendium;
              setOpenMenu(null);
              setShowCompendium(!open);
              setShowItemCompendium(false);
              setShowMonsterCompendium(false);
            }}
            title="Open the compendium of weapons, items, and monsters"
          />
        </div>
      )}

      {/* Initiative and dice stay one click away — no menu to open first.
          Everyone's dice tray is private to their own browser (see
          diceSaved/diceRolls above), so it isn't gated to the host. */}
      <div className="toolbar-group">
        {isHost && (
          <ToolCard
            icon={<Icon name="initiative" />}
            label="Initiative"
            active={showInitiative}
            onClick={() => togglePopover('initiative')}
            title="Roll for Initiative"
          />
        )}
        <span className="toolbar-hint-anchor">
          <ToolCard
            icon={<Icon name="music" />}
            label="Music"
            active={Boolean(audio?.playback?.nowPlaying) || showMusicHint}
            onClick={audio?.enabled ? onOpenMusic : () => setShowMusicHint((s) => !s)}
            title={audio?.enabled ? 'Table music' : 'Why there’s no music here'}
          />
          {showMusicHint && !audio?.enabled && (
            <div className="toolbar-hint-pop">
              <Hint>{musicHint}</Hint>
            </div>
          )}
        </span>
        <ToolCard icon={<Icon name="dice" />} label="Dice" active={showDice} onClick={() => togglePopover('dice')} title="Roll the dice" />
        {showDice && (
          <DiceModal
            {...dice}
            onClose={() => setShowDice(false)}
          />
        )}
      </div>

      {/* The codes sit in the bar when there's room; on a narrower bar the
          same chips fold into an "Invite" menu (see TOOLBAR_DENSITIES). Both
          are always rendered — CSS shows one. */}
      {isHost && (
        <div className="toolbar-group toolbar-codes-inline">
          {codeChips}
          {codesTip}
        </div>
      )}
      {isHost && (
        <ToolMenu
          className="toolbar-codes-menu"
          icon={<Icon name="invite" />}
          label="Invite"
          title="Player code and DM code — click a code to copy it"
          open={openMenu === 'codes'}
          onToggle={() => toggleMenu('codes')}
          onClose={closeMenu}
          popovers={openMenu !== 'codes' && codesTip}
        >
          {codeChips}
        </ToolMenu>
      )}

      {isHost && (showCompendium || showItemCompendium || showMonsterCompendium) && (
        <CompendiumBook
          kind={showCompendium ? 'weapons' : showItemCompendium ? 'items' : 'monsters'}
          onClose={() => {
            setShowCompendium(false);
            setShowItemCompendium(false);
            setShowMonsterCompendium(false);
          }}
          onSwitchKind={(k) => {
            setShowCompendium(k === 'weapons');
            setShowItemCompendium(k === 'items');
            setShowMonsterCompendium(k === 'monsters');
          }}
          onAddMonster={onAddEntity}
          customMonsters={customMonsters}
          heroes={heroes || []}
          onGiveItem={giveItemToHero}
          customWeapons={customWeapons}
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
          encounterActive={encounterActive}
          onToggleEncounter={onToggleEncounter}
          onClose={() => setShowInitiative(false)}
        />
      )}

      <div className="spacer" />

      {/* Saved state over the autosave countdown, stacked so the pair costs
          one narrow column instead of two side by side. */}
      {isHost && (
        <div className="toolbar-status">
          {lastSavedLabel && (
            <span className="toolbar-saved" role="status" title={lastSavedLabel}>
              <span className="toolbar-saved-dot" aria-hidden="true" />
              <span className="toolbar-saved-text">{lastSavedLabel}</span>
            </span>
          )}

          {/* A host-only safety net alongside the manual Save inside
              Configurations below — counts down from 5:00 and autosaves the
              same way that button does, in case the DM forgets. */}
          <span
            className="autosave-countdown"
            title={`Auto-saves in ${formatCountdown(autosaveSecondsLeft)} — the Save button in Configurations still works any time`}
          >
            <Icon name="timer" /> {formatCountdown(autosaveSecondsLeft)}
          </span>
        </div>
      )}

      {/* The very last group: save/export/import/close/leave — the
          "shutting the book" actions, tucked away since they're reached for
          far less often than anything above. */}
      <ToolMenu
        icon={<Icon name="config" />}
        label="Configurations"
        title="Save, export, import, close, hints, and leave"
        open={openMenu === 'configurations'}
        onToggle={() => toggleMenu('configurations')}
        onClose={closeMenu}
        align="end"
      >
        {isHost && (
          <>
            <ToolCard icon={<Icon name="save" />} label="Save" onClick={() => pick(onSaveNow)} title={lastSavedLabel} />
            <ToolCard icon={<Icon name="export" />} label="Export" onClick={() => pick(onExport)} title="Export .bmp" />
            <ToolCard icon={<Icon name="import" />} label="Import" onClick={() => pick(() => importRef.current?.click())} title="Import .bmp — overwrites the whole table" />
            <input ref={importRef} type="file" accept="image/bmp,.bmp" style={{ display: 'none' }} onChange={handleImportFile} />
            <ToolCard
              icon={<Icon name={session.isOpen ? 'unlock' : 'lock'} />}
              label={session.isOpen ? 'Close' : 'Reopen'}
              active={!session.isOpen}
              onClick={() => pick(onToggleOpen)}
              title={session.isOpen ? 'Close table to new joins' : 'Table closed — reopen'}
            />
          </>
        )}
        <ToolCard
          icon={<Icon name="hints" />}
          label={hintPrefs.show ? 'Hints on' : 'Hints off'}
          active={hintPrefs.show}
          onClick={() => pick(() => hintPrefs.setShow(!hintPrefs.show))}
          title={
            hintPrefs.show
              ? 'Show hints and tips (on this device) — click to turn tips and mode bars off. Inline hints stay.'
              : 'Hints and tips are off on this device — click to turn them back on'
          }
        />
        {isHost && onRevealRollsChange && (
          <label className="toolbar-menu-check">
            <input type="checkbox" checked={revealRolls} onChange={(e) => onRevealRollsChange(e.target.checked)} />
            <span>
              <b>Reveal rolls to players</b>
              <small>Off: only you see the rolls you make. On: every roll you make shows for the players too. Players’ rolls always reach you.</small>
            </span>
          </label>
        )}
        {hintPrefs.show && hintPrefs.anyDismissed && (
          <ToolCard icon={<Icon name="refresh" />} label="Tips again" onClick={() => pick(hintPrefs.resetDismissed)} title="Show every tip and mode bar you've hidden again" />
        )}
      </ToolMenu>

      <button type="button" className="toolbar-leave" ref={leaveRef} onClick={onLeave} title="Leave the table">
        <Icon name="leave" />
        <span className="toolbar-leave-label">Leave</span>
      </button>
    </div>
  );
}

// Set the day/night phase by hand. Picking a phase overrides the clock's own
// cycle (which keeps running underneath) until "Follow the clock" hands it
// back; it works with the cycle on or off, and with no clock at all.
function DayNightPopover({ override, hasClock, hasCycle, onSelect, island, onIslandDayNight, onClose }) {
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
      {island && onIslandDayNight && (
        <>
          <label className="field-label" style={{ marginTop: 12 }}>
            {island.name}
          </label>
          <select
            className="field"
            value={island.dayNight || 'cycle'}
            onChange={(e) => onIslandDayNight(e.target.value)}
            title="Follow the table's day / night, or stay always day / always night whatever it says"
          >
            {ISLAND_DAY_NIGHT_MODES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

// World state → Ambience: the sound that plays for players on this map.
function AmbiencePopover({ layer, audio, onClose }) {
  return (
    <ModalShell title="Ambience" icon="music" closeLabel="Close ambience" onClose={onClose}>
      <SoundField audio={audio} targetKind="layer" targetId={layer.id} label={`${layer.name} — plays for players on this map`} />
    </ModalShell>
  );
}

// An island's or a group's condition states - fog, darkness, fire, and so
// on - in the Islands dialog. Toggling one applies immediately (like a
// token's conditions), and everyone at the table sees the resulting badges
// on the map.
function ConditionPicker({ active = [], onChange }) {
  function toggle(key) {
    onChange(active.includes(key) ? active.filter((k) => k !== key) : [...active, key]);
  }
  const labels = active.map((key) => ISLAND_CONDITIONS.find((c) => c.key === key)?.label).filter(Boolean);

  return (
    <div className="island-row-conditions">
      <div className="condition-row">
        {ISLAND_CONDITIONS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`condition-badge${active.includes(c.key) ? ' active' : ''}`}
            style={{ backgroundImage: `url(${c.imageUrl})` }}
            title={`${c.label} — ${c.description}`}
            aria-label={c.label}
            aria-pressed={active.includes(c.key)}
            onClick={() => toggle(c.key)}
          />
        ))}
      </div>
      <span className="island-row-note">{labels.length ? labels.join(' · ') : 'No conditions'}</span>
    </div>
  );
}

// World state → Map: this map's own settings. An island's name, size and
// background are in World state → Islands; the map's ambience and each
// island's day / night in World state too.
function MapSettingsPopover({ layer, isHost, onLayerPatch, onClose }) {
  const [feet, setFeet] = useState(layer.feetPerSquare);

  function commitFeet() {
    const next = Math.max(1, parseInt(feet, 10) || 5);
    setFeet(next);
    if (next !== layer.feetPerSquare) onLayerPatch({ feetPerSquare: next });
  }

  return (
    <ModalShell
      title="Map settings"
      icon="map"
      closeLabel="Close map settings"
      onClose={() => {
        if (isHost) commitFeet();
        onClose();
      }}
    >
      <div className="section-label" style={{ marginTop: 0 }}>
        {layer.name}
      </div>
      <label className="field-label">Feet per square</label>
      <input
        className="field"
        type="number"
        min="1"
        value={feet}
        onChange={(e) => setFeet(e.target.value)}
        onBlur={commitFeet}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        disabled={!isHost}
      />
      <p className="footer-note" style={{ border: 'none', padding: '4px 0' }}>
        {isHost
          ? 'Saves when you leave the field. Island names, sizes and backgrounds are in World state → Islands.'
          : 'Only the host can change map settings.'}
      </p>
    </ModalShell>
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
    <ModalShell title="Layers" icon="layers" closeLabel="Close layers panel" onClose={onClose}>
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

      {(layerOrder || []).length > 1 && (
        <Hint className="hint-tight">The first map is the base — new players land there, so it can’t be deleted.</Hint>
      )}

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
    </ModalShell>
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
  onUngroupIslands,
  onRenameGroup,
  onIslandConditions,
  onGroupConditions,
  onUpdateIsland,
  onUploadBackground,
  onDownloadIslandImage,
  focusIslandId = null,
  onSwitchToEdit,
  onClose,
}) {
  // The island whose settings (name, size, background) are open.
  const [openId, setOpenId] = useState(focusIslandId);
  const groupOf = (islandId) => Object.values(islandGroups || {}).find((g) => g.islandIds.includes(islandId));
  const [name, setName] = useState('');
  const [cols, setCols] = useState(20);
  const [rows, setRows] = useState(15);
  // The new-island form stays folded behind one button until it's wanted.
  const [adding, setAdding] = useState(false);

  function closeAdding() {
    setAdding(false);
    setName('');
    setCols(20);
    setRows(15);
  }

  function addIsland() {
    if (!name.trim()) return;
    onCreateIsland({ name: name.trim(), cols, rows });
    closeAdding();
  }

  return (
    <ModalShell title="Islands on this layer" icon="islands" closeLabel="Close islands panel" onClose={onClose}>
      {(islandOrder || []).map((id, i) => {
        const island = islands?.[id];
        if (!island) return null;
        const isSole = islandOrder.length === 1;
        const isBase = i === 0 && !isSole;
        const isActive = id === activeIslandId;
        const group = groupOf(id);
        return (
          <div key={id} className="island-row">
          <div className="player-row" style={{ justifyContent: 'space-between' }}>
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
              {onUpdateIsland && (
                <button
                  className={`btn btn-secondary btn-sm ${openId === id ? 'active' : ''}`}
                  aria-expanded={openId === id}
                  onClick={() => setOpenId(openId === id ? null : id)}
                  title="Name, size and background image"
                >
                  Settings
                </button>
              )}
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
          {openId === id && onUpdateIsland && (
            <IslandSettings
              island={island}
              onPatch={(patch) => onUpdateIsland(id, patch)}
              onUploadBackground={(file) => onUploadBackground(id, file)}
              onDownloadImage={() => onDownloadIslandImage?.(id)}
            />
          )}
          {group ? (
            <span className="island-row-note">
              In <b>{group.name}</b> — its conditions are set on the group below.
            </span>
          ) : (
            onIslandConditions && <ConditionPicker active={island.conditions || []} onChange={(keys) => onIslandConditions(id, keys)} />
          )}
          </div>
        );
      })}

      {Object.values(islandGroups || {}).length > 0 && (
        <>
          <div className="section-label">Groups on this layer</div>
          {Object.values(islandGroups).map((group) => (
            <GroupRow key={group.id} group={group} onRename={onRenameGroup} onUngroup={onUngroupIslands} onConditions={onGroupConditions} />
          ))}
        </>
      )}

      {adding ? (
        <div className="island-settings island-new">
          <div className="section-label" style={{ marginTop: 0 }}>
            New island
          </div>
          <label className="field-label">Name</label>
          <input
            className="field"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addIsland();
              else if (e.key === 'Escape') {
                e.stopPropagation();
                closeAdding();
              }
            }}
            placeholder="e.g. Side Chamber"
          />
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
          <div className="field-row">
            <button className="btn btn-secondary" onClick={closeAdding}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={addIsland} disabled={!name.trim()}>
              Add island
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-secondary btn-block" onClick={() => setAdding(true)} style={{ marginTop: 10 }}>
          + New island
        </button>
      )}
      <Hint className="hint-tight" action={onSwitchToEdit ? 'Switch to Edit' : null} onAction={onSwitchToEdit}>
        Switch to <b>Tools → Edit</b>, then drag an island by its background. Where edges touch, tokens walk across.
      </Hint>
    </ModalShell>
  );
}

// An island's own settings, opened from its row in the Islands dialog.
// Name and size save when the field is left (or on Enter); a background
// image applies as soon as it's picked.
function IslandSettings({ island, onPatch, onUploadBackground, onDownloadImage }) {
  const [name, setName] = useState(island.name);
  const [cols, setCols] = useState(island.cols);
  const [rows, setRows] = useState(island.rows);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  function commitName() {
    const next = name.trim() || 'Untitled Island';
    setName(next);
    if (next !== island.name) onPatch({ name: next });
  }
  function commitSize() {
    const c = clampGridDims(cols);
    const r = clampGridDims(rows);
    setCols(c);
    setRows(r);
    if (c !== island.cols || r !== island.rows) onPatch({ cols: c, rows: r });
  }
  const blurOnEnter = (e) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };
  async function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      await onUploadBackground(file);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="island-settings">
      <label className="field-label">Name</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={blurOnEnter} />
      <div className="field-row">
        <div>
          <label className="field-label">Width</label>
          <input className="field" type="number" value={cols} onChange={(e) => setCols(e.target.value)} onBlur={commitSize} onKeyDown={blurOnEnter} />
        </div>
        <div>
          <label className="field-label">Height</label>
          <input className="field" type="number" value={rows} onChange={(e) => setRows(e.target.value)} onBlur={commitSize} onKeyDown={blurOnEnter} />
        </div>
      </div>
      <label className="field-label">Background image</label>
      <div className="field-row">
        <button className="btn btn-secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? 'Uploading…' : island.backgroundImage ? 'Replace image' : 'Upload image'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={onDownloadImage}
          title="Download this island as a PNG (background + grid) to edit in an image editor, then upload it back as the background"
        >
          Download image (.png)
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickFile} />
      <span className="island-row-note">Name and size save when you leave the field. A new image applies straight away.</span>
    </div>
  );
}

// One row per island group in IslandManagerPopover — an inline rename
// field (local-state-then-Save, same shape as MapSettingsPopover's name
// field) plus an Ungroup button, then the group's conditions, which stand
// for every member island. Ungrouping only dissolves the group; member
// islands are untouched and get their own conditions back.
function GroupRow({ group, onRename, onUngroup, onConditions }) {
  const [name, setName] = useState(group.name);
  const dirty = name !== group.name;
  return (
    <div className="island-row">
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
    {onConditions && <ConditionPicker active={group.conditions || []} onChange={(keys) => onConditions(group.id, keys)} />}
    </div>
  );
}

// DM-only: pick which hero and monster/NPC tokens on the current layer are
// in this encounter, then roll a d20 for each at once. The actual roll +
// per-entity `initiativeRoll`/`initiativeTurn` stamping (rendered as the
// boot badge on the token, see MapBoard.jsx) lives in GameView's
// rollInitiative — this component is just the picker + results readout.
function InitiativeModal({ heroes, mobs, onRoll, encounterActive, onToggleEncounter, onClose }) {
  const [participantIds, setParticipantIds] = useState([]);
  const [results, setResults] = useState(null);
  // "Start encounter": ticked by default, so rolling starts the fight — the
  // turn order, turn banner, movement range and End turn (EncounterHud.jsx).
  // While one is running the box shows it; unticking ends it.
  const [startEncounter, setStartEncounter] = useState(true);
  const encounterChecked = encounterActive || (!results?.length && startEncounter);

  function handleEncounterChange(checked) {
    setStartEncounter(checked);
    if (!checked && encounterActive) onToggleEncounter(false);
    else if (checked && !encounterActive && results?.length) onToggleEncounter(true, results);
  }

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
    const rolled = onRoll(participantIds, { startEncounter }) || [];
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
          <span className="book-title"><ModalIcon name="bolt" />Roll for Initiative</span>
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

          {participantIds.length === 0 && (
            <Hint className="hint-tight">
              {heroes.length + mobs.length === 0
                ? 'Nobody to roll for yet. Place heroes and monsters on this map first.'
                : 'Pick who joins from the two lists above, then roll.'}
            </Hint>
          )}
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

          <label className="encounter-check">
            <input type="checkbox" checked={encounterChecked} onChange={(e) => handleEncounterChange(e.target.checked)} />
            <span>
              <strong>Start encounter</strong>
              <small>{encounterActive ? 'Running — untick to end the fight' : 'Turns, movement range and End turn once rolled'}</small>
            </span>
          </label>

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
  const nothingSaved = Object.keys(customAssets || {}).length === 0;

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
          <span className="book-title"><ModalIcon name="archive" />Asset Storage</span>
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
          {nothingSaved && (
            <Hint className="asset-empty-hint">
              Nothing saved here yet. Make a monster, weapon or item once below, then place it as often as you like at this table.
            </Hint>
          )}
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

