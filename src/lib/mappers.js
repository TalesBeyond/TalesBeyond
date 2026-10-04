// Postgres rows are snake_case and split across tables/maps/entities/players;
// the reducer in state/store.jsx speaks the camelCase TableState shape
// documented in SPEC.md §6.1. These functions are the only place that
// translates between the two, so nothing else needs to know the DB layout.

import { toStoredImage, toStoredBackground, fromStoredImage, customAssetDataFromDb } from './storedImages.js';

// A layer is now just a named canvas — its grid fields (cols/rows/cellSize/
// backgroundImage) moved to islands (see mapDbIsland below); `islands`/
// `islandOrder` are assembled separately in remoteApi.js's
// fetchTableSnapshot, since they come from their own table. `islandGroups`
// bundles islands the host has explicitly grouped (see MapBoard.jsx's
// bounding-box rendering) — the islands themselves are untouched by
// grouping, only their membership lives here.
export function mapDbLayer(row) {
  return {
    id: row.id,
    name: row.name,
    feetPerSquare: row.feet_per_square,
    islandGroups: row.island_groups || {},
  };
}

export function mapClientLayerPatchToDb(patch) {
  const db = {};
  if ('name' in patch) db.name = patch.name;
  if ('feetPerSquare' in patch) db.feet_per_square = patch.feetPerSquare;
  if ('islandGroups' in patch) db.island_groups = patch.islandGroups;
  return db;
}

// An island — one independent grid, freely positioned (x, y) on its
// layer's canvas.
export function mapDbIsland(row) {
  return {
    id: row.id,
    name: row.name,
    cols: row.cols,
    rows: row.rows,
    cellSize: row.cell_size,
    backgroundImage: toStoredBackground(row.background_url), // fingerprint only (lib/storedImages.js)
    x: row.x,
    y: row.y,
    conditions: row.conditions || [],
    dayNight: row.day_night ?? 'cycle',
    // Null for islands from before each island had its own scale — they
    // follow their layer's (utils/grid.js islandFeet).
    feetPerSquare: row.feet_per_square ?? null,
    // How its grid is drawn (utils/grid.js gridLineStyle); null is the default.
    gridLines: row.grid_lines || null,
  };
}

export function mapClientIslandPatchToDb(patch) {
  const db = {};
  if ('name' in patch) db.name = patch.name;
  if ('cols' in patch) db.cols = patch.cols;
  if ('rows' in patch) db.rows = patch.rows;
  if ('cellSize' in patch) db.cell_size = patch.cellSize;
  if ('backgroundImage' in patch) db.background_url = toStoredBackground(patch.backgroundImage); // fingerprint only (lib/storedImages.js)
  if ('x' in patch) db.x = patch.x;
  if ('y' in patch) db.y = patch.y;
  if ('conditions' in patch) db.conditions = patch.conditions;
  if ('dayNight' in patch) db.day_night = patch.dayNight;
  if ('feetPerSquare' in patch && patch.feetPerSquare != null) db.feet_per_square = patch.feetPerSquare;
  if ('gridLines' in patch) db.grid_lines = patch.gridLines || null;
  return db;
}

export function mapDbEntity(row) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    imageUrl: fromStoredImage(row.image_url, row),
    color: row.color,
    col: row.col,
    row: row.row,
    size: row.size,
    hp: row.hp,
    maxHp: row.max_hp,
    tempHp: row.temp_hp ?? 0,
    armorClass: row.armor_class ?? undefined,
    ownerId: row.owner_id,
    layerId: row.layer_id,
    islandId: row.island_id,
    targetLayerId: row.target_layer_id,
    targetCol: row.target_col,
    targetRow: row.target_row,
    conditions: row.conditions || [],
    sheet: row.sheet ?? undefined,
    chestSize: row.chest_size ?? undefined,
    opened: row.kind === 'chest' ? row.opened ?? false : undefined,
    items: row.kind === 'chest' ? row.chest_items ?? [] : undefined,
    ...(row.kind === 'trap'
      ? {
          trapDescription: row.trap_description ?? '',
          trapSave: row.trap_save ?? null,
          trapFail: row.trap_fail ?? null,
          trapDice: row.trap_dice ?? '',
          trapDamage: row.trap_damage ?? '',
          trapDamageType: row.trap_damage_type ?? 'none',
          trapRevealed: row.trap_revealed ?? false,
        }
      : {}),
  };
}

export function mapClientEntityToDb(entity, tableId) {
  return {
    id: entity.id,
    table_id: tableId,
    kind: entity.kind,
    name: entity.name,
    image_url: toStoredImage(entity.imageUrl),
    color: entity.color,
    col: entity.col,
    row: entity.row,
    size: entity.size,
    hp: entity.hp,
    max_hp: entity.maxHp,
    // Only when set, so placing tokens keeps working on a project that
    // hasn't run 51_temp_hp.sql yet.
    ...(entity.tempHp ? { temp_hp: entity.tempHp } : {}),
    armor_class: entity.armorClass ?? null,
    owner_id: entity.ownerId,
    layer_id: entity.layerId,
    island_id: entity.islandId,
    target_layer_id: entity.targetLayerId ?? null,
    target_col: entity.targetCol ?? null,
    target_row: entity.targetRow ?? null,
    conditions: entity.conditions || [],
    sheet: entity.sheet ?? null,
    chest_size: entity.chestSize ?? null,
    opened: entity.opened ?? false,
    chest_items: entity.items ?? [],
    ...(entity.kind === 'trap'
      ? {
          trap_description: entity.trapDescription ?? '',
          trap_save: entity.trapSave ?? null,
          trap_fail: entity.trapFail ?? null,
          trap_dice: entity.trapDice ?? '',
          trap_damage: entity.trapDamage ?? '',
          trap_damage_type: entity.trapDamageType ?? 'none',
          trap_revealed: entity.trapRevealed ?? false,
        }
      : {}),
  };
}

