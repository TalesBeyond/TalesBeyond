import React, { useEffect, useRef, useState } from 'react';
import { useFx, rarityOf, RARITY_LABELS } from '../lib/fx.js';
import { playSfx } from '../lib/sfx.js';

// Full-map moments drawn over the stage (lib/fx.js): the turn banner that
// sweeps across when a new turn starts, the big die for a natural 20 or 1,
// and loot cards flipping face-up. Purely visual — nothing here writes state.

const BANNER_MS = 1800;
const NAT_MS = 1600;

export default function FxLayer() {
  const [banner, setBanner] = useState(null);
  const [nat, setNat] = useState(null);
  const [loot, setLoot] = useState(null);
  const timers = useRef({});

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  function show(setter, key, value, ms) {
    clearTimeout(timers.current[key]);
    setter({ ...value, key: Date.now() });
    if (ms) timers.current[key] = setTimeout(() => setter(null), ms);
  }

  useFx((event) => {
    if (event.type === 'banner') show(setBanner, 'banner', event, BANNER_MS);
    else if (event.type === 'nat') show(setNat, 'nat', event, NAT_MS);
    else if (event.type === 'loot') {
      show(setLoot, 'loot', event, 0);
      if (event.items?.length) playSfx('page');
    }
  });

  return (
    <>
      {banner && (
        <div key={banner.key} className={`turn-banner tone-${banner.tone || 'ally'}`} role="status">
          <div className="turn-banner-ribbon">
            <strong>{banner.title}</strong>
            {banner.sub && <span>{banner.sub}</span>}
          </div>
        </div>
      )}
      {nat && <NatDie key={nat.key} value={nat.value} />}
      {loot && <LootReveal key={loot.key} title={loot.title} items={loot.items || []} onClose={() => setLoot(null)} />}
    </>
  );
}

function NatDie({ value }) {
  const crit = value === 20;
  return (
    <div className={`nat-moment ${crit ? 'nat-20' : 'nat-1'}`} role="status" aria-label={crit ? 'Natural 20' : 'Natural 1'}>
      <svg width="150" height="150" viewBox="0 0 88 88" aria-hidden="true">
        <polygon className="nat-face" points="44,4 80,24 80,64 44,84 8,64 8,24" />
        <polygon className="nat-inner" points="44,22 70,64 18,64" />
        <path className="nat-edges" d="M44 4L44 22M8 24L44 22M80 24L44 22M8 24L18 64M80 24L70 64M8 64L18 64M80 64L70 64M44 84L18 64M44 84L70 64" />
        {!crit && <path className="nat-crack" d="M30 10l6 14-5 8 8 10-3 12 6 10" />}
        <text x={crit ? 44 : 50} y="55" textAnchor="middle">
          {value}
        </text>
      </svg>
      <span className="nat-label">{crit ? 'Natural 20' : 'Natural 1'}</span>
    </div>
  );
}

// Cards start face-down and flip one after another.
function LootReveal({ title, items, onClose }) {
  return (
    <div className="loot-reveal" role="dialog" aria-label={title}>
      <div className="loot-reveal-head">
        <strong>{title}</strong>
        <button type="button" className="popover-close" onClick={onClose} aria-label="Close loot">
          ×
        </button>
      </div>
      {items.length === 0 ? (
        <p className="loot-empty">The roll came up empty this time.</p>
      ) : (
        <div className="loot-cards">
          {items.map((item, i) => {
            const rarity = rarityOf(item.name);
            return (
              <div key={item.id || `${item.name}_${i}`} className="loot-card" style={{ animationDelay: `${0.35 + i * 0.35}s` }}>
                <div className="loot-card-back" aria-hidden="true">
                  ?
                </div>
                <div className={`loot-card-face rarity-${rarity}`}>
                  <span className="loot-card-name">{item.name}</span>
                  {item.qty > 1 && <span className="loot-card-qty">× {item.qty}</span>}
                  <span className="loot-card-rarity">{RARITY_LABELS[rarity]}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
