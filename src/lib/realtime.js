// Realtime sync (SPEC.md §9.5). Subscribes to Postgres changes for one
// table and turns them into the exact same reducer actions that local
// interactions already dispatch (see state/store.jsx) — so MapBoard,
// TokenSidebar, RightPanel, etc. never need to know whether a change
// originated locally or from another player's browser.
//
// Conflict handling: last-write-wins via each row's `updated_at`, set
// server-side by the touch_updated_at() trigger. Good enough for
// single-owner-in-the-moment fields like token position/HP; see
// SPEC.md §9.5 for the reasoning and future refinement ideas.

import { supabase } from './supabaseClient.js';
import { mapDbEntity, mapDbLayer, mapDbIsland, mapDbPlayer, mapDbEntityDmData, mapDbCustomAsset } from './mappers.js';

// onStatusChange, if given, is called on every SUBSCRIBED/TIMED_OUT/CLOSED/
// CHANNEL_ERROR transition of this one channel (see REALTIME_SUBSCRIBE_STATES
// in @supabase/realtime-js) as (status, isInitialJoin) — isInitialJoin is true
// only for the very first SUBSCRIBED, so a caller can tell "just connected"
// apart from "recovered after a drop" without tracking that itself.
export function subscribeToTable(tableId, dispatch, onStatusChange) {
  const channel = supabase.channel(`table:${tableId}`);
  let hasJoinedOnce = false;

  channel
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'entities', filter: `table_id=eq.${tableId}` },
      (payload) => {
        if (payload.eventType === 'INSERT') {
          dispatch({ type: 'ADD_ENTITY', entity: mapDbEntity(payload.new) });
        } else if (payload.eventType === 'UPDATE') {
          // A trap the DM just revealed reaches a player as an UPDATE for a
          // row their client has never seen (it was invisible to them until
          // now — 20250101000028_traps.sql). ADD_ENTITY upserts, so use it
          // for traps; every other kind's UPDATE targets an entity the
          // client already has.
          const type = payload.new.kind === 'trap' ? 'ADD_ENTITY' : 'UPDATE_ENTITY';
          dispatch(
            type === 'ADD_ENTITY'
              ? { type, entity: mapDbEntity(payload.new) }
              : { type, id: payload.new.id, patch: mapDbEntity(payload.new) }
          );
        } else if (payload.eventType === 'DELETE') {
          dispatch({ type: 'REMOVE_ENTITY', id: payload.old.id });
        }
      }
    )
    .on(
      // Only a host's subscription ever receives these — entity_dm_data's
      // RLS SELECT policy (15_entity_dm_data_privacy.sql) is host-only, and
      // Realtime enforces the same RLS per-subscriber for postgres_changes.
      'postgres_changes',
      { event: '*', schema: 'public', table: 'entity_dm_data', filter: `table_id=eq.${tableId}` },
      (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          dispatch({ type: 'UPDATE_ENTITY', id: payload.new.entity_id, patch: mapDbEntityDmData(payload.new) });
        }
        // DELETE: the entity itself is being removed too (cascade) — the
        // entities-table listener's REMOVE_ENTITY already covers cleanup.
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'players', filter: `table_id=eq.${tableId}` },
      (payload) => {
        if (payload.eventType === 'INSERT') {
          dispatch({ type: 'ADD_PLAYER', player: mapDbPlayer(payload.new) });
        } else if (payload.eventType === 'UPDATE') {
          dispatch({ type: 'PATCH_PLAYER', id: payload.new.id, patch: mapDbPlayer(payload.new) });
        } else if (payload.eventType === 'DELETE') {
          dispatch({ type: 'REMOVE_PLAYER', id: payload.old.id });
        }
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'layers', filter: `table_id=eq.${tableId}` },
      (payload) => {
        if (payload.eventType === 'INSERT') {
          // islands/islandOrder aren't columns on this row — they arrive a
          // moment later via the islands INSERT event below (see
          // addLayerRemote, which inserts the layer then its base island).
          dispatch({ type: 'ADD_LAYER', layer: { ...mapDbLayer(payload.new), islands: {}, islandOrder: [] } });
        } else if (payload.eventType === 'UPDATE') {
          dispatch({ type: 'UPDATE_LAYER', id: payload.new.id, patch: mapDbLayer(payload.new) });
        } else if (payload.eventType === 'DELETE') {
          dispatch({ type: 'REMOVE_LAYER', id: payload.old.id });
        }
      }
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'islands', filter: `table_id=eq.${tableId}` }, (payload) => {
      const layerId = payload.new?.layer_id ?? payload.old?.layer_id;
      if (payload.eventType === 'INSERT') {
        dispatch({ type: 'ADD_ISLAND', layerId, island: mapDbIsland(payload.new) });
      } else if (payload.eventType === 'UPDATE') {
        dispatch({ type: 'UPDATE_ISLAND', layerId, islandId: payload.new.id, patch: mapDbIsland(payload.new) });
      } else if (payload.eventType === 'DELETE') {
        dispatch({ type: 'REMOVE_ISLAND', layerId, islandId: payload.old.id });
      }
    })
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'tables', filter: `id=eq.${tableId}` },
      (payload) => {
        dispatch({ type: 'SET_SESSION_OPEN', isOpen: payload.new.is_open });
        // Absent (not merely null) before 32_game_clock.sql is applied.
        if ('game_clock' in payload.new) dispatch({ type: 'SET_CLOCK', clock: payload.new.game_clock ?? null });
        if ('day_night_override' in payload.new) dispatch({ type: 'SET_DAY_NIGHT_OVERRIDE', phase: payload.new.day_night_override ?? null });
      }
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_assets', filter: `table_id=eq.${tableId}` }, (payload) => {
      if (payload.eventType === 'INSERT') {
        dispatch({ type: 'ADD_CUSTOM_ASSET', item: mapDbCustomAsset(payload.new) });
      } else if (payload.eventType === 'DELETE') {
        dispatch({ type: 'REMOVE_CUSTOM_ASSET', id: payload.old.id });
      }
    })
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'invite_codes', filter: `table_id=eq.${tableId}` },
      (payload) => {
        if (!payload.new.revoked_at) dispatch({ type: 'REGENERATE_INVITE_CODE', code: payload.new.code });
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED' && !hasJoinedOnce) {
        hasJoinedOnce = true;
        onStatusChange?.(status, true);
      } else {
        onStatusChange?.(status, false);
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}
