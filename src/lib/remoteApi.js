// Remote persistence layer — the cloud-mode counterpart to
// state/persistence.js. Every function here does one network round trip
// and returns data already in the client's camelCase shape (via
// lib/mappers.js), so callers in components never see a raw DB row.
//
// This file is deliberately parallel in spirit to persistence.js: same
// idea of "one boundary module," different transport.

import { supabase } from './supabaseClient.js';
import {
  mapDbLayer,
  mapClientLayerPatchToDb,
  mapDbIsland,
  mapClientIslandPatchToDb,
  mapDbEntity,
  mapClientEntityToDb,
  mapClientEntityPatchToDb,
  mapDbEntityDmData,
  mapClientEntityDmDataPatchToDb,
  mapDbCustomAsset,
  mapDbPlayer,
} from './mappers.js';

// dmNotes/droppables live in their own host-only-readable table (see
// 15_entity_dm_data_privacy.sql) instead of on `entities` — split a patch
// bound for updateEntityRemote across the two tables by key.
const DM_DATA_KEYS = ['dmNotes', 'droppables', 'mobSheet'];

function must(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

// ---- Table lifecycle ----

export async function createTableRemote({ name, cols, rows, displayName, color }) {
  const { data, error } = await supabase.rpc('create_table', {
    p_name: name,
    p_cols: cols,
    p_rows: rows,
    p_display_name: displayName,
    p_color: color,
  });
  if (error) throw new Error(`create_table: ${error.message}`);
  const row = data[0];
  return { tableId: row.table_id, code: row.code, hostPlayerId: row.host_player_id };
}

export async function joinTableRemote({ code, displayName, color }) {
  const { data, error } = await supabase.rpc('join_table', {
    p_code: code,
    p_display_name: displayName,
    p_color: color,
  });
  if (error) throw new Error(`join_table: ${error.message}`);
  const row = data[0];
  return { tableId: row.table_id, playerId: row.player_id };
}

export async function regenerateInviteCodeRemote(tableId) {
  const { data, error } = await supabase.rpc('regenerate_invite_code', { p_table_id: tableId });
  if (error) throw new Error(`regenerate_invite_code: ${error.message}`);
  return data; // new code string
}

// Permanently deletes a table this identity hosts (REQ-007) — every child
// row cascades via existing FKs. Callers should run deleteTableStorage
// (storageUpload.js) first; see that function's comment for why the order
// matters.
export async function deleteTableRemote(tableId) {
  const { error } = await supabase.rpc('delete_table', { p_table_id: tableId });
  if (error) throw new Error(`delete_table: ${error.message}`);
}

export async function whoamiForCodeRemote(code) {
  const { data, error } = await supabase.rpc('whoami_for_code', { p_code: code });
  if (error) throw new Error(`whoami_for_code: ${error.message}`);
  return data?.[0] ? { tableId: data[0].table_id, playerId: data[0].player_id, isHost: data[0].is_host } : null;
}

export async function setTableOpenRemote(tableId, isOpen) {
  must(await supabase.from('tables').update({ is_open: isOpen }).eq('id', tableId), 'setTableOpen');
}

// Every table the signed-in caller hosts (REQ-003) — newest first, for
// Landing's "Your tables" list. Filtering by host_auth_id (rather than just
// relying on the "members can read their table" RLS policy) makes sure a
// host who also happens to be seated as a plain player elsewhere doesn't see
// those tables here too.
export async function listMyTablesRemote() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`listMyTables: ${userError.message}`);
  const userId = userData.user?.id;
  if (!userId) return [];

  const tableRows = must(
    await supabase
      .from('tables')
      .select('id,name,created_at')
      .eq('host_auth_id', userId)
      .order('created_at', { ascending: false }),
    'listMyTables(tables)'
  );
  if (tableRows.length === 0) return [];

  const tableIds = tableRows.map((row) => row.id);
  const [codesRes, playersRes] = await Promise.all([
    supabase.from('invite_codes').select('table_id,code').in('table_id', tableIds).is('revoked_at', null),
    supabase.from('players').select('id,table_id').eq('auth_user_id', userId).eq('is_host', true).in('table_id', tableIds),
  ]);
  const codeRows = must(codesRes, 'listMyTables(codes)');
  const playerRows = must(playersRes, 'listMyTables(players)');

  const codeByTable = {};
  for (const row of codeRows) codeByTable[row.table_id] = row.code;
  const playerIdByTable = {};
  for (const row of playerRows) playerIdByTable[row.table_id] = row.id;

  return tableRows.map((row) => ({
    tableId: row.id,
    name: row.name,
    code: codeByTable[row.id] ?? null,
    playerId: playerIdByTable[row.id] ?? null,
  }));
}

