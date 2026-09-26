import React, { useRef, useState } from 'react';
import ModalIcon from './ModalIcon.jsx';
import { DebouncedRange, CatalogSongSelect, DemoTrackPicker } from './SoundField.jsx';
import { isCatalogTrack } from '../lib/audioEngine.js';
import { AUDIO_TABLE_QUOTA_BYTES } from '../lib/storageUpload.js';
import { getSfxVolume, setSfxVolume, playSfx } from '../lib/sfx.js';
import { SOUND_EFFECTS, DEMO_MUSIC, builtinTrackUrl, isBuiltinTrackUrl } from '../data/defaultAudio.js';

function formatSeconds(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const megabytes = (bytes) => (bytes / 1048576).toFixed(1);

// A track is "default" music when it points at a sound that ships with the app
// or the Default catalog (no file of the table's own); anything uploaded or
// picked from this device is the user's.
const isDefaultTrack = (track) => isCatalogTrack(track);

// Every sound in the session, split into two tabs: the user's own music and
// the app's default music + sound effects. Each sound is a collapsible row:
// the header shows its title and play/pause; opening it shows the volume
// sliders (and, for the DM, loop / replace / remove).
export default function MusicModal({ audio, worldTrack, worldTargetId, layers, layerOrder, entities, isGuest, onClose }) {
  const [tab, setTab] = useState('user');
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
  // An empty world slot lives on the user tab, where its upload button is.
  const worldIsDefault = Boolean(world.track) && isDefaultTrack(world.track);
  const userRows = [...(worldIsDefault ? [] : [world]), ...rest.filter((r) => !isDefaultTrack(r.track))];
  const defaultRows = [...(worldIsDefault ? [world] : []), ...rest.filter((r) => isDefaultTrack(r.track))];

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
        <div className="music-tabs" role="tablist" aria-label="Music">
          {[
            ['user', 'Your music', userRows.filter((r) => r.track).length],
            ['default', 'Default', defaultRows.length + SOUND_EFFECTS.length],
          ].map(([k, label, count]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`music-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
              {label} <span className="music-tab-count">{count}</span>
            </button>
          ))}
        </div>
        <div style={{ padding: 16, flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tab === 'user' ? (
            <>
              {userRows.map((row) => (
                <MusicRow key={row.key} row={row} audio={audio} worldTargetId={worldTargetId} />
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
            </>
          ) : (
            <>
              {audio.isHost && (DEMO_MUSIC.length > 0 || audio.catalog?.length > 0) && (
                <div className="music-default-pick">
                  <span className="music-row-source">Set world music</span>
                  <DemoTrackPicker audio={audio} targetKind="world" targetId={worldTargetId} />
                  <CatalogSongSelect audio={audio} targetKind="world" targetId={worldTargetId} />
                </div>
              )}
              {defaultRows.map((row) => (
                <MusicRow key={row.key} row={row} audio={audio} worldTargetId={worldTargetId} />
              ))}
              <div className="music-section-label">Sound effects</div>
              {SOUND_EFFECTS.map((effect) => (
                <SoundEffectRow key={effect.id} effect={effect} />
              ))}
              <p className="footer-note" style={{ border: 'none', padding: 0 }}>
                The built-in sound effects come from{' '}
                <a href="https://pixabay.com/" target="_blank" rel="noopener noreferrer">
                  Pixabay
                </a>
                . Open a sound to see where it comes from.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// The collapsible shell every row shares: a header (title + subtitle, then
// the action at the far right) that toggles a panel of controls.
function MusicDropdown({ source, title, status, action, muted, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`music-row${open ? ' open' : ''}${muted ? ' music-row-muted' : ''}`}>
      <div className="music-row-head">
        <button type="button" className="music-row-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="music-row-chevron" aria-hidden="true">▸</span>
          <span className="music-row-main">
            <span className="music-row-name">{title}</span>
            <span className="music-row-status">
              {source}
              {status ? ` · ${status}` : ''}
            </span>
          </span>
        </button>
        {action}
      </div>
      {open && <div className="music-row-body">{children}</div>}
    </div>
  );
}

// "A single paper page turning. · From Pixabay (by someone)" — the
// description and where a built-in sound comes from.
function SoundCredit({ description, source }) {
  if (!description && !source) return null;
  return (
    <p className="music-credit">
      {description}
      {source && (
        <>
          {description ? ' ' : ''}
          <span className="music-credit-source">
            From{' '}
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.name}
            </a>
            {source.author ? ` · by ${source.author}` : ''}
          </span>
        </>
      )}
    </p>
  );
}

function PlayButton({ playing, onClick, title }) {
  return (
    <button type="button" className={`music-play${playing ? ' playing' : ''}`} onClick={onClick} title={title} aria-label={title}>
      {playing ? '⏸' : '▶'}
    </button>
  );
}

// One built-in sound effect. Local to this browser, like a player's own
// music slider; the header button and releasing the slider play a preview.
function SoundEffectRow({ effect }) {
  const [volume, setVolume] = useState(() => getSfxVolume(effect.id));
  const preview = () => playSfx(effect.id);
  return (
    <MusicDropdown
      source="Sound effect"
      title={effect.name}
      action={<PlayButton playing={false} onClick={preview} title={`Preview ${effect.name}`} />}
    >
      <div className="music-row-status">{effect.when}</div>
      <SoundCredit description={effect.description} source={effect.source} />
      <div className="music-sliders">
        <label className="music-slider">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label={`${effect.name} volume`}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              setSfxVolume(effect.id, v);
            }}
            onPointerUp={preview}
            onKeyUp={preview}
          />
        </label>
      </div>
    </MusicDropdown>
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
  const demo = track && isBuiltinTrackUrl(track.url) ? DEMO_MUSIC.find((m) => builtinTrackUrl(m.id) === track.url) : null;
  const canPlay = audio.isHost && track && !expired;

  return (
    <MusicDropdown
      source={row.source}
      title={track ? track.name : 'No music yet'}
      status={status}
      muted={expired && !audio.isHost}
      action={
        canPlay && (
          <PlayButton
            playing={isPlaying}
            onClick={() => (isPlaying ? audio.pause() : audio.play(track.id))}
            title={isPlaying ? 'Pause for everyone' : 'Play for everyone who can hear it'}
          />
        )
      }
    >
      {demo && <SoundCredit description={demo.description} source={demo.source} />}
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
                {busy ? 'Uploading…' : track ? 'Replace with my file' : 'Upload MP3 or WAV'}
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
      {audio.isHost && expired && row.kind !== 'world' && !isCatalogTrack(track) && (
        <p className="footer-note" style={{ border: 'none', padding: '6px 0 0' }}>
          Re-upload it from Map settings or the token inspector.
        </p>
      )}
      {!audio.isHost && !track && <p className="music-row-status">The DM hasn't set any music.</p>}
      {error && <p className="error-note" style={{ marginTop: 8 }}>{error}</p>}
    </MusicDropdown>
  );
}
