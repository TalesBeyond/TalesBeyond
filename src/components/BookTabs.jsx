import React from 'react';
import { emitFx } from '../lib/fx.js';

// The Grimoire palette's index tabs, sticking out of the map page's edge
// like a real book's thumb index. They're shortcuts to panels the toolbar
// already has (asked for over lib/fx.js — see Toolbar.jsx), plus the
// Chronicle: the combat log, readable here whether or not a fight is on.
// Every other palette hides them (styles.css), so the toolbar stays the one
// way in there.
export default function BookTabs({ isHost, chronicleOpen, onToggleChronicle }) {
  const tabs = [
    isHost && { key: 'bestiary', label: 'Bestiary', title: 'Monsters of the compendium' },
    isHost && { key: 'armory', label: 'Armory', title: 'Weapons and items of the compendium' },
    { key: 'dice', label: 'Dice', title: 'Roll the dice' },
    isHost && { key: 'music', label: 'Music', title: 'Table music' },
  ].filter(Boolean);

  return (
    <nav className="book-tabs" aria-label="Book sections">
      {tabs.map((t) => (
        <button key={t.key} type="button" className="book-tab" title={t.title} onClick={() => emitFx({ type: 'open', panel: t.key })}>
          {t.label}
        </button>
      ))}
      <button
        type="button"
        className={`book-tab${chronicleOpen ? ' active' : ''}`}
        aria-expanded={chronicleOpen}
        title="Chronicle of the Dice — every roll, hit and turn"
        onClick={onToggleChronicle}
      >
        Chronicle
      </button>
    </nav>
  );
}
