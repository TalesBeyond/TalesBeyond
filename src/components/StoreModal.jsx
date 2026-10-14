import React, { useState } from 'react';
import ModalShell from './ModalShell.jsx';
import { STORE_SECTIONS, formatStorePrice } from '../data/store.js';
import { addSpriteHero, spriteForUrl, useOwnedSpriteHeroes } from '../data/spriteTokens.js';

// The Store: its sections down a side panel (Maps, Characters, Stories,
// Bundles), and the open section's wares beside it — each a framed picture
// with its name and price under it. The shelves are examples (data/store.js);
// there is nothing to buy yet. For testing, a Characters ware has an Add
// button that puts its animated hero in the tokens panel's Default heroes.
// A ware whose picture is animated (data/spriteTokens.js) plays its frames
// while the pointer is over it.
export default function StoreModal({ onClose }) {
  const [sectionKey, setSectionKey] = useState(STORE_SECTIONS[0].key);
  const section = STORE_SECTIONS.find((s) => s.key === sectionKey) || STORE_SECTIONS[0];
  const ownedSprites = useOwnedSpriteHeroes();

  return (
    <ModalShell title="Store" icon="store" closeLabel="Close the store" maxWidth={900} flush onClose={onClose}>
      <div className="store">
        <nav className="store-nav" aria-label="Store sections">
          {STORE_SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`store-nav-item${s.key === section.key ? ' active' : ''}`}
              aria-pressed={s.key === section.key}
              onClick={() => setSectionKey(s.key)}
            >
              <span>{s.label}</span>
              <span className="store-nav-count">{s.items.length}</span>
            </button>
          ))}
        </nav>
        <div className="store-shelf">
          <div className="store-shelf-head">
            <h3>{section.label}</h3>
            <p>{section.blurb}</p>
          </div>
          <ul className="store-grid">
            {section.items.map((it) => {
              const added = it.spriteKey && ownedSprites.some((h) => h.key === it.spriteKey);
              const sprite = spriteForUrl(it.imageUrl);
              return (
                <li key={it.key} className="store-item">
                  <span className="store-frame">
                    {sprite ? (
                      <span className="sprite" style={{ backgroundImage: `url(${sprite.sheet})`, '--sprite-frames': sprite.frames }} aria-hidden="true" />
                    ) : (
                      <img src={it.imageUrl} alt="" />
                    )}
                  </span>
                  <span className="store-item-name">{it.name}</span>
                  <span className="store-item-price">{formatStorePrice(it.price)}</span>
                  {it.spriteKey && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={added}
                      title={added ? `${it.name} is in your Default heroes` : `Add ${it.name} to your Default heroes`}
                      onClick={() => addSpriteHero(it.spriteKey)}
                    >
                      {added ? 'Added' : 'Add'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </ModalShell>
  );
}