// ---- Full snapshot, used to hydrate the reducer on join/resume ----

export async function fetchTableSnapshot(tableId) {
  const [tableRes, codeRes, layersRes, islandsRes, entitiesRes, dmDataRes, playersRes] = await Promise.all([
    supabase.from('tables').select('id,is_open,created_at').eq('id', tableId).single(),
    supabase.from('invite_codes').select('code').eq('table_id', tableId).is('revoked_at', null).single(),
    supabase.from('layers').select('*').eq('table_id', tableId).order('created_at', { ascending: true }),
    supabase.from('islands').select('*').eq('table_id', tableId).order('created_at', { ascending: true }),
    supabase.from('entities').select('*').eq('table_id', tableId).order('created_at', { ascending: true }),
    // Returns zero rows for a non-host caller (RLS) — that's the point: a
    // player's client never even receives another entity's DM notes/loot.
    supabase.from('entity_dm_data').select('*').eq('table_id', tableId),
    supabase.from('players').select('*').eq('table_id', tableId),
  ]);

  const table = must(tableRes, 'fetchTableSnapshot(table)');
  const codeRow = must(codeRes, 'fetchTableSnapshot(code)');
  const layerRows = must(layersRes, 'fetchTableSnapshot(layers)');
  const islandRows = must(islandsRes, 'fetchTableSnapshot(islands)');
  const entityRows = must(entitiesRes, 'fetchTableSnapshot(entities)');
  const dmDataRows = must(dmDataRes, 'fetchTableSnapshot(entityDmData)');
  const playerRows = must(playersRes, 'fetchTableSnapshot(players)');

  // The clock lives in its own column (32_game_clock.sql). Fetched
  // separately and forgivingly - a project that has not run that migration
  // yet has no such column, and that must not stop anyone joining.
  const clockRes = await supabase.from('tables').select('game_clock').eq('id', tableId).maybeSingle();
  const clock = clockRes.error ? null : clockRes.data?.game_clock ?? null;
  // Same again for the manual day/night override (33_day_night_override.sql),
  // in its own query so a project that has 32 but not 33 still gets its clock.
  const overrideRes = await supabase.from('tables').select('day_night_override').eq('id', tableId).maybeSingle();
  const dayNightOverride = overrideRes.error ? null : overrideRes.data?.day_night_override ?? null;

  // Custom assets (36_custom_assets.sql) are a whole separate table rather
  // than a column, so a project that hasn't run that migration yet gets an
  // error here instead of a missing column — same forgiving treatment.
  const customAssetsRes = await supabase.from('custom_assets').select('*').eq('table_id', tableId);
  const customAssetRows = customAssetsRes.error ? [] : customAssetsRes.data;
  const customAssets = {};
  const customAssetOrder = [];
  for (const row of customAssetRows) {
    customAssets[row.id] = mapDbCustomAsset(row);
    customAssetOrder.push(row.id);
  }

  const players = {};
  let hostPlayerId = null;
  for (const row of playerRows) {
    players[row.id] = mapDbPlayer(row);
    if (row.is_host) hostPlayerId = row.id;
  }

  const layers = {};
  const layerOrder = [];
  const baseLayer = layerRows.find((row) => row.is_base) || layerRows[0];
  for (const row of layerRows) {
    const islandsForLayer = islandRows.filter((isl) => isl.layer_id === row.id);
    const baseIsland = islandsForLayer.find((isl) => isl.is_base) || islandsForLayer[0];
    const islands = {};
    const islandOrder = [];
    for (const islandRow of islandsForLayer) {
      islands[islandRow.id] = mapDbIsland(islandRow);
      if (baseIsland && islandRow.id === baseIsland.id) islandOrder.unshift(islandRow.id);
      else islandOrder.push(islandRow.id);
    }
    layers[row.id] = { ...mapDbLayer(row), islands, islandOrder };
    if (baseLayer && row.id === baseLayer.id) layerOrder.unshift(row.id);
    else layerOrder.push(row.id);
  }

  const dmDataByEntityId = {};
  for (const row of dmDataRows) dmDataByEntityId[row.entity_id] = mapDbEntityDmData(row);

  const entities = {};
  const entityOrder = [];
  for (const row of entityRows) {
    const dmData = dmDataByEntityId[row.id];
    entities[row.id] = {
      ...mapDbEntity(row),
      dmNotes: dmData?.dmNotes ?? '',
      droppables: row.kind === 'mob' ? dmData?.droppables ?? [] : undefined,
      mobSheet: row.kind === 'mob' ? dmData?.mobSheet : undefined,
    };
    entityOrder.push(row.id);
  }

  return {
    session: {
      code: codeRow.code,
      tableId: table.id,
      hostPlayerId,
      isOpen: table.is_open,
      createdAt: new Date(table.created_at).getTime(),
    },
    layers,
    layerOrder,
    clock,
    dayNightOverride,
    entities,
    entityOrder,
    customAssets,
    customAssetOrder,
    players,
  };
}

