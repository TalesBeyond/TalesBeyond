// Upgrades an older saved session into the current shape. Two independent,
// separately-guarded steps run in sequence, so a save from *any* point in
// this app's history upgrades correctly in one pass:
//   1. pre-layers (a single flat `map` + unscoped entities/players) -> layers
//   2. pre-islands layers (grid fields directly on the layer) -> islands
// Kept in its own module, separate from state/store.jsx and
// state/persistence.js, so both can import it without creating a circular
// dependency between those two.

import { generateEntityId, generateInviteCode } from '../utils/inviteCode.js';

export function migrateLegacyState(raw) {
  if (!raw) return raw;

  let state = raw;

  if (!state.layers && state.map) {
    const baseLayerId = generateEntityId();
    const { map, entities, players, ...rest } = state;

    const migratedEntities = {};
    for (const [id, entity] of Object.entries(entities || {})) {
      migratedEntities[id] = { ...entity, layerId: baseLayerId };
    }

    const migratedPlayers = {};
    for (const [id, player] of Object.entries(players || {})) {
      migratedPlayers[id] = { ...player, currentLayerId: baseLayerId };
    }

    state = {
      ...rest,
      layers: { [baseLayerId]: { id: baseLayerId, ...map } },
      layerOrder: [baseLayerId],
      entities: migratedEntities,
      players: migratedPlayers,
    };
  }

  if (!state.layers) return state; // still not a recognizable shape — nothing more we can do

  // Custom assets (36_custom_assets.sql / Toolbar.jsx's Asset Storage) is a
  // top-level slice added after this app already had saves/exports in the
  // wild — backfill it here (this module's whole job) so an older save or
  // .json export still hydrates into a state shape every reducer case and
  // component can rely on, and so re-exporting it afterward actually
  // includes the field instead of silently omitting it.
  if (!state.customAssets) state = { ...state, customAssets: {} };
  if (!state.customAssetOrder) state = { ...state, customAssetOrder: [] };
  // REQ-009's audio slice, same backfill reasoning.
  if (!state.audio) state = { ...state, audio: { tracks: {}, trackOrder: [], playback: { nowPlaying: null, resume: {} } } };

  // session.hostKey (the local/guest "rejoin as host" code — see
  // store.jsx's createEmptyGameState) is likewise a field added after
  // saves/exports already existed in the wild. This function is only ever
  // called for local/guest state (never a remote/cloud snapshot — see
  // fetchTableSnapshot, which has no hostKey concept at all), so an older
  // save or .json export missing it here really is missing it, not a
  // signed-in host table that was never supposed to have one. Generate one
  // on the fly so the Toolbar's host key / DM code chip always has a real
  // value instead of silently showing "undefined".
  if (state.session && !state.session.hostKey) {
    state = { ...state, session: { ...state.session, hostKey: generateInviteCode(10) } };
  }

  let entitiesChanged = false;
  const migratedEntities = { ...state.entities };
  const migratedLayers = {};
  for (const [layerId, layer] of Object.entries(state.layers)) {
    if (layer.islands && layer.islandOrder) {
      migratedLayers[layerId] = layer;
      continue;
    }
    const islandId = generateEntityId();
    const { cols, rows, cellSize, backgroundImage, ...layerRest } = layer;
    migratedLayers[layerId] = {
      ...layerRest,
      islands: { [islandId]: { id: islandId, name: layer.name, cols, rows, cellSize, backgroundImage, x: 0, y: 0 } },
      islandOrder: [islandId],
    };
    for (const [id, entity] of Object.entries(migratedEntities)) {
      if (entity.layerId === layerId && !entity.islandId) {
        migratedEntities[id] = { ...entity, islandId };
        entitiesChanged = true;
      }
    }
  }

  return {
    ...state,
    layers: migratedLayers,
    entities: entitiesChanged ? migratedEntities : state.entities,
  };
}
