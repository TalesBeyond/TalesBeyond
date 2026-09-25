import React, { useEffect, useState } from 'react';
import ModalIcon from './ModalIcon.jsx';
import { generateInviteCode, generatePlayerId } from '../utils/inviteCode.js';
import { createEmptyGameState, MAX_PLAYERS } from '../state/store.jsx';
import { migrateLegacyState } from '../state/migrate.js';
import {
  loadSession,
  saveSession,
  saveIdentity,
  sessionExists,
  listLocalSessionCodes,
  hashGuestCode,
  readEncodedJsonFromFile,
  markGuestActive,
  clearGuestMeta,
  findUnclosedGuestTable,
} from '../state/persistence.js';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js';
import { ensureAnonymousSession, signUpHost, signInHost } from '../lib/auth.js';
import {
  createTableRemote,
  joinTableRemote,
  fetchTableSnapshot,
  whoamiForCodeRemote,
  listMyTablesRemote,
  deleteTableRemote,
} from '../lib/remoteApi.js';
import { deleteTableStorage } from '../lib/storageUpload.js';
import { requestGuestJoin } from '../lib/guestRealtime.js';

const PLAYER_COLORS = ['#c1502e', '#4c7a86', '#62795a', '#a9853f', '#8f5aa8', '#b23a3a', '#3a6ea5', '#c98a3b'];

// Temporary: host accounts (Sign up / Log in) are hidden for now — hosting
// only offers a guest table (start new or resume) until this flips back on.
const SHOW_HOST_LOGIN = false;

