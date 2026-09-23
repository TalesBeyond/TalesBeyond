import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react';
import { saveSession } from './persistence.js';
import { generateEntityId, generateInviteCode } from '../utils/inviteCode.js';

export const MAX_PLAYERS = 10; // 1 host + 9 players

// An island is one independent grid — own size, own background, own
// tokens — freely positioned (x, y, in un-zoomed pixels) on its layer's
// canvas. A layer can hold any number of them.
export function createInitialIsland(overrides = {}) {
  return {
    id: generateEntityId(),
    name: 'Untitled Island',
    cols: 20,
    rows: 15,
    cellSize: 42,
    backgroundImage: null,
    x: 0,
    y: 0,
    ...overrides,
  };
}

export function createInitialLayer(overrides = {}) {
  const { islandOverrides, ...layerOverrides } = overrides;
  const baseIsland = createInitialIsland({ name: 'Untitled Map', ...islandOverrides });
  return {
    id: generateEntityId(),
    name: 'Untitled Map',
    feetPerSquare: 5,
    islands: { [baseIsland.id]: baseIsland },
    islandOrder: [baseIsland.id],
    islandGroups: {},
    ...layerOverrides,
  };
}

const EMPTY_AUDIO = { tracks: {}, trackOrder: [], playback: { nowPlaying: null, resume: {} } };

// A null/partial playback value (no column yet, or a row nobody has played on)
// becomes the empty shape every consumer can rely on.
export function normalizePlayback(playback) {
  return { nowPlaying: playback?.nowPlaying ?? null, resume: playback?.resume ?? {} };
}

