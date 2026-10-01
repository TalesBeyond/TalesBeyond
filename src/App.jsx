import React, { useEffect, useState } from 'react';
import Landing from './components/Landing.jsx';
import GameView from './components/GameView.jsx';
import PalettesMenu from './components/PalettesMenu.jsx';
import LegalPage from './components/LegalPage.jsx';
import { legalDocFromHash } from './data/legal.js';
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
  const [notice, setNotice] = useState(null); // shown on Landing after being kicked
  const [theme, setTheme] = useTheme();

  // The legal pages live at #/legal/<doc>, linked from the landing screen.
  const [legalDoc, setLegalDoc] = useState(() => legalDocFromHash(window.location.hash));
  useEffect(() => {
    const onHashChange = () => setLegalDoc(legalDocFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  function closeLegal() {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setLegalDoc(null);
  }

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
    setNotice(null);
    setEntry({ state, me, mode });
  }

  function handleLeave(reason) {
    setNotice(reason === 'kicked' ? 'The Dungeon Master removed you from the table.' : null);
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
        <div className="top-bar-actions">
          {entry && (
            <span className="session-chip">
              {entry.state.layers?.[entry.state.layerOrder?.[0]]?.name} · {entry.me.name}
              {entry.me.isHost ? ' (Host)' : ''}
            </span>
          )}
          <PalettesMenu theme={theme} onChange={setTheme} />
        </div>
      </header>

      {legalDoc && !entry ? (
        <LegalPage doc={legalDoc} onClose={closeLegal} />
      ) : !entry ? (
        <Landing onEnter={handleEnter} notice={notice} />
      ) : (
        <GameProvider initialState={entry.state} persistLocally={entry.mode === 'local' || entry.mode === 'guest'}>
          <GameView
            me={entry.me}
            mode={entry.mode}
            onLeave={handleLeave}
            onCodeRotated={handleCodeRotated}
            theme={theme}
            onThemeChange={setTheme}
          />
        </GameProvider>
      )}
    </div>
  );
}
