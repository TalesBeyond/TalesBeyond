import React, { useRef, useState } from 'react';
import ModalIcon from './ModalIcon.jsx';
import { DebouncedRange, CatalogSongSelect } from './SoundField.jsx';
import { isCatalogTrack } from '../lib/audioEngine.js';
import { AUDIO_TABLE_QUOTA_BYTES } from '../lib/storageUpload.js';

function formatSeconds(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const megabytes = (bytes) => (bytes / 1048576).toFixed(1);

// Every sound in the session, world music first. The DM sees a synced base
// slider, the loop toggle and play/pause per track; every player sees just
// their own local slider.
export default function MusicModal({ audio, worldTrack, worldTargetId, layers, layerOrder, entities, isGuest, onClose }) {
  const rows = [{ key: 'world', source: 'World music', kind: 'world', track: worldTrack }];
  for (const track of Object.values(audio.tracks)) {
    if (track.targetKind === 'layer' && layers[track.targetId]) {
      rows.push({ key: track.id, source: `Layer — ${layers[track.targetId].name}`, kind: 'layer', track, order: layerOrder.indexOf(track.targetId) });
    } else if (track.targetKind === 'entity' && entities[track.targetId]) {
      rows.push({ key: track.id, source: `Token — ${entities[track.targetId].name}`, kind: 'entity', track, order: 1000 });
    }
  }
  const [world, ...rest] = rows;
  rest.sort((a, b) => a.order - b.order);

  const used = audio.usedBytes;
  const pct = Math.min(100, (used / AUDIO_TABLE_QUOTA_BYTES) * 100);

  return (
    <div className="book-backdrop" onClick={onClose}>
      <div
        className="book-card"
        style={{ maxWidth: 560, background: 'linear-gradient(180deg, var(--ink-900), var(--ink-800))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="book-card-header">
          <span className="book-title"><ModalIcon name="music" />Music</span>
          <button className="popover-close" onClick={onClose} aria-label="Close" title="Close">
            ×
          </button>
        </div>
        <div style={{ padding: 16, flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <MusicRow row={world} audio={audio} worldTargetId={worldTargetId} />
          {rest.map((row) => (
            <MusicRow key={row.key} row={row} audio={audio} />
          ))}

          {audio.isHost && (
            <div className="music-usage">
              <div className="music-usage-bar">
                <div className="music-usage-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="music-row-status">
                {megabytes(used)} of {megabytes(AUDIO_TABLE_QUOTA_BYTES)} MB used · {megabytes(Math.max(0, AUDIO_TABLE_QUOTA_BYTES - used))} MB left
              </div>
            </div>
          )}
          <p className="footer-note" style={{ border: 'none', padding: 0 }}>
            {isGuest
              ? 'Guest table: your files stay on this device and only you hear them — nothing is uploaded, and they are gone when you close the page.'
              : audio.isHost
              ? 'MP3 or WAV, up to 10 MB each. Only one sound plays at a time, for everyone who can hear it. Attach sounds to layers and tokens from Map settings and the token inspector.'
              : 'The DM controls the music. Your volume slider only changes what you hear.'}
          </p>
        </div>
      </div>
    </div>
  );
}

function MusicRow({ row, audio, worldTargetId }) {
  const { track } = row;
  const fileRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const expired = track ? audio.expired.has(track.id) : false;
  const isPlaying = Boolean(track && audio.playback.nowPlaying?.trackId === track.id);
  const resumeMs = track ? audio.playback.resume[track.id] : undefined;
  let status = 'No file yet';
  if (track) {
    if (expired) status = audio.isHost && !isCatalogTrack(track) ? 'File expired — re-upload' : 'Unavailable';
    else status = isPlaying ? 'Now playing' : resumeMs ? `Paused at ${formatSeconds(resumeMs)}` : 'Stopped';
  }

  async function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      await audio.attach('world', worldTargetId, file);
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  const localVolume = track ? audio.localVolumes[track.id] ?? 1 : 1;

  return (
    <div className={`music-row${expired && !audio.isHost ? ' music-row-muted' : ''}`}>
      <div className="music-row-head">
        <div className="music-row-main">
          <div className="music-row-source">{row.source}</div>
          <div className="music-row-name">{track ? track.name : '—'}</div>
          <div className="music-row-status">{status}</div>
        </div>
        {audio.isHost && track && !expired && (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => (isPlaying ? audio.pause() : audio.play(track.id))}
            title={isPlaying ? 'Pause for everyone' : 'Play for everyone who can hear it'}
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
        )}
      </div>

      {track && !expired && (
        <div className="music-sliders">
          {audio.isHost && (
            <label className="music-slider">
              <span>Table volume</span>
              <DebouncedRange value={track.baseVolume} label={`Table volume for ${row.source}`} onCommit={(v) => audio.patch(track.id, { baseVolume: v })} />
            </label>
          )}
          <label className="music-slider">
            <span>{audio.isHost ? 'My volume' : 'Volume'}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={localVolume}
              aria-label={`My volume for ${row.source}`}
              onChange={(e) => audio.setLocalVolume(track.id, Number(e.target.value))}
            />
          </label>
        </div>
      )}

      {audio.isHost && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          {track && !expired && (
            <label className="checkbox-row" style={{ margin: 0 }}>
              <input type="checkbox" checked={track.loop} onChange={(e) => audio.patch(track.id, { loop: e.target.checked })} />
              Loop
            </label>
          )}
          {row.kind === 'world' && (
            <>
              <input ref={fileRef} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" style={{ display: 'none' }} onChange={pickFile} />
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? 'Uploading…' : track ? 'Replace file' : 'Upload MP3 or WAV'}
              </button>
            </>
          )}
          {track && (
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => audio.remove(track.id)}>
              Remove
            </button>
          )}
        </div>
      )}
      {audio.isHost && (row.kind === 'world' || track) && (
        <div style={{ marginTop: 8 }}>
          <CatalogSongSelect
            audio={audio}
            targetKind={row.kind === 'world' ? 'world' : track.targetKind}
            targetId={row.kind === 'world' ? worldTargetId : track.targetId}
            onError={setError}
          />
        </div>
      )}
      {audio.isHost && expired && row.kind !== 'world' && !isCatalogTrack(track) && (
        <p className="footer-note" style={{ border: 'none', padding: '6px 0 0' }}>
          Re-upload it from Map settings or the token inspector.
        </p>
      )}
      {error && <p className="error-note" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
