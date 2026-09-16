// Guest DM sessions (REQ-008). Live sync for a table that is never written
// to Postgres — Realtime Broadcast on a channel named after the invite code
// stands in for realtime.js's postgres_changes subscription, since there is
// no database row for a guest table to change. The DM's browser is the only
// client that ever applies a player-originated action to shared state (see
// REQ-008's Architectural decisions); this module only carries the messages.

import { supabase } from './supabaseClient.js';

function channelNameFor(code) {
  return `guest:${code.toUpperCase()}`;
}

// onStateChange(action): every client (host and players alike) applies a
//   DM-broadcast reducer action verbatim.
// onIntent(action, senderId): host-only — a player's proposed action,
//   validated and applied by the host before being rebroadcast as a
//   state_change.
// onPlayerJoin({ requestId, name, color }): host-only — a joining player's
//   request for a seat; answer with the returned sendJoinAck.
// onStateRequest(requesterId): host-only — a reconnecting player (one who
//   already has a playerId, unlike onPlayerJoin) asking for a fresh
//   snapshot; answer with sendStateSnapshot.
// onStateSnapshot(state, forId): player-side — the host's reply to a
//   state_request. Broadcast reaches every subscriber, so the caller must
//   check `forId` against its own id before applying it.
// onStatusChange(status, isInitialJoin): same shape as realtime.js's
//   subscribeToTable, for connection-state UI and reconnect detection.
export function subscribeToGuestTable(code, { onStateChange, onIntent, onPlayerJoin, onStateRequest, onStateSnapshot, onStatusChange } = {}) {
  const channel = supabase.channel(channelNameFor(code));
  let hasJoinedOnce = false;

  if (onStateChange) {
    channel.on('broadcast', { event: 'state_change' }, ({ payload }) => onStateChange(payload.action));
  }
  if (onIntent) {
    channel.on('broadcast', { event: 'intent' }, ({ payload }) => onIntent(payload.action, payload.senderId));
  }
  if (onPlayerJoin) {
    channel.on('broadcast', { event: 'player_join' }, ({ payload }) => onPlayerJoin(payload));
  }
  if (onStateRequest) {
    channel.on('broadcast', { event: 'state_request' }, ({ payload }) => onStateRequest(payload.requesterId));
  }
  if (onStateSnapshot) {
    channel.on('broadcast', { event: 'state_snapshot' }, ({ payload }) => onStateSnapshot(payload.state, payload.forId));
  }

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED' && !hasJoinedOnce) {
      hasJoinedOnce = true;
      onStatusChange?.(status, true);
    } else {
      onStatusChange?.(status, false);
    }
  });

  return {
    unsubscribe() {
      supabase.removeChannel(channel);
    },
    sendStateChange(action) {
      channel.send({ type: 'broadcast', event: 'state_change', payload: { action } });
    },
    sendIntent(action, senderId) {
      channel.send({ type: 'broadcast', event: 'intent', payload: { action, senderId } });
    },
    sendJoinAck(requestId, playerId, state) {
      channel.send({ type: 'broadcast', event: 'player_join_ack', payload: { requestId, playerId, state } });
    },
    sendStateRequest(requesterId) {
      channel.send({ type: 'broadcast', event: 'state_request', payload: { requesterId } });
    },
    sendStateSnapshot(forId, state) {
      channel.send({ type: 'broadcast', event: 'state_snapshot', payload: { forId, state } });
    },
  };
}

// Player-side join probe, used by Landing's JoinForm before it knows
// whether a code belongs to a guest table at all: opens the channel, asks
// for a seat, and waits briefly for the host to answer. No answer within
// the timeout means either the code is wrong or it belongs to a normal
// cloud table (a disjoint code space) — the caller falls back to the
// existing cloud join flow either way.
export function requestGuestJoin(code, { name, color }, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const channel = supabase.channel(channelNameFor(code));
    const requestId = Math.random().toString(36).slice(2);
    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      supabase.removeChannel(channel);
      resolve(result);
    }

    const timer = setTimeout(() => finish(null), timeoutMs);

    channel
      .on('broadcast', { event: 'player_join_ack' }, ({ payload }) => {
        if (payload.requestId !== requestId) return;
        finish({ playerId: payload.playerId, state: payload.state });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({ type: 'broadcast', event: 'player_join', payload: { requestId, name, color } });
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          finish(null);
        }
      });
  });
}