export function createEmptyGameState({ code, hostPlayerId, hostName, hostColor }) {
  const baseLayer = createInitialLayer();
  return {
    session: {
      code,
      tableId: null, // set when running against the Supabase backend
      hostPlayerId,
      isOpen: true,
      createdAt: Date.now(),
      // Testing only: a separate master code that can re-seat the host if
      // they get removed from the roster (e.g. by closing their tab) —
      // see Landing.jsx's "Rejoin as host" form.
      hostKey: generateInviteCode(10),
    },
    layers: { [baseLayer.id]: baseLayer },
    layerOrder: [baseLayer.id],
    // The table's in-game clock (utils/gameClock.js), or null when the DM
    // hasn't started one.
    clock: null,
    // A phase ('dawn' | 'day' | 'dusk' | 'night') the DM has set by hand,
    // taking priority over the clock's own day/night cycle until they hand it
    // back ("Follow the clock" = null). Independent of the clock, so it works
    // with the cycle on, off, or no clock at all.
    dayNightOverride: null,
    entities: {},
    entityOrder: [],
    // DM-authored custom monsters/weapons/items (Toolbar.jsx's Asset Storage
    // modal) — see 36_custom_assets.sql. Keyed like entities: {id: {id,
    // assetType, data}}, where `data` is the full entry (same shape its
    // built-in catalog counterpart uses), rendered alongside — never instead
    // of — the static WEAPONS/ITEMS/DEFAULT_MOBS catalogs.
    customAssets: {},
    customAssetOrder: [],
    // REQ-009 Synced Table Audio: `tracks` keyed by id, `trackOrder` for
    // stable listing, `playback` = { nowPlaying: { trackId, anchorMs,
    // offsetMs } | null, resume: { [trackId]: offsetMs } } — see
    // 38_synced_table_audio.sql. Cloud tables only in Slice 1.
    audio: { tracks: {}, trackOrder: [], playback: { nowPlaying: null, resume: {} } },
    players: {
      [hostPlayerId]: {
        id: hostPlayerId,
        name: hostName,
        color: hostColor,
        isHost: true,
        connected: true,
        joinedAt: Date.now(),
        currentLayerId: baseLayer.id,
      },
    },
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'HYDRATE':
      return action.state;

    case 'ADD_LAYER':
      return {
        ...state,
        layers: { ...state.layers, [action.layer.id]: action.layer },
        layerOrder: state.layerOrder.includes(action.layer.id)
          ? state.layerOrder
          : [...state.layerOrder, action.layer.id],
      };

    case 'UPDATE_LAYER': {
      const existing = state.layers[action.id];
      if (!existing) return state;
      return {
        ...state,
        layers: { ...state.layers, [action.id]: { ...existing, ...action.patch } },
      };
    }

    case 'REMOVE_LAYER': {
      if (action.id === state.layerOrder[0]) return state; // base layer is permanent
      if (!state.layers[action.id]) return state;
      const baseLayerId = state.layerOrder[0];

      const { [action.id]: _removedLayer, ...remainingLayers } = state.layers;

      const entities = {};
      const entityOrder = [];
      for (const id of state.entityOrder) {
        const entity = state.entities[id];
        if (!entity || entity.layerId === action.id) continue; // drop entities on the removed layer
        entities[id] =
          entity.targetLayerId === action.id
            ? { ...entity, targetLayerId: null, targetCol: null, targetRow: null }
            : entity;
        entityOrder.push(id);
      }

      const players = {};
      for (const [id, player] of Object.entries(state.players)) {
        players[id] = player.currentLayerId === action.id ? { ...player, currentLayerId: baseLayerId } : player;
      }

      return {
        ...state,
        layers: remainingLayers,
        layerOrder: state.layerOrder.filter((id) => id !== action.id),
        entities,
        entityOrder,
        players,
      };
    }

    case 'ADD_ISLAND': {
      const layer = state.layers[action.layerId];
      if (!layer) return state;
      const updatedLayer = {
        ...layer,
        islands: { ...layer.islands, [action.island.id]: action.island },
        islandOrder: layer.islandOrder.includes(action.island.id)
          ? layer.islandOrder
          : [...layer.islandOrder, action.island.id],
      };
      return { ...state, layers: { ...state.layers, [action.layerId]: updatedLayer } };
    }

    case 'UPDATE_ISLAND': {
      const layer = state.layers[action.layerId];
      const existingIsland = layer?.islands[action.islandId];
      if (!existingIsland) return state;
      const updatedLayer = {
        ...layer,
        islands: { ...layer.islands, [action.islandId]: { ...existingIsland, ...action.patch } },
      };
      return { ...state, layers: { ...state.layers, [action.layerId]: updatedLayer } };
    }

    case 'REMOVE_ISLAND': {
      const layer = state.layers[action.layerId];
      if (!layer) return state;
      if (!layer.islands[action.islandId]) return state;
      // The base island is only protected while a sibling exists to fall
      // back to — a layer's sole island can still be removed (the caller
      // is responsible for dropping in a fresh replacement so the layer is
      // never left with zero islands).
      if (action.islandId === layer.islandOrder[0] && layer.islandOrder.length > 1) return state;

      const { [action.islandId]: _removedIsland, ...remainingIslands } = layer.islands;
      const updatedLayer = {
        ...layer,
        islands: remainingIslands,
        islandOrder: layer.islandOrder.filter((id) => id !== action.islandId),
      };

      const entities = {};
      const entityOrder = [];
      for (const id of state.entityOrder) {
        const entity = state.entities[id];
        if (!entity || entity.islandId === action.islandId) continue; // drop entities on the removed island
        entities[id] = entity;
        entityOrder.push(id);
      }

      // Strip the removed island out of any group it belonged to, and
      // dissolve any group that drops below 2 members — a group of one
      // island is meaningless.
      const islandGroups = {};
      for (const [groupId, group] of Object.entries(layer.islandGroups || {})) {
        if (!group.islandIds.includes(action.islandId)) {
          islandGroups[groupId] = group;
          continue;
        }
        const islandIds = group.islandIds.filter((id) => id !== action.islandId);
        if (islandIds.length >= 2) islandGroups[groupId] = { ...group, islandIds };
      }
      updatedLayer.islandGroups = islandGroups;

      return {
        ...state,
        layers: { ...state.layers, [action.layerId]: updatedLayer },
        entities,
        entityOrder,
      };
    }

    case 'ADD_ISLAND_GROUP': {
      const layer = state.layers[action.layerId];
      if (!layer) return state;
      const updatedLayer = {
        ...layer,
        islandGroups: { ...(layer.islandGroups || {}), [action.group.id]: action.group },
      };
      return { ...state, layers: { ...state.layers, [action.layerId]: updatedLayer } };
    }

    case 'UPDATE_ISLAND_GROUP': {
      const layer = state.layers[action.layerId];
      const existingGroup = layer?.islandGroups?.[action.groupId];
      if (!existingGroup) return state;
      const updatedLayer = {
        ...layer,
        islandGroups: { ...layer.islandGroups, [action.groupId]: { ...existingGroup, ...action.patch } },
      };
      return { ...state, layers: { ...state.layers, [action.layerId]: updatedLayer } };
    }

    case 'REMOVE_ISLAND_GROUP': {
      const layer = state.layers[action.layerId];
      if (!layer?.islandGroups?.[action.groupId]) return state;
      const { [action.groupId]: _removedGroup, ...remainingGroups } = layer.islandGroups;
      const updatedLayer = { ...layer, islandGroups: remainingGroups };
      return { ...state, layers: { ...state.layers, [action.layerId]: updatedLayer } };
    }

    case 'MOVE_ISLAND_GROUP': {
      const layer = state.layers[action.layerId];
      const group = layer?.islandGroups?.[action.groupId];
      if (!group) return state;
      const islands = { ...layer.islands };
      for (const islandId of group.islandIds) {
        const island = islands[islandId];
        if (!island) continue;
        islands[islandId] = { ...island, x: island.x + action.dx, y: island.y + action.dy };
      }
      const updatedLayer = { ...layer, islands };
      return { ...state, layers: { ...state.layers, [action.layerId]: updatedLayer } };
    }

    case 'ADD_PLAYER': {
      const already = state.players[action.player.id];
      if (!already && Object.keys(state.players).length >= MAX_PLAYERS) return state;
      return {
        ...state,
        players: { ...state.players, [action.player.id]: { ...already, ...action.player } },
      };
    }

    case 'PATCH_PLAYER': {
      const existing = state.players[action.id];
      if (!existing) return state;
      return {
        ...state,
        players: { ...state.players, [action.id]: { ...existing, ...action.patch } },
      };
    }

    case 'REMOVE_PLAYER': {
      const { [action.id]: _removed, ...rest } = state.players;
      return { ...state, players: rest };
    }

    case 'SET_PLAYER_CONNECTED': {
      const p = state.players[action.id];
      if (!p) return state;
      return {
        ...state,
        players: { ...state.players, [action.id]: { ...p, connected: action.connected } },
      };
    }

    case 'REGENERATE_INVITE_CODE':
      return { ...state, session: { ...state.session, code: action.code } };

    case 'SET_SESSION_OPEN':
      return { ...state, session: { ...state.session, isOpen: action.isOpen } };

    case 'SET_CLOCK':
      return { ...state, clock: action.clock ?? null };

    case 'SET_DAY_NIGHT_OVERRIDE':
      return { ...state, dayNightOverride: action.phase ?? null };

    case 'ADD_ENTITY': {
      const alreadyPresent = Boolean(state.entities[action.entity.id]);
      return {
        ...state,
        entities: { ...state.entities, [action.entity.id]: { ...state.entities[action.entity.id], ...action.entity } },
        entityOrder: alreadyPresent ? state.entityOrder : [...state.entityOrder, action.entity.id],
      };
    }

    case 'UPDATE_ENTITY': {
      const existing = state.entities[action.id];
      if (!existing) return state;
      return {
        ...state,
        entities: { ...state.entities, [action.id]: { ...existing, ...action.patch } },
      };
    }

    case 'MOVE_ENTITY': {
      const existing = state.entities[action.id];
      if (!existing) return state;
      return {
        ...state,
        entities: {
          ...state.entities,
          [action.id]: {
            ...existing,
            col: action.col,
            row: action.row,
            ...(action.islandId ? { islandId: action.islandId } : {}),
            // Only set by confirmEnterDoor, to carry a hero across to a
            // door's other layer along with its col/row/islandId.
            ...(action.layerId ? { layerId: action.layerId } : {}),
          },
        },
      };
    }

    case 'REMOVE_ENTITY': {
      const { [action.id]: _removed, ...rest } = state.entities;
      return {
        ...state,
        entities: rest,
        entityOrder: state.entityOrder.filter((id) => id !== action.id),
      };
    }

    case 'ADD_CUSTOM_ASSET': {
      const customAssets = state.customAssets || {};
      const alreadyPresent = Boolean(customAssets[action.item.id]);
      return {
        ...state,
        customAssets: { ...customAssets, [action.item.id]: action.item },
        customAssetOrder: alreadyPresent
          ? state.customAssetOrder
          : [...(state.customAssetOrder || []), action.item.id],
      };
    }

    case 'SET_AUDIO_TRACK': {
      const audio = state.audio || EMPTY_AUDIO;
      const alreadyPresent = Boolean(audio.tracks[action.track.id]);
      return {
        ...state,
        audio: {
          ...audio,
          tracks: { ...audio.tracks, [action.track.id]: action.track },
          trackOrder: alreadyPresent ? audio.trackOrder : [...audio.trackOrder, action.track.id],
        },
      };
    }

    case 'REMOVE_AUDIO_TRACK': {
      const audio = state.audio || EMPTY_AUDIO;
      const { [action.id]: _removed, ...tracks } = audio.tracks;
      return {
        ...state,
        audio: { ...audio, tracks, trackOrder: audio.trackOrder.filter((id) => id !== action.id) },
      };
    }

    case 'SET_AUDIO_PLAYBACK':
      return { ...state, audio: { ...(state.audio || EMPTY_AUDIO), playback: normalizePlayback(action.playback) } };

    case 'REMOVE_CUSTOM_ASSET': {
      const { [action.id]: _removed, ...rest } = state.customAssets || {};
      return {
        ...state,
        customAssets: rest,
        customAssetOrder: (state.customAssetOrder || []).filter((id) => id !== action.id),
      };
    }

    default:
      return state;
  }
}

