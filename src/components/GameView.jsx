import React, { useEffect, useRef, useState } from 'react';
import ModalIcon from './ModalIcon.jsx';
import { playDiceSound } from '../lib/diceSound.js';
import { useGameState, useGameDispatch, createInitialLayer, createInitialIsland, previewAudioCascade, pruneAudio } from '../state/store.jsx';
import { generateEntityId, generateInviteCode, generatePlayerId } from '../utils/inviteCode.js';
import { migrateLegacyState } from '../state/migrate.js';
import { clampGridDims, computeCanvasBounds } from '../utils/grid.js';
import { defaultCharacterSheet, normalizeEquipment, newEquipmentItem } from '../data/characterSheet.js';
import { defaultDroppablesFor } from '../data/droppables.js';
import { isHiddenTrap, clampTrapSize } from '../data/traps.js';
import { renderIslandTemplateToDataUrl } from '../utils/image.js';
import {
  saveSession,
  deleteSession,
  downloadSessionAsFile,
  downloadGuestSessionAsFile,
  downloadIslandAsFile,
  downloadDataUrl,
  readJsonFromFile,
  readEncodedJsonFromFile,
  saveIdentity,
  clearCurrentPointer,
  sessionExists,
  markGuestClean,
  loadLocalAudioVolumes,
  saveLocalAudioVolumes,
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
  updateTableClockRemote,
  upsertAudioTrackRemote,
  removeAudioTrackRemote,
  updateAudioPlaybackRemote,
  updateTableDayNightOverrideRemote,
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
import { useDayPhase } from '../state/useGameClock.js';
import { withClockRunning } from '../utils/gameClock.js';
import MusicModal from './MusicModal.jsx';
import { LayerStrip, InitiativeBar, RulerReadout, ZoomControl } from './TableHud.jsx';
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

function clampZoom(z) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
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

export default function GameView({ me, mode, onLeave, onCodeRotated }) {
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
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
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

  function handleHostPresenceChange(hostPresent) {
    const timers = hostAbsentTimersRef.current;
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
  // Each player's own level per track — this browser only.
  const [localAudioVolumes, setLocalAudioVolumes] = useState(() => loadLocalAudioVolumes(audioScope));
  const { blocked: audioBlocked, unlock: unlockAudio, expired: expiredAudio } = useTableAudio({
    enabled: audioEnabled,
    playback: state.audio?.playback,
    tracks: state.audio?.tracks,
    currentLayerId,
    layers: state.layers,
    localVolumes: localAudioVolumes,
    checkFiles: isGuest,
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
    const centerX = (island.x - originX + (island.cols * island.cellSize) / 2) * zoom;
    const centerY = (island.y - originY + (island.rows * island.cellSize) / 2) * zoom;
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

    const unsubscribe = subscribeToTable(tableId, dispatch, handleStatusChange, {
      isHost,
      onHostPresenceChange: isHost ? undefined : handleHostPresenceChange,
    });
    return () => {
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

    // Player-side only: a channel recovery that isn't the very first join
    // means a real drop happened in between, so ask the host for current
    // state rather than trusting whatever this browser still has —
    // mirrors REQ-001's resync intent, but over broadcast/state_snapshot
    // instead of fetchTableSnapshot, since a guest table has no Postgres
    // row to fetch from.
    function handleGuestStatusChange(status, isInitialJoin) {
      if (isGuestHost) return;
      if (status === 'SUBSCRIBED' && !isInitialJoin) {
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

  function canDamageMob(entity, patch) {
    const keys = Object.keys(patch);
    if (keys.length !== 1 || keys[0] !== 'hp') return false;
    const newHp = patch.hp;
    const currentHp = entity.hp ?? entity.maxHp ?? 0;
    return typeof newHp === 'number' && newHp >= 0 && newHp <= currentHp;
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
  function rollInitiative(selectedIds) {
    if (!isHost) return [];
    const selected = new Set(selectedIds);
    for (const entity of Object.values(state.entities)) {
      if (entity.initiativeTurn != null && !selected.has(entity.id)) {
        updateEntity(entity.id, { initiativeRoll: null, initiativeTurn: null });
      }
    }
    if (selectedIds.length) playDiceSound();
    const rolled = selectedIds.map((id) => ({ id, roll: 1 + Math.floor(Math.random() * 20) }));
    rolled.sort((a, b) => b.roll - a.roll);
    rolled.forEach(({ id, roll }, index) => updateEntity(id, { initiativeRoll: roll, initiativeTurn: index + 1 }));
    return rolled.map(({ id, roll }, index) => ({ id, roll, turn: index + 1 }));
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
  }

  // Places a freshly built island (from createIsland or importIsland) next
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

  function createIsland({ name, cols, rows }) {
    if (!isHost) return;
    const island = createInitialIsland({
      name: name.trim() || 'Untitled Island',
      cols: clampGridDims(cols),
      rows: clampGridDims(rows),
    });
    placeAndAddIsland(island);
  }

  // Downloads the active island's shell (grid + background — no
  // id/position/entities) to a file for reuse/sharing.
  function downloadIsland() {
    const island = currentLayer.islands[activeIslandId];
    if (island) downloadIslandAsFile(island);
  }

  // Downloads the active island as a standalone PNG (background + grid
  // lines, at native pixel resolution) for editing in an external image
  // editor — the result can be re-uploaded via "Upload island background
  // image" to become a new custom map.
  async function downloadIslandImage() {
    const island = currentLayer.islands[activeIslandId];
    if (!island) return;
    try {
      const dataUrl = await renderIslandTemplateToDataUrl(island);
      const filename = `${(island.name || 'island').trim().replace(/[^a-z0-9_-]+/gi, '_') || 'island'}.png`;
      downloadDataUrl(dataUrl, filename);
    } catch {
      alert("Could not export this island's image — its background image could not be loaded.");
    }
  }

  // Reads a previously exported island-shell file and adds it as a
  // brand-new island via the same placement logic createIsland uses,
  // without touching the currently active/selected island beforehand.
  function importIsland(file) {
    if (!isHost) return;
    readJsonFromFile(file)
      .then((raw) => {
        if (typeof raw?.name !== 'string' || !Number.isFinite(raw.cols) || !Number.isFinite(raw.rows) || !Number.isFinite(raw.cellSize)) {
          alert('That file does not look like a Hearthbound island export.');
          return;
        }
        const island = createInitialIsland({
          name: raw.name.trim() || 'Untitled Island',
          cols: clampGridDims(raw.cols),
          rows: clampGridDims(raw.rows),
          cellSize: raw.cellSize,
          backgroundImage: typeof raw.backgroundImage === 'string' ? raw.backgroundImage : null,
        });
        placeAndAddIsland(island);
      })
      .catch(() => alert('Could not read that file — is it a valid Hearthbound island export?'));
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
    if (existing) {
      // The replaced file is gone: stop it for everyone and forget its position.
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
  function confirmGroup(name) {
    if (!isHost || pendingGroupIslandIds.length < 2) return;
    const group = { id: generateEntityId(), name: name.trim() || 'Untitled Group', islandIds: pendingGroupIslandIds };
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
    if (!isHost) return;
    const patch = { name: name.trim() || 'Untitled Group' };
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
    setZoom((z) => clampZoom(z + ZOOM_STEP));
  }
  function zoomOut() {
    captureZoomAnchor();
    setZoom((z) => clampZoom(z - ZOOM_STEP));
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

  const shownPanelWidths = fitPanelWidths(panelWidths, viewportWidth, leftCollapsed, rightCollapsed);

  return (
    <div
      className={`game-layout${leftCollapsed ? ' left-collapsed' : ''}${rightCollapsed ? ' right-collapsed' : ''}`}
      style={{ '--left-w': `${shownPanelWidths.left}px`, '--right-w': `${shownPanelWidths.right}px` }}
    >
      <TokenSidebar
        onAddEntity={addEntity}
        layers={state.layers}
        layerOrder={state.layerOrder}
        currentLayerId={currentLayerId}
        isHost={isHost}
        customAssets={state.customAssets}
        collapsed={leftCollapsed}
        onToggleCollapsed={() => setLeftCollapsed((c) => !c)}
      />

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <Toolbar
          isHost={isHost}
          isGuestHost={isGuestHost}
          layer={currentLayer}
          activeIsland={currentLayer.islands[activeIslandId] || currentLayer.islands[currentLayer.islandOrder[0]]}
          tool={tool}
          onToolChange={setTool}
          onLayerPatch={(patch) => updateLayer(currentLayerId, patch)}
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
          onDownloadIsland={downloadIsland}
          onDownloadIslandImage={downloadIslandImage}
          onImportIsland={importIsland}
          onUngroupIslands={ungroupIslands}
          onRenameGroup={renameGroup}
          heroes={heroes}
          onUpdateEntity={updateEntity}
          initiativeHeroes={initiativeHeroes}
          initiativeMobs={initiativeMobs}
          onRollInitiative={rollInitiative}
          customAssets={state.customAssets}
          onAddCustomAsset={addCustomAsset}
          onRemoveCustomAsset={removeCustomAsset}
          collapsed={toolbarCollapsed}
          onToggleCollapsed={() => setToolbarCollapsed((c) => !c)}
          zoom={zoom}
        />
        <LayerStrip
          layers={state.layers}
          layerOrder={state.layerOrder}
          currentLayerId={currentLayerId}
          layerPlayerCounts={layerPlayerCounts}
          isHost={isHost}
          onSwitchLayer={setHostViewLayerId}
          feetPerSquare={currentLayer.feetPerSquare}
          clock={state.clock}
          phaseOverride={state.dayNightOverride}
        />
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
          />
        </div>
        <InitiativeBar entities={layerEntities} />
        <RulerReadout feet={tool === 'ruler' ? rulerFeet : null} />
        <ZoomControl zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onZoomReset={zoomReset} onRecenter={() => recenterOnIsland(activeIslandId)} />
        </div>
      </div>

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
        onToggleCollapsed={() => setRightCollapsed((c) => !c)}
      />

      {showMusicModal && audioEnabled && (
        <MusicModal
          audio={audioApi}
          worldTrack={worldTrack}
          worldTargetId={audioScope}
          layers={state.layers}
          layerOrder={state.layerOrder}
          entities={state.entities}
          isGuest={isGuest}
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

      {!leftCollapsed && (
        <PanelResizer
          side="left"
          width={shownPanelWidths.left}
          label="Resize tokens panel"
          onResize={(w) => resizePanel('left', w)}
          onReset={() => resizePanel('left', DEFAULT_PANEL_WIDTHS.left)}
        />
      )}
      {!rightCollapsed && (
        <PanelResizer
          side="right"
          width={shownPanelWidths.right}
          label="Resize players and inspector panel"
          onResize={(w) => resizePanel('right', w)}
          onReset={() => resizePanel('right', DEFAULT_PANEL_WIDTHS.right)}
        />
      )}

      {pendingDoor && (
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

      {tool === 'group' && <GroupConfirmPanel count={pendingGroupIslandIds.length} onConfirm={confirmGroup} onCancel={cancelGroup} />}

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
