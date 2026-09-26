// REQ-009 Synced Table Audio — the playback engine. One <audio> element driven
// from state.audio: every client derives the position from the shared anchor
// (offsetMs + Date.now() - anchorMs), so nothing is written per tick.

import { useCallback, useEffect, useRef, useState } from 'react';
import { isBuiltinTrackUrl, resolveTrackUrl } from '../data/defaultAudio.js';

// Loops by default for world/layer sounds, not for one-shot token sounds.
export function defaultLoopFor(targetKind) {
  return targetKind !== 'entity';
}

// Where the current sound should be, in seconds. A looping track wraps by its
// duration; a one-shot returns null once it has run past the end.
export function playbackPositionSeconds(nowPlaying, durationSeconds, loop, nowMs = Date.now()) {
  const raw = Math.max(0, (nowPlaying.offsetMs + (nowMs - nowPlaying.anchorMs)) / 1000);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return raw;
  if (loop) return raw % durationSeconds;
  return raw >= durationSeconds ? null : raw;
}

// A track that points at a Default catalog song: a public URL, but no file of
// the table's own (cloud uploads always have a storage path, a guest DM's local
// files are blob: URLs).
export function isCatalogTrack(track) {
  return Boolean(track) && !track.storagePath && !String(track.url).startsWith('blob:');
}

// The audibility rule (REQ-009): world and token sounds are heard by everyone;
// a layer sound only by clients on that layer. `expired` files are skipped.
export function audibleTrack(playback, tracks, { currentLayerId, layers, expired } = {}) {
  const np = playback?.nowPlaying;
  const track = np ? tracks?.[np.trackId] : null;
  if (!track || expired?.has(track.id)) return null;
  switch (track.targetKind) {
    case 'world':
    case 'entity':
      return track;
    case 'layer':
      return track.targetId === currentLayerId ? track : null;
    default:
      return null;
  }
}

/**
 * @param {object} opts
 * @param {boolean} opts.enabled - false in local demo mode: nothing runs
 * @param {object} opts.playback - state.audio.playback
 * @param {object} opts.tracks - state.audio.tracks
 * @param {string} opts.currentLayerId - the layer this client is on
 * @param {object} opts.layers - state.layers
 * @param {object} opts.localVolumes - { [trackId]: 0..1 } this browser's levels
 * @param {boolean} opts.checkFiles - HEAD-check track files up front (guest
 *   tables, whose files expire)
 * @returns {{ blocked: boolean, unlock: () => void, expired: Set<string> }}
 */
export function useTableAudio({ enabled, playback, tracks, currentLayerId, layers, localVolumes, checkFiles }) {
  const elRef = useRef(null);
  const [blocked, setBlocked] = useState(false);
  const [expired, setExpired] = useState(() => new Set());
  // Bumped by unlock(), and when the tab wakes or the network returns, so the
  // sync effect re-derives the position.
  const [resyncTick, setResyncTick] = useState(0);

  const track = enabled ? audibleTrack(playback, tracks, { currentLayerId, layers, expired }) : null;
  const nowPlaying = track ? playback.nowPlaying : null;
  const url = track ? resolveTrackUrl(track.url) : null;
  const loop = track?.loop ?? true;
  const volume = track ? clamp01(track.baseVolume ?? 1) * clamp01(localVolumes?.[track.id] ?? 1) : 0;

  const markExpired = useCallback((id) => {
    setExpired((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  // A guest table resumed from autosave references blob URLs that died with
  // the old page — find out before the DM presses play.
  const trackKey = Object.values(tracks || {})
    .map((t) => `${t.id}=${t.url}`)
    .join('|');
  useEffect(() => {
    if (!enabled || !checkFiles) return undefined;
    let cancelled = false;
    for (const t of Object.values(tracks || {})) {
      if (isBuiltinTrackUrl(t.url)) {
        // Bundled with the app: only missing if a later build dropped it.
        if (!resolveTrackUrl(t.url)) markExpired(t.id);
        continue;
      }
      if (t.url.startsWith('blob:')) {
        // A guest DM's local file: a blob URL from an earlier page load is dead.
        fetch(t.url).then(
          (res) => res.body?.cancel(),
          () => !cancelled && markExpired(t.id)
        );
        continue;
      }
      fetch(t.url, { method: 'HEAD' }).then(
        (res) => !cancelled && !res.ok && markExpired(t.id),
        () => {} // offline is not expiry
      );
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, checkFiles, trackKey, markExpired]);

  useEffect(() => {
    if (!enabled) return undefined;
    const bump = () => setResyncTick((n) => n + 1);
    const onVisible = () => document.visibilityState === 'visible' && bump();
    window.addEventListener('online', bump);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', bump);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  useEffect(() => {
    if (!nowPlaying || !url) {
      const idle = elRef.current;
      if (idle) idle.pause();
      setBlocked(false);
      return undefined;
    }

    if (!elRef.current) {
      elRef.current = new Audio();
      elRef.current.preload = 'auto';
    }
    const el = elRef.current;
    el.loop = loop;
    const trackId = nowPlaying.trackId;
    const onError = () => markExpired(trackId);
    el.addEventListener('error', onError);
    if (el.getAttribute('data-src') !== url) {
      el.setAttribute('data-src', url);
      el.src = url;
    }

    let cancelled = false;
    function seekAndPlay() {
      if (cancelled) return;
      const target = playbackPositionSeconds(nowPlaying, el.duration, loop);
      if (target === null) {
        el.pause(); // a one-shot that has already finished
        return;
      }
      if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
      el.play().then(
        () => !cancelled && setBlocked(false),
        (err) => {
          // Only a gesture block is something the player can fix; a file that
          // cannot load surfaces through the 'error' event instead.
          if (!cancelled && err?.name === 'NotAllowedError') setBlocked(true);
        }
      );
    }

    if (el.readyState >= 1) seekAndPlay();
    else el.addEventListener('loadedmetadata', seekAndPlay, { once: true });

    return () => {
      cancelled = true;
      el.removeEventListener('loadedmetadata', seekAndPlay);
      el.removeEventListener('error', onError);
    };
    // `playback` itself is a dependency so a resync (HYDRATE after a
    // reconnect) re-derives the position even when the values are unchanged.
  }, [url, loop, playback, nowPlaying?.trackId, nowPlaying?.anchorMs, nowPlaying?.offsetMs, resyncTick, markExpired]);

  // Volume changes apply live, without re-seeking. (iOS Safari ignores it.)
  useEffect(() => {
    if (elRef.current) elRef.current.volume = volume;
  }, [volume, url]);

  useEffect(
    () => () => {
      const el = elRef.current;
      if (el) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
    },
    []
  );

  const unlock = useCallback(() => setResyncTick((n) => n + 1), []);
  return { blocked, unlock, expired };
}

function clamp01(n) {
  return Math.min(1, Math.max(0, Number(n) || 0));
}