// ---- In-game clock ----

export async function updateTableClockRemote(tableId, clock) {
  must(await supabase.from('tables').update({ game_clock: clock }).eq('id', tableId), 'updateTableClock');
}

export async function updateTableDayNightOverrideRemote(tableId, phase) {
  must(await supabase.from('tables').update({ day_night_override: phase }).eq('id', tableId), 'updateTableDayNightOverride');
}

// ---- Layers ----

export async function addLayerRemote(tableId, layer) {
  const db = { ...mapClientLayerPatchToDb(layer), id: layer.id, table_id: tableId };
  must(await supabase.from('layers').insert(db), 'addLayer');
  // A freshly created layer always carries exactly one (base) island — see
  // GameView.createLayer / store.createInitialLayer.
  const baseIslandId = layer.islandOrder[0];
  await addIslandRemote(tableId, layer.id, layer.islands[baseIslandId], true);
}

export async function updateLayerRemote(layerId, patch) {
  const db = mapClientLayerPatchToDb(patch);
  must(await supabase.from('layers').update(db).eq('id', layerId), 'updateLayer');
}

export async function removeLayerRemote(layerId) {
  must(await supabase.from('layers').delete().eq('id', layerId), 'removeLayer');
}

// ---- Islands ----

export async function addIslandRemote(tableId, layerId, island, isBase = false) {
  const db = { ...mapClientIslandPatchToDb(island), id: island.id, layer_id: layerId, table_id: tableId, is_base: isBase };
  must(await supabase.from('islands').insert(db), 'addIsland');
}

export async function updateIslandRemote(islandId, patch) {
  const db = mapClientIslandPatchToDb(patch);
  must(await supabase.from('islands').update(db).eq('id', islandId), 'updateIsland');
}

export async function removeIslandRemote(islandId) {
  must(await supabase.from('islands').delete().eq('id', islandId), 'removeIsland');
}

// ---- Entities ----