export default function Landing({ onEnter }) {
  const [mode, setMode] = useState('host');

  const cardCopy =
    mode === 'join'
      ? { title: 'Take your seat', lede: 'Enter the invitation code your host shared with you.' }
      : { title: 'Run your own table', lede: 'You will be the Dungeon Master. Up to nine players can join you.' };

  return (
    <div className="centered-column">
      <div className="landing-shell">
        <LandingHero />

        <div className="lobby-card">
          {mode === 'hostkey' ? (
            <>
              <RejoinHostForm onEnter={onEnter} />
              <p className="footer-note" style={{ border: 'none', padding: '10px 2px 0', margin: 0 }}>
                <button type="button" className="link-btn" onClick={() => setMode('host')}>
                  ← Back
                </button>
              </p>
            </>
          ) : (
            <>
              <div className="mode-toggle">
                <button className={mode === 'host' ? 'active' : ''} onClick={() => setMode('host')}>
                  Host a table
                </button>
                <button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>
                  Join a table
                </button>
              </div>

              <h2>{cardCopy.title}</h2>
              <p className="lede">{cardCopy.lede}</p>

              {mode === 'host' ? <HostForm onEnter={onEnter} /> : <JoinForm onEnter={onEnter} />}

              {!isSupabaseConfigured && (
                <p className="footer-note" style={{ border: 'none', padding: '14px 2px 0', margin: 0 }}>
                  Testing only —{' '}
                  <button type="button" className="link-btn" onClick={() => setMode('hostkey')}>
                    rejoin as host with a host key
                  </button>
                  .
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Left side of the landing screen: brand, the connection status, the pitch and
// a static picture of a battle map (purely decorative, so hidden from
// assistive tech except for its short label).
function LandingHero() {
  return (
    <div className="landing-hero">
      <div className={`landing-status ${isSupabaseConfigured ? '' : 'local'}`}>
        <span className="landing-status-dot" />
        <span>
          {isSupabaseConfigured
            ? 'Cloud mode: tables sync live across devices'
            : 'Local demo mode: no backend configured (see supabase/README.md)'}
        </span>
      </div>

      <div className="landing-eyebrow">A shared virtual table for D&amp;D</div>
      <h1>Gather round the table, wherever you are.</h1>
      <p className="landing-lede">
        Build a battle map, drop in heroes and monsters, and pick up right where you left off. One
        invitation code brings your whole party to the same board.
      </p>

      <div className="landing-map">
        <svg viewBox="0 0 640 270" role="img" aria-label="A sample battle map with hero tokens, monster tokens, a chest and a ruler measuring 25 feet">
          <rect x="0" y="0" width="640" height="270" fill="#2b241c" />
          <g stroke="#3f3628" strokeWidth="1">
            <path d="M0 30H640M0 60H640M0 90H640M0 120H640M0 150H640M0 180H640M0 210H640M0 240H640" />
            <path d="M40 0V270M80 0V270M120 0V270M160 0V270M200 0V270M240 0V270M280 0V270M320 0V270M360 0V270M400 0V270M440 0V270M480 0V270M520 0V270M560 0V270M600 0V270" />
          </g>
          <rect x="60" y="30" width="330" height="210" fill="#3a3024" stroke="#a9853f" strokeWidth="3" />
          <rect x="390" y="110" width="80" height="50" fill="#3a3024" stroke="#a9853f" strokeWidth="3" />
          <rect x="470" y="0" width="170" height="270" fill="#17140f" opacity="0.88" />
          <rect x="216" y="92" width="26" height="20" rx="3" fill="#a9853f" stroke="#f2e9d4" strokeWidth="1.5" />
          <path d="M120 150 L296 190" stroke="#f2e9d4" strokeWidth="2" strokeDasharray="6 5" fill="none" />
          <rect x="176" y="154" width="64" height="24" rx="12" fill="#17140f" stroke="#f2e9d4" strokeWidth="1" />
          <text x="208" y="171" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="12" fill="#f2e9d4">25 ft</text>
          <circle cx="120" cy="150" r="16" fill="#b84a2a" stroke="#f2e9d4" strokeWidth="2" />
          <text x="120" y="155" textAnchor="middle" fontFamily="Spectral, serif" fontWeight="700" fontSize="15" fill="#fff">M</text>
          <circle cx="160" cy="90" r="16" fill="#4c7a86" stroke="#f2e9d4" strokeWidth="2" />
          <text x="160" y="95" textAnchor="middle" fontFamily="Spectral, serif" fontWeight="700" fontSize="15" fill="#fff">T</text>
          <circle cx="100" cy="210" r="16" fill="#62795a" stroke="#f2e9d4" strokeWidth="2" />
          <text x="100" y="215" textAnchor="middle" fontFamily="Spectral, serif" fontWeight="700" fontSize="15" fill="#fff">A</text>
          <rect x="282" y="176" width="28" height="28" rx="4" fill="#7a2a2a" stroke="#f2e9d4" strokeWidth="2" />
          <rect x="330" y="80" width="28" height="28" rx="4" fill="#7a2a2a" stroke="#f2e9d4" strokeWidth="2" />
          <g transform="translate(454 20)">
            <rect x="0" y="0" width="160" height="34" rx="8" fill="#17140f" stroke="#a9853f" strokeWidth="1" />
            <text x="12" y="22" fontFamily="Instrument Sans, sans-serif" fontSize="12" fill="#d9c89e">Invite code</text>
            <text x="148" y="22" textAnchor="end" fontFamily="IBM Plex Mono, monospace" fontSize="14" letterSpacing="1.5" fill="#f2e9d4">K7Q2MZ</text>
          </g>
        </svg>
      </div>

      <div className="landing-features">
        <div className="landing-feature">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><rect x="2" y="2" width="16" height="16" rx="1" /><path d="M2 8h16M2 13h16M8 2v16M13 2v16" /></svg>
          <span>Square-grid maps</span>
        </div>
        <div className="landing-feature">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="2.5" /></svg>
          <span>Hero and monster tokens</span>
        </div>
        <div className="landing-feature">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M3 16L16 3M6 13l2 2M9 10l2 2M12 7l2 2" /></svg>
          <span>Ruler and distance</span>
        </div>
      </div>
    </div>
  );
}

function HostForm({ onEnter }) {
  // 'checking' briefly covers the initial getSession() round trip so a host
  // who's already signed in (e.g. came back to Landing, or a fresh device
  // with a stored session) lands on "Your tables" instead of flashing the
  // sign-up/log-in form first.
  const [authState, setAuthState] = useState(isSupabaseConfigured ? 'checking' : 'localOnly');
  const [creatingNew, setCreatingNew] = useState(false);
  // REQ-008: which signed-out path the host picked — an account (today's
  // sign-up/log-in flow) or a guest table (no account, nothing saved on
  // our end). Only meaningful while signed out in cloud mode.
  const [hostChoice, setHostChoice] = useState(null);
  // REQ-008 Slice 4: a guest table on this browser that was never left
  // cleanly (crash, force-closed tab) — see findUnclosedGuestTable.
  const [unclosedCode, setUnclosedCode] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setAuthState(data.session ? 'signedIn' : 'signedOut');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    setUnclosedCode(findUnclosedGuestTable());
  }, []);

  function resumeUnclosedGuestTable() {
    const raw = loadSession(unclosedCode);
    const state = raw ? migrateLegacyState(raw) : null;
    const me = state?.players?.[state.session.hostPlayerId];
    if (!state || !me) {
      clearGuestMeta(unclosedCode);
      setUnclosedCode(null);
      return;
    }
    onEnter({ state, me, mode: 'guest' });
  }

  function discardUnclosedGuestTable() {
    clearGuestMeta(unclosedCode);
    setUnclosedCode(null);
  }

  if (authState === 'checking') return null;

  if (authState === 'signedOut') {
    if (hostChoice === 'guest') {
      return <GuestHostForm onEnter={onEnter} onBack={() => setHostChoice(null)} />;
    }
    if (hostChoice === 'resumeGuest') {
      return <GuestResumeForm onEnter={onEnter} onBack={() => setHostChoice(null)} />;
    }
    if (hostChoice === 'account') {
      return (
        <>
          <HostAuthForm onAuthed={() => setAuthState('signedIn')} />
          <p className="footer-note" style={{ border: 'none', padding: '10px 2px 0', margin: 0 }}>
            <button type="button" className="link-btn" onClick={() => setHostChoice(null)}>
              ← Back
            </button>
          </p>
        </>
      );
    }
    return (
      <div>
        {unclosedCode && (
          <div style={{ border: '1px solid var(--gold-line)', borderRadius: 6, padding: 12, marginBottom: 14 }}>
            <p className="footer-note" style={{ border: 'none', padding: 0, margin: '0 0 10px' }}>
              A guest table on this browser (<code style={{ fontFamily: 'var(--font-mono)' }}>{unclosedCode}</code>)
              was not closed properly last time — you can pick it back up.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" onClick={resumeUnclosedGuestTable}>
                Resume it
              </button>
              <button type="button" className="btn btn-secondary" onClick={discardUnclosedGuestTable}>
                Discard
              </button>
            </div>
          </div>
        )}
        {SHOW_HOST_LOGIN && (
          <button type="button" className="btn btn-primary btn-block" onClick={() => setHostChoice('account')}>
            Sign up / Log in
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => setHostChoice('guest')}
          style={SHOW_HOST_LOGIN ? { marginTop: 8 } : undefined}
        >
          Start a guest table
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={() => setHostChoice('resumeGuest')}
          style={{ marginTop: 8 }}
        >
          Resume guest session
        </button>
        <p className="footer-note" style={{ padding: '10px 2px 0', border: 'none' }}>
          A guest table needs no account — but nothing about it is saved on our end. You'll need to
          export it yourself before closing it if you want to pick it back up later, then come back
          here and use "Resume guest session" (the file mid-session Import button won't do this).
        </p>
      </div>
    );
  }

  if (authState === 'signedIn' && !creatingNew) {
    return (
      <HostTablesList
        onEnter={onEnter}
        onCreateNew={() => setCreatingNew(true)}
        onSignedOut={() => {
          setCreatingNew(false);
          setAuthState('signedOut');
        }}
      />
    );
  }

  return <HostTableForm onEnter={onEnter} />;
}

function HostTablesList({ onEnter, onCreateNew, onSignedOut }) {
  const [tables, setTables] = useState(null); // null while loading
  const [error, setError] = useState('');
  const [resumingId, setResumingId] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null); // table being confirmed for delete
  const [deletingId, setDeletingId] = useState(null);
  const busyId = resumingId ?? deletingId;

  useEffect(() => {
    let cancelled = false;
    listMyTablesRemote()
      .then((rows) => {
        if (!cancelled) setTables(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load your tables.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function resume(table) {
    setError('');
    setResumingId(table.tableId);
    try {
      const state = await fetchTableSnapshot(table.tableId);
      const player = state.players[table.playerId];
      onEnter({ state, me: player, mode: 'remote' });
    } catch (err) {
      setError(err.message || 'Could not resume that table.');
      setResumingId(null);
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      onSignedOut();
    }
  }

  async function confirmDelete() {
    const table = pendingDelete;
    if (!table) return;
    setError('');
    setDeletingId(table.tableId);
    setPendingDelete(null);
    try {
      // Storage cleanup must run before the table row is deleted — the
      // RLS policy authorizing it depends on that row still existing.
      await deleteTableStorage(table.tableId);
      // Once storage is gone there's no undoing it, so a couple of quick
      // retries here narrow the window where a transient failure on this
      // specific call would otherwise leave the table alive but stripped
      // of every image it had, with no way to put them back.
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await deleteTableRemote(table.tableId);
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
      }
      if (lastErr) throw lastErr;
      setTables((prev) => prev.filter((t) => t.tableId !== table.tableId));
    } catch (err) {
      setError(err.message || 'Could not delete that table.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      {error && <div className="error-note">{error}</div>}

      {tables === null ? (
        <p className="footer-note" style={{ border: 'none', padding: 0 }}>
          Loading your tables…
        </p>
      ) : tables.length === 0 ? (
        <p className="footer-note" style={{ border: 'none', padding: '0 0 14px' }}>
          You haven't hosted a table yet.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tables.map((table) => (
            <li
              key={table.tableId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                border: '1px solid var(--ink-700)',
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              <span>{table.name}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busyId !== null}
                  onClick={() => resume(table)}
                >
                  {resumingId === table.tableId ? 'Resuming…' : 'Resume'}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busyId !== null}
                  onClick={() => setPendingDelete(table)}
                >
                  {deletingId === table.tableId ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={onCreateNew}
        style={{ marginTop: 14 }}
      >
        Create a new table
      </button>

      <p className="footer-note" style={{ padding: '10px 2px 0', border: 'none' }}>
        <button type="button" className="link-btn" onClick={signOut} disabled={signingOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </p>

      {pendingDelete && (
        <DeleteTableConfirm table={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />
      )}
    </div>
  );
}

// Deleting a table is permanent, so the host has to type its name to arm the button.
function DeleteTableConfirm({ table, onCancel, onConfirm }) {
  const [typed, setTyped] = useState('');
  const armed = typed.trim() === String(table.name ?? '').trim();
  return (
    <div className="delete-confirm-backdrop" onClick={onCancel}>
      <div className="delete-confirm-card" role="alertdialog" aria-label="Delete this table?" onClick={(e) => e.stopPropagation()}>
        <h4>
          <ModalIcon name="warn" />
          Delete this table?
        </h4>
        <p>
          <strong>{table.name}</strong> and everything in it — heroes, maps, chests, everything — will be
          permanently removed. Make sure no one is still playing. This can't be undone.
        </p>
        <div className="delete-confirm-field">
          <label htmlFor="delete-confirm-input">Type the table name to confirm</label>
          <input
            id="delete-confirm-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={table.name}
            autoComplete="off"
            autoFocus
          />
        </div>
        <div className="delete-confirm-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={!armed}>
            Delete table
          </button>
        </div>
      </div>
    </div>
  );
}

function HostAuthForm({ onAuthed }) {
  const [authMode, setAuthMode] = useState('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter an email and password.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (authMode === 'signup') {
        await signUpHost(email.trim(), password);
      } else {
        await signInHost(email.trim(), password);
      }
      onAuthed();
    } catch (err) {
      setError(err.message || 'Something went wrong signing you in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="error-note">{error}</div>}

      <label className="field-label">Email</label>
      <input
        className="field"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
      />

      <label className="field-label">Password</label>
      <input
        className="field"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
      />

      <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
        {busy ? 'Please wait…' : authMode === 'signup' ? 'Sign up' : 'Log in'}
      </button>

      <p className="footer-note" style={{ padding: '10px 2px 0', border: 'none' }}>
        {authMode === 'signup' ? 'Already have a host account? ' : 'New here? '}
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setAuthMode(authMode === 'signup' ? 'login' : 'signup');
            setError('');
          }}
        >
          {authMode === 'signup' ? 'Log in' : 'Sign up'}
        </button>
      </p>
    </form>
  );
}

function HostTableForm({ onEnter }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PLAYER_COLORS[0]);
  const [mapName, setMapName] = useState('The Sunken Crypt');
  const [cols, setCols] = useState(20);
  const [rows, setRows] = useState(15);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Enter a name for yourself as the host.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (isSupabaseConfigured) {
        const { tableId, code, hostPlayerId } = await createTableRemote({
          name: mapName.trim() || 'Untitled Map',
          cols: parseInt(cols, 10) || 20,
          rows: parseInt(rows, 10) || 15,
          displayName: name.trim(),
          color,
        });
        const state = await fetchTableSnapshot(tableId);
        const me = { id: hostPlayerId, name: name.trim(), color, isHost: true };
        onEnter({ state, me, mode: 'remote' });
        return;
      }

      let code = generateInviteCode();
      while (sessionExists(code)) code = generateInviteCode(); // avoid rare collision

      const hostId = generatePlayerId();
      const state = createEmptyGameState({ code, hostPlayerId: hostId, hostName: name.trim(), hostColor: color });
      const baseLayer = state.layers[state.layerOrder[0]];
      const baseIsland = baseLayer.islands[baseLayer.islandOrder[0]];
      baseLayer.name = mapName.trim() || 'Untitled Map';
      baseIsland.name = baseLayer.name;
      baseIsland.cols = Math.min(60, Math.max(4, parseInt(cols, 10) || 20));
      baseIsland.rows = Math.min(60, Math.max(4, parseInt(rows, 10) || 15));

      saveSession(code, state);
      saveIdentity(code, { id: hostId, name: name.trim(), color, isHost: true });
      onEnter({ state, me: { id: hostId, name: name.trim(), color, isHost: true }, mode: 'local' });
    } catch (err) {
      setError(err.message || 'Something went wrong opening the table.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="error-note">{error}</div>}

      <label className="field-label">Your name (as Dungeon Master)</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mara" />

      <label className="field-label">Your color</label>
      <ColorPicker value={color} onChange={setColor} />

      <div className="divider-word">new map</div>

      <label className="field-label">Map name</label>
      <input className="field" value={mapName} onChange={(e) => setMapName(e.target.value)} />

      <div className="field-row">
        <div>
          <label className="field-label">Width (squares)</label>
          <input
            className="field"
            type="number"
            min={4}
            max={60}
            value={cols}
            onChange={(e) => setCols(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Height (squares)</label>
          <input
            className="field"
            type="number"
            min={4}
            max={60}
            value={rows}
            onChange={(e) => setRows(e.target.value)}
          />
        </div>
      </div>

      <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
        {busy ? 'Opening…' : 'Open the table'}
      </button>
      <p className="footer-note" style={{ padding: '10px 2px 0', border: 'none' }}>
        A fresh invitation code is generated every time you open a table (up to 9 players plus you).
      </p>
    </form>
  );
}

// REQ-008 Guest DM Sessions: opens a table with no account and no Postgres
// row at all — createEmptyGameState is called directly, the same call
// HostTableForm's local-mode branch already makes, instead of
// createTableRemote. The private DM code (session.hostKey) is already
// generated by createEmptyGameState and surfaced in-game via the existing
// "Host key" toolbar button (Toolbar.jsx) — nothing extra to show here.
function GuestHostForm({ onEnter, onBack }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PLAYER_COLORS[0]);
  const [mapName, setMapName] = useState('The Sunken Crypt');
  const [cols, setCols] = useState(20);
  const [rows, setRows] = useState(15);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Enter a name for yourself as the host.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      // No server to check collisions against — a guest table's channel
      // name space (32^8 combinations) makes a collision with another live
      // guest table negligible, unlike local mode's own-browser
      // sessionExists() check.
      const code = generateInviteCode();
      const hostId = generatePlayerId();
      const state = createEmptyGameState({ code, hostPlayerId: hostId, hostName: name.trim(), hostColor: color });
      const baseLayer = state.layers[state.layerOrder[0]];
      const baseIsland = baseLayer.islands[baseLayer.islandOrder[0]];
      baseLayer.name = mapName.trim() || 'Untitled Map';
      baseIsland.name = baseLayer.name;
      baseIsland.cols = Math.min(60, Math.max(4, parseInt(cols, 10) || 20));
      baseIsland.rows = Math.min(60, Math.max(4, parseInt(rows, 10) || 15));

      markGuestActive(code);
      onEnter({ state, me: { id: hostId, name: name.trim(), color, isHost: true }, mode: 'guest' });
    } catch (err) {
      setError(err.message || 'Something went wrong opening the table.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="error-note">{error}</div>}

      <label className="field-label">Your name (as Dungeon Master)</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mara" />

      <label className="field-label">Your color</label>
      <ColorPicker value={color} onChange={setColor} />

      <div className="divider-word">new map</div>

      <label className="field-label">Map name</label>
      <input className="field" value={mapName} onChange={(e) => setMapName(e.target.value)} />

      <div className="field-row">
        <div>
          <label className="field-label">Width (squares)</label>
          <input
            className="field"
            type="number"
            min={4}
            max={60}
            value={cols}
            onChange={(e) => setCols(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Height (squares)</label>
          <input
            className="field"
            type="number"
            min={4}
            max={60}
            value={rows}
            onChange={(e) => setRows(e.target.value)}
          />
        </div>
      </div>

      <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
        {busy ? 'Opening…' : 'Start the guest table'}
      </button>
      <p className="footer-note" style={{ padding: '10px 2px 0', border: 'none' }}>
        Nothing about this table is saved on our end — export it (Toolbar) before you close it if you
        want to pick it back up later. Your private DM code is the "Host key" button once you're in.
      </p>
      <p className="footer-note" style={{ border: 'none', padding: '10px 2px 0', margin: 0 }}>
        <button type="button" className="link-btn" onClick={onBack}>
          ← Back
        </button>
      </p>
    </form>
  );
}

// REQ-008 Guest DM Sessions: resumes a guest table from its exported file
// plus the DM code the file's own export never included. Reactivates the
// same invite code (state.session.code, untouched by export/import) so any
// player who already has it can rejoin; GameView's guest subscription
// effect reopens the identical broadcast channel once entered.
function GuestResumeForm({ onEnter, onBack }) {
  const [fileName, setFileName] = useState('');
  const [fileContents, setFileContents] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError('');
    readEncodedJsonFromFile(file)
      .then((raw) => setFileContents(raw))
      .catch(() => {
        setFileContents(null);
        setError('Could not read that file — is it a valid Hearthbound guest export?');
      });
  }

  async function submit(e) {
    e.preventDefault();
    if (!fileContents) {
      setError('Choose the table file you exported.');
      return;
    }
    if (!code.trim()) {
      setError('Enter your DM code.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (!fileContents?.session?.hostKeyHash || !fileContents?.layers) {
        setError('That file does not look like a guest table export.');
        return;
      }
      const enteredHash = await hashGuestCode(code);
      if (enteredHash !== fileContents.session.hostKeyHash) {
        setError('That DM code does not match this file.');
        return;
      }
      const { hostKeyHash, ...sessionRest } = fileContents.session;
      const restored = migrateLegacyState({
        ...fileContents,
        session: { ...sessionRest, hostKey: code.trim().toUpperCase() },
      });
      const me = restored.players[restored.session.hostPlayerId];
      if (!me) {
        setError('That file is missing its host — it may be corrupted.');
        return;
      }
      markGuestActive(restored.session.code);
      onEnter({ state: restored, me, mode: 'guest' });
    } catch (err) {
      setError(err.message || 'Could not resume that table.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="error-note">{error}</div>}

      <label className="field-label">Exported table file</label>
      <input className="field" type="file" accept="image/bmp,.bmp" onChange={handleFile} />
      {fileName && (
        <p className="footer-note" style={{ border: 'none', padding: '6px 2px 0', margin: 0 }}>
          {fileName}
        </p>
      )}

      <label className="field-label">Your DM code</label>
      <input
        className="field"
        style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste your DM code"
      />

      <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
        {busy ? 'Resuming…' : 'Resume the table'}
      </button>
      <p className="footer-note" style={{ border: 'none', padding: '10px 2px 0', margin: 0 }}>
        <button type="button" className="link-btn" onClick={onBack}>
          ← Back
        </button>
      </p>
    </form>
  );
}

function JoinForm({ onEnter }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState(PLAYER_COLORS[1]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setError('Enter the invitation code your host shared with you.');
      return;
    }
    if (!name.trim()) {
      setError('Enter your name.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      if (isSupabaseConfigured) {
        // Try a guest table first (REQ-008): a quick broadcast handshake
        // distinguishes it from a normal cloud table without a failed RPC
        // round trip — a guest table has no `tables` row for join_table to
        // find. No answer within the timeout falls through to the cloud
        // join below.
        const guestJoin = await requestGuestJoin(cleanCode, { name: name.trim(), color });
        if (guestJoin) {
          const player = guestJoin.state.players[guestJoin.playerId];
          onEnter({ state: guestJoin.state, me: player, mode: 'guest' });
          return;
        }

        await ensureAnonymousSession();
        // Resume an existing seat at this table if this browser has one,
        // instead of asking join_table to create a duplicate.
        const prior = await whoamiForCodeRemote(cleanCode);
        const { tableId, playerId } = prior
          ? { tableId: prior.tableId, playerId: prior.playerId }
          : await joinTableRemote({ code: cleanCode, displayName: name.trim(), color });
        const state = await fetchTableSnapshot(tableId);
        const player = state.players[playerId];
        onEnter({ state, me: player, mode: 'remote' });
        return;
      }

      const rawExisting = loadSession(cleanCode);
      if (!rawExisting) {
        setError('No table found with that code. Double-check it with your host.');
        return;
      }
      const existing = migrateLegacyState(rawExisting);
      if (!existing.session.isOpen) {
        setError('This table is currently closed. Ask your host to reopen it.');
        return;
      }

      // Rejoin as the same player if this browser already has an identity here.
      const priorIdentity = tryReuseIdentity(cleanCode, existing);
      if (priorIdentity) {
        onEnter({ state: existing, me: priorIdentity, mode: 'local' });
        return;
      }

      if (Object.keys(existing.players).length >= MAX_PLAYERS) {
        setError('This table already has its full nine players plus the host.');
        return;
      }

      const id = generatePlayerId();
      const player = {
        id,
        name: name.trim(),
        color,
        isHost: false,
        connected: true,
        joinedAt: Date.now(),
        currentLayerId: existing.layerOrder[0],
      };
      const nextState = { ...existing, players: { ...existing.players, [id]: player } };
      saveSession(cleanCode, nextState);
      saveIdentity(cleanCode, { id, name: name.trim(), color, isHost: false });
      onEnter({ state: nextState, me: { id, name: name.trim(), color, isHost: false }, mode: 'local' });
    } catch (err) {
      setError(err.message || 'Could not join that table.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="error-note">{error}</div>}

      <label className="field-label">Invitation code</label>
      <input
        className="field"
        style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.15em', textTransform: 'uppercase' }}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="ABC123"
        maxLength={8}
      />

      <label className="field-label">Your name</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Thorn" />

      <label className="field-label">Your color</label>
      <ColorPicker value={color} onChange={setColor} />

      <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
        {busy ? 'Joining…' : 'Join the table'}
      </button>
    </form>
  );
}

// Testing only: local-mode escape hatch for regaining host control of a
// table after the host got removed from the roster (e.g. by closing their
// tab — see GameView.jsx's unload handler). Scans every table saved in this
// browser for one whose session.hostKey matches, then re-seats the caller
// as that table's host under the table's original hostPlayerId.
function RejoinHostForm({ onEnter }) {
  const [hostKey, setHostKey] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState(PLAYER_COLORS[0]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function submit(e) {
    e.preventDefault();
    const key = hostKey.trim();
    if (!key) {
      setError('Enter the host key you saved when you created the table.');
      return;
    }
    if (!name.trim()) {
      setError('Enter your name.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      let found = null;
      for (const code of listLocalSessionCodes()) {
        const raw = loadSession(code);
        if (!raw) continue;
        const existing = migrateLegacyState(raw);
        if (existing.session.hostKey && existing.session.hostKey.toUpperCase() === key.toUpperCase()) {
          found = existing;
          break;
        }
      }
      if (!found) {
        setError('No table found with that host key on this browser.');
        setBusy(false);
        return;
      }

      const hostId = found.session.hostPlayerId;
      const hostPlayer = {
        id: hostId,
        name: name.trim(),
        color,
        isHost: true,
        connected: true,
        joinedAt: Date.now(),
        currentLayerId: found.layerOrder[0],
      };
      const nextState = { ...found, players: { ...found.players, [hostId]: hostPlayer } };
      saveSession(found.session.code, nextState);
      saveIdentity(found.session.code, { id: hostId, name: name.trim(), color, isHost: true });
      onEnter({ state: nextState, me: hostPlayer, mode: 'local' });
    } catch (err) {
      setError(err.message || 'Could not rejoin as host.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="error-note">{error}</div>}

      <label className="field-label">Host key</label>
      <input
        className="field"
        style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}
        value={hostKey}
        onChange={(e) => setHostKey(e.target.value)}
        placeholder="Paste your host key"
      />

      <label className="field-label">Your name</label>
      <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mara" />

      <label className="field-label">Your color</label>
      <ColorPicker value={color} onChange={setColor} />

      <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
        {busy ? 'Rejoining…' : 'Rejoin as host'}
      </button>
      <p className="footer-note" style={{ padding: '10px 2px 0', border: 'none' }}>
        Testing only — this re-seats you as the host of whichever table on this browser matches
        the key, bypassing the normal invite code.
      </p>
    </form>
  );
}

function tryReuseIdentity(code, existingState) {
  try {
    const raw = window.localStorage.getItem('hearthbound:identity:' + code.toUpperCase());
    if (!raw) return null;
    const identity = JSON.parse(raw);
    if (existingState.players[identity.id]) return identity;
    return null;
  } catch {
    return null;
  }
}

function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {PLAYER_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: c,
            border: value === c ? '2px solid #f2e9d4' : '2px solid transparent',
            boxShadow: value === c ? '0 0 0 2px ' + c : 'none',
          }}
          aria-label={`Choose color ${c}`}
        />
      ))}
    </div>
  );
}
