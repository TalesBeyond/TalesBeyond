import { useEffect, useState } from 'react';

const STORAGE_KEY = 'hearthbound_theme';

// 'classic' is the app's original palette — it lives on bare :root in
// styles.css and is intentionally never touched. Every other palette
// overrides the same set of variables under [data-theme="..."].
export const PALETTES = [
  { id: 'classic', label: 'Classic', swatch: ['#17140f', '#c1502e', '#f2e9d4'] },
  { id: 'dark', label: 'Dark Mode', swatch: ['#0d0f12', '#5b8def', '#e8eaed'] },
  { id: 'eddies', label: "Eddie's Palette", swatch: ['#050308', '#b46bff', '#39e6a5'] },
  { id: 'syfy', label: 'Syfy', swatch: ['#05080a', '#2ee6d6', '#3fa9f5'] },
];

function loadTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return PALETTES.some((p) => p.id === saved) ? saved : 'classic';
  } catch {
    return 'classic';
  }
}

function applyTheme(themeId) {
  if (themeId === 'classic') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = themeId;
}

// Global, app-wide preference (not per-table state) — read once on load and
// applied straight to the document root so every screen (Landing and every
// table) shares the same palette without threading it through GameProvider.
export function useTheme() {
  const [theme, setThemeState] = useState(loadTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function setTheme(themeId) {
    setThemeState(themeId);
    try {
      localStorage.setItem(STORAGE_KEY, themeId);
    } catch {
      // storage unavailable — the choice just won't survive a reload
    }
  }

  return [theme, setTheme];
}
