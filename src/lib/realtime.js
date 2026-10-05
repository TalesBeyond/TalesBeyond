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
import { attachImageExchange } from './imageExchange.js';
import { canBeHidden } from '../data/visibility.js';
import { mapDbEntity, mapDbLayer, mapDbIsland, mapDbPlayer, mapDbEntityDmData, mapDbCustomAsset, mapDbAudioTrack, mapDbDrawing } from './mappers.js';

// onStatusChange, if given, is called on every SUBSCRIBED/TIMED_OUT/CLOSED/
// CHANNEL_ERROR transition of this one channel (see REALTIME_SUBSCRIBE_STATES
// in @supabase/realtime-js) as (status, isInitialJoin) — isInitialJoin is true
// only for the very first SUBSCRIBED, so a caller can tell "just connected"
// apart from "recovered after a drop" without tracking that itself.
//
// presence, if given, rides this same channel's Presence feature (separate
// from postgres_changes) to answer one question: is the host's browser
// still around? `{ isHost, onHostPresenceChange }` — the host's own client
// tracks itself so everyone else's `onHostPresenceChange(hostPresent)` fires
// on join/leave/crash alike (Presence detects a dropped socket on its own,
// unlike postgres_changes' players-row DELETE, which a host leaving never
// triggers — see doLeaveTable in GameView.jsx). Used to auto-end a table's
// player sessions a few minutes after the host disappears.
// onRoll, if given, receives the dice rolls other people at the table
// announce over this same channel (Broadcast, never stored); the returned
// unsubscribe function carries `sendRoll(roll)` to announce one.
// onArea / `sendArea(message)`: the same for area-of-effect templates laid on
// the map (GameView.jsx's "Areas of effect") — announced, never stored.
export function subscribeToTable(tableId, dispatch, onStatusChange, presence, onRoll, onArea) {
  const channel = supabase.channel(`table:${tableId}`);
  let hasJoinedOnce = false;
  if (onRoll) channel.on('broadcast', { event: 'roll' }, ({ payload }) => onRoll(payload));
  if (onArea) channel.on('broadcast', { event: 'area' }, ({ payload }) => onArea(payload));
  // The DM just hid a monster, chest or door. Realtime sends no event when a
  // row stops being visible to a subscriber, so the DM's client names the
  // token here (`sendConceal`, below) once the row is hidden. The row stays
  // the authority: the token is only dropped if this client really can no
  // longer read it, so a made-up 'conceal' from another player does nothing
  // (and neither does this one on the DM's own second tab).
  channel.on('broadcast', { event: 'conceal' }, async ({ payload }) => {
    if (!payload?.id) return;
    const { data, error } = await supabase.from('entities').select('id').eq('id', payload.id).maybeSingle();
    if (!error && !data) dispatch({ type: 'REMOVE_ENTITY', id: payload.id });
  });
  // DM-uploaded pictures travel between browsers on this same channel.
  const images = attachImageExchange(channel);

  if (presence?.onHostPresenceChange) {
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const hostPresent = Object.values(state).some((metas) => metas.some((meta) => meta.isHost));
      presence.onHostPresenceChange(hostPresent);
    });
  }

  channel
    // Supabase answers a subscription it can't serve — most often a table
    // missing from the supabase_realtime publication (50_realtime_publication
    // .sql) — with an error here, and then drops every postgres_changes
    // binding on the channel while the channel itself still reports
    // SUBSCRIBED. Nothing else would ever surface that.
    .on('system', {}, (message) => {
      if (message?.status === 'error') console.error(`[realtime] table:${tableId} live updates refused:`, message.message);
    })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'entities', filter: `table_id=eq.${tableId}` },
      (payload) => {
        console.debug(`[realtime] entities ${payload.eventType}`, payload.new?.name ?? payload.old?.id);
        if (payload.eventType === 'INSERT') {
          dispatch({ type: 'ADD_ENTITY', entity: mapDbEntity(payload.new) });
        } else if (payload.eventType === 'UPDATE') {
          // A trap the DM just revealed, or a hidden monster, chest or door
          // the DM just showed, reaches a player as an UPDATE for a row
          // their client has never seen (it was invisible to them until
          // now — 20250101000028_traps.sql, 20250101000059_hidden_tokens_
          // locked_doors.sql). ADD_ENTITY upserts, so use it for those
          // kinds; a hero's UPDATE targets an entity the client already has.
          const type = payload.new.kind === 'trap' || canBeHidden(payload.new) ? 'ADD_ENTITY' : 'UPDATE_ENTITY';
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
        if ('audio_playback' in payload.new) dispatch({ type: 'SET_AUDIO_PLAYBACK', playback: payload.new.audio_playback });
        if ('day_night_override' in payload.new) dispatch({ type: 'SET_DAY_NIGHT_OVERRIDE', phase: payload.new.day_night_override ?? null });
        if ('encounter' in payload.new) dispatch({ type: 'SET_ENCOUNTER', encounter: payload.new.encounter ?? null });
      }
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_assets', filter: `table_id=eq.${tableId}` }, (payload) => {
      if (payload.eventType === 'INSERT') {
        dispatch({ type: 'ADD_CUSTOM_ASSET', item: mapDbCustomAsset(payload.new) });
      } else if (payload.eventType === 'DELETE') {
        dispatch({ type: 'REMOVE_CUSTOM_ASSET', id: payload.old.id });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'audio_tracks', filter: `table_id=eq.${tableId}` }, (payload) => {
      if (payload.eventType === 'DELETE') {
        dispatch({ type: 'REMOVE_AUDIO_TRACK', id: payload.old.id });
      } else {
        dispatch({ type: 'SET_AUDIO_TRACK', track: mapDbAudioTrack(payload.new) });
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'drawings', filter: `table_id=eq.${tableId}` }, (payload) => {
      if (payload.eventType === 'DELETE') {
        dispatch({ type: 'REMOVE_DRAWINGS', ids: [payload.old.id] });
      } else {
        dispatch({ type: 'SET_DRAWING', drawing: mapDbDrawing(payload.new) });
      }
    })
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'invite_codes', filter: `table_id=eq.${tableId}` },
      (payload) => {
        if (!payload.new.revoked_at) dispatch({ type: 'REGENERATE_INVITE_CODE', code: payload.new.code });
      }
    )
    .subscribe((status, err) => {
      // A channel that fails to join (or drops) otherwise fails silently —
      // the table just stops updating — so say so in the console.
      if (status === 'SUBSCRIBED') console.info(`[realtime] table:${tableId} connected`);
      else console.warn(`[realtime] table:${tableId} ${status}`, err?.message || err || '');
      if (status === 'SUBSCRIBED' && !hasJoinedOnce) {
        hasJoinedOnce = true;
        onStatusChange?.(status, true);
      } else {
        onStatusChange?.(status, false);
      }
      if (status === 'SUBSCRIBED' && presence?.isHost) channel.track({ isHost: true });
      if (status === 'SUBSCRIBED') images.onSubscribed();
      else images.onDisconnected();
    });

  const unsubscribe = () => {
    images.detach();
    supabase.removeChannel(channel);
  };
  unsubscribe.sendRoll = (roll) => channel.send({ type: 'broadcast', event: 'roll', payload: roll });
  unsubscribe.sendArea = (message) => channel.send({ type: 'broadcast', event: 'area', payload: message });
  unsubscribe.sendConceal = (id) => channel.send({ type: 'broadcast', event: 'conceal', payload: { id } });
  return unsubscribe;
}