export function mapClientEntityPatchToDb(patch) {
  const db = {};
  if ('name' in patch) db.name = patch.name;
  if ('imageUrl' in patch) db.image_url = toStoredImage(patch.imageUrl);
  if ('color' in patch) db.color = patch.color;
  if ('col' in patch) db.col = patch.col;
  if ('row' in patch) db.row = patch.row;
  if ('size' in patch) db.size = patch.size;
  if ('hp' in patch) db.hp = patch.hp;
  if ('maxHp' in patch) db.max_hp = patch.maxHp;
  if ('tempHp' in patch) db.temp_hp = patch.tempHp;
  if ('armorClass' in patch) db.armor_class = patch.armorClass;
  if ('ownerId' in patch) db.owner_id = patch.ownerId;
  if ('layerId' in patch) db.layer_id = patch.layerId;
  if ('islandId' in patch) db.island_id = patch.islandId;
  if ('targetLayerId' in patch) db.target_layer_id = patch.targetLayerId;
  if ('targetCol' in patch) db.target_col = patch.targetCol;
  if ('targetRow' in patch) db.target_row = patch.targetRow;
  if ('conditions' in patch) db.conditions = patch.conditions;
  if ('sheet' in patch) db.sheet = patch.sheet;
  if ('chestSize' in patch) db.chest_size = patch.chestSize;
  if ('opened' in patch) db.opened = patch.opened;
  if ('items' in patch) db.chest_items = patch.items;
  if ('trapDescription' in patch) db.trap_description = patch.trapDescription;
  if ('trapSave' in patch) db.trap_save = patch.trapSave;
  if ('trapFail' in patch) db.trap_fail = patch.trapFail;
  if ('trapDice' in patch) db.trap_dice = patch.trapDice;
  if ('trapDamage' in patch) db.trap_damage = patch.trapDamage;
  if ('trapDamageType' in patch) db.trap_damage_type = patch.trapDamageType;
  if ('trapRevealed' in patch) db.trap_revealed = patch.trapRevealed;
  return db;
}

// entity_dm_data — DM notes and mob droppables, split into their own
// table (see 15_entity_dm_data_privacy.sql) so a host-only RLS SELECT
// policy actually keeps them private, instead of merely hiding them in
// the UI while every column of `entities` remains world-readable.
export function mapDbEntityDmData(row) {
  return {
    dmNotes: row.dm_notes ?? '',
    droppables: row.drop_items ?? [],
    // A monster's tabbed character sheet (30_mob_sheet.sql) — DM-only, so
    // it lives here rather than on `entities`. Absent until first edited.
    mobSheet: row.mob_sheet ?? undefined,
  };
}

export function mapClientEntityDmDataPatchToDb(patch) {
  const db = {};
  if ('dmNotes' in patch) db.dm_notes = patch.dmNotes;
  if ('droppables' in patch) db.drop_items = patch.droppables;
  if ('mobSheet' in patch) db.mob_sheet = patch.mobSheet;
  return db;
}

// Custom assets (36_custom_assets.sql) — a DM-authored monster/weapon/item.
// `data` is already in the exact shape its catalog counterpart uses (see
// src/data/weapons.js / items.js / defaultTokens.js), so the client never
// needs to reshape it before rendering it alongside the built-in catalog.
export function mapDbCustomAsset(row) {
  return {
    id: row.id,
    assetType: row.asset_type,
    data: customAssetDataFromDb(row.asset_type, row.data),
  };
}

// Audio tracks (38_synced_table_audio.sql). `targetId` is text so the world
// track can use the table's own id and later kinds can use layer/island/entity
// ids without a per-kind column.
export function mapDbAudioTrack(row) {
  return {
    id: row.id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    name: row.name,
    url: row.url,
    storagePath: row.storage_path,
    mime: row.mime,
    sizeBytes: Number(row.size_bytes),
    baseVolume: row.base_volume ?? 1,
    loop: row.loop ?? true,
  };
}

// Drawings (52_drawings.sql) — the DM's Draw tool. Geometry is in grid
// squares from the island's top-left corner; see the migration for shapes.
export function mapDbDrawing(row) {
  return {
    id: row.id,
    islandId: row.island_id,
    kind: row.kind,
    geometry: row.geometry,
    style: row.style || {},
  };
}

export function drawingToDb(tableId, drawing) {
  return {
    id: drawing.id,
    table_id: tableId,
    island_id: drawing.islandId,
    kind: drawing.kind,
    geometry: drawing.geometry,
    style: drawing.style || {},
  };
}

export function audioTrackToDb(tableId, track) {
  return {
    id: track.id,
    table_id: tableId,
    target_kind: track.targetKind,
    target_id: track.targetId,
    name: track.name,
    url: track.url,
    storage_path: track.storagePath,
    mime: track.mime,
    size_bytes: track.sizeBytes,
    base_volume: track.baseVolume ?? 1,
    loop: track.loop ?? true,
  };
}

export function mapDbPlayer(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isHost: row.is_host,
    connected: row.connected,
    joinedAt: new Date(row.joined_at).getTime(),
    currentLayerId: row.current_layer_id,
  };
}
