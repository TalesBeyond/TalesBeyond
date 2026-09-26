import React, { useEffect, useRef, useState } from 'react';
import { isCatalogTrack } from '../lib/audioEngine.js';
import { DEMO_MUSIC } from '../data/defaultAudio.js';

// "Choose from catalog…": attaches one of the Default catalog's songs to a
// target. Renders nothing while the catalog has no songs.
export function CatalogSongSelect({ audio, targetKind, targetId, onError }) {
  const songs = audio.catalog || [];
  if (!audio.attachCatalog || songs.length === 0) return null;
  async function choose(e) {
    const song = songs.find((s) => s.slug === e.target.value);
    if (!song) return;
    try {
      await audio.attachCatalog(targetKind, targetId, song);
    } catch (err) {
      onError?.(err.message || 'Could not attach that song.');
    }
  }
  return (
    <select className="field catalog-song-select" aria-label="Choose a song from the catalog" value="" onChange={choose}>
      <option value="">Choose from catalog…</option>
      {songs.map((s) => (
        <option key={s.slug} value={s.slug}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

// A range input that reports its value locally at once but only commits (a
// database write, a broadcast) once the slider has settled — dragging a synced
// volume slider must not send a message per pixel.
export function DebouncedRange({ value, onCommit, label, disabled }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={draft}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        const next = Number(e.target.value);
        setDraft(next);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onCommit(next), 200);
      }}
    />
  );
}

// The DM's picker for the bundled demo music (src/data/defaultAudio.js) —
// an alternative to uploading a file. Hidden while the library is empty.
export function DemoTrackPicker({ audio, targetKind, targetId, disabled }) {
  const [error, setError] = useState('');
  if (!audio.isHost || DEMO_MUSIC.length === 0) return null;
  return (
    <>
      <select
        className="field"
        style={{ width: 'auto', padding: '4px 8px' }}
        aria-label="Use a demo track"
        disabled={disabled}
        value=""
        onChange={async (e) => {
          const id = e.target.value;
          if (!id) return;
          setError('');
          try {
            await audio.attachDemo(targetKind, targetId, id);
          } catch (err) {
            setError(err.message || 'Could not use that track.');
          }
        }}
      >
        <option value="">Use a demo track…</option>
        {DEMO_MUSIC.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {error && <p className="error-note">{error}</p>}
    </>
  );
}

// The host's upload/replace/remove/play/loop control for one target's sound —
// a layer in Map settings, a hero or mob in its inspector. Players
// never see it (they get the Music modal's local slider only).
export default function SoundField({ audio, targetKind, targetId, label = 'Sound' }) {
  const fileRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!audio?.isHost) return null;

  const track = audio.findTrack(targetKind, targetId);
  const expired = track ? audio.expired.has(track.id) : false;
  const isPlaying = Boolean(track && audio.playback.nowPlaying?.trackId === track.id);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      await audio.attach(targetKind, targetId, file);
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sound-field">
      <label className="field-label">{label}</label>
      {!audio.enabled ? (
        <p className="footer-note" style={{ border: 'none', padding: '2px 0' }}>
          Sound needs a cloud or guest table.
        </p>
      ) : (
        <>
          {track && (
            <div className="sound-field-file" title={track.name}>
              {expired ? (isCatalogTrack(track) ? 'Unavailable — pick another song' : 'File expired — re-upload') : track.name}
            </div>
          )}
          <div className="sound-field-actions">
            <input ref={fileRef} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" style={{ display: 'none' }} onChange={pick} />
            {track && !expired && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => (isPlaying ? audio.pause() : audio.play(track.id))}
                title={isPlaying ? 'Pause for everyone' : 'Play for everyone who can hear it'}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'Uploading…' : track ? 'Replace' : 'Upload MP3 / WAV'}
            </button>
            <DemoTrackPicker audio={audio} targetKind={targetKind} targetId={targetId} disabled={busy} />
            {track && (
              <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => audio.remove(track.id)}>
                Remove
              </button>
            )}
          </div>
          <CatalogSongSelect audio={audio} targetKind={targetKind} targetId={targetId} onError={setError} />
          {track && (
            <label className="checkbox-row" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={track.loop} onChange={(e) => audio.patch(track.id, { loop: e.target.checked })} />
              Loop
            </label>
          )}
          {error && <p className="error-note">{error}</p>}
        </>
      )}
    </div>
  );
}
