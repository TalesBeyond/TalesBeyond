// REQ-009 Synced Table Audio — the playback engine. One <audio> element driven
// from state.audio: every client derives the position from the shared anchor
// (offsetMs + Date.now() - anchorMs), so nothing is written per tick. Slice 1
// plays the world track only, audible to everyone.

import { useCallback, useEffect, useRef, useState } from 'react';

// The audible track for this client, or null. Later slices extend this with the
// layer/island/entity rules; keeping it one function keeps that a single change.
export function audibleTrack(playback, tracks) {
  const np = playback?.nowPlaying;
  const track = np ? tracks?.[np.trackId] : null;
  if (!track || track.targetKind !== 'world') return null;
  return track;
}

// Where the current sound should be, in seconds, wrapped by its duration.
export function playbackPositionSeconds(nowPlaying, durationSeconds, nowMs = Date.now()) {
  const raw = Math.max(0, (nowPlaying.offsetMs + (nowMs - nowPlaying.anchorMs)) / 1000);
  return Number.isFinite(durationSeconds) && durationSeconds > 0 ? raw % durationSeconds : raw;
}

/**
 * @returns {{ blocked: boolean, unlock: () => void }} `blocked` is true when
 * the browser refused to start audio without a user gesture; `unlock` retries
 * (call it from a click).
 */
export function useTableAudio({ enabled, playback, tracks }) {
  const elRef = useRef(null);
  const [blocked, setBlocked] = useState(false);
  // Bumped by unlock() so the sync effect re-runs and re-derives the position.
  const [unlockTick, setUnlockTick] = useState(0);

  const track = enabled ? audibleTrack(playback, tracks) : null;
  const nowPlaying = track ? playback.nowPlaying : null;
  const url = track?.url ?? null;

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
    // World music loops by default (Slice 2 makes this per-track).
    el.loop = true;
    if (el.getAttribute('data-src') !== url) {
      el.setAttribute('data-src', url);
      el.src = url;
    }

    let cancelled = false;
    function seekAndPlay() {
      if (cancelled) return;
      const target = playbackPositionSeconds(nowPlaying, el.duration);
      if (Math.abs(el.currentTime - target) > 0.25) el.currentTime = target;
      el.play().then(
        () => !cancelled && setBlocked(false),
        (err) => {
          // A file that cannot load must never throw; only a gesture block is
          // something the player can fix.
          if (!cancelled && err?.name === 'NotAllowedError') setBlocked(true);
        }
      );
    }

    if (el.readyState >= 1) seekAndPlay();
    else el.addEventListener('loadedmetadata', seekAndPlay, { once: true });

    return () => {
      cancelled = true;
      el.removeEventListener('loadedmetadata', seekAndPlay);
    };
  }, [url, nowPlaying?.trackId, nowPlaying?.anchorMs, nowPlaying?.offsetMs, unlockTick]);

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

  const unlock = useCallback(() => setUnlockTick((n) => n + 1), []);
  return { blocked, unlock };
}
