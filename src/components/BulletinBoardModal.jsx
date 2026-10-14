import React, { useEffect } from 'react';
import { playSfx } from '../lib/sfx.js';
import { bulletinsOf } from '../data/bulletins.js';

// A bulletin board, opened to read (data/bulletins.js): every bulletin a
// card that starts face-down and flips over, one after another, the way loot
// cards do (FxLayer.jsx's LootReveal). It reads the board straight from the
// table, so a bulletin the DM pins while it is open flips in too.
export default function BulletinBoardModal({ board, onClose }) {
  const bulletins = bulletinsOf(board);

  useEffect(() => {
    if (bulletins.length) playSfx('page');
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bulletin-backdrop" onClick={onClose}>
      <div className="loot-reveal bulletin-reveal" role="dialog" aria-modal="true" aria-label={board.name} onClick={(e) => e.stopPropagation()}>
        <div className="loot-reveal-head">
          <strong>{board.name}</strong>
          <button type="button" className="popover-close" onClick={onClose} aria-label="Close the bulletin board" title="Close">
            ×
          </button>
        </div>
        {bulletins.length === 0 ? (
          <p className="loot-empty">Nothing is pinned to this board yet.</p>
        ) : (
          <div className="loot-cards bulletin-cards">
            {bulletins.map((b, i) => (
              <article key={b.id} className="loot-card bulletin-card" style={{ animationDelay: `${0.25 + i * 0.2}s` }}>
                <div className="loot-card-back" aria-hidden="true">
                  ?
                </div>
                <div className="loot-card-face bulletin-card-face">
                  <span className="bulletin-card-pin" aria-hidden="true" />
                  <h4 className="loot-card-name bulletin-card-title">{b.title}</h4>
                  {b.text && <p className="bulletin-card-text">{b.text}</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