export async function addEntityRemote(tableId, entity) {
  const db = mapClientEntityToDb(entity, tableId);
  must(await supabase.from('entities').insert(db), 'addEntity');
  if (entity.kind === 'hero' || entity.kind === 'mob') {
    must(
      await supabase.from('entity_dm_data').insert({
        entity_id: entity.id,
        table_id: tableId,
        // mobSheet is only sent when there is one (a freshly placed monster
        // has none), so placing a hero or monster never depends on the
        // mob_sheet column existing — see 30_mob_sheet.sql.
        ...mapClientEntityDmDataPatchToDb({
          dmNotes: entity.dmNotes ?? '',
          droppables: entity.droppables ?? [],
          ...(entity.mobSheet ? { mobSheet: entity.mobSheet } : {}),
        }),
      }),
      'addEntity(dmData)'
    );
  }
}

export async function moveEntityRemote(entityId, col, row, islandId, layerId) {
  const db = { col, row, ...(islandId ? { island_id: islandId } : {}), ...(layerId ? { layer_id: layerId } : {}) };
  must(await supabase.from('entities').update(db).eq('id', entityId), 'moveEntity');
}

// Called once per keystroke on a hero sheet's text fields via GameView's
// updateEntity — fine today, but that's the choke point to debounce first
// if this ever needs it (Realtime Roadmap §2.4), not here.
export async function updateEntityRemote(entityId, patch) {
  const entityPatch = {};
  const dmDataPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (DM_DATA_KEYS.includes(key)) dmDataPatch[key] = value;
    else entityPatch[key] = value;
  }

  const calls = [];
  if (Object.keys(entityPatch).length > 0) {
    calls.push(supabase.from('entities').update(mapClientEntityPatchToDb(entityPatch)).eq('id', entityId));
  }
  if (Object.keys(dmDataPatch).length > 0) {
    calls.push(supabase.from('entity_dm_data').update(mapClientEntityDmDataPatchToDb(dmDataPatch)).eq('entity_id', entityId));
  }
  const results = await Promise.all(calls);
  results.forEach((result) => must(result, 'updateEntity'));
}

export async function removeEntityRemote(entityId) {
  must(await supabase.from('entities').delete().eq('id', entityId), 'removeEntity');
}

// Un-revealing a trap. Revealing one is an ordinary UPDATE (the row becomes
// visible to players, so Realtime delivers it), but Realtime sends no event
// when a row *stops* being visible to a subscriber — a player's client
// would keep showing a trap the DM just hid. Deleting the row does reach
// them (the same DELETE event every other removed token relies on), so a
// hide is delete + re-insert of the same entity, now unrevealed and thus
// invisible to players again. The insert is retried because a failure
// after the delete would otherwise lose the trap from the database.
export async function hideTrapRemote(tableId, entity) {
  await removeEntityRemote(entity.id);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await addEntityRemote(tableId, { ...entity, trapRevealed: false });
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// ---- Custom assets ----

export async function addCustomAssetRemote(tableId, item) {
  must(
    await supabase.from('custom_assets').insert({ id: item.id, table_id: tableId, asset_type: item.assetType, data: item.data }),
    'addCustomAsset'
  );
}

export async function removeCustomAssetRemote(id) {
  must(await supabase.from('custom_assets').delete().eq('id', id), 'removeCustomAsset');
}

// ---- Players ----

// Frees the caller's own seat (see the self-only DELETE policy added in
// 14_entity_ordering_and_player_leave.sql) so the table's capacity count —
// which counts every player row regardless of `connected` — actually goes
// back down when someone leaves, matching local mode's full row removal.
export async function removePlayerRemote(playerId) {
  must(await supabase.from('players').delete().eq('id', playerId), 'removePlayer');
}

export async function setPlayerCurrentLayerRemote(playerId, layerId) {
  must(await supabase.from('players').update({ current_layer_id: layerId }).eq('id', playerId), 'setPlayerCurrentLayer');
}
