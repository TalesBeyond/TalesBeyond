import React from 'react';

// The Grimoire palette's index tab, sticking out of the map page's edge
// like a real book's thumb index. It opens the Chronicle: the combat log,
// readable here whether or not a fight is on. The other thumb tabs it used
// to have (Bestiary, Armory, Dice, Music) were shortcuts to toolbar panels;
// the toolbar is now a rail of tabs of its own in every palette, so they
// went. Every other palette hides this one too (styles.css).
export default function BookTabs({ chronicleOpen, onToggleChronicle }) {
  return (
    <nav className="book-tabs" aria-label="Book sections">
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
