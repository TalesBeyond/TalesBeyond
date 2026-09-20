import React, { useEffect, useRef, useState } from 'react';
import { useGameState, useGameDispatch, createInitialLayer, createInitialIsland } from '../state/store.jsx';
import { generateEntityId, generateInviteCode, generatePlayerId } from '../utils/inviteCode.js';
import { migrateLegacyState } from '../state/migrate.js';
import { clampGridDims, computeCanvasBounds } from '../utils/grid.js';
import { defaultCharacterSheet, normalizeEquipment, newEquipmentItem } from '../data/characterSheet.js';
import { defaultDroppablesFor } from '../data/droppables.js';
import { renderIslandTemplateToDataUrl } from '../utils/image.js';
import {
  saveSession,
  deleteSession,
  downloadSessionAsFile,
  downloadGuestSessionAsFile,
  downloadIslandAsFile,
  downloadDataUrl,
  readJsonFromFile,
  saveIdentity,
  clearCurrentPointer,
  sessionExists,
  markGuestClean,
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

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;

// REQ-001 Connection Recovery: a status flap shorter than this never
// surfaces anything (AC1). Resync-failure backoff schedule (AC4) — index
// clamps at the last entry, so every attempt past the 4th waits 30s.
const RECONNECT_GRACE_MS = 1500;
const RESYNC_BACKOFF_MS = [2000, 4000, 8000, 16000, 30000];

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
function entitiesVisibleOnLayer(state, layerId) {
  const result = {};
  const targetLayer = state.layers[layerId];
  const targetBaseIslandId = targetLayer?.islandOrder[0];
  for (const id of state.entityOrder) {
    const entity = state.entities[id];
    if (!entity) continue;
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
function stripDmNotesFromAction(action) {
  if (action.type === 'ADD_ENTITY' && action.entity?.dmNotes !== undefined) {
    return { ...action, entity: { ...action.entity, dmNotes: undefined } };
  }
  if (action.type === 'UPDATE_ENTITY' && action.patch?.dmNotes !== undefined) {
    return { ...action, patch: { ...action.patch, dmNotes: undefined } };
  }
  return action;
}

function stripDmNotesFromState(fullState) {
  const entities = {};
  for (const [id, entity] of Object.entries(fullState.entities)) {
    entities[id] = entity.dmNotes !== undefined ? { ...entity, dmNotes: undefined } : entity;
  }
  return { ...fullState, entities };
}

function saveOrWarn(code, nextState) {
  const ok = saveSession(code, nextState);
  if (!ok) {
    alert(
      'Could not save — your browser storage is full. Try removing a background image or some custom-uploaded token art, or use Export .json to back up this table.'
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
  const [pendingDoor, setPendingDoor] = useState(null);
  // REQ-008: whether this guest DM has exported at least once since opening
  // this table — purely in-memory, per-mount (not the localStorage clean
  // marker Slice 4 adds), just enough to warn on Leave if they haven't.
  const [hasExportedGuestTable, setHasExportedGuestTable] = useState(false);
  const [pendingLeaveWarning, setPendingLeaveWarning] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
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

  const baseLayerId = state.layerOrder[0];
  const [hostViewLayerId, setHostViewLayerId] = useState(baseLayerId);
  const currentLayerId = isHost ? hostViewLayerId : state.players[me.id]?.currentLayerId || baseLayerId;
  const currentLayer = state.layers[currentLayerId] || state.layers[baseLayerId];

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

  const layerEntities = entitiesVisibleOnLayer(state, currentLayerId);
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

    const unsubscribe = subscribeToTable(tableId, dispatch, handleStatusChange);
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
      dispatch(action);
      guestChannelRef.current?.sendStateChange(stripDmNotesFromAction(action));
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
        if (!entity || entity.kind !== 'chest') return;
        if (!Object.keys(action.patch || {}).every((key) => CHEST_TOGGLE_KEYS.includes(key))) return;
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
      const snapshot = stripDmNotesFromState({ ...stateRef.current, players: { ...stateRef.current.players, [id]: player } });
      guestChannelRef.current?.sendJoinAck(requestId, id, snapshot);
      guestChannelRef.current?.sendStateChange({ type: 'ADD_PLAYER', player });
    }

    // Host-side: answer a reconnecting player's request for a fresh
    // snapshot. Unlike handlePlayerJoin, nothing new is allocated — the
    // requester already has a playerId from before the drop.
    function handleStateRequest(requesterId) {
      guestChannelRef.current?.sendStateSnapshot(requesterId, stripDmNotesFromState(stateRef.current));
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
    guestChannelRef.current?.sendStateChange(stripDmNotesFromAction(action));
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
  // their own hero token and open/close a chest — see PITFALLS.md #1.
  // Enforced here (the single choke point every mutation already funnels
  // through) rather than in each calling component, so no future caller
  // can accidentally skip the check. Mirrored server-side for cloud mode
  // by 16_dm_only_edits.sql's RLS + trigger.
  const CHEST_TOGGLE_KEYS = ['opened', 'imageUrl'];

  function canMoveEntity(entity) {
    if (!entity) return false;
    return isHost || (entity.kind === 'hero' && entity.ownerId === me.id);
  }

  function canUpdateEntity(entity, patch) {
    if (!entity) return false;
    if (isHost) return true;
    return entity.kind === 'chest' && Object.keys(patch).every((key) => CHEST_TOGGLE_KEYS.includes(key));
  }

  function addEntity(draft) {
    if (!isHost) return;
    const targetIsland = currentLayer.islands[activeIslandId] || currentLayer.islands[currentLayer.islandOrder[0]];
    const { col, row } = findFreeCell(layerEntities, targetIsland.id, targetIsland.cols, targetIsland.rows);
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
      const targetLayerEntities = entitiesVisibleOnLayer(state, draft.targetLayerId);
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
      size: 1,
      hp: draft.maxHp,
      maxHp: draft.maxHp,
      armorClass: draft.kind === 'mob' ? 10 : undefined,
      // Left unassigned (rather than defaulting to the placing DM) since
      // only the DM places tokens now — the DM assigns a hero to whichever
      // player controls it afterward, via the Owner field on its inspector.
      ownerId: null,
      layerId: currentLayerId,
      islandId: targetIsland.id,
      targetLayerId: draft.kind === 'door' ? draft.targetLayerId ?? null : null,
      targetCol,
      targetRow,
      conditions: draft.kind !== 'door' && draft.kind !== 'chest' ? [] : undefined,
      dmNotes: draft.kind === 'hero' || draft.kind === 'mob' ? '' : undefined,
      droppables: draft.kind === 'mob' ? draft.droppables || defaultDroppablesFor(draft.mobKey) : undefined,
      sheet: draft.kind === 'hero' ? defaultCharacterSheet() : undefined,
      chestSize: draft.kind === 'chest' ? draft.chestSize : undefined,
      opened: draft.kind === 'chest' ? false : undefined,
      items: draft.kind === 'chest' ? draft.items || [] : undefined,
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

  function moveEntity(id, col, row, islandId) {
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
      guestChannelRef.current?.sendIntent({ type: 'MOVE_ENTITY', id, col, row, islandId }, me.id);
      return;
    }
    dispatch({ type: 'MOVE_ENTITY', id, col, row, islandId });
    if (isRemote) moveEntityRemote(id, col, row, islandId).catch(reportError);
    else if (isGuestHost) guestChannelRef.current?.sendStateChange({ type: 'MOVE_ENTITY', id, col, row, islandId });
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
    if (isRemote) updateEntityRemote(id, patch).catch(reportError);
    else if (isGuestHost) broadcastGuestChange({ type: 'UPDATE_ENTITY', id, patch });
  }

  function removeEntity(id) {
    if (!isHost) return;
    dispatch({ type: 'REMOVE_ENTITY', id });
    if (selectedId === id) setSelectedId(null);
    if (isRemote) removeEntityRemote(id).catch(reportError);
    else if (isGuestHost) broadcastGuestChange({ type: 'REMOVE_ENTITY', id });
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

    dispatch({ type: 'REMOVE_ISLAND', layerId: currentLayerId, islandId });
    if (isRemote) removeIslandRemote(islandId).catch(reportError);
    else if (isGuestHost) broadcastGuestChange({ type: 'REMOVE_ISLAND', layerId: currentLayerId, islandId });

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
    dispatch({ type: 'REMOVE_LAYER', id: layerId });
    if (hostViewLayerId === layerId) setHostViewLayerId(baseLayerId);
    if (isRemote) removeLayerRemote(layerId).catch(reportError);
    else if (isGuestHost) broadcastGuestChange({ type: 'REMOVE_LAYER', id: layerId });
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
    if (isRemote) {
      setSavedAgo('Synced to the cloud');
      return;
    }
    if (saveOrWarn(state.session.code, state)) setSavedAgo('Saved just now');
  }

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
      const raw = await readJsonFromFile(file);
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
    if (isGuestHost) markGuestClean(state.session.code);
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

  return (
    <div className={`game-layout${leftCollapsed ? ' left-collapsed' : ''}${rightCollapsed ? ' right-collapsed' : ''}`}>
      <TokenSidebar
        onAddEntity={addEntity}
        layers={state.layers}
        layerOrder={state.layerOrder}
        currentLayerId={currentLayerId}
        isHost={isHost}
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
          collapsed={toolbarCollapsed}
          onToggleCollapsed={() => setToolbarCollapsed((c) => !c)}
          zoom={zoom}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onZoomReset={zoomReset}
          onRecenter={() => recenterOnIsland(activeIslandId)}
        />
        <div className="stage" ref={stageRef}>
          <MapBoard
            islands={currentLayer.islands}
            islandOrder={currentLayer.islandOrder}
            islandGroups={currentLayer.islandGroups || {}}
            pendingGroupIslandIds={pendingGroupIslandIds}
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
          />
        </div>
      </div>

      <RightPanel
        players={state.players}
        hostId={state.session.hostPlayerId}
        layers={state.layers}
        layerOrder={state.layerOrder}
        entities={layerEntities}
        selectedEntity={selectedEntity}
        isHost={isHost}
        onUpdateEntity={updateEntity}
        onRemoveEntity={removeEntity}
        tool={tool}
        heroes={heroes}
        onGiveChestItem={giveChestItemToHero}
        collapsed={rightCollapsed}
        onToggleCollapsed={() => setRightCollapsed((c) => !c)}
      />

      {pendingDoor && (
        <div className="door-confirm-backdrop" onClick={cancelEnterDoor}>
          <div className="door-confirm-card" onClick={(e) => e.stopPropagation()}>
            <h4>Open the door?</h4>
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
            <h4>Leave without exporting?</h4>
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
