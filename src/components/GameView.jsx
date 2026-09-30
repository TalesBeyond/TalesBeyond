import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ModalIcon from './ModalIcon.jsx';
import { playDiceSound, playSfx, getSfxVolume, setSfxVolume, isDeviceMuted, setDeviceMuted } from '../lib/sfx.js';
import { emitFx, useFx, takeCrit } from '../lib/fx.js';
import { createEncounter, advanceEncounter, currentActorId, speedOf, reachableCells, feetMoved } from '../utils/encounter.js';
import { DEMO_MUSIC, ENCOUNTER_MUSIC, builtinTrackUrl, isBuiltinTrackUrl } from '../data/defaultAudio.js';
import { useGameState, useGameDispatch, createInitialLayer, createInitialIsland, previewAudioCascade, pruneAudio } from '../state/store.jsx';
import { generateEntityId, generateInviteCode, generatePlayerId } from '../utils/inviteCode.js';
import { DEFAULT_DRAW_STYLE, withRecentColour } from '../utils/drawing.js';
import { islandConditionKeys } from '../data/islandConditions.js';
import DrawingBar, { PhoneDrawBar, DrawClearMenu } from './DrawingBar.jsx';
import DrawStylePanel from './DrawStyle.jsx';
import { RollToasts, RollLog } from './RollFeed.jsx';
import { ModeBar, EmptyState } from './Hints.jsx';
import { migrateLegacyState } from '../state/migrate.js';
import { clampGridDims, clampFeetPerSquare, computeCanvasBounds, feetDistance, islandFeet } from '../utils/grid.js';
import { defaultCharacterSheet, normalizeEquipment, newEquipmentItem } from '../data/characterSheet.js';
import { defaultDroppablesFor } from '../data/droppables.js';
import { isHiddenTrap, clampTrapSize } from '../data/traps.js';
import { renderIslandTemplateToDataUrl } from '../utils/image.js';
import {
  saveSession,
  deleteSession,
  downloadSessionAsFile,
  downloadGuestSessionAsFile,
  downloadDataUrl,
  readEncodedJsonFromFile,
  saveIdentity,
  clearCurrentPointer,
  sessionExists,
  markGuestClean,
  loadLocalAudioVolumes,
  saveLocalAudioVolumes,
  loadDrawPrefs,
  loadRevealRolls,
  saveRevealRolls,
  saveDrawPrefs,
} from '../state/persistence.js';
import { isSupabaseConfigured } from '../lib/supabaseClient.js';
import { subscribeToTable } from '../lib/realtime.js';
import { subscribeToGuestTable } from '../lib/guestRealtime.js';
import {
  addLayerRemote,
  updateLayerRemote,
  removeLayerRemote,
  addIslandRemote,
  updateIslandRemote,
  removeIslandRemote,
  addEntityRemote,
  moveEntityRemote,
  updateEntityRemote,
  removeEntityRemote,
  hideTrapRemote,
  addCustomAssetRemote,
  removeCustomAssetRemote,
  upsertDrawingRemote,
  removeDrawingsRemote,
  updateTableClockRemote,
  upsertAudioTrackRemote,
  removeAudioTrackRemote,
  updateAudioPlaybackRemote,
  updateTableDayNightOverrideRemote,
  updateTableEncounterRemote,
  endEncounterTurnRemote,
  regenerateInviteCodeRemote,
  setTableOpenRemote,
  removePlayerRemote,
  setPlayerCurrentLayerRemote,
  fetchTableSnapshot,
} from '../lib/remoteApi.js';
import MapBoard from './MapBoard.jsx';
import TokenSidebar from './TokenSidebar.jsx';
import RightPanel from './RightPanel.jsx';
import Toolbar from './Toolbar.jsx';
import PanelResizer from './PanelResizer.jsx';
import ClockModal from './ClockModal.jsx';
import { useCatalog } from '../lib/catalog.js';
import { useDayPhase } from '../state/useGameClock.js';
import { withClockRunning } from '../utils/gameClock.js';
import MusicModal from './MusicModal.jsx';
import { LayerStrip, InitiativeBar, RulerReadout, ZoomControl } from './TableHud.jsx';
import {
  usePhoneLayout,
  PhoneTopBar,
  PhoneIslandStrip,
  PhoneMiniMap,
  PhoneIslandConditions,
  PhoneTokenCard,
  PhoneNav,
  PhoneSheet,
  PhoneGroupSheet,
  PhoneSwitch,
  PhoneLayersSheet,
  PhoneAtlas,
  PhoneMoveCard,
  PhoneTargetSheet,
  PhoneDoorSheet,
  PhoneChestSheet,
  PhonePlayerMenu,
  PhonePartySheet,
  PhoneEditBar,
} from './PhoneChrome.jsx';
import PhoneCreatureSheet from './PhoneCreatureSheet.jsx';
import { DoorInspector, TrapInspector } from './RightPanel.jsx';
import { PhoneRunTable, PhoneHostMenu } from './PhoneHostScreens.jsx';
import DiceModal from './DiceModal.jsx';
import { TurnOrderRibbon, EncounterActions, CombatLog } from './EncounterHud.jsx';
import BookTabs from './BookTabs.jsx';
import FxLayer from './FxLayer.jsx';
import { useTableAudio, defaultLoopFor } from '../lib/audioEngine.js';
import {
  uploadAudio,
  removeAudioFiles,
  validateAudioFile,
  localAudioFile,
  AUDIO_TABLE_QUOTA_BYTES,
} from '../lib/storageUpload.js';

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;
const STAGE_PADDING = 28; // .stage's padding in styles.css — the map canvas starts this far in

// REQ-001 Connection Recovery: a status flap shorter than this never
// surfaces anything (AC1). Resync-failure backoff schedule (AC4) — index
// clamps at the last entry, so every attempt past the 4th waits 30s.
const RECONNECT_GRACE_MS = 1500;
const RESYNC_BACKOFF_MS = [2000, 4000, 8000, 16000, 30000];

// Host-absence auto-end: once the host's Presence entry disappears — an
// explicit leave, a closed tab, or a crash — and stays gone past a short
// grace period (absorbing the host's own refresh/reconnect blips), every
// other connected player gets this long before their own session ends on
// its own (back to Landing). Each player's browser reaches this
// independently off the same Presence signal, so there's no single place
// that "ends all sessions" — they all just expire around the same time.
const HOST_ABSENCE_GRACE_MS = 5000;
const HOST_ABSENCE_END_MS = 3 * 60 * 1000;

// A host-only safety net alongside the manual Save button (Toolbar's
// Configurations menu) — periodically calls the same save path in case they
// forget. Meaningless in cloud mode (isRemote syncs every mutation as it
// happens; saveNow there just relabels the toolbar), but harmless there too.
const AUTOSAVE_INTERVAL_SECONDS = 15 * 60;

// A phone can zoom further out, so a whole island fits its narrow screen.
const PHONE_ZOOM_MIN = 0.2;
// Entering an encounter: the dice sound, then this long before the encounter music.
const ENCOUNTER_MUSIC_DELAY_MS = 2000;

function clampZoom(z, min = ZOOM_MIN) {
  return Math.min(ZOOM_MAX, Math.max(min, Math.round(z * 10) / 10));
}

function findFreeCell(entities, islandId, cols, rows) {
  const occupied = new Set(
    Object.values(entities)
      .filter((e) => e.islandId === islandId)
      .map((e) => `${e.col},${e.row}`)
  );
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!occupied.has(`${col},${row}`)) return { col, row };
    }
  }
  return { col: 0, row: 0 };
}

// Doors are bidirectional and independently placed per side: a door
// "belongs" to its layerId (using col/row there) but is also visible, at
// its own separate spot, on its targetLayerId (using targetCol/targetRow
// there — falling back to col/row if that side was never positioned). A
// door's target side isn't per-island — it always resolves onto the
// target layer's base island, regardless of which island the door's home
// side sits on. Every other entity kind stays scoped to its own layerId
// (and islandId) only. Returns a dict keyed by id, with col/row/islandId
// already resolved for viewing `layerId`.
// Where a hero lands after walking through a door: one square off the
// door itself, on whichever side is being entered — never standing on the
// door's own square. `doorEntity` must be the raw entity (state.entities[id]),
// not a view-resolved one (entitiesVisibleOnLayer overrides col/row/islandId
// for a door viewed from its target side, which would give the wrong "home
// side" position here). Falls back to the first free cell on that island if
// every orthogonal neighbor is occupied or off the grid.
function arrivalCellNearDoor(state, doorEntity, destinationLayerId) {
  const enteringTargetSide = destinationLayerId === doorEntity.targetLayerId;
  const islandId = enteringTargetSide ? state.layers[destinationLayerId]?.islandOrder[0] : doorEntity.islandId;
  const col = enteringTargetSide ? doorEntity.targetCol ?? doorEntity.col : doorEntity.col;
  const row = enteringTargetSide ? doorEntity.targetRow ?? doorEntity.row : doorEntity.row;
  const island = state.layers[destinationLayerId]?.islands[islandId];
  if (!island) return { islandId, col, row };

  const entitiesOnDestination = entitiesVisibleOnLayer(state, destinationLayerId, true);
  const occupied = new Set(
    Object.values(entitiesOnDestination)
      .filter((e) => e.islandId === islandId)
      .map((e) => `${e.col},${e.row}`)
  );
  const candidates = [
    { col, row: row + 1 },
    { col, row: row - 1 },
    { col: col + 1, row },
    { col: col - 1, row },
  ];
  for (const c of candidates) {
    if (c.col < 0 || c.row < 0 || c.col >= island.cols || c.row >= island.rows) continue;
    if (!occupied.has(`${c.col},${c.row}`)) return { islandId, col: c.col, row: c.row };
  }
  const free = findFreeCell(entitiesOnDestination, islandId, island.cols, island.rows);
  return { islandId, col: free.col, row: free.row };
}

function entitiesVisibleOnLayer(state, layerId, showHiddenTraps) {
  const result = {};
  const targetLayer = state.layers[layerId];
  const targetBaseIslandId = targetLayer?.islandOrder[0];
  for (const id of state.entityOrder) {
    const entity = state.entities[id];
    if (!entity) continue;
    // An unrevealed trap does not exist for anyone but the DM. In cloud mode
    // and guest mode a player's client never receives it at all (see
    // 20250101000028_traps.sql and toGuestBroadcastAction below); this is
    // the matching filter for local mode, where every tab shares one
    // localStorage copy of the table and nothing else can keep it apart.
    if (isHiddenTrap(entity) && !showHiddenTraps) continue;
    if (entity.layerId === layerId) {
      result[id] = entity;
    } else if (entity.kind === 'door' && entity.targetLayerId === layerId) {
      result[id] = {
        ...entity,
        islandId: targetBaseIslandId,
        col: entity.targetCol ?? entity.col,
        row: entity.targetRow ?? entity.row,
      };
    }
  }
  return result;
}

// The side panels can be dragged wider or narrower. The widths are a
// per-viewer convenience, so they live in this browser's localStorage and
// the game still works (at the defaults) if that is unavailable.
const PANEL_WIDTHS_KEY = 'hearthbound:panelwidths';
const DEFAULT_PANEL_WIDTHS = { left: 248, right: 344 };
const PANEL_MIN = 220;
const PANEL_MAX = 640;
const MAP_MIN_WIDTH = 360; // never let the panels squeeze the map below this
const COLLAPSED_PANEL_WIDTH = 36;
// Below this window width both side panels can't sit beside the map without
// crushing it, so they become drawers that slide over the map instead — one
// open at a time, both folded to their rails by default.
const DRAWER_LAYOUT_BELOW = 1200;

function loadPanelWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem(PANEL_WIDTHS_KEY));
    const left = Number(saved?.left);
    const right = Number(saved?.right);
    return {
      left: Number.isFinite(left) ? Math.min(PANEL_MAX, Math.max(PANEL_MIN, left)) : DEFAULT_PANEL_WIDTHS.left,
      right: Number.isFinite(right) ? Math.min(PANEL_MAX, Math.max(PANEL_MIN, right)) : DEFAULT_PANEL_WIDTHS.right,
    };
  } catch {
    return DEFAULT_PANEL_WIDTHS;
  }
}

// The widths a viewer *prefers* are stored as-is, but what is shown is fitted
// to the current window: if the two panels would leave the map narrower than
// MAP_MIN_WIDTH (a smaller window than the one they were sized in), they
// shrink together, proportionally, down to PANEL_MIN. The preference itself
// is untouched, so they spring back if the window grows again.
function fitPanelWidths(widths, viewport, leftCollapsed, rightCollapsed) {
  if (!viewport) return widths;
  const leftShown = leftCollapsed ? COLLAPSED_PANEL_WIDTH : widths.left;
  const rightShown = rightCollapsed ? COLLAPSED_PANEL_WIDTH : widths.right;
  const room = viewport - MAP_MIN_WIDTH;
  if (leftShown + rightShown <= room) return widths;
  const expanded = (leftCollapsed ? 0 : leftShown) + (rightCollapsed ? 0 : rightShown);
  const available = room - (leftCollapsed ? COLLAPSED_PANEL_WIDTH : 0) - (rightCollapsed ? COLLAPSED_PANEL_WIDTH : 0);
  const factor = Math.max(0, available) / expanded;
  return {
    left: Math.max(PANEL_MIN, Math.floor(widths.left * factor)),
    right: Math.max(PANEL_MIN, Math.floor(widths.right * factor)),
  };
}

// saveSession returns false (and only logs to console) when localStorage's
// quota is exceeded — usually from uncapped background/token image uploads
// piling up across tables in this browser. Surface that instead of letting
// the change vanish silently.
// REQ-008 Guest DM Sessions: a hero/mob's dmNotes must never reach a
// player's browser — entity_dm_data's host-only privacy in cloud mode
// comes from RLS on a real query, but a guest table has no server-side RLS
// to lean on, so the host's own client strips it at the point a broadcast
// leaves for players. The host's own local state (and localStorage
// autosave) keeps it; only outgoing broadcast payloads are filtered.
//
// Fields that live in entity_dm_data in cloud mode (host-only under RLS):
// none of them may reach a player over a guest table's broadcast either.
// (droppables was previously missing from this filter, so a guest table's
// players could read a monster's loot table; it is covered now.)
const DM_ONLY_KEYS = ['dmNotes', 'droppables', 'mobSheet'];

function withoutDmOnlyKeys(obj) {
  if (!obj || !DM_ONLY_KEYS.some((key) => obj[key] !== undefined)) return obj;
  const copy = { ...obj };
  for (const key of DM_ONLY_KEYS) delete copy[key];
  return copy;
}

// The same filter keeps an unrevealed trap off a guest table's wire. To
// players a trap does not exist until revealed, so revealing one is sent as
// an ADD_ENTITY, hiding it again as a REMOVE_ENTITY, and anything that
// touches a still-hidden trap (moves, edits, its own removal) is not sent
// at all. `prevState` is the state from *before* the action was applied,
// which is what stateRef holds at every call site (they dispatch and then
// broadcast within the same event, before React re-renders).
//
// Returns the action to broadcast, or null when nothing should go out.
function toGuestBroadcastAction(action, prevState) {
  switch (action.type) {
    case 'ADD_ENTITY': {
      if (isHiddenTrap(action.entity)) return null;
      return { ...action, entity: withoutDmOnlyKeys(action.entity) };
    }
    case 'UPDATE_ENTITY': {
      const before = prevState.entities[action.id];
      if (before?.kind === 'trap') {
        const after = { ...before, ...action.patch };
        const wasHidden = isHiddenTrap(before);
        const nowHidden = isHiddenTrap(after);
        if (wasHidden && nowHidden) return null;
        if (wasHidden) return { type: 'ADD_ENTITY', entity: after };
        if (nowHidden) return { type: 'REMOVE_ENTITY', id: action.id };
      }
      const patch = withoutDmOnlyKeys(action.patch);
      if (patch === action.patch) return action;
      // A patch that was nothing but DM-only fields has nothing left to say.
      return Object.keys(patch).length === 0 ? null : { ...action, patch };
    }
    case 'MOVE_ENTITY':
    case 'REMOVE_ENTITY':
      return isHiddenTrap(prevState.entities[action.id]) ? null : action;
    default:
      return action;
  }
}

function toGuestSnapshot(fullState) {
  const entities = {};
  for (const [id, entity] of Object.entries(fullState.entities)) {
    if (isHiddenTrap(entity)) continue;
    entities[id] = withoutDmOnlyKeys(entity);
  }
  // A guest DM's audio never leaves their browser (files are local blob URLs
  // only the DM can play), so players get no tracks and no playback.
  const audio = { tracks: {}, trackOrder: [], playback: { nowPlaying: null, resume: {} } };
  return { ...fullState, entities, entityOrder: fullState.entityOrder.filter((id) => entities[id]), audio };
}

function saveOrWarn(code, nextState) {
  const ok = saveSession(code, nextState);
  if (!ok) {
    alert(
      'Could not save — your browser storage is full. Try removing a background image or some custom-uploaded token art, or use Export .bmp to back up this table.'
    );
  }
  return ok;
}

