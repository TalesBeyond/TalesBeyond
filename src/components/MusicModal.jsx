import React, { useRef, useState } from 'react';
import { validateAudioFile } from '../lib/storageUpload.js';

function formatSeconds(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// The Music modal (REQ-009). Slice 1 lists just the World music row: the DM
// uploads/replaces the file and plays or pauses it; players see its status.
export default function MusicModal({ isHost, worldTrack, playback, onUpload, onRemove, onPlay, onPause, onClose }) {
  const fileRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isPlaying = Boolean(worldTrack && playback.nowPlaying?.trackId === worldTrack.id);
  const resumeMs = worldTrack ? playback.resume[worldTrack.id] : undefined;

  async function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = validateAudioFile(file);
    if (problem) return setError(problem);
    setError('');
    setBusy(true);
    try {
      await onUpload(file);
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  let status = 'No file yet';
  if (worldTrack) status = isPlaying ? 'Now playing' : resumeMs ? `Paused at ${formatSeconds(resumeMs)}` : 'Stopped';

  return (
    <div className="book-backdrop" onClick={onClose}>
      <div
        className="book-card"
        style={{ maxWidth: 520, background: 'linear-gradient(180deg, var(--ink-900), var(--ink-800))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="book-card-header">
          <span className="book-title">🎵 Music</span>
          <button className="popover-close" onClick={onClose} aria-label="Close" title="Close">
            ×
          </button>
        </div>
        <div style={{ padding: 16, flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <div className="music-row">
            <div className="music-row-main">
              <div className="music-row-source">World music</div>
              <div className="music-row-name">{worldTrack ? worldTrack.name : '—'}</div>
              <div className="music-row-status">{status}</div>
            </div>
            {isHost && worldTrack && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => (isPlaying ? onPause() : onPlay(worldTrack.id))}
                title={isPlaying ? 'Pause for everyone' : 'Play for everyone'}
              >
                {isPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
            )}
          </div>

          {isHost && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input ref={fileRef} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" style={{ display: 'none' }} onChange={pickFile} />
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? 'Uploading…' : worldTrack ? 'Replace file' : 'Upload MP3 or WAV'}
              </button>
              {worldTrack && (
                <button className="btn btn-danger btn-sm" disabled={busy} onClick={onRemove}>
                  Remove
                </button>
              )}
            </div>
          )}
          {error && <p className="error-note" style={{ marginTop: 8 }}>{error}</p>}
          <p className="footer-note" style={{ border: 'none', padding: '10px 0 0' }}>
            {isHost
              ? 'MP3 or WAV, up to 10 MB. The music plays for everyone at the table.'
              : 'The DM controls the music. It plays for everyone at the table.'}
          </p>
        </div>
      </div>
    </div>
  );
}
