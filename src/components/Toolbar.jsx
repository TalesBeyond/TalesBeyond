import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ModalIcon from './ModalIcon.jsx';
import ModalShell from './ModalShell.jsx';
import { Hint, Tip, useHintPrefs } from './Hints.jsx';
import DiceModal from './DiceModal.jsx';
import { clampGridDims, clampFeetPerSquare, GRID_LINE_STRENGTHS, GRID_LINE_COLORS, normalizeGridLines, gridLineStyle } from '../utils/grid.js';
import { resolveImage } from '../lib/imageCache.js';
import { resizeImageToDataUrl, sliceImageForIslands } from '../utils/image.js';
import { WEAPONS, WEAPON_TYPES, DICE_TYPES as WEAPON_DICE_TYPES, CLASSES, averageDamage } from '../data/weapons.js';
import { ITEMS, ITEM_CATEGORIES } from '../data/items.js';
import { makeIconDataUrl } from '../data/defaultTokens.js';
import { defaultCharacterSheet, normalizeEquipment, normalizeCurrency, newEquipmentItem } from '../data/characterSheet.js';
import { ISLAND_CONDITIONS } from '../data/islandConditions.js';
import { ISLAND_DAY_NIGHT_MODES, DAY_PHASES } from '../data/dayPhases.js';
import ClockReadout from './ClockReadout.jsx';
import SoundField from './SoundField.jsx';
import { RollLog, CharacterLog } from './RollFeed.jsx';
import CompendiumBook from './CompendiumBook.jsx';
import RulesBook from './RulesBook.jsx';
import { useFx } from '../lib/fx.js';
import { PALETTES } from '../state/theme.js';

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
function ToolCard({ icon, image, label, active, onClick, disabled, title, badge, tour }) {
  return (
    <button type="button" className={`tool-card ${active ? 'active' : ''}`} onClick={onClick} disabled={disabled} title={title || label} data-tour={tour}>
      <span className="tool-card-icon">{image ? <img className="tool-card-image" src={image} alt="" /> : icon}</span>
      {badge ? (
        <span className="tool-card-badge" aria-label={`${badge} new`}>
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
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
// tour: the name the tutorial (Tour.jsx) finds this button by.
// panel: { title, icon, width } — the entry opens as a side panel beside the
// rail instead of a menu (ModalShell's `side`). A panel stays open while the
// table is played, so a click elsewhere or Escape doesn't close it.
function ToolMenu({ icon, label, title, active, open, onToggle, onClose, popovers, children, className = '', menuClassName = '', align, badge, tour, panel = null }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open || panel) return undefined;
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
  }, [open, onClose, panel]);

  return (
    <div className={`toolbar-group ${className}`} ref={ref} data-tour={tour}>
      <ToolCard icon={icon} label={label} active={open || active} onClick={onToggle} title={title} badge={badge} />
      {open && panel && (
        <ModalShell side title={panel.title} icon={panel.icon} width={panel.width} closeLabel={`Close ${panel.title}`} onClose={onClose}>
          <div className={`side-panel-menu${menuClassName ? ` ${menuClassName}` : ''}`}>{children}</div>
        </ModalShell>
      )}
      {open && !panel && <div className={`toolbar-menu${align === 'end' ? ' align-end' : ''}${menuClassName ? ` ${menuClassName}` : ''}`}>{children}</div>}
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
  area: 'M3 10L16 4c1.500 3.500 1.500 8.500 0 12z',
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
  rolllog: 'M4 3h9l3 3v11H4zM7 8h6M7 11h6M7 14h4',
  charlog: 'M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 17v-1a6 6 0 0 1 8.5-5.5M12.5 17l.5-2.5 3.5-3.5 2 2-3.5 3.5z',
  players: 'M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM1.5 17v-1a5.5 5.5 0 0 1 11 0v1M13 3.4a3 3 0 0 1 0 5.4M18.5 17v-1a5.5 5.5 0 0 0-3.8-5.2',
  invite: 'M7 13a3 3 0 1 1 2.8-4H17v3h-2v2h-2v-2H9.8A3 3 0 0 1 7 13z',
  trash: 'M4 6h12M8 6V4h4v2M5.5 6l.8 11h7.4l.8-11M8.5 9.5v4.5M11.5 9.5v4.5',
  monsters: 'M4 9a6 6 0 0 1 12 0v3l-2 2v3H6v-3l-2-2zM7.5 9.5h.01M12.5 9.5h.01M9 17v-2M11 17v-2',
  token: 'M10 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6.5 16.5l1.3-6.5h4.4l1.3 6.5M5 16.5h10',
  mapdownload: 'M3 2.5h14v9H3zM3 9.5l3.5-3 3 2.5 2.5-2 5 3.5M10 13.5v5M7.5 16l2.5 2.5 2.5-2.5',
  hints: 'M8 16h4M8.5 18.5h3M10 2.5a5 5 0 0 0-3.3 8.8c.7.6.8 1.2.8 2.2h5c0-1 .1-1.6.8-2.2A5 5 0 0 0 10 2.5z',
  rules: 'M10 5C8 3.5 5 3.5 3 4.5v11c2-1 5-1 7 .5 2-1.5 5-1.5 7-.5v-11c-2-1-5-1-7 .5zM10 5v11',
};

// How the bar sheds width when it can't fit on one row, cheapest first. Each
// step keeps everything the previous one applied; the tokens are matched in
// CSS with [data-density~='…'].
const TOOLBAR_DENSITIES = ['', 'codes', 'codes icons', 'codes icons tight'];

// Line icons for the toolbar (replaces the old emoji glyphs so the bar reads
// as one consistent set and follows the palette's text color).
// The books in the compendium drawer (rail), in the order they lie in it.
const COMPENDIUM_BOOKS = [
  { kind: 'monsters', label: 'Monsters', sub: 'Creatures to place on the map', icon: 'monsters' },
  { kind: 'items', label: 'Items', sub: 'Gear, potions and supplies to give or sell', icon: 'items' },
  { kind: 'weapons', label: 'Weapons', sub: 'Blades, bows and the rest, to give or sell', icon: 'weapons' },
];

// A card in a rail drawer: its icon, its name and a line saying what it does.
function DrawerCard({ icon, label, text, title, active = false, danger = false, onClick }) {
  return (
    <button type="button" className={`drawer-tool${active ? ' active' : ''}${danger ? ' danger' : ''}`} aria-pressed={active || undefined} onClick={onClick} title={title}>
      <span className="drawer-tool-icon">
        <Icon name={icon} />
      </span>
      <span className="drawer-book-text">
        <span className="drawer-tool-name">{label}</span>
        <span className="drawer-tool-sub">{text}</span>
      </span>
    </button>
  );
}

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
  area: <Icon name="area" />,
  draw: <Icon name="draw" />,
};
const TOOL_LABELS = { play: 'Play', edit: 'Edit', pan: 'Pan', ruler: 'Ruler', area: 'Area', draw: 'Draw' };

// The Tools drawer (rail): each tool with what it does. `dm`: the DM's only.
const DRAWER_TOOLS = [
  { key: 'play', text: 'Select tokens and drag them around the map. The everyday tool.' },
  { key: 'ruler', text: 'Drag across the map to measure a distance in feet.' },
  { key: 'area', text: 'Lay a spell’s area on the map: a cone, cube, line, sphere and more.' },
  { key: 'draw', text: 'Sketch on the map. Everyone at the table sees it.', dm: true },
  { key: 'edit', text: 'Drag whole maps to move them and line them up.', dm: true },
];

// Seats at a table: the DM plus up to nine players.
const MAX_SEATS = 10;

// Who's at the table, for the Players button: colour and online dot, name,
// and the DM or the hero they play (and "away" when they've dropped).
function PlayerList({ players, hostId, entities, meId, onKick }) {
  const list = Object.values(players || {});
  if (!list.length) return <div className="empty-state">No one here yet.</div>;
  return (
    <ul className="players-menu-list">
      {list.map((p) => {
        const hero = Object.values(entities || {}).find((e) => e.kind === 'hero' && e.ownerId === p.id);
        const role = p.id === hostId ? 'Dungeon Master' : hero?.name || 'No hero yet';
        return (
          <li key={p.id} className="player-row">
            <span className={`player-dot${p.connected ? ' online' : ''}`} style={{ background: p.color }} />
            <span className="player-name">
              {p.name}
              {p.id === meId ? ' (you)' : ''}
            </span>
            <span className="player-tag">{[role, p.connected ? '' : 'away'].filter(Boolean).join(', ')}</span>
            {onKick && p.id !== hostId && (
              <button type="button" className="btn btn-danger btn-sm" title={`Remove ${p.name} from the table`} onClick={() => onKick(p.id)}>
                Kick
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function Toolbar({
  // This session's dice rolls at the table, newest first (RollFeed.jsx).
  rollLog = [],
  activityLog = null, // the DM's character log; null for players
  players = {},
  hostId = null,
  allEntities = {},
  meId = null,
  onKickPlayer = null,
  onStartTour = null, // the DM's tutorial replay (desktop only)
  // Desktop: the bar stands on its side as a rail of book-style tabs down
  // the left edge, and its menus open to the right of it. The Tokens panel
  // opens from a tab of its own.
  rail = false,
  tokensOpen = false,
  onToggleTokens = null,
  // Music is a side panel too, but GameView holds it (the phone opens it as
  // well): whether it is open, and how to close it.
  musicOpen = false,
  onCloseMusic = null,
  // The app-wide colour palette, picked in Configurations.
  theme,
  onThemeChange = null,
  // The roll log and saved dice sets, kept in GameView so they survive
  // closing the popover and the phone dice screen shares them.
  dice,
  isHost,
  isGuestHost,
  layer,
  activeIsland,
  tool,
  onToolChange,
  onArea, // opens the area-of-effect picker; the Area tool itself starts once a shape is chosen
  revealRolls = false,
  onRevealRollsChange,
  hideDrawings = false,
  onToggleHideDrawings,
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
  onRecenterIsland,
  onCreateIsland,
  onRemoveIsland,
  onDownloadIslandImage,
  onUpdateIsland,
  onDetachIsland,
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
  const [showRules, setShowRules] = useState(false);
  // The island whose settings the Islands dialog opens on (the phone's
  // "… settings" button in Edit mode).
  const [islandsFocusId, setIslandsFocusId] = useState(null);
  // Which grouped menu (tools / mapping / world / library) is open.
  const [openMenu, setOpenMenu] = useState(null);
  // The newest roll seen with the Roll log open; anything newer from someone
  // else counts on the button's badge.
  // Which side panel stands beside the rail: 'tools' | 'mapping' | 'world' |
  // 'compendium' | 'initiative' | 'dice' | 'logs' | 'players' |
  // 'configurations' | null. One at a time, and never alongside the Tokens
  // panel or Music, which take the same place.
  const [sidePanel, setSidePanel] = useState(null);
  const [logTab, setLogTab] = useState('rolls'); // 'rolls' | 'heroes', inside the Logs panel
  const [mapTab, setMapTab] = useState('maps'); // 'maps' | 'layers', inside the Mapping drawer
  const closeSide = useCallback(() => setSidePanel(null), []);
  function openSide(name) {
    const opening = sidePanel !== name;
    setOpenMenu(null);
    setSidePanel(opening ? name : null);
    if (!opening) return;
    if (tokensOpen) onToggleTokens?.();
    if (musicOpen) onCloseMusic?.();
  }
  // Opens a side panel without folding it away again if it is the one open.
  function showSide(name) {
    if (sidePanel !== name) openSide(name);
  }
  useEffect(() => {
    if (tokensOpen || musicOpen) setSidePanel(null);
  }, [tokensOpen, musicOpen]);
  // On the rail World maps, Layers and Initiative are drawers, not dialogs.
  const islandsOpen = rail ? sidePanel === 'mapping' && mapTab === 'maps' : showIslands;
  const layersOpen = rail ? sidePanel === 'mapping' && mapTab === 'layers' : showLayers;
  const initiativeOpen = rail ? sidePanel === 'initiative' : showInitiative;

  const [seenRollId, setSeenRollId] = useState(() => rollLog[0]?.id ?? null);
  const rollLogOpen = rail ? sidePanel === 'logs' && (logTab === 'rolls' || !activityLog) : openMenu === 'rolls';
  useEffect(() => {
    if (rollLogOpen && rollLog[0]) setSeenRollId(rollLog[0].id);
  }, [rollLogOpen, rollLog]);
  // The same "new since you last looked" count for the character log.
  const activity = activityLog || [];
  const [seenActivityId, setSeenActivityId] = useState(() => activity[0]?.id ?? null);
  const activityOpen = rail ? sidePanel === 'logs' && logTab === 'heroes' && Boolean(activityLog) : openMenu === 'activity';
  useEffect(() => {
    if (activityOpen && activity[0]) setSeenActivityId(activity[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityOpen, activity[0]?.id]);
  const activitySeenAt = activity.findIndex((e) => e.id === seenActivityId);
  const unseenActivity = activitySeenAt < 0 ? activity.length : activitySeenAt;
  const seenAt = rollLog.findIndex((r) => r.id === seenRollId);
  const unseenRolls = (seenAt < 0 ? rollLog : rollLog.slice(0, seenAt)).filter((r) => !r.mine).length;
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
    if (!bar) return;
    delete bar.dataset.overflow;
    // The rail has no width to run out of; the codes always live in Invite.
    if (rail) {
      bar.dataset.density = 'codes';
      return;
    }
    if (!leave) return;
    for (const density of TOOLBAR_DENSITIES) {
      bar.dataset.density = density;
      const limit = bar.getBoundingClientRect().right - parseFloat(getComputedStyle(bar).paddingRight);
      if (leave.getBoundingClientRect().right <= limit + 0.5) return;
    }
    bar.dataset.overflow = 'wrap';
  }, [rail]);

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

  // On the rail a menu opens beside its tab, not under it. The rail scrolls
  // when the window is short, which would clip anything positioned inside
  // it, so each open menu is pinned to the window instead: level with its
  // tab, pulled up when it would run off the bottom.
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!rail || !bar) return undefined;
    const pops = [...bar.querySelectorAll('.toolbar-menu, [data-rail-pop], .toolbar-codes-tip')];
    if (pops.length === 0) return undefined;
    const place = () => {
      const left = bar.getBoundingClientRect().right + 6;
      for (const pop of pops) {
        const anchor = pop.closest('.toolbar-group');
        if (!anchor) continue;
        const top = Math.max(8, Math.min(anchor.getBoundingClientRect().top, window.innerHeight - pop.offsetHeight - 8));
        Object.assign(pop.style, { position: 'fixed', left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
      }
    };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    pops.forEach((pop) => observer?.observe(pop));
    window.addEventListener('resize', place);
    bar.addEventListener('scroll', place);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
      bar.removeEventListener('scroll', place);
    };
  });

  function closePopovers() {
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

  // Takes one book out of the compendium drawer and opens it.
  function openBook(kind) {
    closePopovers();
    setShowCompendium(kind === 'weapons');
    setShowItemCompendium(kind === 'items');
    setShowMonsterCompendium(kind === 'monsters');
  }

  // A section that opens a menu or a dialog takes the place of whatever panel
  // stands beside the rail: Tokens, Music or one of the side panels.
  function closePanels() {
    if (!rail) return;
    setSidePanel(null);
    if (tokensOpen) onToggleTokens?.();
    if (musicOpen) onCloseMusic?.();
  }

  function toggleMenu(name) {
    closePanels();
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
    // On the rail these stand in a drawer beside it.
    if (rail && (name === 'dayNight' || name === 'ambience')) {
      closePopovers();
      setIslandsFocusId(null);
      showSide('world');
      return;
    }
    if (rail && (name === 'islands' || name === 'layers' || name === 'initiative')) {
      closePopovers();
      if (name !== 'islands') setIslandsFocusId(null);
      if (name !== 'initiative') setMapTab(name === 'layers' ? 'layers' : 'maps');
      showSide(name === 'initiative' ? 'initiative' : 'mapping');
      return;
    }
    setOpenMenu(null);
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

  // An island's background image, picked in its settings (World maps
  // dialog) and sent here when Save changes is pressed.
  // For an island in a group the picture belongs to the whole group: it is
  // laid over all of them together and each gets its own part — the shape
  // Download map exports (GameView's downloadIslandImage).
  async function uploadIslandBackground(islandId, file) {
    try {
      const group = Object.values(layer.islandGroups || {}).find((g) => g.islandIds.includes(islandId));
      const members = group ? group.islandIds.map((id) => layer.islands[id]).filter(Boolean) : [];
      if (members.length > 1) {
        const slices = await sliceImageForIslands(file, members, BACKGROUND_IMAGE_MAX_DIM, 0.78);
        for (const member of members) onUpdateIsland(member.id, { backgroundImage: slices[member.id] });
        return;
      }
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
      <ToolCard
        icon={<Icon name="refresh" />}
        label="New code"
        onClick={onRegenerateCode}
        title="Stop the old player code working and issue a new one. Players already at the table stay seated."
      />
    </>
  );

  // Once, the first time someone hosts: which code to share. Shown by the
  // inline codes or, when the bar folds them away, by the Invite menu — CSS
  // shows whichever of the two is on screen.
  // Kept out of the way while a panel stands beside the rail, where it would
  // lie across it.
  const codesTip = isHost && !(rail && (sidePanel || tokensOpen || musicOpen)) && (
    <Tip id="codes" title="Share the player code" className="toolbar-codes-tip">
      Players join with the player code. Keep the {isGuestHost ? 'DM code' : 'host key'} to yourself — it’s how you get the table back.
    </Tip>
  );

  // The Mapping drawer holds World maps and Layers behind one switch.
  const mappingTabs = rail ? (
    <div className="side-tabs drawer-tabs" role="tablist" aria-label="Mapping">
      {[
        ['maps', 'World maps'],
        ['layers', 'Layers'],
      ].map(([key, text]) => (
        <button key={key} type="button" role="tab" aria-selected={mapTab === key} className={mapTab === key ? 'active' : ''} onClick={() => setMapTab(key)}>
          {text}
        </button>
      ))}
    </div>
  ) : null;

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
    <div className={`toolbar${rail ? ' toolbar-rail' : ''}`} ref={barRef}>
      {!rail && (
        <button className="toolbar-collapse-btn" onClick={onToggleCollapsed} title="Collapse toolbar">
          ▴
        </button>
      )}

      {/* The trigger shows the active tool's icon, so the current mode is
          still visible with the menu folded away. */}
      <ToolMenu
        icon={TOOL_ICONS[tool] || <Icon name="tools" />}
        label="Tools"
        tour="tools"
        title={`Tools — current: ${TOOL_LABELS[tool] || tool}`}
        open={rail ? sidePanel === 'tools' : openMenu === 'tools'}
        onToggle={() => (rail ? openSide('tools') : toggleMenu('tools'))}
        onClose={rail ? closeSide : closeMenu}
        panel={rail ? { title: 'Tools', width: 320 } : null}
        menuClassName={rail ? 'book-drawer tools-drawer' : ''}
      >
        {/* In the drawer each tool says what it does, and the drawer stays
            open so the next tool is one press away. */}
        {rail && (
          <>
            {DRAWER_TOOLS.filter((t) => isHost || !t.dm).map((t) => (
              <button key={t.key} type="button" className={`drawer-tool${tool === t.key ? ' active' : ''}`} aria-pressed={tool === t.key} onClick={() => (t.key === 'area' ? onArea() : onToolChange(t.key))}>
                <span className="drawer-tool-icon">{TOOL_ICONS[t.key]}</span>
                <span className="drawer-book-text">
                  <span className="drawer-tool-name">{TOOL_LABELS[t.key]}</span>
                  <span className="drawer-tool-sub">{t.text}</span>
                </span>
              </button>
            ))}
            <p className="book-drawer-note">Right-drag moves the map in any tool.</p>
          </>
        )}
        {!rail && (
          <>
        <ToolCard
          icon={TOOL_ICONS.play}
          label="Play"
          active={tool === 'play'}
          onClick={() => pick(() => onToolChange('play'))}
          title="Select and drag tokens"
        />
        {/* Pan and "Hide drawings" are off the desktop bar for now: right-drag
            already moves the map in every tool, and GameView ignores a saved
            "hide drawings" on desktop so nobody is left with drawings hidden
            and no switch to bring them back. Both remain on phones. */}
        <ToolCard
          icon={TOOL_ICONS.ruler}
          label="Ruler"
          active={tool === 'ruler'}
          onClick={() => pick(() => onToolChange('ruler'))}
          title="Click and drag on the map to measure distance"
        />
        <ToolCard
          icon={TOOL_ICONS.area}
          label="Area"
          active={tool === 'area'}
          onClick={() => pick(onArea)}
          title="Lay an area of effect on the map — everyone at the table sees it"
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
              title="Drag maps around to reposition them"
            />
          </>
        )}
          </>
        )}
      </ToolMenu>

      {/* The Tokens panel no longer sits beside the map: its tab folds it
          out over the map's left edge and away again. */}
      {rail && isHost && onToggleTokens && (
        <div className="toolbar-group" data-tour="tokens">
          <ToolCard icon={<Icon name="token" />} label="Tokens" active={tokensOpen} onClick={onToggleTokens} title="Heroes, doors, chests, traps and your own images to put on the map" />
        </div>
      )}

      {isHost && (
        <ToolMenu
          icon={<Icon name="mapping" />}
          label="Mapping"
          tour="mapping"
          title="World maps and layers"
          active={rail ? sidePanel === 'mapping' : showIslands || showLayers}
          open={!rail && openMenu === 'mapping'}
          onToggle={() => (rail ? openSide('mapping') : toggleMenu('mapping'))}
          onClose={closeMenu}
          popovers={
            <>
              {islandsOpen && (
                <IslandManagerPopover
                  // Asked to open on one map's settings: start afresh on it.
                  key={islandsFocusId || 'maps'}
                  side={rail}
                  sideTabs={mappingTabs}
                  islands={layer.islands}
                  islandOrder={layer.islandOrder}
                  islandGroups={layer.islandGroups || {}}
                  activeIslandId={activeIslandId}
                  onRecenterIsland={onRecenterIsland}
                  onCreateIsland={onCreateIsland}
                  onRemoveIsland={onRemoveIsland}
                  onDetachIsland={onDetachIsland}
                  onRenameGroup={onRenameGroup}
                  onIslandConditions={onIslandConditions}
                  onGroupConditions={onGroupConditions}
                  onUpdateIsland={onUpdateIsland}
                  onUploadBackground={uploadIslandBackground}
                  onDownloadIslandImage={onDownloadIslandImage}
                  focusIslandId={islandsFocusId}
                  layerFeet={layer.feetPerSquare || 5}
                  onSwitchToEdit={() => {
                    onToolChange('edit');
                    if (rail) closeSide();
                    else setShowIslands(false);
                  }}
                  onClose={rail ? closeSide : () => setShowIslands(false)}
                />
              )}
              {layersOpen && (
                <LayerSwitcherPopover
                  side={rail}
                  sideTabs={mappingTabs}
                  layers={layers}
                  layerOrder={layerOrder}
                  currentLayerId={currentLayerId}
                  layerPlayerCounts={layerPlayerCounts}
                  onSwitchLayer={onSwitchLayer}
                  onCreateLayer={onCreateLayer}
                  onRemoveLayer={onRemoveLayer}
                  onClose={rail ? closeSide : () => setShowLayers(false)}
                />
              )}
            </>
          }
        >
          <ToolCard icon={<Icon name="islands" />} label="World maps" active={showIslands} onClick={() => togglePopover('islands')} title={`${(layer.islandOrder || []).length} map(s) on this layer`} />
          <ToolCard icon={<Icon name="layers" />} label="Layers" active={showLayers} onClick={() => togglePopover('layers')} title={`${(layerOrder || []).length} layer(s)`} />
        </ToolMenu>
      )}

      {isHost && (
        <ToolMenu
          icon={<Icon name="world" />}
          label={rail ? 'World' : 'World state'}
          tour="world"
          title="In-game time, day / night and the world's ambience"
          active={!rail && (showDayNight || showAmbience)}
          open={rail ? sidePanel === 'world' : openMenu === 'world'}
          onToggle={() => (rail ? openSide('world') : toggleMenu('world'))}
          onClose={rail ? closeSide : closeMenu}
          panel={rail ? { title: 'World', width: 360 } : null}
          menuClassName={rail ? 'book-drawer world-drawer' : ''}
          popovers={
            !rail && (
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
            </>
            )
          }
        >
          {/* In the drawer all three are laid out at once: the clock's
              button, then the day / night and ambience controls themselves. */}
          {rail && (
            <>
              <section className="drawer-section">
                <span className="section-label">Ingame time</span>
                <button type="button" className="drawer-tool" onClick={onOpenClock} title="Set the in-game time, tick speed, and day/night cycle">
                  <span className="drawer-tool-icon">
                    <Icon name="clock" />
                  </span>
                  <span className="drawer-book-text">
                    <span className="drawer-tool-name">{clock ? 'Change the clock' : 'Set a clock'}</span>
                    <span className="drawer-tool-sub">The table’s time, how fast it runs, and the day / night cycle.</span>
                  </span>
                </button>
              </section>
              <section className="drawer-section">
                <span className="section-label">Day / night</span>
                <DayNightControls
                  override={dayNightOverride}
                  hasClock={Boolean(clock)}
                  hasCycle={Boolean(clock?.cycle?.enabled)}
                  onSelect={(phase) => onSetDayNightOverride(phase)}
                  island={activeIsland}
                  onIslandDayNight={(dayNight) => onIslandPatch({ dayNight })}
                />
              </section>
              <section className="drawer-section">
                <span className="section-label">Ambience</span>
                <SoundField audio={audio} targetKind="layer" targetId={layer.id} label={`${layer.name} — plays for players in this world`} />
              </section>
            </>
          )}
          {!rail && (
            <>
          <ToolCard icon={<Icon name="clock" />} label="Ingame time" onClick={() => pick(onOpenClock)} title="Set the in-game time, tick speed, and day/night cycle" />
          <ToolCard
            icon={dayPhase ? '' : <Icon name="daynight" />}
            image={dayPhase ? DAY_PHASES[dayPhase].imageUrl : undefined}
            label="Day / night"
            active={showDayNight}
            onClick={() => togglePopover('dayNight')}
            title="Change the day/night phase by hand, and whether this map follows it"
          />
          <ToolCard
            icon={<Icon name="music" />}
            label="Ambience"
            active={showAmbience}
            onClick={() => togglePopover('ambience')}
            title="The sound that plays for players in this world"
          />
            </>
          )}
        </ToolMenu>
      )}

      {/* Not a button: the readout is how every player sees the in-game time. */}
      {clock && !rail && (
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

      {/* The books of monsters, items and weapons, and Storage, where the DM
          makes this table's own. On the rail they lie in a drawer beside it,
          and the drawer stays open under whichever book is taken out. */}
      {isHost && (
        <ToolMenu
          icon={<Icon name="library" />}
          label="Compendium"
          tour="compendium"
          title="The compendium, and your own monsters, weapons and items"
          active={showCompendium || showItemCompendium || showMonsterCompendium || showAssetStorage}
          open={rail ? sidePanel === 'compendium' : openMenu === 'compendium'}
          onToggle={() => (rail ? openSide('compendium') : toggleMenu('compendium'))}
          onClose={rail ? closeSide : closeMenu}
          panel={rail ? { title: 'Compendium', width: 340 } : null}
          menuClassName={rail ? 'book-drawer' : ''}
        >
          {rail && (
            <>
              <p className="book-drawer-note">Pick a book to open it.</p>
              {COMPENDIUM_BOOKS.map((b) => (
                <button key={b.kind} type="button" className={`drawer-book ${b.kind}`} onClick={() => openBook(b.kind)} title={`Open the ${b.label} book`}>
                  <span className="drawer-book-spine" aria-hidden="true" />
                  <span className="drawer-book-text">
                    <span className="drawer-book-title">{b.label}</span>
                    <span className="drawer-book-sub">{b.sub}</span>
                  </span>
                  <span className="drawer-book-icon">
                    <Icon name={b.icon} />
                  </span>
                </button>
              ))}
              <button
                type="button"
                className={`drawer-storage${showAssetStorage ? ' active' : ''}`}
                onClick={() => {
                  setShowMonsterCompendium(false);
                  togglePopover('assetStorage');
                }}
                title="Asset Storage — create custom monsters, weapons, and items for this table"
              >
                <Icon name="storage" />
                <span className="drawer-book-text">
                  <span className="drawer-storage-title">Storage</span>
                  <span className="drawer-storage-sub">Your own monsters, weapons and items</span>
                </span>
              </button>
            </>
          )}
          {!rail && (
            <>
          <ToolCard
            icon={<Icon name="library" />}
            label="Book"
            active={showCompendium || showItemCompendium || showMonsterCompendium}
            onClick={() => {
              const open = showCompendium || showItemCompendium || showMonsterCompendium;
              togglePopover(null);
              setShowCompendium(!open);
              setShowItemCompendium(false);
              setShowMonsterCompendium(false);
            }}
            title="Open the compendium of weapons, items, and monsters"
          />
          <ToolCard
            icon={<Icon name="storage" />}
            label="Storage"
            active={showAssetStorage}
            onClick={() => {
              setShowMonsterCompendium(false);
              togglePopover('assetStorage');
            }}
            title="Asset Storage — create custom monsters, weapons, and items for this table"
          />
            </>
          )}
        </ToolMenu>
      )}

      {/* Initiative and dice stay one click away — no menu to open first.
          Everyone's dice tray is private to their own browser (see
          diceSaved/diceRolls above), so it isn't gated to the host. */}
      <div className="toolbar-group">
        {isHost && (
          <ToolCard
            icon={<Icon name="initiative" />}
            label="Initiative"
            tour="initiative"
            active={initiativeOpen}
            onClick={() => (rail ? openSide('initiative') : togglePopover('initiative'))}
            title="Roll for Initiative"
          />
        )}
        <span className="toolbar-hint-anchor">
          <ToolCard
            icon={<Icon name="music" />}
            label="Music"
            tour="music"
            active={Boolean(audio?.playback?.nowPlaying) || showMusicHint || musicOpen}
            onClick={audio?.enabled ? (musicOpen ? onCloseMusic : onOpenMusic) : () => {
              closePanels();
              setShowMusicHint((s) => !s);
            }}
            title={audio?.enabled ? 'Table music' : 'Why there’s no music here'}
          />
          {showMusicHint && !audio?.enabled && (
            <div className="toolbar-hint-pop" data-rail-pop="">
              <Hint>{musicHint}</Hint>
            </div>
          )}
        </span>
        <ToolCard
          icon={<Icon name="dice" />}
          label="Dice"
          tour="dice"
          active={rail ? sidePanel === 'dice' : showDice}
          onClick={() => (rail ? openSide('dice') : togglePopover('dice'))}
          title="Roll the dice"
        />
        {(rail ? sidePanel === 'dice' : showDice) && <DiceModal {...dice} side={rail} onClose={rail ? closeSide : () => setShowDice(false)} />}
      </div>

      {/* On the rail the roll log and the character log share one tab and
          one side panel; the DM switches between them inside it. */}
      {rail && (
        <ToolMenu
          icon={<Icon name="rolllog" />}
          label="Logs"
          tour="rolls"
          title={activityLog ? 'The roll log and the character log' : 'Every roll at the table this session'}
          open={sidePanel === 'logs'}
          onToggle={() => openSide('logs')}
          onClose={closeSide}
          panel={{ title: 'Logs', width: 360 }}
          badge={(rollLogOpen ? 0 : unseenRolls) + (activityLog && !activityOpen ? unseenActivity : 0)}
        >
          {activityLog && (
            <div className="side-tabs" role="tablist" aria-label="Logs">
              {[
                ['rolls', 'Roll log', rollLogOpen ? 0 : unseenRolls],
                ['heroes', 'Character log', activityOpen ? 0 : unseenActivity],
              ].map(([key, text, unseen]) => (
                <button key={key} type="button" role="tab" aria-selected={logTab === key} className={logTab === key ? 'active' : ''} onClick={() => setLogTab(key)}>
                  {text}
                  {unseen > 0 && <span className="side-tab-count">{unseen > 9 ? '9+' : unseen}</span>}
                </button>
              ))}
            </div>
          )}
          {activityLog && logTab === 'heroes' ? (
            <>
              <div className="players-menu-head">
                Character log <span>{activity.length ? `${activity.length} this session` : 'only you see this'}</span>
              </div>
              <CharacterLog entries={activity} />
            </>
          ) : (
            <>
              <div className="players-menu-head">
                Roll log <span>{rollLog.length ? `${rollLog.length} this session` : ''}</span>
              </div>
              <RollLog entries={rollLog} />
            </>
          )}
        </ToolMenu>
      )}

      {/* This session's rolls — everyone's, and the DM's own (marked when
          hidden). Open to everyone at the table. */}
      {!rail && (
      <ToolMenu
        icon={<Icon name="rolllog" />}
        label="Roll log"
        tour="rolls"
        title="Every roll at the table this session"
        open={rollLogOpen}
        onToggle={() => toggleMenu('rolls')}
        onClose={closeMenu}
        menuClassName="players-menu roll-log-menu"
        badge={rollLogOpen ? 0 : unseenRolls}
      >
        <div className="players-menu-head">
          Roll log <span>{rollLog.length ? `${rollLog.length} this session` : ''}</span>
        </div>
        <RollLog entries={rollLog} />
      </ToolMenu>
      )}

      {/* What each player changed on their own hero (hit points, bag,
          coins, weapons, spells). The DM's alone. */}
      {activityLog && !rail && (
        <ToolMenu
          icon={<Icon name="charlog" />}
          label="Character log"
          tour="charlog"
          title="What each player changed on their own hero this session"
          open={activityOpen}
          onToggle={() => toggleMenu('activity')}
          onClose={closeMenu}
          menuClassName="players-menu roll-log-menu"
          badge={activityOpen ? 0 : unseenActivity}
        >
          <div className="players-menu-head">
            Character log <span>{activity.length ? `${activity.length} this session` : 'only you see this'}</span>
          </div>
          <CharacterLog entries={activity} />
        </ToolMenu>
      )}

      {/* The codes sit in the bar when there's room; on a narrower bar the
          same chips fold into an "Invite" menu (see TOOLBAR_DENSITIES). Both
          are always rendered — CSS shows one. */}
      {isHost && (
        <div className="toolbar-group toolbar-codes-inline" data-tour="codes">
          {codeChips}
          {codesTip}
        </div>
      )}
      {isHost && (
        <ToolMenu
          className="toolbar-codes-menu"
          icon={<Icon name="invite" />}
          label="Invite"
          tour="codes"
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
      {isHost && initiativeOpen && (
        <InitiativeModal
          side={rail}
          heroes={initiativeHeroes || []}
          mobs={initiativeMobs || []}
          onRoll={onRollInitiative}
          encounterActive={encounterActive}
          onToggleEncounter={onToggleEncounter}
          onClose={rail ? closeSide : () => setShowInitiative(false)}
        />
      )}

      <div className="spacer" />

      {/* Saved state over the autosave countdown, stacked so the pair costs
          one narrow column instead of two side by side. */}
      {isHost && !rail && (
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

      {/* Who's at the table — everyone gets this one, not just the DM. */}
      <ToolMenu
        icon={<Icon name="players" />}
        label={rail ? 'Players' : `${Object.keys(players).length}/${MAX_SEATS} players`}
        tour="players"
        title="Who's at the table"
        open={rail ? sidePanel === 'players' : openMenu === 'players'}
        onToggle={() => (rail ? openSide('players') : toggleMenu('players'))}
        onClose={rail ? closeSide : closeMenu}
        panel={rail ? { title: 'Players', width: 340 } : null}
        menuClassName="players-menu"
        align="end"
      >
        <div className="players-menu-head">
          Players <span>{Object.keys(players).length} of {MAX_SEATS} seats</span>
        </div>
        <PlayerList
          players={players}
          hostId={hostId}
          entities={allEntities}
          meId={meId}
          onKick={
            onKickPlayer
              ? (id) => {
                  closeMenu();
                  onKickPlayer(id);
                }
              : null
          }
        />
      </ToolMenu>

      {/* The very last group: save/export/import/close/leave — the
          "shutting the book" actions, tucked away since they're reached for
          far less often than anything above. */}
      <ToolMenu
        icon={<Icon name="config" />}
        label={rail ? 'Config' : 'Configurations'}
        tour="config"
        title="Save, export, import, close, hints, and leave"
        open={rail ? sidePanel === 'configurations' : openMenu === 'configurations'}
        onToggle={() => (rail ? openSide('configurations') : toggleMenu('configurations'))}
        onClose={rail ? closeSide : closeMenu}
        panel={rail ? { title: 'Configurations', width: 340 } : null}
        menuClassName={rail ? 'config-menu book-drawer config-drawer' : 'config-menu'}
        align="end"
      >
        {/* In the drawer every action is a card that says what it does,
            grouped by what it is for. */}
        {rail && (
          <>
            {isHost && (
              <section className="drawer-section">
                <span className="section-label">Table</span>
                <DrawerCard icon="save" label="Save" text="Saves the game state right now." title={lastSavedLabel} onClick={onSaveNow} />
                <DrawerCard icon="export" label="Export" text="Downloads the whole table as a .bmp file, to keep as a backup." onClick={onExport} />
                <DrawerCard icon="import" label="Import" text="Loads a .bmp file. It replaces the whole table." onClick={() => importRef.current?.click()} />
                <input ref={importRef} type="file" accept="image/bmp,.bmp" style={{ display: 'none' }} onChange={handleImportFile} />
                <DrawerCard
                  icon={session.isOpen ? 'unlock' : 'lock'}
                  label={session.isOpen ? 'Close table' : 'Reopen table'}
                  text={session.isOpen ? 'Stops new players from joining. Those already seated stay.' : 'The table is closed. Lets new players join again.'}
                  active={!session.isOpen}
                  onClick={onToggleOpen}
                />
              </section>
            )}
            {isHost && onRevealRollsChange && (
              <section className="drawer-section">
                <span className="section-label">Dice</span>
                <label className="toolbar-menu-check">
                  <input type="checkbox" checked={revealRolls} onChange={(e) => onRevealRollsChange(e.target.checked)} />
                  <span>
                    <b>Reveal rolls to players</b>
                    <small>Off: only you see the rolls you make. On: every roll you make shows for the players too. Players’ rolls always reach you.</small>
                  </span>
                </label>
              </section>
            )}
            <section className="drawer-section">
              <span className="section-label">Help</span>
              <DrawerCard
                icon="rules"
                label="Game table rules"
                text="A book of what every button and tool does."
                onClick={() => {
                  closePopovers();
                  setShowRules(true);
                }}
              />
              {onStartTour && <DrawerCard icon="hints" label="Tutorial" text="A short tour of each part of the screen." onClick={onStartTour} />}
              <DrawerCard
                icon="hints"
                label={hintPrefs.show ? 'Hints on' : 'Hints off'}
                text={hintPrefs.show ? 'Tips and mode bars show on this device. Press to turn them off.' : 'Tips and mode bars are off on this device. Press to turn them on.'}
                active={hintPrefs.show}
                onClick={() => hintPrefs.setShow(!hintPrefs.show)}
              />
              {hintPrefs.show && hintPrefs.anyDismissed && <DrawerCard icon="refresh" label="Tips again" text="Brings back every tip and mode bar you have hidden." onClick={hintPrefs.resetDismissed} />}
            </section>
            {onThemeChange && (
              <section className="drawer-section">
                <div className="toolbar-menu-palettes" role="group" aria-label="Color palette">
                  <span className="toolbar-menu-caption">Palette</span>
                  {PALETTES.map((p) => (
                    <button key={p.id} type="button" className={`palette-option${theme === p.id ? ' active' : ''}`} aria-pressed={theme === p.id} onClick={() => onThemeChange(p.id)}>
                      <span className="palette-swatch" aria-hidden="true">
                        {p.swatch.map((c, i) => (
                          <span key={i} style={{ background: c }} />
                        ))}
                      </span>
                      {p.label}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section className="drawer-section">
              <DrawerCard icon="leave" label="Leave" text="Leaves this table and goes back to the start." danger onClick={onLeave} />
            </section>
          </>
        )}
        {!rail && (
          <>
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
        {onStartTour && <ToolCard icon={<Icon name="hints" />} label="Tutorial" onClick={() => pick(onStartTour)} title="A short tour of what each part of the screen does" />}
        {hintPrefs.show && hintPrefs.anyDismissed && (
          <ToolCard icon={<Icon name="refresh" />} label="Tips again" onClick={() => pick(hintPrefs.resetDismissed)} title="Show every tip and mode bar you've hidden again" />
        )}
        {/* The app-wide palette (state/theme.js). The menu stays open so a
            few can be tried in a row. */}
        {onThemeChange && (
          <div className="toolbar-menu-palettes" role="group" aria-label="Color palette">
            <span className="toolbar-menu-caption">Palette</span>
            {PALETTES.map((p) => (
              <button key={p.id} type="button" className={`palette-option${theme === p.id ? ' active' : ''}`} aria-pressed={theme === p.id} onClick={() => onThemeChange(p.id)}>
                <span className="palette-swatch" aria-hidden="true">
                  {p.swatch.map((c, i) => (
                    <span key={i} style={{ background: c }} />
                  ))}
                </span>
                {p.label}
              </button>
            ))}
          </div>
        )}
        {rail && <ToolCard icon={<Icon name="leave" />} label="Leave" onClick={() => pick(onLeave)} title="Leave the table" />}
        {/* What the tips and the tutorial said, kept to read at any time. */}
        <ToolCard
          icon={<Icon name="rules" />}
          label="Game table rules"
          onClick={() =>
            pick(() => {
              closePopovers();
              setShowRules(true);
            })
          }
          title="What every button and tool does"
        />
          </>
        )}
      </ToolMenu>
      {showRules && <RulesBook isHost={isHost} onClose={() => setShowRules(false)} />}

      {/* On the rail, Leave is the last card in Configurations instead. */}
      {!rail && (
        <button type="button" className="toolbar-leave" ref={leaveRef} onClick={onLeave} title="Leave the table">
          <Icon name="leave" />
          <span className="toolbar-leave-label">Leave</span>
        </button>
      )}
    </div>
  );
}

// Set the day/night phase by hand. Picking a phase overrides the clock's own
// cycle (which keeps running underneath) until "Follow the clock" hands it
// back; it works with the cycle on or off, and with no clock at all.
function DayNightPopover({ onClose, ...controls }) {
  return (
    <div
      data-rail-pop=""
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
      <DayNightControls {...controls} />
    </div>
  );
}

// The controls themselves: in the popover above, and laid straight into the
// World drawer on the rail.
function DayNightControls({ override, hasClock, hasCycle, onSelect, island, onIslandDayNight }) {
  const isManual = Boolean(override);
  return (
    <>
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
    </>
  );
}

// World state → Ambience: the sound that plays for players on this map.
function AmbiencePopover({ layer, audio, onClose }) {
  return (
    <ModalShell title="Ambience" icon="music" closeLabel="Close ambience" onClose={onClose}>
      <SoundField audio={audio} targetKind="layer" targetId={layer.id} label={`${layer.name} — plays for players in this world`} />
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
    <div className="island-row-conditions" role="group" aria-label="Map status">
      <span className="field-label island-status-label">Map status</span>
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

function LayerSwitcherPopover({
  layers,
  layerOrder,
  currentLayerId,
  layerPlayerCounts,
  onSwitchLayer,
  onCreateLayer,
  onRemoveLayer,
  onClose,
  side = false,
  sideTabs = null,
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
    <ModalShell title={side ? 'Mapping' : 'Layers'} icon="layers" closeLabel={side ? 'Close Mapping' : 'Close layers panel'} side={side} width={440} onClose={onClose}>
      {sideTabs}
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
        <Hint className="hint-tight">The first world is the base — new players land there, so it can’t be deleted.</Hint>
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
  onRecenterIsland,
  onCreateIsland,
  onRemoveIsland,
  onDetachIsland,
  onRenameGroup,
  onIslandConditions,
  onGroupConditions,
  onUpdateIsland,
  onUploadBackground,
  onDownloadIslandImage,
  focusIslandId = null,
  layerFeet = 5,
  onSwitchToEdit,
  onClose,
  // On the rail the manager stands in the Mapping drawer, under its switch.
  side = false,
  sideTabs = null,
}) {
  // The island whose settings (name, size, background) are open.
  const [openId, setOpenId] = useState(focusIslandId);
  const groupOf = (islandId) => Object.values(islandGroups || {}).find((g) => g.islandIds.includes(islandId));
  const [name, setName] = useState('');
  const [cols, setCols] = useState(20);
  const [rows, setRows] = useState(15);
  const [feet, setFeet] = useState(5);
  // The new-map form stays folded behind a button until it's wanted:
  // 'new' for a map of its own, or the id of the map getting a sub map.
  const [addingTo, setAddingTo] = useState(null);

  // A sub map is a map grouped under another: the group's first map is the
  // parent, the rest are its sub maps (GameView's createIsland).
  const parentIdOf = (islandId) => {
    const first = groupOf(islandId)?.islandIds[0];
    return first && first !== islandId && islands?.[first] ? first : null;
  };
  const parentIds = (islandOrder || []).filter((id) => islands?.[id] && !parentIdOf(id));
  const subMapsOf = (id) => (islandOrder || []).filter((sub) => islands?.[sub] && parentIdOf(sub) === id);
  // Parents whose sub maps are showing. They start folded, except the one
  // holding the map the dialog was opened on.
  const [expanded, setExpanded] = useState(() => [focusIslandId && parentIdOf(focusIslandId)].filter(Boolean));
  const toggleExpanded = (id) => setExpanded((open) => (open.includes(id) ? open.filter((x) => x !== id) : [...open, id]));

  function closeAdding() {
    setAddingTo(null);
    setName('');
    setCols(20);
    setRows(15);
    setFeet(5);
  }

  function addIsland() {
    if (!name.trim()) return;
    const parentId = addingTo === 'new' ? null : addingTo;
    onCreateIsland({ name: name.trim(), cols, rows, feetPerSquare: feet, parentId });
    if (parentId) setExpanded((open) => (open.includes(parentId) ? open : [...open, parentId]));
    closeAdding();
  }

  const newMapForm = (title, submitLabel, note) => (
    <div className="island-settings island-new">
      <div className="section-label" style={{ marginTop: 0 }}>
        {title}
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
      <label className="field-label">Feet per square</label>
      <input className="field" type="number" min="1" value={feet} onChange={(e) => setFeet(e.target.value)} />
      <div className="field-row">
        <button className="btn btn-secondary" onClick={closeAdding}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={addIsland} disabled={!name.trim()}>
          {submitLabel}
        </button>
      </div>
      {note && <span className="island-row-note">{note}</span>}
    </div>
  );

  // One map's row. A parent's row is also the header its sub maps fold
  // under: its name is the button that shows and hides them.
  const mapRow = (id, parentId = null) => {
        const island = islands[id];
        const isSole = islandOrder.length === 1;
        const isBase = id === islandOrder[0] && !isSole;
        const isActive = id === activeIslandId;
        const group = groupOf(id);
        const subs = parentId ? [] : subMapsOf(id);
        const open = expanded.includes(id);
        return (
          <div key={id} className={`island-row${parentId ? ' sub' : ''}`}>
          {/* The map's header: its name and icon buttons, and under the name
              its sub map button and its status. Settings, the new sub map
              form and the sub maps themselves open below it. */}
          <div className="island-header">
          <div className="player-row island-row-head">
            {subs.length > 0 ? (
              <button
                type="button"
                className="player-name island-expand"
                aria-expanded={open}
                title={open ? 'Hide its sub maps' : 'Show its sub maps'}
                onClick={() => toggleExpanded(id)}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M7 4l6 6-6 6" />
                </svg>
                {island.name}
                <span className="player-tag">
                  {subs.length} sub {subs.length === 1 ? 'map' : 'maps'}
                </span>
              </button>
            ) : (
              <span className="player-name">
                {island.name}
                {parentId && <span className="player-tag"> · sub map</span>}
              </span>
            )}
            {/* On the name's own line, far right: find it, download it, change it, remove it. */}
            <div className="island-row-icons">
              <button
                className={`btn btn-secondary btn-sm btn-icon ${isActive ? 'active' : ''}`}
                aria-label={group ? `Recenter on the ${group.name} group` : `Recenter on ${island.name}`}
                title={`${group ? 'Recenter the view on this group of maps' : 'Recenter the view on this map'}${isActive ? ' (the active map)' : ' and make it the active map'}`}
                onClick={() => {
                  onRecenterIsland(id);
                  onClose();
                }}
              >
                <Icon name="recenter" />
              </button>
              {onDownloadIslandImage && (
                <button
                  className="btn btn-secondary btn-sm btn-icon"
                  aria-label={group ? `Download the ${group.name} group as an image` : `Download ${island.name} as an image`}
                  onClick={() => onDownloadIslandImage(id)}
                  title={
                    group
                      ? `Download map: the whole ${group.name} group as one PNG (backgrounds + grid) to edit in an image editor, then upload it back in Settings`
                      : 'Download map: a PNG (background + grid) to edit in an image editor, then upload it back in Settings'
                  }
                >
                  <Icon name="mapdownload" />
                </button>
              )}
              {onUpdateIsland && (
                <button
                  className={`btn btn-secondary btn-sm btn-icon ${openId === id ? 'active' : ''}`}
                  aria-expanded={openId === id}
                  aria-label={`Settings for ${island.name}`}
                  onClick={() => setOpenId(openId === id ? null : id)}
                  title="Settings: name, size, background image and grid lines"
                >
                  <Icon name="config" />
                </button>
              )}
              <button
                className="btn btn-danger btn-sm btn-icon"
                disabled={isBase}
                aria-label={`Delete ${island.name}`}
                title={isBase ? 'The base map cannot be removed while other maps exist' : isSole ? 'Clear this map and start it fresh — a layer always needs at least one' : 'Delete this map'}
                onClick={() => onRemoveIsland(id)}
              >
                <Icon name="trash" />
              </button>
            </div>
          </div>
          <div className="island-row-actions">
              {!parentId && onCreateIsland && (
                <button
                  className={`btn btn-secondary btn-sm ${addingTo === id ? 'active' : ''}`}
                  aria-expanded={addingTo === id}
                  onClick={() => (addingTo === id ? closeAdding() : setAddingTo(id))}
                  title="Add a map that belongs to this one and moves with it"
                >
                  + Sub map
                </button>
              )}
              {parentId && onDetachIsland && (
                <button className="btn btn-secondary btn-sm" onClick={() => onDetachIsland(id)} title="Make this a map of its own again. It stays where it is.">
                  Detach
                </button>
              )}
          </div>
          {parentId ? (
            <span className="island-row-note">
              Sub map of <b>{islands[parentId].name}</b>. It moves with it and shares its conditions.
            </span>
          ) : group ? (
            // A parent's conditions stand for its sub maps too.
            onGroupConditions && (
              <>
                <ConditionPicker active={group.conditions || []} onChange={(keys) => onGroupConditions(group.id, keys)} />
                <span className="island-row-note">Conditions apply to this map and its sub maps.</span>
              </>
            )
          ) : (
            onIslandConditions && <ConditionPicker active={island.conditions || []} onChange={(keys) => onIslandConditions(id, keys)} />
          )}
          </div>
          {openId === id && onUpdateIsland && (
            <IslandSettings
              island={island}
              fallbackFeet={layerFeet}
              onPatch={(patch) => {
                onUpdateIsland(id, patch);
                // A group is one picture, so its maps share their grid lines.
                if ('gridLines' in patch && group) {
                  for (const memberId of group.islandIds) if (memberId !== id && islands[memberId]) onUpdateIsland(memberId, { gridLines: patch.gridLines });
                }
                // The group takes its parent's name.
                if (patch.name && group && !parentId) onRenameGroup?.(group.id, patch.name);
              }}
              onUploadBackground={(file) => onUploadBackground(id, file)}
              groupName={group?.name || null}
              onSaved={() => setOpenId(null)}
            />
          )}
          {addingTo === id &&
            newMapForm(`New sub map of ${island.name}`, 'Add sub map', 'It lands beside its parent and is grouped with it, so the two move together.')}
          {open && subs.length > 0 && <div className="island-subs">{subs.map((sub) => mapRow(sub, id))}</div>}
          </div>
        );
  };

  // + New map, and the form it unfolds into. In the Mapping drawer it is the
  // drawer's footer, in reach however long the list of maps is; in the
  // dialog it closes the list.
  const newMap =
    addingTo === 'new' ? (
      newMapForm('New map', 'Add map')
    ) : (
      <button
        className={`btn ${side ? 'btn-primary' : 'btn-secondary'} btn-block`}
        onClick={() => {
          closeAdding();
          setAddingTo('new');
        }}
        style={side ? undefined : { marginTop: 10 }}
      >
        + New map
      </button>
    );

  return (
    <ModalShell
      title={side ? 'Mapping' : 'World maps'}
      icon="islands"
      closeLabel={side ? 'Close Mapping' : 'Close world maps panel'}
      maxWidth={560}
      side={side}
      width={440}
      footer={side ? newMap : null}
      onClose={onClose}
    >
      {sideTabs}
      {parentIds.map((id) => mapRow(id))}

      {!side && newMap}
      <Hint className="hint-tight" action={onSwitchToEdit ? 'Switch to Edit' : null} onAction={onSwitchToEdit}>
        Switch to <b>Tools → Edit</b>, then drag a map by its background. Where edges touch, tokens walk across.
      </Hint>
    </ModalShell>
  );
}

// An island's own settings, opened from its row in the Islands dialog.
// Nothing here applies by itself: the fields and a newly picked background
// image are held until Save changes is pressed, and Discard puts the form
// back to the map as it is.
// `groupName`: the island is in a group, so a background image is spread
// over the whole group (uploadIslandBackground above).
// `onSaved`: called once Save changes has applied everything, so the dialog
// can fold the form away again.
function IslandSettings({ island, fallbackFeet = 5, onPatch, onUploadBackground, groupName = null, onSaved }) {
  const savedFeet = island.feetPerSquare || fallbackFeet;
  const [name, setName] = useState(island.name);
  const [cols, setCols] = useState(island.cols);
  const [rows, setRows] = useState(island.rows);
  const [feet, setFeet] = useState(savedFeet);
  const savedLines = normalizeGridLines(island.gridLines || {});
  const [lineStrength, setLineStrength] = useState(savedLines?.strength || 'light');
  const [lineColor, setLineColor] = useState(savedLines?.color || null);
  const lines = normalizeGridLines({ strength: lineStrength, color: lineColor });
  const linesChanged = JSON.stringify(lines) !== JSON.stringify(savedLines);
  const [pendingFile, setPendingFile] = useState(null); // a background image picked but not saved yet
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const dirty =
    name !== island.name ||
    String(cols) !== String(island.cols) ||
    String(rows) !== String(island.rows) ||
    String(feet) !== String(savedFeet) ||
    linesChanged ||
    Boolean(pendingFile);

  function discard() {
    setName(island.name);
    setCols(island.cols);
    setRows(island.rows);
    setFeet(savedFeet);
    setLineStrength(savedLines?.strength || 'light');
    setLineColor(savedLines?.color || null);
    setPendingFile(null);
  }

  async function save() {
    if (!dirty || saving) return;
    const nextName = name.trim() || 'Untitled Map';
    const c = clampGridDims(cols);
    const r = clampGridDims(rows);
    const f = clampFeetPerSquare(feet);
    setName(nextName);
    setCols(c);
    setRows(r);
    setFeet(f);
    const patch = {};
    if (nextName !== island.name) patch.name = nextName;
    if (c !== island.cols || r !== island.rows) Object.assign(patch, { cols: c, rows: r });
    if (f !== island.feetPerSquare) patch.feetPerSquare = f;
    if (Object.keys(patch).length) onPatch(patch);
    // On its own, so the rest still saves on a table whose database has no
    // grid_lines column yet (supabase/migrations 58).
    if (linesChanged) onPatch({ gridLines: lines });
    if (pendingFile) {
      setSaving(true);
      try {
        await onUploadBackground(pendingFile);
      } finally {
        setSaving(false);
        setPendingFile(null);
      }
    }
    onSaved?.();
  }

  const saveOnEnter = (e) => {
    if (e.key === 'Enter') save();
  };
  function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setPendingFile(file);
  }

  return (
    <div className="island-settings">
      <label className="field-label">Name</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={saveOnEnter} />
      <div className="field-row">
        <div>
          <label className="field-label">Width</label>
          <input className="field" type="number" value={cols} onChange={(e) => setCols(e.target.value)} onKeyDown={saveOnEnter} />
        </div>
        <div>
          <label className="field-label">Height</label>
          <input className="field" type="number" value={rows} onChange={(e) => setRows(e.target.value)} onKeyDown={saveOnEnter} />
        </div>
      </div>
      <label className="field-label">Feet per square</label>
      <input className="field" type="number" min="1" value={feet} onChange={(e) => setFeet(e.target.value)} onKeyDown={saveOnEnter} />
      <label className="field-label">Background image</label>
      <div className="field-row">
        <button className="btn btn-secondary" disabled={saving} onClick={() => fileRef.current?.click()}>
          {pendingFile ? 'Choose another image' : island.backgroundImage ? 'Replace image' : 'Upload image'}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickFile} />
      <label className="field-label grid-lines-label">Grid lines</label>
      <div className="grid-lines-row">
        <div className="side-tabs grid-lines-strength" role="group" aria-label="Grid line strength">
          {GRID_LINE_STRENGTHS.map((s) => (
            <button key={s.key} type="button" aria-pressed={lineStrength === s.key} className={lineStrength === s.key ? 'active' : ''} onClick={() => setLineStrength(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="grid-swatches" role="group" aria-label="Grid line colour">
          {GRID_LINE_COLORS.map((c) => (
            <button
              key={c.label}
              type="button"
              className={`grid-swatch${lineColor === c.value ? ' active' : ''}`}
              style={{ '--swatch': c.value || '#17140f' }}
              aria-pressed={lineColor === c.value}
              aria-label={c.label}
              title={c.label}
              onClick={() => setLineColor(c.value)}
            />
          ))}
          <label
            className={`grid-swatch custom${lineColor && !GRID_LINE_COLORS.some((c) => c.value === lineColor) ? ' active' : ''}`}
            style={lineColor && !GRID_LINE_COLORS.some((c) => c.value === lineColor) ? { '--swatch': lineColor } : undefined}
            title="Another colour"
          >
            <input type="color" aria-label="Another colour" value={lineColor || '#17140f'} onChange={(e) => setLineColor(e.target.value.toLowerCase())} />
          </label>
        </div>
      </div>
      <GridLinesPreview lines={lines} image={pendingFile ? null : resolveImage(island.backgroundImage)} />
      <span className="island-row-note">
        Heavier or coloured lines keep the grid readable over a background image.{groupName ? ' They are used for every map in the group.' : ''}
      </span>
      {groupName && (
        <span className="island-row-note">
          This map is in <b>{groupName}</b>, so an image is spread across every map in the group. Use <b>Download map</b> to get the group’s shape first.
        </span>
      )}
      {pendingFile && (
        <span className="island-row-note">
          New background: <b>{pendingFile.name}</b>. It is used once you save.
        </span>
      )}
      {dirty ? (
        <div className="field-row island-settings-confirm">
          <button className="btn btn-secondary" disabled={saving} onClick={discard}>
            Discard
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      ) : (
        <span className="island-row-note">Change anything above, then press Save changes. Nothing is applied until you do.</span>
      )}
    </div>
  );
}

// A strip of grid drawn the way the settings above would draw it, over the
// map's own background, since nothing reaches the map until Save changes.
function GridLinesPreview({ lines, image }) {
  const id = useId();
  const style = gridLineStyle({ gridLines: lines });
  const CELL = 26;
  return (
    <div className={`grid-preview${style.custom ? ' grid-custom' : ''}`} style={image ? { backgroundImage: `url(${image})` } : undefined} aria-hidden="true">
      <svg width="100%" height="100%">
        <defs>
          {/* Five squares to a tile, the lines kept off its edges so none is cut in half. */}
          <pattern id={id} width={CELL * 5} height={CELL * 5} patternUnits="userSpaceOnUse">
            {[0, 1, 2, 3, 4].map((i) => (
              <React.Fragment key={i}>
                <line x1={i * CELL + 13} y1={0} x2={i * CELL + 13} y2={CELL * 5} stroke={style.stroke} strokeWidth={i === 0 ? style.major : style.minor} />
                <line x1={0} y1={i * CELL + 13} x2={CELL * 5} y2={i * CELL + 13} stroke={style.stroke} strokeWidth={i === 0 ? style.major : style.minor} />
              </React.Fragment>
            ))}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
    </div>
  );
}

// DM-only: pick which hero and monster/NPC tokens on the current layer are
// in this encounter, then roll a d20 for each at once. The actual roll +
// per-entity `initiativeRoll`/`initiativeTurn` stamping (rendered as the
// boot badge on the token, see MapBoard.jsx) lives in GameView's
// rollInitiative — this component is just the picker + results readout.
// `side`: on the rail it stands in a drawer beside it instead of a dialog.
function InitiativeModal({ heroes, mobs, onRoll, encounterActive, onToggleEncounter, onClose, side = false }) {
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

  // Roll and Clear. In the drawer they are its footer, in reach however long
  // the list of fighters and the turn order above them grow.
  const rollRow = (
    <div style={{ display: 'flex', gap: 6, marginTop: side ? 0 : 12 }}>
      <button type="button" className="btn btn-primary btn-block" onClick={handleRoll} disabled={participantIds.length === 0}>
        🎲 Roll Initiative ({participantIds.length})
      </button>
      <button type="button" className="btn btn-danger" onClick={handleClear} title="Remove every initiative badge from the map">
        Clear
      </button>
    </div>
  );

  return (
    <ModalShell title="Roll for Initiative" icon="bolt" closeLabel="Close initiative roller" maxWidth={440} side={side} width={380} footer={side ? rollRow : null} onClose={onClose}>
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
                ? 'Nobody to roll for yet. Place heroes and monsters in this world first.'
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

          {!side && rollRow}

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
    </ModalShell>
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