export default function GameView({ me, mode, onLeave, onCodeRotated, theme, onThemeChange }) {
  const state = useGameState();
  const dispatch = useGameDispatch();
  const [tool, setTool] = useState('play');
  const [selectedId, setSelectedId] = useState(null);
  const [savedAgo, setSavedAgo] = useState(mode === 'remote' ? 'Synced to the cloud' : 'Saved just now');
  const [autosaveSecondsLeft, setAutosaveSecondsLeft] = useState(AUTOSAVE_INTERVAL_SECONDS);
  const [pendingDoor, setPendingDoor] = useState(null);
  // REQ-008: whether this guest DM has exported at least once since opening
  // this table — purely in-memory, per-mount (not the localStorage clean
  // marker Slice 4 adds), just enough to warn on Leave if they haven't.
  const [hasExportedGuestTable, setHasExportedGuestTable] = useState(false);
  const [pendingLeaveWarning, setPendingLeaveWarning] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(() => window.innerWidth < DRAWER_LAYOUT_BELOW);
  const [rightCollapsed, setRightCollapsed] = useState(() => window.innerWidth < DRAWER_LAYOUT_BELOW);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [panelWidths, setPanelWidths] = useState(loadPanelWidths);
  const [showClockModal, setShowClockModal] = useState(false);
  // Only changes when the day/night phase does, so the map can react to dusk
  // arriving without this whole screen re-rendering every second.
  const clockPhase = useDayPhase(state.clock);
  // The phase the table is actually in: the DM's manual choice if they made
  // one, otherwise whatever the clock's cycle says.
  const tablePhase = state.dayNightOverride ?? clockPhase;
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    function onWindowResize() {
      setViewportWidth(window.innerWidth);
    }
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, []);

  const drawerLayout = viewportWidth < DRAWER_LAYOUT_BELOW;

  // Crossing the breakpoint resets the panels to that layout's default:
  // folded to rails as drawers, both open side by side on a wide window.
  useEffect(() => {
    setLeftCollapsed(drawerLayout);
    setRightCollapsed(drawerLayout);
  }, [drawerLayout]);

  // As drawers, opening one folds the other so they never stack over the map.
  function togglePanel(side) {
    const opening = side === 'left' ? leftCollapsed : rightCollapsed;
    (side === 'left' ? setLeftCollapsed : setRightCollapsed)(!opening);
    if (opening && drawerLayout) (side === 'left' ? setRightCollapsed : setLeftCollapsed)(true);
  }

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_WIDTHS_KEY, JSON.stringify(panelWidths));
    } catch {
      // storage blocked or full - the sizes just won't be remembered
    }
  }, [panelWidths]);

  // Clamp a requested width to [PANEL_MIN, PANEL_MAX] and to whatever leaves
  // the map at least MAP_MIN_WIDTH given the other panel's current width.
  function resizePanel(side, requested) {
    setPanelWidths((prev) => {
      const otherCollapsed = side === 'left' ? rightCollapsed : leftCollapsed;
      const shown = fitPanelWidths(prev, window.innerWidth, leftCollapsed, rightCollapsed);
      const otherWidth = otherCollapsed ? COLLAPSED_PANEL_WIDTH : shown[side === 'left' ? 'right' : 'left'];
      const room = window.innerWidth - otherWidth - MAP_MIN_WIDTH;
      const max = Math.max(PANEL_MIN, Math.min(PANEL_MAX, room));
      const next = Math.round(Math.min(max, Math.max(PANEL_MIN, requested)));
      return next === prev[side] ? prev : { ...prev, [side]: next };
    });
  }
  // View-only, per-viewer preference — never shared/persisted, so the host
  // and every player can each zoom their own view of the map independently.
  const [zoom, setZoom] = useState(1);
  // REQ-001: ephemeral, per-browser reconnect UI state — never persisted,
  // never part of the reducer's shared `state`.
  const [reconnectUi, setReconnectUi] = useState({ blocked: false, resyncFailed: 0 });

  const isHost = me.id === state.session.hostPlayerId;
  const isRemote = mode === 'remote' && isSupabaseConfigured;
  // REQ-008 Guest DM Sessions: a table with live remote sync but no
  // Postgres row anywhere — see guestRealtime.js. Requires Supabase (for
  // Realtime) exactly like 'remote' does, but never calls remoteApi.js.
  const isGuest = mode === 'guest' && isSupabaseConfigured;
  const isGuestHost = isGuest && isHost;

  // Host-absence auto-end (see HOST_ABSENCE_* above) — { endAt } once the
  // countdown is actually running (for the banner), else null. The timers
  // themselves are closure-scoped refs, not state, for the same reason
  // reconnectUi's grace/backoff timers are: they must outlive renders and
  // get mutated from a Presence callback that isn't triggered by React.
  const [hostAbsentBanner, setHostAbsentBanner] = useState(null);
  const hostAbsentTimersRef = useRef({ graceTimer: null, endTimer: null });
  // Whether the host was in the channel at the last presence sync, so a
  // player can tell when the host (re)appears.
  const hostSeenRef = useRef(false);

  function handleHostPresenceChange(hostPresent) {
    const timers = hostAbsentTimersRef.current;
    // The host just showed up (this player opened the table first, or the
    // host reloaded): anything asked for before went unanswered, so ask
    // for the table as it is now.
    if (hostPresent && !hostSeenRef.current) guestChannelRef.current?.sendStateRequest(me.id);
    hostSeenRef.current = hostPresent;
    if (hostPresent) {
      if (timers.graceTimer) clearTimeout(timers.graceTimer);
      if (timers.endTimer) clearTimeout(timers.endTimer);
      timers.graceTimer = null;
      timers.endTimer = null;
      setHostAbsentBanner(null);
      return;
    }
    if (timers.graceTimer || timers.endTimer) return; // already waiting on this absence
    timers.graceTimer = setTimeout(() => {
      timers.graceTimer = null;
      const endAt = Date.now() + HOST_ABSENCE_END_MS;
      setHostAbsentBanner({ endAt });
      timers.endTimer = setTimeout(() => {
        timers.endTimer = null;
        clearCurrentPointer();
        onLeave();
      }, HOST_ABSENCE_END_MS);
    }, HOST_ABSENCE_GRACE_MS);
  }

  useEffect(() => {
    return () => {
      const timers = hostAbsentTimersRef.current;
      if (timers.graceTimer) clearTimeout(timers.graceTimer);
      if (timers.endTimer) clearTimeout(timers.endTimer);
    };
  }, []);

  // Ticks once a second only while the banner is up, purely to recompute
  // the mm:ss countdown text below — the actual end-of-session action is
  // the setTimeout above, not this render loop.
  const [hostAbsentNow, setHostAbsentNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hostAbsentBanner) return undefined;
    const id = setInterval(() => setHostAbsentNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hostAbsentBanner]);
  const hostAbsentSecondsLeft = hostAbsentBanner ? Math.max(0, Math.ceil((hostAbsentBanner.endAt - hostAbsentNow) / 1000)) : 0;

  const baseLayerId = state.layerOrder[0];
  const [hostViewLayerId, setHostViewLayerId] = useState(baseLayerId);
  const [rulerFeet, setRulerFeet] = useState(null); // live distance from MapBoard's ruler, for the HUD readout
  const currentLayerId = isHost ? hostViewLayerId : state.players[me.id]?.currentLayerId || baseLayerId;
  const currentLayer = state.layers[currentLayerId] || state.layers[baseLayerId];

  // REQ-009 Synced Table Audio. Cloud tables sync audio through Storage. A
  // guest DM keeps their files on their own device only (nothing is uploaded
  // anywhere, so players hear nothing); guest players and local demo tables
  // have no audio, and there the Music button is disabled.
  const audioEnabled = isRemote || isGuestHost;
  const audioScope = isRemote ? state.session.tableId : state.session.code;
  const [showMusicModal, setShowMusicModal] = useState(false);
  // This browser's volume for the encounter theme (set in the Music modal).
  const [encounterMusicVolume, setEncounterMusicVolume] = useState(() => getSfxVolume(ENCOUNTER_MUSIC.id));
  // Entering an encounter: the dice rattle for everyone at the table, then
  // the encounter theme 2 s later. Ending it stops the theme at once.
  const encounterActive = Boolean(state.encounter);
  const [encounterMusicOn, setEncounterMusicOn] = useState(encounterActive);
  const encounterActiveRef = useRef(encounterActive);
  useEffect(() => {
    const was = encounterActiveRef.current;
    encounterActiveRef.current = encounterActive;
    if (encounterActive && !was) playDiceSound();
  }, [encounterActive]);
  useEffect(() => {
    if (!encounterActive) {
      setEncounterMusicOn(false);
      return undefined;
    }
    if (encounterMusicOn) return undefined;
    const timer = setTimeout(() => setEncounterMusicOn(true), ENCOUNTER_MUSIC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [encounterActive, encounterMusicOn]);
  // Each player's own level per track — this browser only.
  const [localAudioVolumes, setLocalAudioVolumes] = useState(() => loadLocalAudioVolumes(audioScope));
  // "Mute on this device" (phone table menu): silences table music and effects here only.
  const [deviceMuted, setDeviceMutedState] = useState(isDeviceMuted);
  function toggleDeviceMuted(next) {
    setDeviceMuted(next);
    setDeviceMutedState(next);
  }
  // The dice roll log and saved dice sets, shared by the toolbar's Dice popover and the phone dice screen.
  const [diceRolls, setDiceRolls] = useState([]);
  const [diceSaved, setDiceSaved] = useState([]);
  const diceApi = {
    saved: diceSaved,
    rolls: diceRolls,
    onRoll: (roll) => setDiceRolls((prev) => [roll, ...prev].slice(0, 50)),
    onClearRolls: () => setDiceRolls([]),
    onSave: (entry) => setDiceSaved((prev) => [...prev, entry]),
    onRemoveSaved: (id) => setDiceSaved((prev) => prev.filter((x) => x.id !== id)),
  };
  const { blocked: audioBlocked, unlock: unlockAudio, expired: expiredAudio } = useTableAudio({
    enabled: audioEnabled,
    playback: state.audio?.playback,
    tracks: state.audio?.tracks,
    currentLayerId,
    layers: state.layers,
    localVolumes: localAudioVolumes,
    checkFiles: isGuest,
    // The encounter's own theme, for everyone at the table while a fight runs.
    override: state.encounter && encounterMusicOn ? { url: ENCOUNTER_MUSIC.url, volume: encounterMusicVolume } : null,
    muted: deviceMuted,
  });

  // Which island new tokens/doors get placed onto, and which island is
  // highlighted for editing — a local viewing choice (like hostViewLayerId),
  // set by clicking an island's background on the map. Falls back to the
  // current layer's base island whenever the layer changes or the active
  // island stops existing (e.g. it was just deleted).
  const [activeIslandId, setActiveIslandId] = useState(currentLayer.islandOrder[0]);
  useEffect(() => {
    if (!currentLayer.islands[activeIslandId]) setActiveIslandId(currentLayer.islandOrder[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLayerId, currentLayer.islandOrder]);

  // Island ids the host has clicked so far while the 'group' tool is
  // active — cleared on confirm/cancel, and whenever the tool changes away
  // from 'group' (see the effect below).
  const [pendingGroupIslandIds, setPendingGroupIslandIds] = useState([]);
  useEffect(() => {
    if (tool !== 'group') setPendingGroupIslandIds([]);
  }, [tool]);

  // The map canvas is padded well beyond the islands themselves (see
  // computeCanvasBounds) so panning never hits an edge — which means the
  // scroll position has to be deliberately centered on an island rather
  // than defaulting to (0,0), or a fresh view would just show empty
  // padding. `stageRef` lets both the auto-recenter-on-layer-switch effect
  // below and the toolbar's Recenter card scroll the actual DOM element.
  const stageRef = useRef(null);
  function recenterOnIsland(islandId) {
    const stage = stageRef.current;
    const island = currentLayer.islands[islandId];
    if (!stage || !island) return;
    const { originX, originY } = computeCanvasBounds(currentLayer.islands);
    // The canvas sits STAGE_PADDING in from the stage's scroll origin.
    const centerX = (island.x - originX + (island.cols * island.cellSize) / 2) * zoom + STAGE_PADDING;
    const centerY = (island.y - originY + (island.rows * island.cellSize) / 2) * zoom + STAGE_PADDING;
    stage.scrollLeft = centerX - stage.clientWidth / 2;
    stage.scrollTop = centerY - stage.clientHeight / 2;
  }
  useEffect(() => {
    recenterOnIsland(currentLayer.islandOrder[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLayerId]);

  // A newly created island lands past every existing island's rightmost
  // edge — often well outside the current viewport — so createIsland flags
  // it here rather than recentering immediately: the island doesn't exist
  // in `currentLayer.islands` yet within that same call, only once the
  // dispatch above has actually rendered.
  const pendingRecenterIslandIdRef = useRef(null);
  useEffect(() => {
    const pendingId = pendingRecenterIslandIdRef.current;
    if (pendingId && currentLayer.islands[pendingId]) {
      recenterOnIsland(pendingId);
      pendingRecenterIslandIdRef.current = null;
    }
  });

  const layerEntities = entitiesVisibleOnLayer(state, currentLayerId, isHost);
  const layerEntityOrder = state.entityOrder.filter((id) => layerEntities[id]);

  const layerPlayerCounts = {};
  for (const id of state.layerOrder) layerPlayerCounts[id] = 0;
  for (const player of Object.values(state.players)) {
    const layerId = player.currentLayerId || baseLayerId;
    layerPlayerCounts[layerId] = (layerPlayerCounts[layerId] || 0) + 1;
  }

  const selectedEntity = selectedId ? layerEntities[selectedId] : null;

  // ---- Encounter (utils/encounter.js) ----
  // Whose turn it is and how far they can still walk. Everyone sees the
  // same encounter; only the DM and the acting hero's owner can end a turn.
  const encounter = state.encounter || null;
  const actorId = currentActorId(encounter);
  const actor = actorId ? state.entities[actorId] || null : null;
  const isMyTurn = Boolean(actor && actor.kind === 'hero' && actor.ownerId === me.id);
  const canEndTurn = Boolean(encounter && actor && (isHost || isMyTurn));
  let moveRange = null;
  let movement = null;
  if (encounter && actor) {
    const speed = speedOf(actor);
    const start = encounter.turnStart?.id === actor.id ? encounter.turnStart : null;
    if (start && actor.layerId === currentLayerId) {
      moveRange = {
        islandId: start.islandId,
        cells: reachableCells(currentLayer.islands[start.islandId], start, speed, islandFeet(currentLayer, start.islandId)),
      };
    }
    const actorLayer = state.layers[actor.layerId] || currentLayer;
    const moved = feetMoved(encounter, actor, islandFeet(actorLayer, actor.islandId));
    movement = { total: speed, left: moved == null ? 0 : Math.max(0, speed - moved) };
  }

  // Every hero token across every layer — the Buy/Give compendium controls
  // need to reach a hero regardless of which layer the host is currently
  // viewing.
  const heroes = Object.values(state.entities)
    .filter((e) => e.kind === 'hero')
    .map((e) => ({ ...e, ownerName: state.players[e.ownerId]?.name }));

  // Roll for Initiative's participant pools — unlike `heroes` above, scoped
  // to whatever the host is currently looking at: an encounter roll is for
  // the scene in front of them, not every hero/monster across every layer.
  // There's no separate "NPC" kind in this app (see mob), so a "monster or
  // NPC" token is just any mob-kind entity — a DM already renames/reskins
  // one for either purpose via Asset Storage.
  const initiativeHeroes = Object.values(layerEntities).filter((e) => e.kind === 'hero');
  const initiativeMobs = Object.values(layerEntities).filter((e) => e.kind === 'mob');

  // In cloud mode, subscribe to live changes from every other connected
  // browser for as long as this screen is mounted (SPEC.md §9.5). One
  // channel per table for its whole lifetime — Realtime Roadmap §2.3; a
  // reconnect feature is exactly the kind of addition that could tempt
  // opening a second one, so don't.
  //
  // REQ-001 Connection Recovery also rides this same channel's status
  // callback: a drop that outlasts the grace period blocks the screen
  // (`reconnectUi.blocked`) until a fresh snapshot lands, retrying the
  // snapshot fetch with backoff if it fails. All of this is local closure
  // state (not React state) because it's mutated from a callback that
  // outlives any single render — `reconnectUi` only mirrors it for display.
  useEffect(() => {
    if (!isRemote || !state.session.tableId) return undefined;
    const tableId = state.session.tableId;

    let graceTimer = null;
    let backoffTimer = null;
    let blocked = false;
    let resyncSeq = 0;
    // Establishing the very first connection can itself flap through
    // TIMED_OUT/CHANNEL_ERROR before ever reaching SUBSCRIBED (slow initial
    // handshake, not a drop) — none of that counts as "disconnected" until
    // there's been a real connection to drop in the first place.
    let hasConnectedOnce = false;

    async function runResync() {
      const seq = ++resyncSeq;
      if (backoffTimer) {
        clearTimeout(backoffTimer);
        backoffTimer = null;
      }
      try {
        const snapshot = await fetchTableSnapshot(tableId);
        if (seq !== resyncSeq) return; // superseded by a newer drop/recovery
        dispatch({ type: 'HYDRATE', state: snapshot });
        blocked = false;
        setReconnectUi({ blocked: false, resyncFailed: 0 });
      } catch (err) {
        if (seq !== resyncSeq) return;
        reportError(err);
        setReconnectUi((prev) => {
          const resyncFailed = prev.resyncFailed + 1;
          const delay = RESYNC_BACKOFF_MS[Math.min(resyncFailed - 1, RESYNC_BACKOFF_MS.length - 1)];
          backoffTimer = setTimeout(runResync, delay);
          return { blocked: true, resyncFailed };
        });
      }
    }

    function handleStatusChange(status, isInitialJoin) {
      if (status === 'SUBSCRIBED') {
        hasConnectedOnce = true;
        if (isInitialJoin) {
          // A fresh channel for this effect run is up — any blocked scrim
          // still showing belongs to a stale run (e.g. `tableId` changed
          // without unmounting GameView) and no longer applies.
          setReconnectUi({ blocked: false, resyncFailed: 0 });
          return;
        }
        if (graceTimer) {
          // Recovered before the grace period elapsed — just a blip,
          // never surfaced (AC1).
          clearTimeout(graceTimer);
          graceTimer = null;
          return;
        }
        if (blocked) runResync(); // a real drop had already surfaced — resync before unblocking (AC3)
        return;
      }
      // TIMED_OUT / CLOSED / CHANNEL_ERROR
      if (!hasConnectedOnce) return; // still establishing the first-ever connection, not a drop
      if (blocked || graceTimer) return; // already surfaced, or already waiting out the grace period
      graceTimer = setTimeout(() => {
        graceTimer = null;
        blocked = true;
        setReconnectUi({ blocked: true, resyncFailed: 0 });
      }, RECONNECT_GRACE_MS);
    }

    const unsubscribe = subscribeToTable(
      tableId,
      dispatch,
      handleStatusChange,
      {
        isHost,
        onHostPresenceChange: isHost ? undefined : handleHostPresenceChange,
      },
      (roll) => receiveRollRef.current(roll)
    );
    tableChannelRef.current = { sendRoll: unsubscribe.sendRoll };
    return () => {
      tableChannelRef.current = null;
      if (graceTimer) clearTimeout(graceTimer);
      if (backoffTimer) clearTimeout(backoffTimer);
      unsubscribe();
      setReconnectUi({ blocked: false, resyncFailed: 0 });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRemote, state.session.tableId]);

  // Always-current snapshot for the unload handler below — closing a tab
  // doesn't reliably let React re-run effects, so this can't rely on `state`
  // from a stale render.
  const stateRef = useRef(state);
  stateRef.current = state;

  // ---- Game-feel moments (lib/fx.js, drawn by MapBoard and FxLayer) ----

  // The combat log: this browser's own rolls and attacks, plus every HP
  // change and turn change it sees (those come from synced state, so every
  // player's log agrees on them).
  const [combatLog, setCombatLog] = useState([]);

  // ---- Dice rolls at the table (RollFeed.jsx) ----
  // Players roll in the open: every roll a player makes is announced to the
  // whole table. The DM's own rolls stay on the DM's screen unless they turn
  // on "Reveal rolls to players" (this browser's choice — only the DM's
  // client ever decides to send them). Rolls travel live over the table's
  // channel and are never stored.
  const [revealRolls, setRevealRollsState] = useState(() => loadRevealRolls());
  function setRevealRolls(next) {
    setRevealRollsState(next);
    saveRevealRolls(next);
  }
  const [rollLog, setRollLog] = useState([]);
  const [rollToasts, setRollToasts] = useState([]);
  const tableChannelRef = useRef(null); // cloud: { sendRoll }
  function addRoll(entry) {
    setRollLog((prev) => [entry, ...prev].slice(0, 100));
    if (entry.mine) return;
    setRollToasts((prev) => [entry, ...prev].slice(0, 3));
    setTimeout(() => setRollToasts((prev) => prev.filter((t) => t.id !== entry.id)), 6000);
  }
  function receiveRoll(roll) {
    if (!roll || roll.byId === me.id) return;
    addRoll({ ...roll, mine: false, hidden: false });
  }
  // The channels are opened in effects that outlive a render; they call the
  // latest receiver through this.
  const receiveRollRef = useRef(receiveRoll);
  receiveRollRef.current = receiveRoll;
  // Who sees a roll made in this browser (DiceModal's note).
  const rollShare = isHost ? (revealRolls ? 'revealed' : 'hidden') : isRemote || isGuest ? 'table' : 'local';
  useFx((event) => {
    if (event.type !== 'rolled') return;
    const player = stateRef.current.players[me.id];
    const hidden = isHost && !revealRolls;
    const roll = {
      id: `${me.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      byId: me.id,
      name: player?.name || 'Someone',
      color: player?.color || null,
      isDm: isHost,
      what: event.what || null,
      dice: event.dice || '',
      detail: event.detail || '',
      total: event.total,
      flag: event.flag || null,
    };
    addRoll({ ...roll, mine: true, hidden });
    if (hidden) return;
    if (isRemote) tableChannelRef.current?.sendRoll(roll);
    else if (isGuest) guestChannelRef.current?.sendRoll(roll);
  });
  const [chronicleOpen, setChronicleOpen] = useState(false); // Grimoire's Chronicle tab (BookTabs.jsx)
  const logSeq = useRef(0);
  useFx((event) => {
    if (event.type !== 'log') return;
    const entry = { id: ++logSeq.current, text: event.text, tone: event.tone };
    setCombatLog((prev) => [entry, ...prev].slice(0, 80));
  });

  // Hit numbers and loot reveals, derived from what changed in synced state
  // rather than from who changed it, so every client shows the same blow.
  // An HP change is settled for a moment before it's shown, so typing a new
  // value into the HP field reads as one change, not one per keystroke.
  const seenEntitiesRef = useRef(null);
  const pendingHpRef = useRef({});
  useEffect(() => {
    const prev = seenEntitiesRef.current;
    const seen = {};
    // Temporary HP counts: a blow they soak up still shows its damage number.
    const life = (e) => (typeof e.hp === 'number' ? e.hp + (e.tempHp || 0) : e.hp);
    for (const e of Object.values(state.entities)) seen[e.id] = { hp: life(e), opened: e.opened };
    seenEntitiesRef.current = seen;
    if (!prev) return;
    for (const e of Object.values(state.entities)) {
      const before = prev[e.id];
      if (!before) continue;
      if (e.kind !== 'door' && e.maxHp && typeof before.hp === 'number' && typeof e.hp === 'number' && life(e) !== before.hp) {
        const pending = pendingHpRef.current[e.id] || { baseHp: before.hp };
        clearTimeout(pending.timer);
        pending.timer = setTimeout(() => {
          delete pendingHpRef.current[e.id];
          const now = stateRef.current.entities[e.id];
          if (!now || typeof now.hp !== 'number') return;
          const delta = life(now) - pending.baseHp;
          if (!delta) return;
          if (delta < 0) {
            emitFx({ type: 'float', entityId: e.id, kind: takeCrit(e.id) ? 'crit' : 'dmg', amount: -delta });
            emitFx({ type: 'log', tone: 'hit', text: `${now.name} took ${-delta} damage (${now.hp}/${now.maxHp})` });
          } else {
            emitFx({ type: 'float', entityId: e.id, kind: 'heal', amount: delta });
            emitFx({ type: 'log', tone: 'heal', text: `${now.name} healed ${delta} (${now.hp}/${now.maxHp})` });
          }
        }, 450);
        pendingHpRef.current[e.id] = pending;
      }
      if (e.kind === 'chest' && before.opened === false && e.opened === true && e.layerId === currentLayerId) {
        emitFx({ type: 'loot', title: e.name || 'Chest', items: e.items || [] });
      }
    }
  }, [state.entities, currentLayerId]);
  useEffect(() => () => Object.values(pendingHpRef.current).forEach((p) => clearTimeout(p.timer)), []);

  // The turn banner, once per new turn (not on first load — joining a fight
  // already in progress shouldn't replay it).
  const turnKey = encounter ? `${encounter.round}:${encounter.turn}` : null;
  const lastTurnKeyRef = useRef(undefined);
  useEffect(() => {
    const prevKey = lastTurnKeyRef.current;
    lastTurnKeyRef.current = turnKey;
    if (prevKey === undefined || turnKey === prevKey) return;
    if (!turnKey) {
      emitFx({ type: 'log', tone: 'turn', text: 'The encounter ended' });
      return;
    }
    if (!actor) return;
    const mine = actor.kind === 'hero' && actor.ownerId === me.id;
    emitFx({
      type: 'banner',
      title: mine ? 'Your Turn' : `${actor.name}'s Turn`,
      sub: `Round ${encounter.round} · ${speedOf(actor)} ft to move`,
      tone: mine ? 'mine' : actor.kind === 'mob' ? 'enemy' : 'ally',
    });
    emitFx({ type: 'log', tone: 'turn', text: `Round ${encounter.round}: ${actor.name}'s turn` });
    playSfx('turn');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey]);

  // REQ-008 Guest DM Sessions: the guest channel's send methods, stashed in
  // a ref so moveEntity (and, as later slices extend this, every other
  // mutation) can reach them without this subscription effect re-running on
  // every render — mirrors why isRemote's effect above only depends on
  // [isRemote, tableId], not on `state`.
  const guestChannelRef = useRef(null);

  useEffect(() => {
    if (!isGuest) return undefined;
    const code = state.session.code;

    function applyAndBroadcast(action) {
      const safe = toGuestBroadcastAction(action, stateRef.current);
      dispatch(action);
      if (safe) guestChannelRef.current?.sendStateChange(safe);
    }

    // Host-side validation of a player's proposed action — mirrors
    // canMoveEntity/canUpdateEntity below, but checked against the
    // sender's id rather than `me.id` (which is always the host's own id
    // in this handler, so their `isHost` shortcuts can't be reused here
    // without also trusting whatever the player claims).
    function applyValidatedIntent(action, senderId) {
      if (action.type === 'MOVE_ENTITY') {
        const entity = stateRef.current.entities[action.id];
        if (!entity || entity.kind !== 'hero' || entity.ownerId !== senderId) return;
        applyAndBroadcast(action);
      } else if (action.type === 'UPDATE_ENTITY') {
        const entity = stateRef.current.entities[action.id];
        if (!canPlayerUpdateEntity(entity, action.patch || {}, senderId)) return;
        applyAndBroadcast(action);
      } else if (action.type === 'PATCH_PLAYER') {
        // A player may only patch their own record, and only the field
        // door-walking touches (see confirmEnterDoor) — never impersonate
        // another player or change something else via this path.
        if (action.id !== senderId) return;
        if (!Object.keys(action.patch || {}).every((key) => key === 'currentLayerId')) return;
        applyAndBroadcast(action);
      } else if (action.type === 'REMOVE_PLAYER') {
        // Self-removal only (leaving the table) — never remove someone else.
        if (action.id !== senderId) return;
        applyAndBroadcast(action);
      } else if (action.type === 'END_TURN') {
        // A player may only end the turn of a hero they own, and only the
        // current one — the host works out who is next, not the sender.
        const current = stateRef.current.encounter;
        const acting = stateRef.current.entities[currentActorId(current)];
        if (!acting || acting.kind !== 'hero' || acting.ownerId !== senderId) return;
        applyAndBroadcast({ type: 'SET_ENCOUNTER', encounter: advanceEncounter(current, stateRef.current.entities) });
      }
    }

    // Host-side: seat a newly joining guest player. There's no join_table
    // RPC to do this for a guest table (REQ-008 Constraints) — the host's
    // own client assigns the id, adds them to the roster, and answers with
    // a full snapshot the same shape fetchTableSnapshot would return.
    function handlePlayerJoin({ requestId, name, color }) {
      const id = generatePlayerId();
      const player = {
        id,
        name,
        color,
        isHost: false,
        connected: true,
        joinedAt: Date.now(),
        currentLayerId: stateRef.current.layerOrder[0],
      };
      dispatch({ type: 'ADD_PLAYER', player });
      const snapshot = toGuestSnapshot({ ...stateRef.current, players: { ...stateRef.current.players, [id]: player } });
      guestChannelRef.current?.sendJoinAck(requestId, id, snapshot);
      guestChannelRef.current?.sendStateChange({ type: 'ADD_PLAYER', player });
    }

    // Host-side: answer a reconnecting player's request for a fresh
    // snapshot. Unlike handlePlayerJoin, nothing new is allocated — the
    // requester already has a playerId from before the drop.
    function handleStateRequest(requesterId) {
      guestChannelRef.current?.sendStateSnapshot(requesterId, toGuestSnapshot(stateRef.current));
    }

    // Player-side only: every time the channel connects — opening the
    // table after a reload as much as recovering from a drop — ask the host
    // for current state rather than trusting whatever this browser saved
    // last, which misses anything the DM changed meanwhile. Mirrors
    // REQ-001's resync intent, but over broadcast/state_snapshot instead of
    // fetchTableSnapshot, since a guest table has no Postgres row to fetch
    // from. If the host isn't there yet, handleHostPresenceChange asks again
    // when they arrive.
    function handleGuestStatusChange(status) {
      if (isGuestHost) return;
      if (status === 'SUBSCRIBED') {
        guestChannelRef.current?.sendStateRequest(me.id);
      }
    }

    const channel = subscribeToGuestTable(code, {
      onStateChange: isGuestHost ? undefined : (action) => dispatch(action),
      onIntent: isGuestHost ? applyValidatedIntent : undefined,
      onPlayerJoin: isGuestHost ? handlePlayerJoin : undefined,
      onStateRequest: isGuestHost ? handleStateRequest : undefined,
      onStateSnapshot: isGuestHost
        ? undefined
        : (snapshotState, forId) => {
            if (forId === me.id) dispatch({ type: 'HYDRATE', state: snapshotState });
          },
      onStatusChange: handleGuestStatusChange,
      isHost: isGuestHost,
      onHostPresenceChange: isGuestHost ? undefined : handleHostPresenceChange,
      onRoll: (roll) => receiveRollRef.current(roll),
    });
    guestChannelRef.current = channel;
    return () => {
      channel.unsubscribe();
      guestChannelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, isGuestHost, state.session.code]);

  // REQ-008: called after every host-originated mutation's local dispatch,
  // alongside the existing `if (isRemote) ...Remote(...)` call — mirrors
  // that pattern with a broadcast send standing in for the remote write.
  // A no-op for players and for non-guest modes.
  function broadcastGuestChange(action) {
    if (!isGuestHost) return;
    const safe = toGuestBroadcastAction(action, stateRef.current);
    if (safe) guestChannelRef.current?.sendStateChange(safe);
  }

  // Local mode only: closing the tab/browser or navigating away should drop
  // this player from the roster, not just leave them shown forever. React's
  // component lifecycle isn't reliable during page teardown, so this writes
  // straight to localStorage instead of going through dispatch.
  //
  // REQ-008: explicitly excluded for guest mode, not just isRemote — a
  // guest table's shared truth lives in the DM's broadcast-authoritative
  // state, not in each client's own localStorage, so this raw write would
  // never reach anyone else anyway. Worse, for the guest HOST it would
  // silently strip their own player row on every refresh/close (the same
  // `saveSession` blob resume-on-refresh and Slice 4's crash recovery both
  // depend on), which is exactly the data this feature exists to protect.
  useEffect(() => {
    if (isRemote || isGuest) return undefined;
    function removeSelfOnUnload() {
      const current = stateRef.current;
      if (!current.players[me.id]) return;
      const { [me.id]: _removed, ...players } = current.players;
      saveSession(current.session.code, { ...current, players });
    }
    window.addEventListener('beforeunload', removeSelfOnUnload);
    window.addEventListener('pagehide', removeSelfOnUnload);
    return () => {
      window.removeEventListener('beforeunload', removeSelfOnUnload);
      window.removeEventListener('pagehide', removeSelfOnUnload);
    };
  }, [isRemote, isGuest, me.id]);

  // Permission model: the DM edits everything; a player may only move
  // their own hero token, open/close a chest, and use their own hero's
  // Battle Equipment tab (weapon, modifiers, rolling), Spells tab, and Bag
  // tab (equipment, currency) — see PITFALLS.md #1. Enforced here (the
  // single choke point every mutation already funnels through) rather
  // than in each calling component, so no future caller can accidentally
  // skip the check. Mirrored server-side for cloud mode by
  // 35_player_battle_equipment.sql's trigger.
  const CHEST_TOGGLE_KEYS = ['opened', 'imageUrl'];
  // Sheet keys a hero's own owner may change — Battle Equipment writes
  // `attacks`, Spells writes `spellcasting`, Bag writes
  // `equipment`/`currency`. Every other key (level, abilities, saves, ...)
  // stays DM-only.
  const HERO_OWNER_SHEET_KEYS = ['attacks', 'spellcasting', 'equipment', 'currency'];

  function canMoveEntity(entity) {
    if (!entity) return false;
    return isHost || (entity.kind === 'hero' && entity.ownerId === me.id);
  }

  // A hero's whole tabbed sheet lives in one `sheet` object, so "only
  // Battle Equipment/Bag changed" means every other top-level key is still
  // equal to what it was before the patch. This has to be a value compare,
  // not a reference compare: a guest's patch arrives here after a round
  // trip through the Realtime broadcast channel (applyValidatedIntent
  // below), which JSON-serializes it — every nested object/array gets a
  // fresh reference even when nothing in it changed.
  function isHeroOwnerSheetPatch(entity, patch) {
    const keys = Object.keys(patch);
    if (keys.length !== 1 || keys[0] !== 'sheet') return false;
    const oldSheet = entity.sheet || {};
    const newSheet = patch.sheet || {};
    const allKeys = new Set([...Object.keys(oldSheet), ...Object.keys(newSheet)]);
    for (const key of allKeys) {
      if (HERO_OWNER_SHEET_KEYS.includes(key)) continue;
      if (JSON.stringify(oldSheet[key]) !== JSON.stringify(newSheet[key])) return false;
    }
    return true;
  }

  // A hit rolled from Battle Equipment applies its damage to the target
  // mob's hp (RightPanel.jsx's confirmAttack). Bounded to a plain decrease
  // so this only ever reads as "apply attack damage," never "edit a
  // monster's hp."
  // A player taking an item from an opened chest (RightPanel's "Take"
  // button) removes exactly one whole item stack from the chest's `items`
  // — same as the host's "Give" — and nothing else. Bounded so this only
  // ever reads as "loot one stack," never "edit a chest's contents."
  function isTakeChestItemPatch(entity, patch) {
    const keys = Object.keys(patch);
    if (keys.length !== 1 || keys[0] !== 'items') return false;
    const oldItems = entity.items || [];
    const newItems = patch.items || [];
    if (newItems.length !== oldItems.length - 1) return false;
    const removed = oldItems.filter((it) => !newItems.some((n) => n.id === it.id));
    if (removed.length !== 1) return false;
    // Every remaining item must be byte-for-byte unchanged — a value
    // compare, not a reference compare, since a guest's patch arrives here
    // after a round trip through Realtime broadcast (see
    // isHeroOwnerSheetPatch above for why that matters).
    return newItems.every((it) => JSON.stringify(it) === JSON.stringify(oldItems.find((o) => o.id === it.id)));
  }

  // A player's attack may lower a monster's HP and spend its temporary HP
  // (which damage uses up first) — never raise either, never touch anything else.
  function canDamageMob(entity, patch) {
    const keys = Object.keys(patch);
    if (!keys.length || !keys.every((key) => key === 'hp' || key === 'tempHp')) return false;
    if ('hp' in patch) {
      const currentHp = entity.hp ?? entity.maxHp ?? 0;
      if (typeof patch.hp !== 'number' || patch.hp < 0 || patch.hp > currentHp) return false;
    }
    if ('tempHp' in patch) {
      if (typeof patch.tempHp !== 'number' || patch.tempHp < 0 || patch.tempHp > (entity.tempHp || 0)) return false;
    }
    return true;
  }

  // The non-host update rules, independent of whose browser is evaluating
  // them — shared by canUpdateEntity (host's own `me.id`) and the guest
  // sync handler's applyValidatedIntent below (a remote sender's id, which
  // can never be trusted to equal `me.id`/`isHost`).
  function canPlayerUpdateEntity(entity, patch, playerId) {
    if (!entity) return false;
    if (entity.kind === 'chest') {
      return Object.keys(patch).every((key) => CHEST_TOGGLE_KEYS.includes(key)) || isTakeChestItemPatch(entity, patch);
    }
    if (entity.kind === 'hero' && entity.ownerId === playerId) {
      return isHeroOwnerSheetPatch(entity, patch);
    }
    if (entity.kind === 'mob') {
      return canDamageMob(entity, patch);
    }
    return false;
  }

  function canUpdateEntity(entity, patch) {
    if (!entity) return false;
    if (isHost) return true;
    return canPlayerUpdateEntity(entity, patch, me.id);
  }

  function addEntity(draft) {
    if (!isHost) return;
    const targetIsland = currentLayer.islands[activeIslandId] || currentLayer.islands[currentLayer.islandOrder[0]];
    const free = findFreeCell(layerEntities, targetIsland.id, targetIsland.cols, targetIsland.rows);
    // Only a trap can be sized at placement (1 to 5 squares wide); everything
    // else starts 1x1.
    // A compendium monster also arrives pre-sized (Large creatures are 2x2).
    const size = draft.kind === 'trap' ? clampTrapSize(draft.size) : draft.kind === 'mob' && draft.size ? Math.min(draft.size, 4) : 1;
    // findFreeCell finds a free single square, which is the token's top-left
    // corner — pull a big trap back so it lands fully on the island rather
    // than hanging off its right/bottom edge (an island smaller than the
    // trap just pins it to the top-left).
    const col = Math.max(0, Math.min(free.col, targetIsland.cols - size));
    const row = Math.max(0, Math.min(free.row, targetIsland.rows - size));
    // A door's placement on its target layer is independent of its
    // placement here — find it its own free cell over there too (always on
    // that layer's base island, since doors aren't per-island-targeted),
    // rather than forcing it to reuse this layer's (col,row) which may
    // already be occupied (or even off-grid) on the other side.
    let targetCol = null;
    let targetRow = null;
    if (draft.kind === 'door' && draft.targetLayerId) {
      const targetLayer = state.layers[draft.targetLayerId];
      const targetLayerBaseIsland = targetLayer.islands[targetLayer.islandOrder[0]];
      const targetLayerEntities = entitiesVisibleOnLayer(state, draft.targetLayerId, isHost);
      const free = findFreeCell(targetLayerEntities, targetLayerBaseIsland.id, targetLayerBaseIsland.cols, targetLayerBaseIsland.rows);
      targetCol = free.col;
      targetRow = free.row;
    }
    const entity = {
      id: generateEntityId(),
      kind: draft.kind,
      name: draft.name,
      imageUrl: draft.imageUrl,
      color: draft.color,
      col,
      row,
      size,
      hp: draft.maxHp,
      maxHp: draft.maxHp,
      armorClass: draft.kind === 'mob' ? draft.armorClass ?? 10 : undefined,
      // Left unassigned (rather than defaulting to the placing DM) since
      // only the DM places tokens now — the DM assigns a hero to whichever
      // player controls it afterward, via the Owner field on its inspector.
      ownerId: null,
      layerId: currentLayerId,
      islandId: targetIsland.id,
      targetLayerId: draft.kind === 'door' ? draft.targetLayerId ?? null : null,
      targetCol,
      targetRow,
      conditions: draft.kind !== 'door' && draft.kind !== 'chest' && draft.kind !== 'trap' ? [] : undefined,
      dmNotes: draft.kind === 'hero' || draft.kind === 'mob' ? draft.dmNotes ?? '' : undefined,
      mobSheet: draft.kind === 'mob' ? draft.mobSheet : undefined,
      droppables: draft.kind === 'mob' ? draft.droppables || defaultDroppablesFor(draft.mobKey) : undefined,
      sheet: draft.kind === 'hero' ? defaultCharacterSheet() : undefined,
      chestSize: draft.kind === 'chest' ? draft.chestSize : undefined,
      opened: draft.kind === 'chest' ? false : undefined,
      items: draft.kind === 'chest' ? draft.items || [] : undefined,
      // A trap always starts hidden - the DM reveals it deliberately from
      // its inspector.
      ...(draft.kind === 'trap'
        ? {
            trapDescription: draft.trapDescription ?? '',
            trapSave: draft.trapSave ?? null,
            trapFail: draft.trapFail ?? null,
            trapDice: draft.trapDice ?? '',
            trapDamage: draft.trapDamage ?? '',
            trapDamageType: draft.trapDamageType ?? 'none',
            trapRevealed: false,
          }
        : {}),
    };
    dispatch({ type: 'ADD_ENTITY', entity });
    setSelectedId(entity.id);
    if (isRemote) {
      addEntityRemote(state.session.tableId, entity).catch(reportError);
    } else if (isGuestHost) {
      broadcastGuestChange({ type: 'ADD_ENTITY', entity });
    } else {
      saveOrWarn(state.session.code, {
        ...state,
        entities: { ...state.entities, [entity.id]: entity },
        entityOrder: [...state.entityOrder, entity.id],
      });
    }
  }

  // `layerId` is only ever passed by confirmEnterDoor, to carry a hero
  // across to the door's other side along with the col/row/islandId move —
  // every other caller (MapBoard's drag) leaves it undefined and this
  // behaves exactly as before.
  function moveEntity(id, col, row, islandId, layerId) {
    const entity = state.entities[id];
    if (!canMoveEntity(entity)) return;
    // Dragging a door while viewing it from its target-layer side repositions
    // only that side, independent of where it sits on its home layer. That
    // side isn't per-island, so only accept a drop that landed back on the
    // layer's base island (islandId is undefined for an invalid/off-island drop).
    if (entity?.kind === 'door' && entity.layerId !== currentLayerId && entity.targetLayerId === currentLayerId) {
      if (islandId && islandId !== currentLayer.islandOrder[0]) return;
      updateEntity(id, { targetCol: col, targetRow: row });
      return;
    }
    // REQ-008: a guest player has nothing durable to write to, so their
    // move is only ever an intent for the DM's client to validate and
    // apply — never an optimistic local dispatch (see Architectural
    // decisions: the DM's browser is the sole source of truth).
    if (isGuest && !isGuestHost) {
      guestChannelRef.current?.sendIntent({ type: 'MOVE_ENTITY', id, col, row, islandId, layerId }, me.id);
      return;
    }
    dispatch({ type: 'MOVE_ENTITY', id, col, row, islandId, layerId });
    if (isRemote) moveEntityRemote(id, col, row, islandId, layerId).catch(reportError);
    else if (isGuestHost) broadcastGuestChange({ type: 'MOVE_ENTITY', id, col, row, islandId, layerId });
  }

  function updateEntity(id, patch) {
    const entity = state.entities[id];
    if (!canUpdateEntity(entity, patch)) return;
    // REQ-008: same host-authoritative split as moveEntity — a guest
    // player's only reachable use of this (a chest toggle, per
    // canUpdateEntity above) is an intent, never a local dispatch.
    if (isGuest && !isGuestHost) {
      guestChannelRef.current?.sendIntent({ type: 'UPDATE_ENTITY', id, patch }, me.id);
      return;
    }
    dispatch({ type: 'UPDATE_ENTITY', id, patch });
    // Every text field on a hero's sheet funnels through here on each
    // keystroke today — fine at current usage, but if that ever gets slow
    // enough to matter, debounce the network call here rather than in each
    // caller (Realtime Roadmap §2.4).
    if (isRemote) {
      // Hiding a revealed trap again cannot be a plain UPDATE - see
      // hideTrapRemote for why it is a delete + re-insert instead.
      if (entity.kind === 'trap' && entity.trapRevealed && patch.trapRevealed === false) {
        hideTrapRemote(state.session.tableId, { ...entity, ...patch }).catch(reportError);
      } else {
        updateEntityRemote(id, patch).catch(reportError);
      }
    } else if (isGuestHost) {
      broadcastGuestChange({ type: 'UPDATE_ENTITY', id, patch });
    }
  }

  function removeEntity(id) {
    if (!isHost) return;
    const cascade = audioEnabled ? previewAudioCascade(state, { type: 'REMOVE_ENTITY', id }) : null;
    dispatch({ type: 'REMOVE_ENTITY', id });
    if (selectedId === id) setSelectedId(null);
    if (isRemote) removeEntityRemote(id).catch(reportError);
    else if (isGuestHost) broadcastGuestChange({ type: 'REMOVE_ENTITY', id });
    if (cascade) dropAudioTracks(cascade.removed, cascade.audio);
  }

  // Roll for Initiative: DM-only, rolls a d20 for every selected hero/mob
  // and stamps entity.initiativeRoll/initiativeTurn via the same updateEntity
  // path as any other entity edit (so it syncs the same way HP or a
  // condition would). A fresh roll fully replaces whatever combat order was
  // showing before — anything still carrying a badge that isn't part of
  // this new roll (or the whole roll is being cleared) has it stripped
  // first. Returns the sorted results so the modal can show the turn order
  // without re-deriving it.
  function rollInitiative(selectedIds, { startEncounter = false } = {}) {
    if (!isHost) return [];
    const selected = new Set(selectedIds);
    for (const entity of Object.values(state.entities)) {
      if (entity.initiativeTurn != null && !selected.has(entity.id)) {
        updateEntity(entity.id, { initiativeRoll: null, initiativeTurn: null });
      }
    }
    // Starting an encounter rattles the dice itself (the encounter effect).
    if (selectedIds.length && !startEncounter) playDiceSound();
    const rolled = selectedIds.map((id) => ({ id, roll: 1 + Math.floor(Math.random() * 20) }));
    rolled.sort((a, b) => b.roll - a.roll);
    rolled.forEach(({ id, roll }, index) => updateEntity(id, { initiativeRoll: roll, initiativeTurn: index + 1 }));
    // A fresh roll replaces any fight already running; clearing ends it.
    if (!rolled.length) setEncounter(null);
    else if (startEncounter) setEncounter(createEncounter(rolled, state.entities));
    return rolled.map(({ id, roll }, index) => ({ id, roll, turn: index + 1 }));
  }

  // The encounter itself (49_encounter.sql) — the DM starts, advances and
  // ends it; written the same way as the clock.
  function setEncounter(next) {
    if (!isHost) return;
    dispatch({ type: 'SET_ENCOUNTER', encounter: next });
    if (isRemote) {
      updateTableEncounterRemote(state.session.tableId, next).catch(reportError);
    } else if (isGuestHost) {
      broadcastGuestChange({ type: 'SET_ENCOUNTER', encounter: next });
    } else {
      saveOrWarn(state.session.code, { ...state, encounter: next });
    }
  }

  // The InitiativeModal's "Start encounter" box, ticked or unticked after
  // the roll: starts a fight from those results, or ends the running one.
  function toggleEncounter(active, results) {
    if (!active) setEncounter(null);
    else if (results?.length) setEncounter(createEncounter(results, state.entities));
  }

  // End turn: the DM for anyone, a player for their own hero. A cloud
  // player can't write the tables row, so theirs goes through an RPC that
  // re-checks it's really their turn; a guest player's is an intent the
  // DM's client validates.
  function endTurn() {
    if (!canEndTurn) return;
    const next = advanceEncounter(encounter, state.entities);
    if (isHost) {
      setEncounter(next);
    } else if (isGuest) {
      guestChannelRef.current?.sendIntent({ type: 'END_TURN' }, me.id);
    } else {
      dispatch({ type: 'SET_ENCOUNTER', encounter: next });
      if (isRemote) {
        endEncounterTurnRemote(state.session.tableId, next).catch((err) => {
          reportError(err);
          dispatch({ type: 'SET_ENCOUNTER', encounter }); // refused — put the turn back
        });
      }
      else saveOrWarn(state.session.code, { ...state, encounter: next });
    }
  }

  // Asset Storage (Toolbar.jsx): the DM authoring a custom monster/weapon/
  // item and dropping it into this table's compendiums/monster list
  // alongside the built-in defaults — see 36_custom_assets.sql. `data` is
  // already the full entry, shaped exactly like its catalog counterpart.
  function addCustomAsset(assetType, data) {
    if (!isHost) return;
    const item = { id: generateEntityId(), assetType, data };
    dispatch({ type: 'ADD_CUSTOM_ASSET', item });
    if (isRemote) addCustomAssetRemote(state.session.tableId, item).catch(reportError);
    else if (isGuestHost) broadcastGuestChange({ type: 'ADD_CUSTOM_ASSET', item });
  }

  // ---- Drawings (the DM's Draw tool) ----
  // Settings for the next shape: which drawing tool, its style, and whether
  // shapes snap to the grid. Local to this browser.
  const [drawSettings, setDrawSettingsState] = useState(() => {
    const prefs = loadDrawPrefs();
    return {
      subTool: prefs.subTool || 'pencil',
      style: { ...DEFAULT_DRAW_STYLE, ...(prefs.style || {}) },
      snap: prefs.snap ?? true,
    };
  });
  // The drawing Select has picked, if any.
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  function setDrawSettings(next) {
    // A style change while a drawing is selected restyles that drawing too
    // (just the fields that changed).
    const selected = selectedDrawingId && state.drawings?.[selectedDrawingId];
    if (selected && next.style !== drawSettings.style) {
      const patch = {};
      for (const key of Object.keys(next.style)) if (next.style[key] !== drawSettings.style[key]) patch[key] = next.style[key];
      if (Object.keys(patch).length) updateDrawing({ ...selected, style: { ...selected.style, ...patch } });
    }
    if (next.subTool !== 'select') setSelectedDrawingId(null);
    setDrawSettingsState(next);
    saveDrawPrefs({ ...loadDrawPrefs(), subTool: next.subTool, style: next.style, snap: next.snap });
  }
  // The last few colours actually drawn with, newest first.
  const [recentColours, setRecentColours] = useState(() => loadDrawPrefs().recentColours || []);
  function noteColourUsed(colour) {
    const next = withRecentColour(recentColours, colour);
    setRecentColours(next);
    saveDrawPrefs({ ...loadDrawPrefs(), recentColours: next });
  }

  // One write per finished action, like every other host edit: dispatch
  // here, then the cloud row or the guest broadcast. Local and guest tables
  // save the whole state themselves (GameProvider's autosave).
  function writeDrawing(drawing) {
    if (!isHost) return;
    dispatch({ type: 'SET_DRAWING', drawing });
    if (isRemote) upsertDrawingRemote(state.session.tableId, drawing).catch(reportError);
    else if (isGuestHost) broadcastGuestChange({ type: 'SET_DRAWING', drawing });
  }

  function deleteDrawings(ids) {
    if (!isHost || !ids.length) return;
    dispatch({ type: 'REMOVE_DRAWINGS', ids });
    if (isRemote) removeDrawingsRemote(ids).catch(reportError);
    else if (isGuestHost) broadcastGuestChange({ type: 'REMOVE_DRAWINGS', ids });
  }

  // Undo/redo for the DM's own drawing actions, this browser and this
  // session only. Each step is a list of { id, before, after } (a drawing,
  // or null where it didn't exist); undoing writes every `before` back
  // through the normal write path, so it reaches the table like any edit.
  // `group` merges a step into the previous one with the same key (one
  // eraser sweep is one step).
  const drawUndoRef = useRef([]);
  const drawRedoRef = useRef([]);
  const [drawHistoryTick, setDrawHistoryTick] = useState(0);
  function recordDrawStep(changes, group = null) {
    const undo = drawUndoRef.current;
    const last = undo[undo.length - 1];
    if (group && last?.group === group) last.changes.push(...changes);
    else undo.push({ group, changes });
    if (undo.length > 100) undo.shift();
    drawRedoRef.current = [];
    setDrawHistoryTick((t) => t + 1);
  }
  function applyDrawStep(step, direction) {
    const current = stateRef.current;
    const islandAlive = (islandId) => Object.values(current.layers).some((layer) => layer.islands?.[islandId]);
    const doomed = [];
    for (const change of step.changes) {
      const target = direction === 'undo' ? change.before : change.after;
      if (!target) {
        if (current.drawings?.[change.id]) doomed.push(change.id);
      } else if (islandAlive(target.islandId)) {
        writeDrawing(target);
      }
    }
    deleteDrawings(doomed);
  }
  function undoDrawing() {
    const step = drawUndoRef.current.pop();
    if (!step) return;
    applyDrawStep(step, 'undo');
    drawRedoRef.current.push(step);
    setDrawHistoryTick((t) => t + 1);
  }
  function redoDrawing() {
    const step = drawRedoRef.current.pop();
    if (!step) return;
    applyDrawStep(step, 'redo');
    drawUndoRef.current.push(step);
    setDrawHistoryTick((t) => t + 1);
  }
  const canUndoDrawing = drawHistoryTick >= 0 && drawUndoRef.current.length > 0;
  const canRedoDrawing = drawHistoryTick >= 0 && drawRedoRef.current.length > 0;

  function updateDrawing(drawing) {
    const before = state.drawings?.[drawing.id];
    if (!before) return;
    writeDrawing(drawing);
    recordDrawStep([{ id: drawing.id, before, after: drawing }]);
  }

  function addDrawing(drawing) {
    const created = { ...drawing, id: generateEntityId() };
    writeDrawing(created);
    recordDrawStep([{ id: created.id, before: null, after: created }]);
    if (drawing.style?.color) noteColourUsed(drawing.style.color);
  }

  function removeDrawings(ids, group = null) {
    const present = ids.filter((id) => state.drawings?.[id]);
    if (!present.length) return;
    deleteDrawings(present);
    recordDrawStep(
      present.map((id) => ({ id, before: state.drawings[id], after: null })),
      group
    );
  }

  // "Clear this island" / "Clear this map": the drawings each would take.
  const drawingIdsOnIsland = (islandId) => (state.drawingOrder || []).filter((id) => state.drawings[id]?.islandId === islandId);
  const drawingIdsOnMap = () => {
    const onMap = new Set(currentLayer.islandOrder);
    return (state.drawingOrder || []).filter((id) => onMap.has(state.drawings[id]?.islandId));
  };

  // "Hide drawings": this browser only, for anyone at the table.
  const [hideDrawings, setHideDrawingsState] = useState(() => Boolean(loadDrawPrefs().hide));
  function setHideDrawings(hide) {
    setHideDrawingsState(hide);
    saveDrawPrefs({ ...loadDrawPrefs(), hide });
  }

  // Leaving Draw, or the selected drawing disappearing (erased, its island
  // deleted), drops the selection.
  const selectedDrawingGone = Boolean(selectedDrawingId) && !state.drawings?.[selectedDrawingId];
  useEffect(() => {
    if (tool !== 'draw' || selectedDrawingGone) setSelectedDrawingId(null);
  }, [tool, selectedDrawingGone]);

  // While drawing: Esc drops the selection, Delete or Backspace removes the
  // selected drawing, Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes —
  // never while typing in a field.
  useEffect(() => {
    if (!isHost || tool !== 'draw') return undefined;
    function onKey(e) {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoDrawing();
        else undoDrawing();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redoDrawing();
      } else if (e.key === 'Escape') {
        setSelectedDrawingId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        e.preventDefault();
        removeDrawings([selectedDrawingId]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function removeCustomAsset(id) {
    if (!isHost) return;
    dispatch({ type: 'REMOVE_CUSTOM_ASSET', id });
    if (isRemote) removeCustomAssetRemote(id).catch(reportError);
    else if (isGuestHost) broadcastGuestChange({ type: 'REMOVE_CUSTOM_ASSET', id });
  }

  // Looting a chest: the same "drop it into Bag > Weapons & gear" used by
  // the compendium Give buttons, plus removing that slot from the chest —
  // only reachable once the chest is opened (RightPanel's ChestInspector
  // gates the button on entity.opened, not on the current tool).
  function giveChestItemToHero(chestEntity, item, heroId) {
    const hero = state.entities[heroId];
    if (!hero) return;
    const sheet = hero.sheet || defaultCharacterSheet();
    const equipment = normalizeEquipment(sheet.equipment);
    const newItem = { ...newEquipmentItem(), name: item.name, qty: item.qty };
    updateEntity(hero.id, { sheet: { ...sheet, equipment: { ...equipment, gear: [...equipment.gear, newItem] } } });
    updateEntity(chestEntity.id, { items: (chestEntity.items || []).filter((it) => it.id !== item.id) });
  }

  // The player-facing counterpart to giveChestItemToHero above: a player
  // loots an opened chest into their own hero's Bag — never anyone else's,
  // since the target hero is resolved from `me.id` here rather than taking
  // a heroId from the caller (RightPanel's ChestInspector doesn't have one
  // to offer a player anyway — see isTakeChestItemPatch for the write-side
  // guard against taking more than one stack).
  function takeChestItem(chestEntity, item) {
    const myHero = heroes.find((h) => h.ownerId === me.id);
    if (!myHero) return;
    giveChestItemToHero(chestEntity, item, myHero.id);
  }

  function updateLayer(layerId, patch) {
    if (!isHost) return;
    dispatch({ type: 'UPDATE_LAYER', id: layerId, patch });
    if (isRemote) {
      updateLayerRemote(layerId, patch).catch(reportError);
    } else if (isGuestHost) {
      broadcastGuestChange({ type: 'UPDATE_LAYER', id: layerId, patch });
    } else {
      saveOrWarn(state.session.code, {
        ...state,
        layers: { ...state.layers, [layerId]: { ...state.layers[layerId], ...patch } },
      });
    }
  }

  function createLayer({ name, cols, rows }) {
    if (!isHost) return;
    const layerName = name.trim() || 'Untitled Map';
    const layer = createInitialLayer({
      name: layerName,
      islandOverrides: { name: layerName, cols: clampGridDims(cols), rows: clampGridDims(rows) },
    });
    dispatch({ type: 'ADD_LAYER', layer });
    if (isRemote) {
      addLayerRemote(state.session.tableId, layer).catch(reportError);
    } else if (isGuestHost) {
      broadcastGuestChange({ type: 'ADD_LAYER', layer });
    } else {
      saveOrWarn(state.session.code, {
        ...state,
        layers: { ...state.layers, [layer.id]: layer },
        layerOrder: [...state.layerOrder, layer.id],
      });
    }
    return layer.id;
  }

  // Places a freshly built island (from createIsland) next
  // to the active island (not the rightmost edge across every island on the
  // layer) — a merge can make one island's own footprint huge, and
  // anchoring off the layer-wide edge would drop a new island far from
  // wherever the host is actually looking/working. The active island isn't
  // always the most recently placed one (e.g. it resets to the base island
  // on reload), so nudge past anything the candidate spot would actually
  // collide with rather than trusting it's clear. Mutates `island.x`/`y`,
  // then dispatches it exactly like every other island-adding path.
  function placeAndAddIsland(island) {
    const reference = currentLayer.islands[activeIslandId] || currentLayer.islands[currentLayer.islandOrder[0]];
    island.x = reference ? reference.x + reference.cols * reference.cellSize + 60 : 0;
    island.y = reference ? reference.y : 0;
    const w = island.cols * island.cellSize;
    const h = island.rows * island.cellSize;
    for (let collided = true; collided; ) {
      collided = false;
      for (const isl of Object.values(currentLayer.islands)) {
        const ow = isl.cols * isl.cellSize;
        const oh = isl.rows * isl.cellSize;
        const overlaps = island.x < isl.x + ow && island.x + w > isl.x && island.y < isl.y + oh && island.y + h > isl.y;
        if (overlaps) {
          island.x = isl.x + ow + 60;
          collided = true;
        }
      }
    }
    dispatch({ type: 'ADD_ISLAND', layerId: currentLayerId, island });
    setActiveIslandId(island.id);
    pendingRecenterIslandIdRef.current = island.id;
    if (isRemote) addIslandRemote(state.session.tableId, currentLayerId, island).catch(reportError);
    else if (isGuestHost) broadcastGuestChange({ type: 'ADD_ISLAND', layerId: currentLayerId, island });
  }

  function createIsland({ name, cols, rows, feetPerSquare }) {
    if (!isHost) return;
    const island = createInitialIsland({
      name: name.trim() || 'Untitled Island',
      cols: clampGridDims(cols),
      rows: clampGridDims(rows),
      feetPerSquare: clampFeetPerSquare(feetPerSquare),
    });
    placeAndAddIsland(island);
  }

  // Downloads an island (the active one by default) as a standalone PNG
  // (background + grid lines, at native pixel resolution) for editing in an
  // external image editor — the result can be uploaded back from the
  // island's settings (Mapping → Islands) as its background.
  async function downloadIslandImage(islandId = activeIslandId) {
    const island = currentLayer.islands[islandId];
    if (!island) return;
    try {
      const dataUrl = await renderIslandTemplateToDataUrl(island);
      const filename = `${(island.name || 'island').trim().replace(/[^a-z0-9_-]+/gi, '_') || 'island'}.png`;
      downloadDataUrl(dataUrl, filename);
    } catch {
      alert("Could not export this island's image — its background image could not be loaded.");
    }
  }

  function updateIsland(islandId, patch) {
    if (!isHost) return;
    dispatch({ type: 'UPDATE_ISLAND', layerId: currentLayerId, islandId, patch });
    if (isRemote) updateIslandRemote(islandId, patch).catch(reportError);
    else if (isGuestHost) broadcastGuestChange({ type: 'UPDATE_ISLAND', layerId: currentLayerId, islandId, patch });
  }

  // The table's in-game clock (null removes it). Host-only, like every other
  // table-wide setting; players just see the result.
  function updateClock(clock) {
    if (!isHost) return;
    dispatch({ type: 'SET_CLOCK', clock });
    if (isRemote) {
      updateTableClockRemote(state.session.tableId, clock).catch(reportError);
    } else if (isGuestHost) {
      broadcastGuestChange({ type: 'SET_CLOCK', clock });
    } else {
      saveOrWarn(state.session.code, { ...state, clock });
    }
  }


  // ---- Synced Table Audio (REQ-009): the DM alone uploads, plays, pauses ----

  const { audio: catalogSongs } = useCatalog();
  const audioTracks = state.audio?.tracks || {};
  const audioPlayback = state.audio?.playback || { nowPlaying: null, resume: {} };
  const audioUsedBytes = Object.values(audioTracks).reduce((sum, t) => sum + (t.sizeBytes || 0), 0);
  const findAudioTrack = (targetKind, targetId) =>
    Object.values(audioTracks).find((t) => t.targetKind === targetKind && t.targetId === String(targetId)) || null;
  const worldTrack = findAudioTrack('world', audioScope);

  // The same write pattern as updateClock: local dispatch, then the remote
  // write. Guest tables keep tracks and playback in the DM's state only —
  // never broadcast, since players have no way to fetch the files.
  function syncAudio(action, remoteWrite) {
    dispatch(action);
    if (isRemote) remoteWrite?.().catch(reportError);
  }

  // Cloud files live in Storage; a guest DM's are blob URLs in this tab.
  function releaseAudioFiles(tracks) {
    tracks = tracks.filter((t) => !isBuiltinTrackUrl(t.url));
    if (isGuest) tracks.forEach((t) => URL.revokeObjectURL(t.url));
    else removeAudioFiles(tracks.map((t) => t.storagePath));
  }

  function writeAudioPlayback(playback) {
    if (!isHost || !audioEnabled) return;
    syncAudio({ type: 'SET_AUDIO_PLAYBACK', playback }, () => updateAudioPlaybackRemote(state.session.tableId, playback));
  }

  const positionNow = (np) => np.offsetMs + (Date.now() - np.anchorMs);

  // Starting a sound pauses the one playing (its position goes into `resume`)
  // and continues the new one from its own resume offset, else 0.
  function playAudioTrack(trackId) {
    const { nowPlaying, resume } = audioPlayback;
    const next = { ...resume };
    if (nowPlaying && nowPlaying.trackId !== trackId) next[nowPlaying.trackId] = positionNow(nowPlaying);
    const offsetMs = next[trackId] ?? (nowPlaying?.trackId === trackId ? positionNow(nowPlaying) : 0);
    delete next[trackId];
    writeAudioPlayback({ nowPlaying: { trackId, anchorMs: Date.now(), offsetMs }, resume: next });
  }

  function pauseAudio() {
    const { nowPlaying, resume } = audioPlayback;
    if (!nowPlaying) return;
    writeAudioPlayback({ nowPlaying: null, resume: { ...resume, [nowPlaying.trackId]: positionNow(nowPlaying) } });
  }

  function friendlyAudioError(err) {
    const message = String(err?.message || err);
    if (/quota|50 MB/i.test(message)) return new Error("This table's audio is full (50 MB limit). Remove a file first.");
    if (/mime|not supported|invalid.*type/i.test(message)) return new Error('Only MP3 or WAV files are supported.');
    if (/maximum allowed size|too large|413/i.test(message)) return new Error('That file is over the 10 MB limit.');
    return err instanceof Error ? err : new Error(message);
  }

  // Attach (or replace) the sound on a target. Throws an Error whose message
  // the UI shows inline.
  async function attachAudio(targetKind, targetId, file) {
    if (!isHost || !audioEnabled) return;
    const problem = validateAudioFile(file);
    if (problem) throw new Error(problem);
    const existing = findAudioTrack(targetKind, targetId);
    const usedByOthers = audioUsedBytes - (existing?.sizeBytes || 0);
    if (usedByOthers + file.size > AUDIO_TABLE_QUOTA_BYTES) {
      const left = Math.max(0, AUDIO_TABLE_QUOTA_BYTES - usedByOthers) / 1048576;
      throw new Error(`Not enough room: this table's audio limit is 50 MB and ${left.toFixed(1)} MB is left.`);
    }
    let uploaded;
    try {
      uploaded = isGuest ? localAudioFile(file) : await uploadAudio(file, audioScope);
    } catch (err) {
      throw friendlyAudioError(err);
    }
    const track = {
      id: existing?.id ?? generateEntityId(),
      targetKind,
      targetId: String(targetId),
      name: file.name,
      ...uploaded,
      baseVolume: existing?.baseVolume ?? 1,
      loop: existing?.loop ?? defaultLoopFor(targetKind),
    };
    if (isRemote) {
      try {
        await upsertAudioTrackRemote(state.session.tableId, track);
      } catch (err) {
        releaseAudioFiles([uploaded]);
        throw friendlyAudioError(err);
      }
    }
    retireReplacedTrack(existing);
    dispatch({ type: 'SET_AUDIO_TRACK', track });
  }

  // The replaced file is gone: stop it for everyone and forget its position.
  function retireReplacedTrack(existing) {
    if (!existing) return;
    const { [existing.id]: _drop, ...resume } = audioPlayback.resume;
    if (audioPlayback.nowPlaying?.trackId === existing.id || existing.id in audioPlayback.resume) {
      writeAudioPlayback({ nowPlaying: audioPlayback.nowPlaying?.trackId === existing.id ? null : audioPlayback.nowPlaying, resume });
    }
    releaseAudioFiles([existing]);
  }

  // Attach a Default catalog song: the track just points at its public URL, so
  // nothing is uploaded, no quota is used, and there is no file of ours to purge.
  async function attachCatalogAudio(targetKind, targetId, song) {
    if (!isHost || !audioEnabled) return;
    const existing = findAudioTrack(targetKind, targetId);
    const track = {
      id: existing?.id ?? generateEntityId(),
      targetKind,
      targetId: String(targetId),
      name: song.name,
      url: song.url,
      storagePath: '',
      mime: song.mime,
      sizeBytes: 0,
      baseVolume: existing?.baseVolume ?? 1,
      loop: existing?.loop ?? defaultLoopFor(targetKind),
    };
    if (isRemote) {
      try {
        await upsertAudioTrackRemote(state.session.tableId, track);
      } catch (err) {
        throw friendlyAudioError(err);
      }
    }
    retireReplacedTrack(existing);
    dispatch({ type: 'SET_AUDIO_TRACK', track });
  }

  // Use a bundled demo track (src/data/defaultAudio.js) instead of a file: no
  // upload, no quota. The row stores `builtin:<id>`, resolved at play time.
  async function attachDemoAudio(targetKind, targetId, demoId) {
    if (!isHost || !audioEnabled) return;
    const demo = DEMO_MUSIC.find((m) => m.id === demoId);
    if (!demo) return;
    const existing = findAudioTrack(targetKind, targetId);
    const track = {
      id: existing?.id ?? generateEntityId(),
      targetKind,
      targetId: String(targetId),
      name: demo.name,
      url: builtinTrackUrl(demo.id),
      storagePath: '',
      mime: 'audio/mpeg',
      sizeBytes: 0,
      baseVolume: existing?.baseVolume ?? 1,
      loop: existing?.loop ?? demo.loop ?? defaultLoopFor(targetKind),
    };
    if (isRemote) {
      try {
        await upsertAudioTrackRemote(state.session.tableId, track);
      } catch (err) {
        throw friendlyAudioError(err);
      }
    }
    if (existing) {
      const { [existing.id]: _drop, ...resume } = audioPlayback.resume;
      if (audioPlayback.nowPlaying?.trackId === existing.id || existing.id in audioPlayback.resume) {
        writeAudioPlayback({ nowPlaying: audioPlayback.nowPlaying?.trackId === existing.id ? null : audioPlayback.nowPlaying, resume });
      }
      releaseAudioFiles([existing]);
    }
    dispatch({ type: 'SET_AUDIO_TRACK', track });
  }

  // Loop and base volume. Cloud rows are upserted whole (the host may write).
  function patchAudioTrack(trackId, patch) {
    const track = audioTracks[trackId];
    if (!isHost || !track) return;
    const next = { ...track, ...patch };
    syncAudio({ type: 'SET_AUDIO_TRACK', track: next }, () => upsertAudioTrackRemote(state.session.tableId, next));
  }

  // Delete tracks' rows and files, and clean the playback value. `audio` is the
  // slice as it will be once they are gone (see previewAudioCascade).
  function dropAudioTracks(removed, audio) {
    if (!removed.length) return;
    if (isRemote) for (const t of removed) removeAudioTrackRemote(t.id).catch(reportError);
    releaseAudioFiles(removed);
    if (audio && JSON.stringify(audio.playback) !== JSON.stringify(audioPlayback)) writeAudioPlayback(audio.playback);
  }

  function removeAudioTrack(trackId) {
    if (!isHost || !audioTracks[trackId]) return;
    const audio = pruneAudio(state.audio, [trackId]);
    dispatch({ type: 'REMOVE_AUDIO_TRACK', id: trackId });
    dropAudioTracks([audioTracks[trackId]], audio);
  }

  // What the layer/island/token UI needs, bundled so it can be passed down once.
  const audioApi = {
    enabled: audioEnabled,
    isHost,
    tracks: audioTracks,
    playback: audioPlayback,
    expired: expiredAudio,
    usedBytes: audioUsedBytes,
    findTrack: findAudioTrack,
    attach: attachAudio,
    catalog: catalogSongs,
    attachCatalog: attachCatalogAudio,
    attachDemo: attachDemoAudio,
    patch: patchAudioTrack,
    remove: removeAudioTrack,
    play: playAudioTrack,
    pause: pauseAudio,
    localVolumes: localAudioVolumes,
    setLocalVolume: (trackId, value) =>
      setLocalAudioVolumes((prev) => {
        const next = { ...prev, [trackId]: value };
        saveLocalAudioVolumes(audioScope, next);
        return next;
      }),
  };

  // Auto-follow: when the DM switches the layer they are viewing, a layer sound
  // starts (interrupting whatever played); with none, a playing layer or island
  // sound pauses. World and token sounds are never touched. Deliberately keyed
  // on the change, not the mount, so a DM page refresh never restarts anything.
  const previousViewLayerRef = useRef(hostViewLayerId);
  useEffect(() => {
    if (previousViewLayerRef.current === hostViewLayerId) return;
    previousViewLayerRef.current = hostViewLayerId;
    if (!isHost || !audioEnabled) return;
    const layerTrack = findAudioTrack('layer', hostViewLayerId);
    const playing = audioPlayback.nowPlaying ? audioTracks[audioPlayback.nowPlaying.trackId] : null;
    if (layerTrack) {
      if (playing?.id !== layerTrack.id && !expiredAudio.has(layerTrack.id)) playAudioTrack(layerTrack.id);
    } else if (playing && (playing.targetKind === 'layer')) {
      pauseAudio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostViewLayerId]);

  // Pause or resume the clock from the toolbar. Re-bases the anchor to the
  // current time first (withClockRunning) so pausing freezes what is on screen
  // and resuming carries on from there.
  function setClockRunning(running) {
    if (!state.clock) return;
    updateClock(withClockRunning(state.clock, running, Date.now()));
  }

  // The DM setting the day/night phase by hand (null = hand it back to the
  // clock). Works whether or not the clock's own cycle is on, or a clock
  // exists at all.
  function updateDayNightOverride(phase) {
    if (!isHost) return;
    dispatch({ type: 'SET_DAY_NIGHT_OVERRIDE', phase });
    if (isRemote) {
      updateTableDayNightOverrideRemote(state.session.tableId, phase).catch(reportError);
    } else if (isGuestHost) {
      broadcastGuestChange({ type: 'SET_DAY_NIGHT_OVERRIDE', phase });
    } else {
      saveOrWarn(state.session.code, { ...state, dayNightOverride: phase });
    }
  }

  function moveIsland(islandId, x, y) {
    updateIsland(islandId, { x, y });
  }

  function removeIsland(islandId) {
    if (!isHost) return;
    const layer = currentLayer;
    const removedIsland = layer.islands[islandId];
    if (!removedIsland) return;
    const isSoleIsland = layer.islandOrder.length === 1;
    if (islandId === layer.islandOrder[0] && !isSoleIsland) return; // base island stays put while a sibling exists

    const cascade = audioEnabled ? previewAudioCascade(state, { type: 'REMOVE_ISLAND', layerId: currentLayerId, islandId }) : null;
    dispatch({ type: 'REMOVE_ISLAND', layerId: currentLayerId, islandId });
    if (isRemote) removeIslandRemote(islandId).catch(reportError);
    else if (isGuestHost) broadcastGuestChange({ type: 'REMOVE_ISLAND', layerId: currentLayerId, islandId });
    if (cascade) dropAudioTracks(cascade.removed, cascade.audio);

    if (isSoleIsland) {
      // The canvas, active-island selection, and map settings all assume a
      // layer has at least one island — drop in a fresh blank one, in the
      // same spot, rather than leaving the layer with none.
      const replacement = createInitialIsland({ name: removedIsland.name, cols: removedIsland.cols, rows: removedIsland.rows });
      replacement.x = removedIsland.x;
      replacement.y = removedIsland.y;
      dispatch({ type: 'ADD_ISLAND', layerId: currentLayerId, island: replacement });
      setActiveIslandId(replacement.id);
      if (isRemote) addIslandRemote(state.session.tableId, currentLayerId, replacement).catch(reportError);
      else if (isGuestHost) broadcastGuestChange({ type: 'ADD_ISLAND', layerId: currentLayerId, island: replacement });
    } else if (activeIslandId === islandId) {
      setActiveIslandId(layer.islandOrder[0]);
    }
  }

  // While the 'group' tool is active, clicking an island toggles it into
  // the pending selection rather than selecting/dragging it normally (see
  // MapBoard's onIslandDragUp).
  function toggleGroupCandidate(islandId) {
    setPendingGroupIslandIds((prev) => (prev.includes(islandId) ? prev.filter((id) => id !== islandId) : [...prev, islandId]));
  }

  // Bundles the selected islands into one island group — each keeps its own
  // grid/background/size; only their membership and the group's own name
  // are new state. Requires at least 2 islands (a group of one is
  // meaningless).
  // `islandIds`: the phone's group sheet picks from a list; the desktop
  // Merge Islands tool picks on the map (pendingGroupIslandIds).
  function confirmGroup(name, islandIds = pendingGroupIslandIds) {
    if (!isHost || islandIds.length < 2) return;
    // The group starts with every condition its islands had; from here on
    // the group's conditions stand for all of them.
    const conditions = [...new Set(islandIds.flatMap((id) => currentLayer.islands[id]?.conditions || []))];
    const group = { id: generateEntityId(), name: name.trim() || 'Untitled Group', islandIds, conditions };
    dispatch({ type: 'ADD_ISLAND_GROUP', layerId: currentLayerId, group });
    if (isRemote) {
      const islandGroups = { ...(currentLayer.islandGroups || {}), [group.id]: group };
      updateLayerRemote(currentLayerId, { islandGroups }).catch(reportError);
    } else if (isGuestHost) {
      broadcastGuestChange({ type: 'ADD_ISLAND_GROUP', layerId: currentLayerId, group });
    }
    setPendingGroupIslandIds([]);
    setTool('edit');
  }

  function cancelGroup() {
    setPendingGroupIslandIds([]);
    setTool('edit');
  }

  function ungroupIslands(groupId) {
    if (!isHost) return;
    dispatch({ type: 'REMOVE_ISLAND_GROUP', layerId: currentLayerId, groupId });
    if (isRemote) {
      const { [groupId]: _removed, ...islandGroups } = currentLayer.islandGroups || {};
      updateLayerRemote(currentLayerId, { islandGroups }).catch(reportError);
    } else if (isGuestHost) {
      broadcastGuestChange({ type: 'REMOVE_ISLAND_GROUP', layerId: currentLayerId, groupId });
    }
  }

  function renameGroup(groupId, name) {
    updateGroup(groupId, { name: name.trim() || 'Untitled Group' });
  }

  function updateGroup(groupId, patch) {
    if (!isHost) return;
    dispatch({ type: 'UPDATE_ISLAND_GROUP', layerId: currentLayerId, groupId, patch });
    if (isRemote) {
      const existing = currentLayer.islandGroups?.[groupId];
      if (!existing) return;
      const islandGroups = { ...currentLayer.islandGroups, [groupId]: { ...existing, ...patch } };
      updateLayerRemote(currentLayerId, { islandGroups }).catch(reportError);
    } else if (isGuestHost) {
      broadcastGuestChange({ type: 'UPDATE_ISLAND_GROUP', layerId: currentLayerId, groupId, patch });
    }
  }

  // Moves every member island of a group by the same delta in one dispatch,
  // so the group visually stays rigid — dragging an individual grouped
  // island's own body (rather than the group's bounding-box handle) still
  // goes through moveIsland/updateIsland unchanged.
  function moveIslandGroup(groupId, dx, dy) {
    if (!isHost) return;
    const group = currentLayer.islandGroups?.[groupId];
    if (!group) return;
    dispatch({ type: 'MOVE_ISLAND_GROUP', layerId: currentLayerId, groupId, dx, dy });
    if (isRemote) {
      for (const islandId of group.islandIds) {
        const island = currentLayer.islands[islandId];
        if (!island) continue;
        updateIslandRemote(islandId, { x: island.x + dx, y: island.y + dy }).catch(reportError);
      }
    } else if (isGuestHost) {
      // A single MOVE_ISLAND_GROUP action reproduces the same reducer
      // effect for every member island — unlike the remote path above,
      // broadcast doesn't need a per-island message.
      broadcastGuestChange({ type: 'MOVE_ISLAND_GROUP', layerId: currentLayerId, groupId, dx, dy });
    }
  }

  function removeLayer(layerId) {
    if (!isHost) return;
    if (layerId === baseLayerId) return;
    const cascade = audioEnabled ? previewAudioCascade(state, { type: 'REMOVE_LAYER', id: layerId }) : null;
    dispatch({ type: 'REMOVE_LAYER', id: layerId });
    if (hostViewLayerId === layerId) setHostViewLayerId(baseLayerId);
    if (isRemote) removeLayerRemote(layerId).catch(reportError);
    else if (isGuestHost) broadcastGuestChange({ type: 'REMOVE_LAYER', id: layerId });
    if (cascade) dropAudioTracks(cascade.removed, cascade.audio);
  }

  function enterDoor(doorEntity) {
    if (isHost || !doorEntity.targetLayerId) return;
    // Bidirectional: travel to whichever end of the door isn't the layer
    // currently being viewed from, so the same door works walking in from
    // either side.
    const destinationLayerId = currentLayerId === doorEntity.layerId ? doorEntity.targetLayerId : doorEntity.layerId;
    setPendingDoor({ door: doorEntity, destinationLayerId });
  }

  function confirmEnterDoor() {
    const pending = pendingDoor;
    setPendingDoor(null);
    if (!pending) return;
    // Move the player's own hero off the square it was standing on and
    // onto the new layer, one square clear of the door rather than sitting
    // on top of it — the door itself is always the raw entity (never the
    // target-side view-resolved copy MapBoard's onEnterDoor handed
    // enterDoor), so arrivalCellNearDoor sees its true home/target
    // col/row regardless of which side was clicked.
    const myHero = heroes.find((h) => h.ownerId === me.id);
    if (myHero) {
      const rawDoor = state.entities[pending.door.id];
      if (rawDoor) {
        const arrival = arrivalCellNearDoor(state, rawDoor, pending.destinationLayerId);
        moveEntity(myHero.id, arrival.col, arrival.row, arrival.islandId, pending.destinationLayerId);
      }
    }
    const patch = { currentLayerId: pending.destinationLayerId };
    // REQ-008: only a player ever reaches this (enterDoor excludes the
    // host), so this is always the guest-player intent branch, never the
    // guest-host broadcast one — mirrors moveEntity/updateEntity's split.
    if (isGuest) {
      guestChannelRef.current?.sendIntent({ type: 'PATCH_PLAYER', id: me.id, patch }, me.id);
      setSelectedId(null);
      return;
    }
    dispatch({ type: 'PATCH_PLAYER', id: me.id, patch });
    setSelectedId(null);
    if (isRemote) setPlayerCurrentLayerRemote(me.id, pending.destinationLayerId).catch(reportError);
  }

  function cancelEnterDoor() {
    setPendingDoor(null);
  }

  async function regenerateCode() {
    if (isRemote) {
      try {
        const next = await regenerateInviteCodeRemote(state.session.tableId);
        dispatch({ type: 'REGENERATE_INVITE_CODE', code: next });
        onCodeRotated?.(next);
      } catch (err) {
        reportError(err);
      }
      return;
    }
    if (isGuestHost) {
      // The invite code doubles as the guest broadcast channel's name
      // (guestRealtime.js) — rotating it moves the DM to a brand-new
      // channel that already-connected players have no way to learn about,
      // silently stranding them. Unlike cloud mode (whose channel is keyed
      // by the permanent tableId, not the invite code), there's no
      // regeneration path here that doesn't do that.
      alert("Regenerating the invite code isn't supported for a guest table — it would disconnect anyone already playing. Share the current code instead.");
      return;
    }
    const oldCode = state.session.code;
    let next = generateInviteCode();
    while (sessionExists(next)) next = generateInviteCode();
    dispatch({ type: 'REGENERATE_INVITE_CODE', code: next });
    saveSession(next, { ...state, session: { ...state.session, code: next } });
    deleteSession(oldCode);
    saveIdentity(next, me);
    onCodeRotated?.(next);
  }

  function toggleOpen() {
    const nextOpen = !state.session.isOpen;
    dispatch({ type: 'SET_SESSION_OPEN', isOpen: nextOpen });
    if (isRemote) setTableOpenRemote(state.session.tableId, nextOpen).catch(reportError);
    else if (isGuestHost) broadcastGuestChange({ type: 'SET_SESSION_OPEN', isOpen: nextOpen });
  }

  function saveNow() {
    console.log('Save clicked — saving table', state.session.code);
    autosaveSecondsRef.current = AUTOSAVE_INTERVAL_SECONDS;
    setAutosaveSecondsLeft(AUTOSAVE_INTERVAL_SECONDS);
    if (isRemote) {
      setSavedAgo('Synced to the cloud');
      return;
    }
    if (saveOrWarn(state.session.code, state)) setSavedAgo('Saved just now');
  }

  // `saveNow` closes over this render's `state`, so the interval below can't
  // call it directly — a setInterval callback keeps whatever closure was
  // live when the effect last ran, which (since the effect only depends on
  // isHost) would mean saving the same stale snapshot every 15 minutes
  // forever. Stashing the latest `saveNow` in a ref, reassigned every
  // render, sidesteps that — same trick as `stateRef` above for the guest
  // channel's handlers.
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;
  // The actual countdown lives in a ref, mutated directly by the interval —
  // `autosaveSecondsLeft` state only mirrors it for display. Driving the
  // countdown through a setState *updater* instead would mean calling
  // saveNowRef.current() (a real side effect: writes to localStorage)
  // from inside that updater function, which React may invoke more than
  // once per tick (e.g. Strict Mode's double-invoke) and could double-save.
  const autosaveSecondsRef = useRef(AUTOSAVE_INTERVAL_SECONDS);

  useEffect(() => {
    if (!isHost) return undefined;
    const tick = setInterval(() => {
      autosaveSecondsRef.current -= 1;
      if (autosaveSecondsRef.current <= 0) {
        saveNowRef.current();
      } else {
        setAutosaveSecondsLeft(autosaveSecondsRef.current);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [isHost]);

  function exportTable() {
    if (isGuestHost) {
      // Async (hashing the DM code) — fire and forget, matching every other
      // Toolbar action's "click and it just happens" feel; a failure here
      // would be a SubtleCrypto/browser problem, not a user mistake.
      downloadGuestSessionAsFile(state)
        .then(() => setHasExportedGuestTable(true))
        .catch(() => alert('Could not export this table — try again.'));
      return;
    }
    downloadSessionAsFile(state);
  }

  async function importTable(file) {
    // Overwrites the entire shared table — DM only (see PITFALLS.md #1).
    if (!isHost) return;
    try {
      const raw = await readEncodedJsonFromFile(file);
      if (!raw?.session?.code || !(raw?.map || raw?.layers)) {
        alert('That file does not look like a Hearthbound table export.');
        return;
      }
      if (isRemote) {
        alert('Importing a file directly into a cloud table is not supported yet — export is still available as a backup.');
        return;
      }
      if (isGuestHost) {
        // This in-session "swap the whole table" import is a separate,
        // older feature from REQ-008's own file+DM-code resume flow
        // (Slice 3) — allowing it here would silently desync every
        // connected player, since nothing broadcasts a wholesale replace.
        alert(
          'Importing a file mid-session is not supported for a guest table. To resume a previously ' +
            'exported table, leave this one first and use "Resume guest session" on the Landing screen.'
        );
        return;
      }
      const parsed = migrateLegacyState(raw);
      saveSession(parsed.session.code, parsed);
      dispatch({ type: 'HYDRATE', state: parsed });
      const importedName = parsed.layers[parsed.layerOrder[0]]?.name;
      alert(`Imported "${importedName}". This table now reflects the imported file.`);
    } catch (err) {
      alert('Could not read that file — is it a valid Hearthbound export?');
    }
  }

  // REQ-008: since nothing about a guest table is ever stored anywhere but
  // this browser, a DM leaving without exporting first loses the table for
  // good — this is the confirm gate Toolbar's Leave button now goes through
  // for a guest host; every other case (a guest player, any local/remote
  // leave) just leaves immediately via doLeaveTable, unchanged.
  function leaveTable() {
    if (isGuestHost && !hasExportedGuestTable) {
      setPendingLeaveWarning(true);
      return;
    }
    doLeaveTable();
  }

  function doLeaveTable() {
    // REQ-008: a guest player has no roster row of their own to just drop
    // locally — tell the DM they're leaving via intent so the DM's roster
    // (the shared source of truth) actually loses them too.
    if (isGuest && !isGuestHost) {
      guestChannelRef.current?.sendIntent({ type: 'REMOVE_PLAYER', id: me.id }, me.id);
      clearCurrentPointer();
      onLeave();
      return;
    }
    // REQ-008 Slice 4: this is the one choke point every deliberate guest-DM
    // leave path funnels through (whether or not they exported first) — a
    // tab that just closes or crashes never reaches this line, which is
    // exactly the "unclean" signal findUnclosedGuestTable looks for.
    if (isGuestHost) {
      markGuestClean(state.session.code);
      releaseAudioFiles(Object.values(audioTracks));
    }
    // A signed-in host leaving their own cloud table must NOT delete their
    // own player row. "members can read their table" (02_policies.sql) is
    // tables' only SELECT policy, and it requires a live players row for
    // this identity — deleting it here would permanently hide this table
    // from the host's own "Your tables" list (listMyTablesRemote) and block
    // ever resuming or deleting it again, even though the table itself
    // still exists and still counts against their 20-table cap. Unlike a
    // player freeing a seat, the host isn't vacating anything by leaving —
    // they're just navigating away from a live view they can always return
    // to by signing in again.
    if (isRemote && isHost) {
      clearCurrentPointer();
      onLeave();
      return;
    }
    dispatch({ type: 'REMOVE_PLAYER', id: me.id });
    if (isRemote) {
      removePlayerRemote(me.id).catch(reportError);
    } else if (isGuestHost) {
      broadcastGuestChange({ type: 'REMOVE_PLAYER', id: me.id });
    } else {
      const { [me.id]: _removed, ...players } = state.players;
      saveOrWarn(state.session.code, { ...state, players });
    }
    clearCurrentPointer();
    onLeave();
  }

  function cancelLeaveWarning() {
    setPendingLeaveWarning(false);
  }

  function confirmLeaveWithoutExporting() {
    setPendingLeaveWarning(false);
    doLeaveTable();
  }

  function exportThenLeave() {
    setPendingLeaveWarning(false);
    downloadGuestSessionAsFile(state)
      .then(() => {
        setHasExportedGuestTable(true);
        doLeaveTable();
      })
      .catch(() => alert('Could not export this table — try again.'));
  }

  // Island positions are stored in world-space and scaled by zoom when
  // rendered (see MapBoard), so changing zoom shifts every island's pixel
  // position on screen — without correcting scrollLeft/scrollTop to match,
  // whatever was in view jumps away. Captured just before zoom changes and
  // applied once the new zoom has rendered (below), this keeps whatever's
  // currently centered in the viewport centered after zooming, the same
  // way pinch-zoom in map apps stays anchored instead of recentering on
  // some fixed point.
  const zoomAnchorRef = useRef(null); // { oldZoom, oldScrollLeft, oldScrollTop }
  function captureZoomAnchor() {
    const stage = stageRef.current;
    zoomAnchorRef.current = {
      oldZoom: zoom,
      oldScrollLeft: stage ? stage.scrollLeft : 0,
      oldScrollTop: stage ? stage.scrollTop : 0,
    };
  }
  useEffect(() => {
    const anchor = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    const stage = stageRef.current;
    if (!anchor || !stage || anchor.oldZoom === zoom) return;
    const ratio = zoom / anchor.oldZoom;
    stage.scrollLeft = (anchor.oldScrollLeft + stage.clientWidth / 2) * ratio - stage.clientWidth / 2;
    stage.scrollTop = (anchor.oldScrollTop + stage.clientHeight / 2) * ratio - stage.clientHeight / 2;
  }, [zoom]);

  // Shared by the toolbar's +/− cards and the map's scroll-wheel handler
  // (MapBoard's onWheel, active in every tool) so both drive the same zoom.
  function zoomIn() {
    captureZoomAnchor();
    setZoom((z) => clampZoom(z + ZOOM_STEP, isPhone ? PHONE_ZOOM_MIN : ZOOM_MIN));
  }
  function zoomOut() {
    captureZoomAnchor();
    setZoom((z) => clampZoom(z - ZOOM_STEP, isPhone ? PHONE_ZOOM_MIN : ZOOM_MIN));
  }
  function zoomReset() {
    captureZoomAnchor();
    setZoom(1);
  }

  // Scroll wheel always zooms, regardless of the active tool (Play, Edit,
  // Pan, Ruler) — dragging (Pan) and the scrollbars remain how you move
  // around the map. Attached to the whole stage, not just the map canvas,
  // so it works even over the empty margin around a small map.
  //
  // Wired as a native listener (not React's onWheel) because React attaches
  // wheel/touch listeners at the root as passive for scroll performance —
  // preventDefault() inside a passive listener is a silent no-op that spams
  // "Unable to preventDefault inside passive event listener invocation" on
  // every tick, and the page would still scroll along with the zoom.
  const handleStageWheelRef = useRef(null);
  handleStageWheelRef.current = function handleStageWheel(e) {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else if (e.deltaY > 0) zoomOut();
  };
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const onWheel = (e) => handleStageWheelRef.current(e);
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  // ---- Phone layout (MOBILE_DESIGN.md) ----
  // Islands first: the top bar names the island you're on, the chips fly the
  // camera from island to island (fitting each to the screen), and a pinch
  // zooms. Everything not yet redesigned for phones opens in a bottom sheet.
  const isPhone = usePhoneLayout();
  const [phoneSheet, setPhoneSheet] = useState(null); // null | 'panel' | 'add' | 'menu' | 'layers' | 'atlas'
  // A hint's "Open Tokens": the Tokens panel on desktop, the Add sheet on a
  // phone.
  useFx((event) => {
    if (event.type !== 'open' || event.panel !== 'tokens' || !isHost) return;
    if (isPhone) setPhoneSheet('add');
    else if (leftCollapsed) togglePanel('left');
  });

  // The zoom that fits a whole island inside the stage, less its padding.
  function fitZoomFor(island) {
    const stage = stageRef.current;
    if (!stage || !island) return zoom;
    const w = stage.clientWidth - STAGE_PADDING * 2 - 16;
    const h = stage.clientHeight - STAGE_PADDING * 2 - 16;
    const z = Math.min(w / (island.cols * island.cellSize), h / (island.rows * island.cellSize));
    return Math.min(ZOOM_MAX, Math.max(PHONE_ZOOM_MIN, Math.round(z * 100) / 100));
  }
  function flyToIsland(islandId) {
    const island = currentLayer.islands[islandId];
    if (!island) return;
    setActiveIslandId(islandId);
    setZoom(fitZoomFor(island));
    pendingRecenterIslandIdRef.current = islandId;
  }

  // Land on your own hero's island (or the base island) whenever the phone
  // layout starts or the layer changes.
  const myHeroOnLayer = heroes.find((h) => h.ownerId === me.id && h.layerId === currentLayerId);
  useEffect(() => {
    if (!isPhone) return;
    flyToIsland(myHeroOnLayer?.islandId || currentLayer.islandOrder[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPhone, currentLayerId]);

  // Touch gestures on the map, in every layout (phones, tablets, touch
  // laptops, a desktop browser's device emulation): two fingers pinch-zoom around their
  // midpoint (and pan as they move); one finger on empty map pans in the Play
  // tool, so a token drag and a pan never fight. MapBoard reads
  // `touchGestureRef.current.panned` to skip the click that ends a pan.
  const touchGestureRef = useRef({ panned: false, pan: null, pinch: null });
  const pinchAnchorRef = useRef(null); // { worldX, worldY, relX, relY }
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  useLayoutEffect(() => {
    const anchor = pinchAnchorRef.current;
    const stage = stageRef.current;
    if (!anchor || !stage) return;
    pinchAnchorRef.current = null;
    stage.scrollLeft = anchor.worldX * zoom + STAGE_PADDING - anchor.relX;
    stage.scrollTop = anchor.worldY * zoom + STAGE_PADDING - anchor.relY;
  }, [zoom]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const g = touchGestureRef.current;
    const zoomMin = isPhone ? PHONE_ZOOM_MIN : ZOOM_MIN;
    const rel = (t) => {
      const r = stage.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    // While two fingers are down the canvas is only scaled with a CSS
    // transform; the real zoom (which re-renders the whole map) is set once,
    // when the pinch ends.
    function endPinch() {
      const p = g.pinch;
      g.pinch = null;
      if (!p) return;
      p.canvas.style.transform = '';
      p.canvas.style.transformOrigin = '';
      p.canvas.style.willChange = '';
      const next = Math.min(ZOOM_MAX, Math.max(zoomMin, p.zoom * p.scale));
      if (next === zoomRef.current) {
        stage.scrollLeft = p.worldX * next + STAGE_PADDING - p.mid.x;
        stage.scrollTop = p.worldY * next + STAGE_PADDING - p.mid.y;
      } else {
        pinchAnchorRef.current = { worldX: p.worldX, worldY: p.worldY, relX: p.mid.x, relY: p.mid.y };
        setZoom(next);
      }
    }
    function onStart(e) {
      const canvas = stage.querySelector('.island-canvas');
      if (e.touches.length === 2 && canvas) {
        const a = rel(e.touches[0]);
        const b = rel(e.touches[1]);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const z = zoomRef.current;
        canvas.style.transformOrigin = '0 0';
        canvas.style.willChange = 'transform';
        g.pinch = {
          canvas,
          dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          zoom: z,
          scale: 1,
          mid,
          left: stage.scrollLeft,
          top: stage.scrollTop,
          worldX: (stage.scrollLeft + mid.x - STAGE_PADDING) / z,
          worldY: (stage.scrollTop + mid.y - STAGE_PADDING) / z,
        };
        g.pan = null;
        g.panned = true;
        e.preventDefault();
      } else if (e.touches.length === 1) {
        g.panned = false;
        g.pan =
          toolRef.current === 'play' && !e.target.closest('.token')
            ? { x: e.touches[0].clientX, y: e.touches[0].clientY, left: stage.scrollLeft, top: stage.scrollTop }
            : null;
      }
    }
    function onMove(e) {
      if (g.pinch && e.touches.length === 2) {
        e.preventDefault();
        const p = g.pinch;
        const a = rel(e.touches[0]);
        const b = rel(e.touches[1]);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const next = Math.min(ZOOM_MAX, Math.max(zoomMin, (p.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / p.dist));
        const scale = next / p.zoom;
        // Keep the world point that started under the fingers under their midpoint.
        const tx = mid.x - STAGE_PADDING + p.left - p.worldX * p.zoom * scale;
        const ty = mid.y - STAGE_PADDING + p.top - p.worldY * p.zoom * scale;
        p.canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
        p.scale = scale;
        p.mid = mid;
      } else if (g.pan && e.touches.length === 1) {
        const dx = e.touches[0].clientX - g.pan.x;
        const dy = e.touches[0].clientY - g.pan.y;
        if (!g.panned && Math.hypot(dx, dy) < 6) return;
        g.panned = true;
        e.preventDefault();
        stage.scrollLeft = g.pan.left - dx;
        stage.scrollTop = g.pan.top - dy;
      }
    }
    function onEnd(e) {
      if (e.touches.length < 2) endPinch();
      if (e.touches.length === 0) {
        g.pan = null;
        // Long enough for the click that ends this touch to see it; then a
        // later mouse click (a touch laptop) isn't mistaken for a pan's end.
        if (g.panned) {
          setTimeout(() => {
            if (!g.pan && !g.pinch) g.panned = false;
          }, 400);
        }
      }
    }
    stage.addEventListener('touchstart', onStart, { passive: false });
    stage.addEventListener('touchmove', onMove, { passive: false });
    stage.addEventListener('touchend', onEnd);
    stage.addEventListener('touchcancel', onEnd);
    return () => {
      stage.removeEventListener('touchstart', onStart);
      stage.removeEventListener('touchmove', onMove);
      stage.removeEventListener('touchend', onEnd);
      stage.removeEventListener('touchcancel', onEnd);
    };
  }, [isPhone]);

  // ---- Tap to move (phone) ----
  // With a token you may move selected, tapping a square moves it there; the
  // acting token in an encounter only gets a planned move, which "Move here"
  // commits (its movement is budgeted).
  const [plannedMove, setPlannedMove] = useState(null); // { entityId, islandId, col, row }
  useEffect(() => {
    setPlannedMove(null);
  }, [selectedId, actorId, currentLayerId, isPhone]);

  function doorAt(islandId, col, row) {
    return Object.values(layerEntities).find((e) => e.kind === 'door' && e.islandId === islandId && e.col === col && e.row === row) || null;
  }
  function commitMove(entity, islandId, col, row) {
    moveEntity(entity.id, col, row, islandId);
    // Landing a hero on a door's square offers to walk through it, as a drag does.
    const door = entity.kind === 'hero' && !isHost ? doorAt(islandId, col, row) : null;
    if (door) enterDoor(door);
  }
  function handleTapCell(islandId, col, row) {
    const entity = selectedEntity;
    if (!entity || (entity.kind !== 'hero' && entity.kind !== 'mob') || !canMoveEntity(entity)) return false;
    if (entity.islandId === islandId && entity.col === col && entity.row === row) return false;
    if (encounter && actor?.id === entity.id) {
      setPlannedMove({ entityId: entity.id, islandId, col, row });
      return true;
    }
    commitMove(entity, islandId, col, row);
    return true;
  }
  function confirmPlannedMove() {
    const entity = plannedMove && state.entities[plannedMove.entityId];
    if (entity) commitMove(entity, plannedMove.islandId, plannedMove.col, plannedMove.row);
    setPlannedMove(null);
  }

  // What the confirm card and the map label say about a planned move.
  let plannedMoveInfo = null;
  if (plannedMove && state.entities[plannedMove.entityId]) {
    const entity = state.entities[plannedMove.entityId];
    const fps = islandFeet(currentLayer, plannedMove.islandId);
    const target = { col: plannedMove.col, row: plannedMove.row };
    const sameIsland = entity.islandId === plannedMove.islandId;
    const start = encounter?.turnStart?.id === entity.id ? encounter.turnStart : null;
    const island = currentLayer.islands[plannedMove.islandId];
    const leftAfter =
      start && start.islandId === plannedMove.islandId ? Math.max(0, speedOf(entity) - feetDistance(start, target, fps)) : null;
    plannedMoveInfo = {
      name: entity.name,
      feet: sameIsland ? feetDistance(entity, target, fps) : null,
      leftAfter,
      total: speedOf(entity),
      islandName: sameIsland ? null : island?.name || 'another island',
    };
  }
  // On the acting hero's turn, a creature they could attack gets a Target button.
  const canTargetSelected = Boolean(
    encounter && actor?.kind === 'hero' && (isHost || isMyTurn) && selectedEntity && selectedEntity.id !== actor.id && selectedEntity.kind === 'mob'
  );

  const plannedMoveForMap = plannedMove
    ? { ...plannedMove, label: plannedMoveInfo?.feet != null ? `${plannedMoveInfo.feet} ft` : plannedMoveInfo?.islandName || '' }
    : null;

  // A guest table lives in the DM's browser: while one is hosted from a
  // phone, keep the screen from sleeping. The browser drops the lock whenever
  // the page is hidden, so it's asked for again each time the page returns.
  useEffect(() => {
    if (!isPhone || !isGuestHost || !navigator.wakeLock) return undefined;
    let lock = null;
    let cancelled = false;
    async function request() {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) lock.release().catch(() => {});
      } catch {
        // refused (battery saver, unsupported context) — the menu's note still applies
      }
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') request();
    }
    request();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      lock?.release().catch(() => {});
    };
  }, [isPhone, isGuestHost]);

  // Leaving the phone layout shouldn't leave a sheet open behind the desktop.
  useEffect(() => {
    if (!isPhone) setPhoneSheet(null);
  }, [isPhone]);

  const shownPanelWidths = fitPanelWidths(panelWidths, viewportWidth, leftCollapsed, rightCollapsed);

  // The toolbar spans the whole window above the panels rather than sitting
  // in the map's column: its commands are table-wide, and the full width is
  // what lets it keep its labels on an ordinary laptop screen.
  const toolbarEl = (
      <Toolbar
        dice={{ ...diceApi, share: rollShare }}
        revealRolls={revealRolls}
        onRevealRollsChange={setRevealRolls}
        isHost={isHost}
        isGuestHost={isGuestHost}
        layer={currentLayer}
        activeIsland={currentLayer.islands[activeIslandId] || currentLayer.islands[currentLayer.islandOrder[0]]}
        tool={tool}
        hideDrawings={hideDrawings}
        onToggleHideDrawings={() => setHideDrawings(!hideDrawings)}
        onToolChange={setTool}
        onIslandPatch={(patch) => updateIsland(activeIslandId, patch)}
        session={state.session}
        onRegenerateCode={regenerateCode}
        onToggleOpen={toggleOpen}
        onSaveNow={saveNow}
        autosaveSecondsLeft={autosaveSecondsLeft}
        clock={state.clock}
        onAddEntity={addEntity}
        onOpenClock={() => setShowClockModal(true)}
        audio={audioApi}
        musicHint={isGuest ? 'On a guest table the music plays only on the DM’s own device.' : 'Music plays on cloud and guest tables. This one is a local demo, so it stays quiet.'}
        onOpenMusic={() => setShowMusicModal(true)}
        onSetClockRunning={setClockRunning}
        dayPhase={tablePhase}
        dayNightOverride={state.dayNightOverride}
        onSetDayNightOverride={updateDayNightOverride}
        onExport={exportTable}
        onImport={importTable}
        onLeave={leaveTable}
        lastSavedLabel={savedAgo}
        layers={state.layers}
        layerOrder={state.layerOrder}
        currentLayerId={currentLayerId}
        layerPlayerCounts={layerPlayerCounts}
        onSwitchLayer={setHostViewLayerId}
        onCreateLayer={createLayer}
        onRemoveLayer={removeLayer}
        activeIslandId={activeIslandId}
        onSelectIsland={setActiveIslandId}
        onCreateIsland={createIsland}
        onRemoveIsland={removeIsland}
        onDownloadIslandImage={downloadIslandImage}
        onUpdateIsland={updateIsland}
        onUngroupIslands={ungroupIslands}
        onRenameGroup={renameGroup}
        onIslandConditions={(islandId, conditions) => updateIsland(islandId, { conditions })}
        onGroupConditions={(groupId, conditions) => updateGroup(groupId, { conditions })}
        heroes={heroes}
        onUpdateEntity={updateEntity}
        initiativeHeroes={initiativeHeroes}
        initiativeMobs={initiativeMobs}
        onRollInitiative={rollInitiative}
        encounterActive={Boolean(encounter)}
        onToggleEncounter={toggleEncounter}
        customAssets={state.customAssets}
        onAddCustomAsset={addCustomAsset}
        onRemoveCustomAsset={removeCustomAsset}
        collapsed={isPhone ? false : toolbarCollapsed}
        onToggleCollapsed={() => setToolbarCollapsed((c) => !c)}
        zoom={zoom}
      />
  );

  const tokenSidebarEl = (
        <TokenSidebar
          onAddEntity={addEntity}
          onCreateLayer={isHost ? createLayer : null}
          layers={state.layers}
          layerOrder={state.layerOrder}
          currentLayerId={currentLayerId}
          isHost={isHost}
          customAssets={state.customAssets}
          collapsed={isPhone ? false : leftCollapsed}
          onToggleCollapsed={() => (isPhone ? setPhoneSheet(null) : togglePanel('left'))}
          layout={isPhone ? 'phone' : 'panel'}
        />
  );

  const rightPanelEl = (
        <RightPanel
          audio={audioApi}
          players={state.players}
          hostId={state.session.hostPlayerId}
          layers={state.layers}
          layerOrder={state.layerOrder}
          entities={layerEntities}
          selectedEntity={selectedEntity}
          isHost={isHost}
          meId={me.id}
          onUpdateEntity={updateEntity}
          onRemoveEntity={removeEntity}
          tool={tool}
          heroes={heroes}
          onGiveChestItem={giveChestItemToHero}
          onTakeChestItem={takeChestItem}
          collapsed={rightCollapsed}
          onToggleCollapsed={() => togglePanel('right')}
          encounterActor={actor}
          rollLog={rollLog}
        />
  );

  const activeIsland = currentLayer.islands[activeIslandId] || currentLayer.islands[currentLayer.islandOrder[0]];
  const layerIndex = state.layerOrder.indexOf(currentLayerId);
  const { originX: canvasOriginX, originY: canvasOriginY } = computeCanvasBounds(currentLayer.islands);

  return (
    <div className={`game-screen${isPhone ? ' phone' : ''}`}>
      {isPhone ? (
        <>
          <PhoneTopBar
            islandName={activeIsland?.name || currentLayer.name}
            layerName={currentLayer.name}
            layerIndex={layerIndex}
            layerCount={state.layerOrder.length}
            feetPerSquare={islandFeet(currentLayer, activeIslandId)}
            onAtlas={() => setPhoneSheet('atlas')}
            onLayers={() => setPhoneSheet('layers')}
            onMenu={() => setPhoneSheet('menu')}
          />
          <PhoneIslandStrip
            layer={currentLayer}
            entities={layerEntities}
            activeIslandId={activeIslandId}
            onPick={flyToIsland}
            onAddIsland={isHost ? () => emitFx({ type: 'open', panel: 'islands' }) : null}
          />
        </>
      ) : (
        toolbarEl
      )}

      <div
        className={`game-layout${isPhone ? ' phone-layout' : drawerLayout ? ' drawers' : ''}${!isPhone && leftCollapsed ? ' left-collapsed' : ''}${!isPhone && rightCollapsed ? ' right-collapsed' : ''}`}
        style={{ '--left-w': `${shownPanelWidths.left}px`, '--right-w': `${shownPanelWidths.right}px` }}
      >
        {!isPhone && tokenSidebarEl}

        <div className="game-center">
          {!isPhone && (
          <LayerStrip
            layers={state.layers}
            layerOrder={state.layerOrder}
            currentLayerId={currentLayerId}
            layerPlayerCounts={layerPlayerCounts}
            isHost={isHost}
            onSwitchLayer={setHostViewLayerId}
            feetPerSquare={islandFeet(currentLayer, activeIslandId)}
            clock={state.clock}
            phaseOverride={state.dayNightOverride}
          />
          )}
          <div className="stage-wrap">
          <div className="stage" ref={stageRef}>
            <MapBoard
              islands={currentLayer.islands}
              islandOrder={currentLayer.islandOrder}
              islandGroups={currentLayer.islandGroups || {}}
              pendingGroupIslandIds={pendingGroupIslandIds}
              dayPhase={tablePhase}
              onToggleGroupCandidate={toggleGroupCandidate}
              onMoveIslandGroup={moveIslandGroup}
              feetPerSquare={currentLayer.feetPerSquare}
              activeIslandId={activeIslandId}
              onSelectIsland={setActiveIslandId}
              onMoveIsland={moveIsland}
              entities={layerEntities}
              entityOrder={layerEntityOrder}
              selectedId={selectedId}
              onSelectEntity={setSelectedId}
              onMoveEntity={moveEntity}
              canMoveEntity={canMoveEntity}
              isHost={isHost}
              onEnterDoor={enterDoor}
              tool={tool}
              zoom={zoom}
              onRulerChange={setRulerFeet}
              moveRange={moveRange}
              actorId={actorId}
              gestureRef={touchGestureRef}
              onTapCell={isPhone ? handleTapCell : null}
              plannedMove={isPhone ? plannedMoveForMap : null}
              drawings={state.drawings}
              hideDrawings={hideDrawings}
              drawingOrder={state.drawingOrder}
              drawSettings={isHost ? drawSettings : null}
              onAddDrawing={isHost ? addDrawing : null}
              onUpdateDrawing={isHost ? updateDrawing : null}
              onRemoveDrawings={isHost ? removeDrawings : null}
              selectedDrawingId={tool === 'draw' ? selectedDrawingId : null}
              onSelectDrawing={setSelectedDrawingId}
            />
          </div>
          {isPhone && (
            <>
              <PhoneMiniMap
                layer={currentLayer}
                zoom={zoom}
                stageRef={stageRef}
                originX={canvasOriginX}
                originY={canvasOriginY}
                stagePadding={STAGE_PADDING}
                activeIslandId={activeIslandId}
                onOpen={() => setPhoneSheet('atlas')}
              />
              <PhoneIslandConditions conditions={islandConditionKeys(currentLayer, activeIslandId)} />
              {isHost && (tool === 'edit' || tool === 'group') && (
                <PhoneEditBar
                  tool={tool}
                  islandName={activeIsland?.name}
                  onSettings={() => emitFx({ type: 'open', panel: 'islands', islandId: activeIslandId })}
                  onGroup={() => setPhoneSheet('group')}
                  onDraw={() => setTool('draw')}
                  onDone={() => setTool(tool === 'group' ? 'edit' : 'play')}
                />
              )}
              {isHost && tool === 'draw' && (
                <PhoneDrawBar
                  settings={drawSettings}
                  onChange={setDrawSettings}
                  canUndo={canUndoDrawing}
                  canRedo={canRedoDrawing}
                  onUndo={undoDrawing}
                  onRedo={redoDrawing}
                  onStyle={() => setPhoneSheet('drawstyle')}
                  onDone={() => setTool('edit')}
                />
              )}
              {!isHost && tool !== 'draw' && !selectedEntity && !heroes.some((h) => h.ownerId === me.id) && (
                <div className="phone-no-hero">
                  <EmptyState icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6" /></svg>} title="You don’t have a hero yet">
                    Ask your DM to pick you under <b>played by</b> on a hero’s card. You can look around and roll dice meanwhile.
                  </EmptyState>
                </div>
              )}
              {tool === 'draw' ? null : plannedMoveInfo ? (
                <PhoneMoveCard info={plannedMoveInfo} onCancel={() => setPlannedMove(null)} onConfirm={confirmPlannedMove} />
              ) : (
                <PhoneTokenCard
                  entity={selectedEntity}
                  isHost={isHost}
                  onOpen={() => setPhoneSheet(selectedEntity?.kind === 'chest' ? 'chest' : selectedEntity?.kind === 'hero' || selectedEntity?.kind === 'mob' ? 'creature' : 'inspect')}
                  onHp={(hp) => selectedEntity && updateEntity(selectedEntity.id, { hp })}
                  onTarget={canTargetSelected ? () => setPhoneSheet('target') : null}
                />
              )}
            </>
          )}
          {encounter && !isPhone ? (
            <TurnOrderRibbon encounter={encounter} entities={state.entities} meId={me.id} />
          ) : (
            <InitiativeBar entities={encounter ? state.entities : layerEntities} encounter={encounter} />
          )}
          {encounter && (
            <EncounterActions
              actor={actor}
              canEndTurn={canEndTurn}
              isMyTurn={isMyTurn}
              onEndTurn={endTurn}
              isHost={isHost}
              onEndEncounter={() => setEncounter(null)}
              movement={movement}
              log={combatLog}
            />
          )}
          <FxLayer />
          {!isPhone && <BookTabs isHost={isHost} chronicleOpen={chronicleOpen} onToggleChronicle={() => setChronicleOpen((o) => !o)} />}
          {chronicleOpen && (
            <div className="book-chronicle">
              <CombatLog log={combatLog} onClose={() => setChronicleOpen(false)} />
            </div>
          )}
          <RulerReadout feet={tool === 'ruler' ? rulerFeet : null} />
          <RollToasts toasts={rollToasts} onDismiss={(id) => setRollToasts((prev) => prev.filter((t) => t.id !== id))} />
          {isHost && tool === 'play' && Object.keys(layerEntities).length === 0 && (
            <div className="map-empty">
              <EmptyState
                icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14" /></svg>}
                title="This map is empty"
                action={isPhone ? 'Add to the map' : 'Open Tokens'}
                onAction={() => emitFx({ type: 'open', panel: 'tokens' })}
              >
                {isPhone ? (
                  <>Add heroes, monsters, doors and chests with the <b>Add</b> button below.</>
                ) : (
                  <>
                    Add heroes, monsters, doors and chests from the <b>Tokens</b> panel on the left.
                  </>
                )}
              </EmptyState>
            </div>
          )}
          {/* While a tool changes what a press does, say so across the top of
              the map (the phone's Edit and Draw have their own bars). */}
          {tool === 'ruler' && (
            <ModeBar id="ruler" className="map-mode-bar" label="Ruler." doneLabel="Play" onDone={() => setTool('play')}>
              Drag from one square to another. Every second diagonal counts as {islandFeet(currentLayer, activeIslandId) * 2} ft.
            </ModeBar>
          )}
          {!isPhone && isHost && tool === 'edit' && (
            <ModeBar id="edit" className="map-mode-bar" label="Edit mode." doneLabel="Done" onDone={() => setTool('play')}>
              Drag an island to move it. Where edges touch, tokens walk across.
            </ModeBar>
          )}
          {!isPhone && isHost && tool === 'group' && (
            <ModeBar id="group" className="map-mode-bar" label="Merge islands." doneLabel="Cancel" onDone={cancelGroup}>
              Click islands to add them to a group. A group moves together and shares one name.
            </ModeBar>
          )}
          {!isPhone && isHost && tool === 'draw' && (
            <ModeBar id="draw" className="map-mode-bar" label="Draw." doneLabel="Done" onDone={() => setTool('play')}>
              Everyone at the table sees what you draw. Right-drag moves the map.
            </ModeBar>
          )}
          {isHost && !isPhone && tool === 'draw' && (
            <DrawingBar
              settings={drawSettings}
              onChange={setDrawSettings}
              recentColours={recentColours}
              canUndo={canUndoDrawing}
              canRedo={canRedoDrawing}
              onUndo={undoDrawing}
              onRedo={redoDrawing}
              islandName={currentLayer.islands[activeIslandId]?.name || 'this island'}
              mapName={currentLayer.name}
              islandCount={drawingIdsOnIsland(activeIslandId).length}
              mapCount={drawingIdsOnMap().length}
              onClearIsland={() => removeDrawings(drawingIdsOnIsland(activeIslandId))}
              onClearMap={() => removeDrawings(drawingIdsOnMap())}
            />
          )}
          <ZoomControl
            zoom={zoom}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onZoomReset={zoomReset}
            onRecenter={() => (isPhone ? flyToIsland(activeIslandId) : recenterOnIsland(activeIslandId))}
          />
          </div>
        </div>

        {!isPhone && rightPanelEl}

        {showMusicModal && audioEnabled && (
          <MusicModal
            audio={audioApi}
            worldTrack={worldTrack}
            worldTargetId={audioScope}
            layers={state.layers}
            layerOrder={state.layerOrder}
            entities={state.entities}
            isGuest={isGuest}
            encounterVolume={encounterMusicVolume}
            onEncounterVolume={(v) => {
              setEncounterMusicVolume(v);
              setSfxVolume(ENCOUNTER_MUSIC.id, v);
            }}
            onClose={() => setShowMusicModal(false)}
          />
        )}

        {audioBlocked && (
          <button className="audio-unlock-banner" onClick={unlockAudio}>
            🔊 Tap to enable sound
          </button>
        )}

        {showClockModal && isHost && (
          <ClockModal
            clock={state.clock}
            onSave={(clock) => {
              updateClock(clock);
              setShowClockModal(false);
            }}
            onRemove={() => {
              updateClock(null);
              setShowClockModal(false);
            }}
            onClose={() => setShowClockModal(false)}
          />
        )}

        {/* Drawers keep their preferred width, clamped by CSS — no resizing. */}
        {!isPhone && !leftCollapsed && !drawerLayout && (
          <PanelResizer
            side="left"
            width={shownPanelWidths.left}
            label="Resize tokens panel"
            onResize={(w) => resizePanel('left', w)}
            onReset={() => resizePanel('left', DEFAULT_PANEL_WIDTHS.left)}
          />
        )}
        {!isPhone && !rightCollapsed && !drawerLayout && (
          <PanelResizer
            side="right"
            width={shownPanelWidths.right}
            label="Resize players and inspector panel"
            onResize={(w) => resizePanel('right', w)}
            onReset={() => resizePanel('right', DEFAULT_PANEL_WIDTHS.right)}
          />
        )}

        {!isPhone && pendingDoor && (
          <div className="door-confirm-backdrop" onClick={cancelEnterDoor}>
            <div className="door-confirm-card" onClick={(e) => e.stopPropagation()}>
              <h4><ModalIcon name="door" />Open the door?</h4>
              <p>
                Step through <strong>{pendingDoor.door.name}</strong> to{' '}
                <strong>{state.layers[pendingDoor.destinationLayerId]?.name || 'the other layer'}</strong>?
              </p>
              <div className="door-confirm-actions">
                <button className="btn btn-secondary" onClick={cancelEnterDoor}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={confirmEnterDoor}>
                  Open door
                </button>
              </div>
            </div>
          </div>
        )}

        {tool === 'group' && !isPhone && <GroupConfirmPanel count={pendingGroupIslandIds.length} onConfirm={confirmGroup} onCancel={cancelGroup} />}

        {pendingLeaveWarning && (
          <div className="door-confirm-backdrop" onClick={cancelLeaveWarning}>
            <div className="door-confirm-card" onClick={(e) => e.stopPropagation()}>
              <h4><ModalIcon name="exit" />Leave without exporting?</h4>
              <p>
                Nothing about this guest table is saved anywhere but this browser. If you leave now without
                exporting, <strong>everything since it opened will be lost for good.</strong>
              </p>
              <div className="door-confirm-actions">
                <button className="btn btn-secondary" onClick={cancelLeaveWarning}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={confirmLeaveWithoutExporting}>
                  Leave anyway
                </button>
                <button className="btn btn-primary" onClick={exportThenLeave}>
                  Export &amp; leave
                </button>
              </div>
            </div>
          </div>
        )}

        {reconnectUi.blocked && (
          <div className="reconnect-scrim">
            <div className="reconnect-card">
              <p>Reconnecting…</p>
              {reconnectUi.resyncFailed >= 4 && (
                <button className="btn btn-primary" onClick={() => window.location.reload()}>
                  Still trying — reload the page
                </button>
              )}
            </div>
          </div>
        )}

        {hostAbsentBanner && (
          <div className="host-absent-banner">
            The host has left the table. This session will end in{' '}
            {String(Math.floor(hostAbsentSecondsLeft / 60)).padStart(2, '0')}:
            {String(hostAbsentSecondsLeft % 60).padStart(2, '0')} unless they return.
          </div>
        )}
      </div>

      {isPhone && (
        <>
          {/* The host's toolbar stays mounted (hidden) on a phone so its panels —
              bestiary, initiative, layers, islands, asset storage — can open over
              lib/fx.js from the phone screens. */}
          {isHost && <div className="phone-toolbar-host">{toolbarEl}</div>}
          <PhoneNav isHost={isHost} tool={tool} onTool={setTool} onOpen={setPhoneSheet} />
          {phoneSheet === 'inspect' && (selectedEntity?.kind === 'door' || selectedEntity?.kind === 'trap') && (
            <PhoneSheet title={selectedEntity.name} onClose={() => setPhoneSheet(null)}>
              <div className="phone-sheet-pad">
                {selectedEntity.kind === 'door' ? (
                  <DoorInspector
                    entity={selectedEntity}
                    layers={state.layers}
                    layerOrder={state.layerOrder}
                    isHost={isHost}
                    onUpdate={updateEntity}
                    onRemove={(id) => {
                      removeEntity(id);
                      setPhoneSheet(null);
                    }}
                  />
                ) : (
                  <TrapInspector
                    entity={selectedEntity}
                    isHost={isHost}
                    onUpdate={updateEntity}
                    onRemove={(id) => {
                      removeEntity(id);
                      setPhoneSheet(null);
                    }}
                  />
                )}
              </div>
            </PhoneSheet>
          )}
          {pendingDoor && (
            <PhoneDoorSheet
              door={pendingDoor.door}
              doorIslandName={currentLayer.islands[pendingDoor.door.islandId]?.name}
              destLayerName={state.layers[pendingDoor.destinationLayerId]?.name || 'the other layer'}
              destIslandName={state.layers[pendingDoor.destinationLayerId]?.islands?.[state.layers[pendingDoor.destinationLayerId]?.islandOrder?.[0]]?.name}
              peopleThere={Object.values(state.players)
                .filter((p) => p.id !== me.id && (p.currentLayerId || baseLayerId) === pendingDoor.destinationLayerId)
                .map((p) => p.name)}
              onWalk={confirmEnterDoor}
              onCancel={cancelEnterDoor}
            />
          )}
          {phoneSheet === 'chest' && selectedEntity?.kind === 'chest' && (
            <PhoneChestSheet
              entity={selectedEntity}
              islandName={currentLayer.islands[selectedEntity.islandId]?.name}
              isHost={isHost}
              heroes={heroes}
              meId={me.id}
              onUpdate={updateEntity}
              onGive={giveChestItemToHero}
              onTake={takeChestItem}
              onClose={() => setPhoneSheet(null)}
            />
          )}
          {phoneSheet === 'creature' && selectedEntity && (selectedEntity.kind === 'hero' || selectedEntity.kind === 'mob') && (
            <PhoneCreatureSheet
              entity={selectedEntity}
              isHost={isHost}
              meId={me.id}
              players={state.players}
              entities={layerEntities}
              audio={audioApi}
              onUpdate={updateEntity}
              onRemove={removeEntity}
              onClose={() => setPhoneSheet(null)}
            />
          )}
          {phoneSheet === 'target' && canTargetSelected && (
            <PhoneTargetSheet
              actor={actor}
              target={selectedEntity}
              getTarget={(id) => state.entities[id]}
              onDamage={updateEntity}
              onClose={() => setPhoneSheet(null)}
            />
          )}
          {phoneSheet === 'add' && isHost && (
            <PhoneSheet title="Add to the map" onClose={() => setPhoneSheet(null)}>
              {tokenSidebarEl}
            </PhoneSheet>
          )}
          {phoneSheet === 'menu' && !isHost && (
            <PhonePlayerMenu
              clock={state.clock}
              phaseOverride={state.dayNightOverride}
              layerName={currentLayer.name}
              dmName={state.players[state.session.hostPlayerId]?.name}
              seated={Object.values(state.players)
                .filter((p) => p.id !== state.session.hostPlayerId)
                .map((p) => (p.id === me.id ? `${p.name} (you)` : p.name))}
              island={activeIsland}
              islandConditions={islandConditionKeys(currentLayer, activeIslandId)}
              feetPerSquare={islandFeet(currentLayer, activeIslandId)}
              theme={theme}
              onThemeChange={onThemeChange}
              muted={deviceMuted}
              onMutedChange={toggleDeviceMuted}
              hideDrawings={hideDrawings}
              onHideDrawingsChange={setHideDrawings}
              onLeave={leaveTable}
              onClose={() => setPhoneSheet(null)}
            />
          )}
          {phoneSheet === 'group' && isHost && (
            <PhoneGroupSheet
              layer={currentLayer}
              tokenCounts={Object.values(layerEntities).reduce((acc, e) => ({ ...acc, [e.islandId]: (acc[e.islandId] || 0) + 1 }), {})}
              activeIslandId={activeIslandId}
              onGroup={(ids, name) => {
                confirmGroup(name, ids);
                setPhoneSheet(null);
              }}
              onRename={renameGroup}
              onUngroup={ungroupIslands}
              onClose={() => setPhoneSheet(null)}
            />
          )}
          {phoneSheet === 'drawstyle' && isHost && (
            <PhoneSheet title="Drawing style" onClose={() => setPhoneSheet(null)} className="phone-sheet-drawstyle">
              <DrawStylePanel style={drawSettings.style} recent={recentColours} onChange={(style) => setDrawSettings({ ...drawSettings, style })} />
              <PhoneSwitch
                label="Snap to grid"
                caption="Lines, circles and rectangles land on the grid."
                checked={drawSettings.snap}
                onChange={(snap) => setDrawSettings({ ...drawSettings, snap })}
              />
              <DrawClearMenu
                islandName={currentLayer.islands[activeIslandId]?.name || 'this island'}
                mapName={currentLayer.name}
                islandCount={drawingIdsOnIsland(activeIslandId).length}
                mapCount={drawingIdsOnMap().length}
                onClearIsland={() => removeDrawings(drawingIdsOnIsland(activeIslandId))}
                onClearMap={() => removeDrawings(drawingIdsOnMap())}
              />
            </PhoneSheet>
          )}
          {phoneSheet === 'party' && (
            <PhonePartySheet
              players={state.players}
              hostId={state.session.hostPlayerId}
              meId={me.id}
              entities={state.entities}
              layers={state.layers}
              currentLayerId={currentLayerId}
              onShow={(hero) => {
                setPhoneSheet(null);
                flyToIsland(hero.islandId);
                setSelectedId(hero.id);
              }}
              onShowRolls={() => setPhoneSheet('rolls')}
              rollCount={rollLog.length}
              onClose={() => setPhoneSheet(null)}
            />
          )}
          {phoneSheet === 'dice' && <DiceModal {...diceApi} share={rollShare} onClose={() => setPhoneSheet(null)} />}
          {phoneSheet === 'menu' && isHost && (
            <PhoneHostMenu
              session={state.session}
              isGuestHost={isGuestHost}
              savedLabel={savedAgo}
              autosaveSecondsLeft={autosaveSecondsLeft}
              onRegenerateCode={regenerateCode}
              onToggleOpen={toggleOpen}
              onSaveNow={saveNow}
              onExport={exportTable}
              onImport={importTable}
              onManageIslands={() => {
                setPhoneSheet(null);
                emitFx({ type: 'open', panel: 'islands' });
              }}
              onManageLayers={() => {
                setPhoneSheet(null);
                emitFx({ type: 'open', panel: 'layers' });
              }}
              theme={theme}
              onThemeChange={onThemeChange}
              muted={deviceMuted}
              onMutedChange={toggleDeviceMuted}
              hideDrawings={hideDrawings}
              onHideDrawingsChange={setHideDrawings}
              revealRolls={revealRolls}
              onRevealRollsChange={setRevealRolls}
              onLeave={leaveTable}
              onClose={() => setPhoneSheet(null)}
            />
          )}
          {phoneSheet === 'run' && isHost && (
            <PhoneRunTable
              encounter={encounter}
              actorName={actor?.name}
              onEndEncounter={() => setEncounter(null)}
              onShowLog={() => setPhoneSheet('log')}
              onShowRolls={() => setPhoneSheet('rolls')}
              rollCount={rollLog.length}
              clock={state.clock}
              phaseOverride={state.dayNightOverride}
              onSetClockRunning={setClockRunning}
              onSetDayNight={updateDayNightOverride}
              islandName={activeIsland?.name}
              islandDayNight={activeIsland?.dayNight || 'cycle'}
              onIslandDayNight={(dayNight) => updateIsland(activeIslandId, { dayNight })}
              audioEnabled={audioEnabled}
              onOpenMusic={() => setShowMusicModal(true)}
              onOpenDice={() => setPhoneSheet('dice')}
              onOpenParty={() => setPhoneSheet('party')}
              onClose={() => setPhoneSheet(null)}
            />
          )}
          {phoneSheet === 'rolls' && (
            <PhoneSheet title="Roll log" onClose={() => setPhoneSheet(null)} className="phone-sheet-rolls">
              <div className="phone-sheet-pad">
                <p className="phone-caption phone-caption-flush">
                  {isHost
                    ? revealRolls
                      ? 'Everyone’s rolls this session. Reveal is on: players see yours too.'
                      : 'Everyone’s rolls this session. Yours are marked “Only you”.'
                    : 'Everyone’s rolls this session, and the DM’s when they show them.'}
                </p>
                <RollLog entries={rollLog} />
              </div>
            </PhoneSheet>
          )}
          {phoneSheet === 'log' && (
            <PhoneSheet title="Combat log" onClose={() => setPhoneSheet(null)} className="phone-sheet-log">
              <CombatLog log={combatLog} onClose={() => setPhoneSheet(null)} />
            </PhoneSheet>
          )}
          {phoneSheet === 'layers' && (
            <PhoneLayersSheet
              layers={state.layers}
              layerOrder={state.layerOrder}
              currentLayerId={currentLayerId}
              layerPlayerCounts={layerPlayerCounts}
              isHost={isHost}
              onSwitch={(id) => {
                setHostViewLayerId(id);
                setPhoneSheet(null);
              }}
              onManage={() => {
                setPhoneSheet(null);
                emitFx({ type: 'open', panel: 'layers' });
              }}
              onClose={() => setPhoneSheet(null)}
            />
          )}
          {phoneSheet === 'atlas' && (
            <PhoneAtlas
              layer={currentLayer}
              entities={layerEntities}
              activeIslandId={activeIslandId}
              myHeroId={myHeroOnLayer?.id}
              layerLabel={`${state.layerOrder.length > 1 ? `Layer ${layerIndex + 1} of ${state.layerOrder.length} · ` : ''}${currentLayer.islandOrder.length} islands · ${islandFeet(currentLayer, activeIslandId)} ft squares here`}
              onPick={(id) => {
                setPhoneSheet(null);
                flyToIsland(id);
              }}
              onClose={() => setPhoneSheet(null)}
              onManageIslands={
                isHost
                  ? () => {
                      setPhoneSheet(null);
                      emitFx({ type: 'open', panel: 'islands' });
                    }
                  : null
              }
              onManageLayers={
                isHost
                  ? () => {
                      setPhoneSheet(null);
                      emitFx({ type: 'open', panel: 'layers' });
                    }
                  : null
              }
            />
          )}
        </>
      )}
    </div>
  );
}

// Floating panel shown while the 'group' tool is active — the host clicks
// islands on the map to build up the pending selection (see
// GameView.toggleGroupCandidate) while this stays open, then names the
// group and confirms here.
function GroupConfirmPanel({ count, onConfirm, onCancel }) {
  const [name, setName] = useState('');
  return (
    <div className="group-confirm-panel">
      <h4>Merge islands</h4>
      <p>Click islands on the map to select them — {count} selected.</p>
      <input
        className="field"
        placeholder="Group name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <div className="merge-confirm-actions">
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => onConfirm(name)} disabled={count < 2}>
          Merge ({count})
        </button>
      </div>
    </div>
  );
}

function reportError(err) {
  // Cloud-mode writes are fire-and-forget from the UI's perspective (the
  // optimistic local dispatch already happened); surface failures without
  // blocking interaction. A production build would route this through a
  // toast/notification system instead of console.error.
  console.error('Hearthbound sync error:', err);
}
