import React, { useEffect, useRef, useState } from 'react';
import { useFx, rarityOf, RARITY_LABELS } from '../lib/fx.js';
import { playSfx } from '../lib/sfx.js';

// Full-map moments drawn over the stage (lib/fx.js): the turn banner that
// sweeps across when a new turn starts, the big die that tumbles and lands on
// every roll, and loot cards flipping face-up. Purely visual — nothing
// here writes state.

const BANNER_MS = 1800;
const DIE_MS = 2000; // an ordinary result
const NAT_MS = 2500; // a natural 20 or 1 lingers a little longer
const TUMBLE_MS = 480; // faces flicker past before it lands

export default function FxLayer() {
  const [banner, setBanner] = useState(null);
  const [die, setDie] = useState(null);
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
    else if (event.type === 'die') {
      const extreme = event.value >= (event.max ?? 20) || event.value <= (event.min ?? 1);
      show(setDie, 'die', event, extreme ? NAT_MS : DIE_MS);
    }
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
      {die && <RollDie key={die.key} value={die.value} sides={die.sides} min={die.min} max={die.max} detail={die.detail} caption={die.caption} />}
      {loot && <LootReveal key={loot.key} title={loot.title} items={loot.items || []} onClose={() => setLoot(null)} />}
    </>
  );
}

// Each die's silhouette, in the d20's 88×88 frame: its outline (face), an
// optional inner facet, the edges between, and where its number sits. A d100
// borrows the d10's kite.
const DIE_SHAPES = {
  4: { face: '44,6 84,78 4,78', edges: 'M44 6L44 58M4 78L44 58M84 78L44 58', textY: 72 },
  6: { face: '10,10 78,10 78,78 10,78', inner: '20,20 68,20 68,68 20,68', textY: 52 },
  8: { face: '44,4 82,44 44,84 6,44', inner: '44,4 70,56 18,56', edges: 'M6 44L18 56M82 44L70 56M44 84L18 56M44 84L70 56', textY: 47 },
  10: { face: '44,4 82,40 44,84 6,40', inner: '44,4 64,46 44,58 24,46', edges: 'M6 40L24 46M82 40L64 46M44 84L44 58', textY: 45 },
  12: { face: '44,4 84,33 69,80 19,80 4,33', inner: '44,20 64,35 56,60 32,60 24,35', edges: 'M44 4L44 20M84 33L64 35M69 80L56 60M19 80L32 60M4 33L24 35', textY: 49 },
  20: {
    face: '44,4 80,24 80,64 44,84 8,64 8,24',
    inner: '44,22 70,64 18,64',
    edges: 'M44 4L44 22M8 24L44 22M80 24L44 22M8 24L18 64M80 24L70 64M8 64L18 64M80 64L70 64M44 84L18 64M44 84L70 64',
    textY: 55,
  },
};
DIE_SHAPES[100] = DIE_SHAPES[10];

// The die's colour tells the story at a glance, scaled to whatever it could
// have rolled: its best possible result gold with a glow, its worst cracked
// blood-red, the lower half cool slate, the upper half jade. For a d20 that's
// 20 · 1 · 2–10 · 11–19.
export function dieTier(value, min = 1, max = 20) {
  if (value >= max) return 'nat-20';
  if (value <= min) return 'nat-1';
  return value < (min + max) / 2 ? 'die-low' : 'die-high';
}

function RollDie({ value, sides = 20, min = 1, max = 20, detail, caption }) {
  const shape = DIE_SHAPES[sides] || DIE_SHAPES[20];
  const randomFace = () => min + Math.floor(Math.random() * (max - min + 1));
  const [face, setFace] = useState(randomFace);
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const flicker = setInterval(() => setFace(randomFace()), 70);
    const land = setTimeout(() => {
      clearInterval(flicker);
      setFace(value);
      setLanded(true);
    }, TUMBLE_MS);
    return () => {
      clearInterval(flicker);
      clearTimeout(land);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const tier = landed ? dieTier(value, min, max) : 'die-rolling';
  const isD20 = sides === 20 && min === 1 && max === 20;
  const label = !landed ? null : isD20 ? (value === 20 ? 'Natural 20' : value === 1 ? 'Natural 1' : null) : value >= max ? 'Max roll' : value <= min ? 'Lowest roll' : null;
  const cracked = landed && isD20 && value === 1;
  const digits = String(face).length;
  return (
    <div className={`nat-moment ${tier}${landed ? ' landed' : ''}`} role="status" aria-label={`Rolled ${value} on ${isD20 ? 'a d20' : `d${sides}`}${detail ? `, ${detail}` : ''}`}>
      <svg width="150" height="150" viewBox="0 0 88 88" aria-hidden="true">
        <polygon className="nat-face" points={shape.face} />
        {shape.inner && <polygon className="nat-inner" points={shape.inner} />}
        {shape.edges && <path className="nat-edges" d={shape.edges} />}
        {cracked && <path className="nat-crack" d="M30 10l6 14-5 8 8 10-3 12 6 10" />}
        <text x={cracked ? 50 : 44} y={shape.textY} textAnchor="middle" style={{ fontSize: digits > 2 ? 15 : 20 }}>
          {face}
        </text>
      </svg>
      {landed && (label || detail || caption) && (
        <span className="nat-label">
          {label && <strong>{label}</strong>}
          {detail && <span className="nat-detail">{detail}</span>}
          {caption && <span className="nat-caption">{caption}</span>}
        </span>
      )}
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
