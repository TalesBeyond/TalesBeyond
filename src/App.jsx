import React, { useEffect, useState } from 'react';
import Landing from './components/Landing.jsx';
import GameView from './components/GameView.jsx';
import PalettesMenu from './components/PalettesMenu.jsx';
import { GameProvider } from './state/store.jsx';
import { loadSession, loadCurrentPointer, saveCurrentPointer, clearCurrentPointer } from './state/persistence.js';
import { migrateLegacyState } from './state/migrate.js';
import { isSupabaseConfigured } from './lib/supabaseClient.js';
import { ensureAnonymousSession } from './lib/auth.js';
import { fetchTableSnapshot } from './lib/remoteApi.js';
import { useTheme } from './state/theme.js';
import { loadCatalog } from './lib/catalog.js';

export default function App() {
  const [entry, setEntry] = useState(null); // { state, me, mode }
  const [checkedResume, setCheckedResume] = useState(false);
  const [theme, setTheme] = useTheme();

  // The Default catalog loads once per page load, in the background.
  useEffect(() => {
    loadCatalog();
  }, []);

  // On first load, try to silently resume whatever table this browser
  // tab was last sitting at (e.g. after a refresh) — in either mode.
  useEffect(() => {
    let cancelled = false;

    async function resume() {
      const pointer = loadCurrentPointer();
      if (!pointer) {
        setCheckedResume(true);
        return;
      }

      if (pointer.mode === 'remote' && isSupabaseConfigured) {
        try {
          await ensureAnonymousSession();
          const state = await fetchTableSnapshot(pointer.tableId);
          const player = state.players[pointer.playerId];
          if (!cancelled && player) setEntry({ state, me: player, mode: 'remote' });
          else if (!cancelled) clearCurrentPointer();
        } catch {
          if (!cancelled) clearCurrentPointer();
        }
      } else if (pointer.mode === 'local' || pointer.mode === 'guest') {
        // Guest DM sessions (REQ-008) have no Postgres row to resync from —
        // they resume from this browser's own localStorage exactly like
        // local mode does, not via fetchTableSnapshot.
        const raw = loadSession(pointer.code);
        const state = raw ? migrateLegacyState(raw) : null;
        const player = state?.players?.[pointer.playerId];
        if (state && player) setEntry({ state, me: player, mode: pointer.mode });
        else clearCurrentPointer();
      } else {
        clearCurrentPointer();
      }

      if (!cancelled) setCheckedResume(true);
    }

    resume();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleEnter({ state, me, mode }) {
    saveCurrentPointer({
      mode,
      code: state.session.code,
      tableId: state.session.tableId,
      playerId: me.id,
    });
    setEntry({ state, me, mode });
  }

  function handleLeave() {
    setEntry(null);
  }

  function handleCodeRotated(newCode) {
    if (!entry) return;
    saveCurrentPointer({
      mode: entry.mode,
      code: newCode,
      tableId: entry.state.session.tableId,
      playerId: entry.me.id,
    });
  }

  if (!checkedResume) return null;

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">
          <span className="brand-mark">Hearthbound</span>
          <span className="brand-sub">
            virtual table · {isSupabaseConfigured ? 'cloud mode' : 'local demo mode'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {entry && (
            <span className="session-chip">
              {entry.state.layers?.[entry.state.layerOrder?.[0]]?.name} · {entry.me.name}
              {entry.me.isHost ? ' (Host)' : ''}
            </span>
          )}
          <PalettesMenu theme={theme} onChange={setTheme} />
        </div>
      </header>

      {!entry ? (
        <Landing onEnter={handleEnter} />
      ) : (
        <GameProvider initialState={entry.state} persistLocally={entry.mode === 'local' || entry.mode === 'guest'}>
          <GameView
            me={entry.me}
            mode={entry.mode}
            onLeave={handleLeave}
            onCodeRotated={handleCodeRotated}
          />
        </GameProvider>
      )}
    </div>
  );
}