const GameStateContext = createContext(null);
const GameDispatchContext = createContext(null);

export function GameProvider({ initialState, persistLocally = true, children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const saveTimer = useRef(null);
  const latestState = useRef(state);
  latestState.current = state;

  // A dispatch immediately followed by this provider unmounting (e.g. Leave
  // clicked right after a dispatch) can get batched by React such that this
  // component never re-renders with the new reducer output before teardown
  // — in that case `latestState.current` above would still be one step
  // behind, and the unmount-flush effect below would save stale data over
  // whatever the caller already persisted. Advance the ref synchronously,
  // independent of whether/when React gets around to re-rendering.
  const dispatchAndTrack = useCallback((action) => {
    latestState.current = reducer(latestState.current, action);
    dispatch(action);
  }, []);

  // Autosave to localStorage, debounced, any time shared table state
  // changes — but only in Phase 1 local mode. In cloud mode each mutation
  // already writes straight to Postgres (see components/GameView.jsx), so
  // saving the whole blob to localStorage here would be redundant and,
  // for large maps with embedded images, slow.
  useEffect(() => {
    if (!persistLocally) return undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveSession(state.session.code, state);
    }, 300);
    return () => clearTimeout(saveTimer.current);
  }, [state, persistLocally]);

  // Flush any still-pending debounced save when this provider unmounts (e.g.
  // the host/player clicks Leave right after an edit) — otherwise the cleanup
  // above just cancels the timer and the last few seconds of changes never
  // reach localStorage at all.
  useEffect(() => {
    return () => {
      if (persistLocally) saveSession(latestState.current.session.code, latestState.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GameStateContext.Provider value={state}>
      <GameDispatchContext.Provider value={dispatchAndTrack}>{children}</GameDispatchContext.Provider>
    </GameStateContext.Provider>
  );
}

export function useGameState() {
  const ctx = useContext(GameStateContext);
  if (!ctx) throw new Error('useGameState must be used inside GameProvider');
  return ctx;
}

export function useGameDispatch() {
  const ctx = useContext(GameDispatchContext);
  if (!ctx) throw new Error('useGameDispatch must be used inside GameProvider');
  return ctx;
}
