import React, { useEffect, useRef, useState } from 'react';
import { getIslandCondition, islandConditionKeys } from '../data/islandConditions.js';
import { PALETTES } from '../state/theme.js';
import { CONDITIONS } from '../data/conditions.js';
import { attackPreview, resolveAttackRoll, weaponStatsFor, acOf, ATTACK_BEAT_MS } from '../utils/combat.js';
import { isCreature } from '../data/tokenKinds.js';
import RollModeTabs from './RollModeTabs.jsx';
import { CHEST_SIZES, chestSlotCount } from '../data/chests.js';
import ChestContentsEditor from './ChestContentsEditor.jsx';
import { GiveChestItemButton, TakeChestItemButton, ChestOpenButton } from './RightPanel.jsx';
import ClockReadout from './ClockReadout.jsx';
import { SOUND_EFFECTS } from '../data/defaultAudio.js';
import { playDiceSound, getSfxVolume, setSfxVolume } from '../lib/sfx.js';
import { useHintPrefs } from './Hints.jsx';
import { useImageCacheVersion } from '../lib/imageCache.js';
import { entityImageSrc } from '../lib/storedImages.js';

// The phone layout: the map first. GameView swaps its desktop chrome (toolbar,
// side panels, layer strip) for these pieces when the viewport is phone-sized;
// the map itself is the same MapBoard, filling the screen, and everything here
// floats over it.

// Portrait phones by width, phones held sideways by their short height.
export const PHONE_QUERY = '(max-width: 767px), (max-height: 499px)';

export function usePhoneLayout() {
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const onChange = () => setIsPhone(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isPhone;
}

const ICONS = {
  play: 'M5 3l14 8-6 2-2 6z',
  pan: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  ruler: 'M3 17L17 3l4 4L7 21z M7 13l2 2 M10 10l2 2 M13 7l2 2',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4',
  add: 'M12 8v8M8 12h8 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  party: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21v-1a6 6 0 0 1 12 0v1 M16 3.5a4 4 0 0 1 0 7.5 M22 21v-1a6 6 0 0 0-4-5.6',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 6l-6 6 6 6',
  chev: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  fog: 'M4 9h13 M7 13h13 M4 17h11',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  dice: 'M12 2l9 5v10l-9 5-9-5V7z M3 7l9 6 9-6 M12 13v9',
  run: 'M4 5h16v14H4z M12 5v14 M7 9h2 M7 12h2 M15 9h2 M15 12h2',
  recenter: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  sheet: 'M6 3h9l4 4v14H6z M15 3v4h4 M9 12h6 M9 16h6',
  sword: 'M20 4h-4l-9 9 4 4 9-9z M6 12l6 6 M4 20l4-4',
  area: 'M3 12L19 5c2 4 2 10 0 14z',
};

export function PhoneIcon({ name, size = 22, strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

// Heroes, monsters and NPCs standing on an island, for the chips and the atlas.
function occupantsOf(entities, islandId) {
  return Object.values(entities || {}).filter((e) => e.islandId === islandId && isCreature(e));
}

function islandBounds(layer) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of layer.islandOrder) {
    const i = layer.islands[id];
    if (!i) continue;
    minX = Math.min(minX, i.x);
    minY = Math.min(minY, i.y);
    maxX = Math.max(maxX, i.x + i.cols * i.cellSize);
    maxY = Math.max(maxY, i.y + i.rows * i.cellSize);
  }
  if (minX === Infinity) return { minX: 0, minY: 0, w: 1, h: 1 };
  return { minX, minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

function groupNameOf(layer, islandId) {
  for (const g of Object.values(layer.islandGroups || {})) if (g.islandIds.includes(islandId)) return g.name;
  return null;
}

// ---------- top row: the island you're on, its conditions, worlds and the menu ----------

// `conditions`: the island's condition keys in force (islandConditionKeys — a
// group's, for a grouped island).
export function PhoneTopBar({ islandName, conditions = [], onAtlas, onLayers, onMenu }) {
  const labels = conditions.map((key) => getIslandCondition(key)?.label).filter(Boolean);
  return (
    <header className="phone-topbar">
      <button type="button" className="phone-topbar-title" onClick={onAtlas} aria-label={`${islandName}, open the map overview`}>
        <span className="phone-topbar-island">{islandName}</span>
        <PhoneIcon name="down" size={13} strokeWidth={3} />
      </button>
      {labels.length > 0 && (
        <div className="phone-conditions" role="status" aria-label={`Map conditions: ${labels.join(', ')}`}>
          <PhoneIcon name="fog" size={16} strokeWidth={2} />
          <span>{labels.join(' · ')}</span>
        </div>
      )}
      <div className="phone-topbar-actions">
        <button type="button" className="phone-icon-btn" onClick={onLayers} aria-label="Worlds">
          <PhoneIcon name="layers" />
        </button>
        <button type="button" className="phone-icon-btn" onClick={onMenu} aria-label="Table menu">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      </div>
    </header>
  );
}

// ---------- the dock: tools and the two sheets used most, icons only ----------

export function PhoneNav({ isHost, tool, onTool, onOpen, onRecenter }) {
  const tools = isHost
    ? [
        ['play', 'Play'],
        ['edit', 'Edit'],
        ['ruler', 'Ruler'],
      ]
    : [
        ['play', 'Play'],
        ['pan', 'Pan'],
        ['ruler', 'Ruler'],
      ];
  const sheets = isHost
    ? [
        ['add', 'Add'],
        ['run', 'Run table'],
      ]
    : [
        ['dice', 'Dice'],
        ['party', 'Party'],
      ];
  return (
    <nav className="phone-nav" aria-label="Tools">
      {tools.map(([id, label]) => (
        <button key={id} type="button" className={tool === id ? 'active' : ''} aria-pressed={tool === id} aria-label={label} title={label} onClick={() => onTool(id)}>
          <PhoneIcon name={id} />
        </button>
      ))}
      {sheets.map(([id, label]) => (
        <button key={id} type="button" aria-label={label} title={label} onClick={() => onOpen(id)}>
          <PhoneIcon name={id} />
        </button>
      ))}
      <button type="button" aria-label="Recenter on the current map" title="Recenter" onClick={onRecenter}>
        <PhoneIcon name="recenter" />
      </button>
    </nav>
  );
}

// ---------- a bottom sheet ----------

export function PhoneSheet({ title, onClose, children, className = '' }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="phone-sheet-backdrop" onClick={onClose}>
      <section className={`phone-sheet ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="phone-sheet-grabber" aria-hidden="true" />
        <header className="phone-sheet-header">
          <h2>{title}</h2>
          <button type="button" className="phone-icon-btn" onClick={onClose} aria-label="Close">
            <PhoneIcon name="close" size={20} strokeWidth={2.2} />
          </button>
        </header>
        <div className="phone-sheet-body">{children}</div>
      </section>
    </div>
  );
}

// ---------- maps (layers) ----------

export function PhoneLayersSheet({ layers, layerOrder, currentLayerId, layerPlayerCounts, isHost, onSwitch, onManage, onClose }) {
  return (
    <PhoneSheet title="Worlds" onClose={onClose}>
      <ul className="phone-layer-list">
        {layerOrder.map((id, index) => {
          const layer = layers[id];
          if (!layer) return null;
          const here = id === currentLayerId;
          const count = layerPlayerCounts?.[id] || 0;
          return (
            <li key={id} className={here ? 'here' : ''}>
              <LayerThumb layer={layer} />
              <div className="phone-layer-text">
                <b>{layer.name}</b>
                <span>
                  {index === 0 ? 'Base layer · ' : ''}
                  {layer.islandOrder.length} {layer.islandOrder.length === 1 ? 'map' : 'maps'}
                </span>
                <span>{count ? `${count} ${count === 1 ? 'person' : 'people'} here` : 'Nobody here'}</span>
              </div>
              {here ? (
                <span className="phone-layer-here">{isHost ? 'Viewing' : 'You’re here'}</span>
              ) : isHost ? (
                <button type="button" className="phone-btn-ghost" onClick={() => onSwitch(id)}>
                  View
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {isHost ? (
        <button type="button" className="phone-btn-ghost phone-btn-block" onClick={onManage}>
          Add, rename or remove worlds
        </button>
      ) : (
        <p className="phone-caption">Walk through a door to take your hero to another world. Only the DM can add, rename or remove worlds.</p>
      )}
    </PhoneSheet>
  );
}

function LayerThumb({ layer }) {
  const b = islandBounds(layer);
  return (
    <svg className="phone-layer-thumb" viewBox={`${b.minX} ${b.minY} ${b.w} ${b.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {layer.islandOrder.map((id) => {
        const i = layer.islands[id];
        return i ? <rect key={id} x={i.x} y={i.y} width={i.cols * i.cellSize} height={i.rows * i.cellSize} /> : null;
      })}
    </svg>
  );
}

// ---------- atlas: every island on the layer ----------

export function PhoneAtlas({ layer, entities, activeIslandId, myHeroId, layerLabel, onPick, onClose, onManageIslands, onManageLayers }) {
  const [box, setBox] = useState({ w: 358, h: 300 });
  const ref = React.useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setBox({ w: el.clientWidth, h: el.clientHeight });
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const b = islandBounds(layer);
  const scale = Math.min((box.w - 24) / b.w, (box.h - 24) / b.h);
  const offX = (box.w - b.w * scale) / 2;
  const offY = (box.h - b.h * scale) / 2;
  const place = (x, y) => ({ left: offX + (x - b.minX) * scale, top: offY + (y - b.minY) * scale });

  return (
    <div className="phone-atlas" role="dialog" aria-modal="true" aria-label="Map overview">
      <header className="phone-atlas-header">
        <button type="button" className="phone-icon-btn" onClick={onClose} aria-label="Back to the map">
          <PhoneIcon name="back" strokeWidth={2.2} />
        </button>
        <div>
          <h2>{layer.name}</h2>
          <span>{layerLabel}</span>
        </div>
      </header>
      <div className="phone-atlas-map" ref={ref}>
        {layer.islandOrder.map((id) => {
          const i = layer.islands[id];
          if (!i) return null;
          const p = place(i.x, i.y);
          return (
            <button
              key={id}
              type="button"
              className={`phone-atlas-island${id === activeIslandId ? ' active' : ''}`}
              style={{
                ...p,
                width: i.cols * i.cellSize * scale,
                height: i.rows * i.cellSize * scale,
                backgroundImage: i.backgroundImage ? `url(${i.backgroundImage})` : undefined,
              }}
              onClick={() => onPick(id)}
              aria-label={`Go to ${i.name}`}
            >
              <span className="phone-atlas-tag">{i.name}</span>
            </button>
          );
        })}
        {Object.values(entities || {}).map((e) => {
          const i = layer.islands[e.islandId];
          if (!i || !isCreature(e)) return null;
          const p = place(i.x + (e.col + 0.5) * i.cellSize, i.y + (e.row + 0.5) * i.cellSize);
          return (
            <span
              key={e.id}
              aria-hidden="true"
              className={`phone-atlas-dot${e.kind === 'mob' ? ' mob' : ''}${e.id === myHeroId ? ' me' : ''}`}
              style={{ left: p.left, top: p.top, background: e.kind === 'hero' ? e.color : undefined }}
            />
          );
        })}
      </div>
      <div className="phone-atlas-list">
        <h3>Maps</h3>
        <ul>
          {layer.islandOrder.map((id, index) => {
            const i = layer.islands[id];
            if (!i) return null;
            const who = occupantsOf(entities, id);
            const group = groupNameOf(layer, id);
            const conds = islandConditionKeys(layer, id).map((k) => getIslandCondition(k)?.label).filter(Boolean);
            return (
              <li key={id}>
                <button type="button" onClick={() => onPick(id)}>
                  <span className={`phone-atlas-swatch${id === activeIslandId ? ' active' : ''}`} style={{ backgroundImage: i.backgroundImage ? `url(${i.backgroundImage})` : undefined }} aria-hidden="true" />
                  <span className="phone-atlas-row-text">
                    <b>{i.name}</b>
                    <span>
                      {i.cols} × {i.rows}
                      {index === 0 ? ' · base map' : ''}
                      {group ? ` · ${group}` : ''}
                      {who.length ? ` · ${who.length} here` : ''}
                    </span>
                    {conds.length > 0 && <span className="phone-atlas-conds">{conds.join(' · ')}</span>}
                  </span>
                  <PhoneIcon name="chev" size={16} strokeWidth={2.4} />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="phone-caption">Tokens walk straight across where two maps touch. Doors lead to other worlds.</p>
        {(onManageIslands || onManageLayers) && (
          <div className="phone-atlas-manage">
            {onManageIslands && (
              <button type="button" className="phone-btn-ghost" onClick={onManageIslands}>
                Manage maps
              </button>
            )}
            {onManageLayers && (
              <button type="button" className="phone-btn-ghost" onClick={onManageLayers}>
                Manage worlds
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- palette choice (the desktop toolbar's Configurations → Palette, as a row) ----------

export function PhonePaletteRow({ theme, onChange }) {
  if (!onChange) return null;
  return (
    <div className="phone-palettes" role="radiogroup" aria-label="Palette">
      {PALETTES.map((p) => (
        <button key={p.id} type="button" role="radio" aria-checked={theme === p.id} className={theme === p.id ? 'active' : ''} onClick={() => onChange(p.id)}>
          <span className="phone-palette-swatch" aria-hidden="true">
            {p.swatch.map((c) => (
              <span key={c} style={{ background: c }} />
            ))}
          </span>
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ---------- a guest table hosted from this phone ----------

export function PhoneGuestHostNote() {
  return (
    <p className="phone-note" role="note">
      This guest table runs on this phone. Keep Hearthbound open and the screen on while you play, and export the table before you
      close it.
    </p>
  );
}

// ---------- target and attack (encounter, the actor's turn) ----------

export function PhoneTargetSheet({ actor, target, getTarget, onDamage, onClose }) {
  useImageCacheVersion(); // redraw when a shared picture arrives
  const attacks = (actor?.sheet?.attacks || []).filter((a) => a.weaponName);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState('normal'); // disadvantage · normal · advantage
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState(null);
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  if (!actor || !target) return null;

  const attack = attacks[Math.min(index, attacks.length - 1)];
  const preview = attack ? attackPreview(attack, target, mode) : null;
  const hp = Math.max(0, target.hp ?? target.maxHp ?? 0);
  const pct = target.maxHp ? Math.max(0, Math.min(1, hp / target.maxHp)) : 0;
  const hpLeft = preview ? Math.max(0, Math.round(hp - preview.averageDamage)) : null;
  const conditions = (target.conditions || []).map((k) => CONDITIONS.find((c) => c.key === k)?.label).filter(Boolean);

  function attackNow() {
    if (!attack || rolling) return;
    setRolling(true);
    setResult(null);
    timers.current = [
      setTimeout(playDiceSound, ATTACK_BEAT_MS),
      setTimeout(() => {
        setRolling(false);
        const latest = getTarget(target.id);
        if (!latest) return;
        setResult(resolveAttackRoll(attack, latest, { attackerName: actor.name, playSounds: true, applyDamage: onDamage, mode }));
      }, ATTACK_BEAT_MS * 2),
    ];
  }

  return (
    <PhoneSheet title={target.name} onClose={onClose} className="phone-sheet-target">
      <div className="phone-target">
        <div className="phone-target-summary">
          <span className="phone-token-avatar" style={{ backgroundImage: `url(${entityImageSrc(target)})`, '--token-color': target.color || 'transparent' }} />
          <div className="phone-token-text">
            <span className="phone-token-stats">
              <span className="phone-token-bar">
                <span style={{ width: `${pct * 100}%`, background: pct > 0.5 ? 'var(--moss)' : pct > 0.25 ? 'var(--gold-hi)' : 'var(--danger)' }} />
              </span>
              <span className="phone-token-hp">
                {hp}/{target.maxHp}
              </span>
              <span className="phone-token-ac">AC {acOf(target)}</span>
            </span>
            <span className="phone-token-hint">{conditions.length ? conditions.join(' · ') : 'No conditions'}</span>
          </div>
        </div>

        <section className="phone-target-attack" aria-label={`${actor.name} attacks`}>
          <span className="phone-label">{actor.name} attacks</span>
          {attacks.length === 0 ? (
            <p className="phone-caption phone-caption-flush">Equip a weapon in {actor.name}’s Battle tab to attack from here.</p>
          ) : (
            <>
              <div className="phone-segment" role="radiogroup" aria-label="Weapon">
                {attacks.map((a, i) => (
                  <button key={`${a.weaponName}-${i}`} type="button" role="radio" aria-checked={i === index} className={i === index ? 'active' : ''} onClick={() => setIndex(i)}>
                    {weaponStatsFor(a.weaponName).name}
                  </button>
                ))}
              </div>
              <RollModeTabs mode={mode} onChange={setMode} disabled={rolling} className="phone-segment" />
              {preview && (
                <div className="phone-target-stats">
                  <div>
                    <b>{Math.round(preview.hitChance * 100)}%</b>
                    <span>to hit</span>
                  </div>
                  <div>
                    <b>{preview.damageLabel}</b>
                    <span>damage</span>
                  </div>
                  <div>
                    <b>≈{hpLeft}</b>
                    <span>HP left on a hit</span>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <p className="phone-target-result" aria-live="polite">
          {rolling
            ? 'Rolling…'
            : result
              ? `${result.hit ? 'Hit' : 'Miss'} — ${result.attackTotal} vs AC ${result.targetAC}${result.hit ? ` · ${result.damageTotal} damage` : ''}${result.throws ? ` · ${result.mode} (${result.throws.join(', ')})` : ''}`
              : ''}
        </p>
        <button type="button" className="phone-btn-primary phone-btn-block-primary" onClick={attackNow} disabled={!attack || rolling}>
          {attack ? `Attack with ${weaponStatsFor(attack.weaponName).name}` : 'Attack'}
        </button>
      </div>
    </PhoneSheet>
  );
}

// ---------- doors ----------

// `travellerName` is set when the DM is sending a token through (they
// dropped it on the door); otherwise it is a player walking their own hero.
export function PhoneDoorSheet({ door, doorIslandName, destLayerName, destIslandName, peopleThere, travellerName = null, onWalk, onCancel }) {
  return (
    <PhoneSheet title={door.name || 'Door'} onClose={onCancel}>
      <div className="phone-sheet-pad">
        <p className="phone-caption phone-caption-flush">Door{doorIslandName ? ` · ${doorIslandName}` : ''}</p>
        <div className="phone-door-dest">
          <span className="phone-label">Leads to</span>
          <b>
            {destLayerName}
            {destIslandName ? ` · ${destIslandName}` : ''}
          </b>
          <span className="phone-caption phone-caption-flush">
            {peopleThere.length ? `${peopleThere.join(', ')} ${peopleThere.length === 1 ? 'is' : 'are'} there` : 'Nobody is there yet'}
          </span>
        </div>
        <button type="button" className="phone-btn-primary phone-btn-block-primary" onClick={onWalk}>
          {travellerName ? `Send ${travellerName} through` : 'Walk through'}
        </button>
        <button type="button" className="phone-btn-ghost phone-btn-full" onClick={onCancel}>
          Stay here
        </button>
        <p className="phone-caption phone-caption-flush">
          {travellerName
            ? `${travellerName} steps through to the other side${door.locked ? ' — the door stays locked for players' : ''}. Everyone else stays here.`
            : 'Your hero steps through to the other side. Everyone else stays here until they walk through too.'}
        </p>
      </div>
    </PhoneSheet>
  );
}

// ---------- chests ----------

export function PhoneChestSheet({ entity, islandName, isHost, heroes, meId, players, onUpdate, onGive, onTake, onClose }) {
  const [editing, setEditing] = useState(false);
  if (!entity) return null;
  const items = entity.items || [];
  const capacity = chestSlotCount(entity.chestSize);
  const sizeLabel = CHEST_SIZES.find((s) => s.key === entity.chestSize)?.label || 'Small';
  const myHero = (heroes || []).find((h) => h.ownerId === meId);
  const showItems = isHost || entity.opened;

  return (
    <PhoneSheet title={entity.name || 'Chest'} onClose={onClose}>
      <div className="phone-sheet-pad">
        <p className="phone-caption phone-caption-flush">
          {sizeLabel} chest · {capacity} {capacity === 1 ? 'slot' : 'slots'}
          {islandName ? ` · ${islandName}` : ''}
        </p>
        <ChestOpenButton
          entity={entity}
          isHost={isHost}
          meId={meId}
          players={players}
          onUpdate={onUpdate}
          primaryClass="phone-btn-primary phone-btn-block-primary"
          secondaryClass="phone-btn-ghost phone-btn-full"
          quietClass="phone-btn-ghost phone-btn-full"
        />
        {!showItems && <p className="phone-caption phone-caption-flush">The DM decides whether it opens. Ask, and you’ll see what’s inside once they allow it.</p>}
        {showItems && (
          <section className="phone-chest-items" aria-label="Inside">
            <span className="phone-label">
              Inside · {items.length} of {capacity}
            </span>
            {items.length === 0 ? (
              <p className="phone-caption phone-caption-flush">Nothing inside.</p>
            ) : (
              items.map((item) => (
                <div className="phone-chest-row" key={item.id}>
                  <span>
                    {item.name}
                    {item.qty > 1 ? ` × ${item.qty}` : ''}
                  </span>
                  {isHost ? (
                    entity.opened && <GiveChestItemButton item={item} heroes={heroes || []} onGive={(heroId) => onGive(entity, item, heroId)} />
                  ) : (
                    <TakeChestItemButton disabled={!myHero} onTake={() => onTake(entity, item)} />
                  )}
                </div>
              ))
            )}
            {!isHost && !myHero && items.length > 0 && (
              <p className="phone-caption phone-caption-flush">You need a hero to carry loot. Ask your DM to link one to you.</p>
            )}
          </section>
        )}
        {isHost && (
          <>
            <PhoneSwitch
              label="Locked"
              caption="Players can’t ask to open it until you unlock it."
              checked={Boolean(entity.locked)}
              onChange={(locked) => onUpdate(entity.id, { locked })}
            />
            <PhoneSwitch
              label="Hidden from players"
              caption="Gone from every player’s map until you show it again."
              checked={Boolean(entity.hidden)}
              onChange={(hidden) => onUpdate(entity.id, { hidden })}
            />
            <button type="button" className="phone-btn-ghost phone-btn-full" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
              {editing ? 'Done editing contents' : 'Edit contents'}
            </button>
            {editing && (
              <ChestContentsEditor
                items={items}
                capacity={capacity}
                onAddItem={(item) => onUpdate(entity.id, { items: [...items, item] })}
                onRemoveItem={(id) => onUpdate(entity.id, { items: items.filter((it) => it.id !== id) })}
                onUpdateQty={(id, qty) => onUpdate(entity.id, { items: items.map((it) => (it.id === id ? { ...it, qty } : it)) })}
              />
            )}
          </>
        )}
      </div>
    </PhoneSheet>
  );
}

// ---------- a switch row ----------

export function PhoneSwitch({ label, caption, checked, onChange }) {
  const id = React.useId();
  return (
    <div className="phone-switch-row">
      <span className="phone-switch-text">
        <span id={id} className="phone-switch-label">
          {label}
        </span>
        {caption && <span className="phone-caption phone-caption-flush">{caption}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} className={`phone-switch${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
        <span />
      </button>
    </div>
  );
}

// ---------- look & sound ----------

export function PhoneLookAndSound({ theme, onThemeChange, muted, onMutedChange, hideDrawings, onHideDrawingsChange }) {
  const [levels, setLevels] = useState(() => Object.fromEntries(SOUND_EFFECTS.map((e) => [e.id, getSfxVolume(e.id)])));
  const hints = useHintPrefs();
  return (
    <section className="phone-menu-section" aria-label="Look and sound">
      <span className="phone-label">Look &amp; sound</span>
      <PhonePaletteRow theme={theme} onChange={onThemeChange} />
      <PhoneSwitch label="Mute on this device" caption="Music and sound effects. Everyone else still hears theirs." checked={muted} onChange={onMutedChange} />
      {onHideDrawingsChange && (
        <PhoneSwitch label="Hide drawings" caption="The DM's drawings, on this device only." checked={Boolean(hideDrawings)} onChange={onHideDrawingsChange} />
      )}
      <PhoneSwitch label="Show hints and tips" caption="On this device. Inline hints stay; tips and mode bars go." checked={hints.show} onChange={hints.setShow} />
      {hints.show && hints.anyDismissed && (
        <button type="button" className="phone-btn-ghost phone-btn-full" onClick={hints.resetDismissed}>
          Show all tips again
        </button>
      )}
      <div className={`phone-volumes${muted ? ' muted' : ''}`}>
        <span className="phone-caption phone-caption-flush">Sound effect volume</span>
        {SOUND_EFFECTS.map((e) => (
          <label key={e.id} className="phone-volume">
            <span>{e.name}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={levels[e.id]}
              disabled={muted}
              onChange={(ev) => {
                const v = Number(ev.target.value);
                setSfxVolume(e.id, v);
                setLevels((prev) => ({ ...prev, [e.id]: v }));
              }}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

// ---------- the player's table menu ----------

export function PhonePlayerMenu({ clock, phaseOverride, layerName, dmName, seated, island, islandConditions = [], feetPerSquare, theme, onThemeChange, muted, onMutedChange, hideDrawings, onHideDrawingsChange, onLeave, onClose }) {
  const [confirming, setConfirming] = useState(false);
  const islandConds = islandConditions.map((k) => getIslandCondition(k)?.label).filter(Boolean);
  return (
    <PhoneSheet title="Table menu" onClose={onClose}>
      <div className="phone-sheet-pad">
        {clock && (
          <section className="phone-menu-section" aria-label="In-game time">
            <span className="phone-label">In-game time</span>
            <div className="phone-clock">
              <ClockReadout clock={clock} isHost={false} phaseOverride={phaseOverride} />
            </div>
          </section>
        )}
        <PhoneLookAndSound theme={theme} onThemeChange={onThemeChange} muted={muted} onMutedChange={onMutedChange} hideDrawings={hideDrawings} onHideDrawingsChange={onHideDrawingsChange} />
        <section className="phone-menu-section" aria-label="This table">
          <span className="phone-label">This table</span>
          <dl className="phone-facts">
            <dt>World</dt>
            <dd>{layerName}</dd>
            <dt>DM</dt>
            <dd>{dmName || '—'}</dd>
            <dt>Seated</dt>
            <dd>{seated.join(', ') || '—'}</dd>
          </dl>
        </section>
        <section className="phone-menu-section" aria-label="This world">
          <span className="phone-label">This world</span>
          <dl className="phone-facts">
            <dt>Map</dt>
            <dd>{island?.name || '—'}</dd>
            <dt>Feet per square</dt>
            <dd>{feetPerSquare}</dd>
            <dt>Map conditions</dt>
            <dd>{islandConds.length ? islandConds.join(', ') : 'None'}</dd>
          </dl>
        </section>
        {confirming ? (
          <div className="phone-confirm" role="alertdialog" aria-label="Leave the table?">
            <p>Leave {layerName}? You’ll need the invitation code to join again.</p>
            <div className="phone-move-actions">
              <button type="button" className="phone-btn-ghost" onClick={() => setConfirming(false)}>
                Stay
              </button>
              <button type="button" className="phone-btn-danger" onClick={onLeave}>
                Leave
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="phone-btn-danger-ghost phone-btn-full" onClick={() => setConfirming(true)}>
            Leave the table
          </button>
        )}
      </div>
    </PhoneSheet>
  );
}

// ---------- party ----------

export function PhonePartySheet({ players, hostId, meId, entities, layers, currentLayerId, onShow, onShowRolls, rollCount = 0, onKick, onClose }) {
  const heroes = Object.values(entities || {}).filter((e) => e.kind === 'hero');
  const seated = Object.values(players || {}).filter((p) => p.id !== hostId);
  const dm = players?.[hostId];
  return (
    <PhoneSheet title="Party" onClose={onClose}>
      <ul className="phone-party">
        {seated.map((p) => {
          const hero = heroes.find((h) => h.ownerId === p.id);
          const here = hero && hero.layerId === currentLayerId;
          const who = hero ? (p.id === meId ? 'you' : `played by ${p.name}`) : p.id === meId ? 'you · no hero yet' : 'no hero yet';
          return (
            <li key={p.id}>
              <span className="phone-party-avatar" style={{ background: p.color }} aria-hidden="true">
                <span className={`phone-party-dot${p.connected ? ' online' : ''}`} />
              </span>
              <span className="phone-party-text">
                <b>{hero ? hero.name : p.name}</b>
                <span>
                  {who} · {p.connected ? 'online' : 'away'}
                </span>
              </span>
              {hero && here ? (
                <button type="button" className="phone-btn-ghost" onClick={() => onShow(hero)} aria-label={`Show ${hero.name} on the map`}>
                  Show on map
                </button>
              ) : hero ? (
                <span className="phone-party-where">On {layers?.[hero.layerId]?.name || 'another world'}</span>
              ) : (
                <span className="phone-party-where">Not on the map</span>
              )}
              {onKick && (
                <button type="button" className="phone-btn-ghost phone-btn-danger" onClick={() => onKick(p.id)} aria-label={`Kick ${p.name} from the table`}>
                  Kick
                </button>
              )}
            </li>
          );
        })}
        {seated.length === 0 && <li className="phone-caption">Nobody has joined yet.</li>}
      </ul>
      {dm && (
        <p className="phone-caption">
          DM · {dm.name} {dm.connected ? 'is online' : 'is away'}
        </p>
      )}
      {onShowRolls && (
        <button type="button" className="phone-btn-ghost phone-btn-block" onClick={onShowRolls}>
          Roll log{rollCount ? ` · ${rollCount}` : ''}
        </button>
      )}
    </PhoneSheet>
  );
}

// ---------- the DM's Edit mode bar (phone) ----------

export function PhoneEditBar({ islandName, onSettings, onDraw, onDone }) {
  return (
    <div className="phone-edit-bar" role="status">
      <span className="phone-edit-text">
        <b>Edit mode.</b> Drag a map to move it; edges snap together where they touch.
      </span>
      <div className="phone-edit-actions">
        <button type="button" className="phone-btn-ghost" onClick={onSettings}>
          {islandName ? `${islandName} settings` : 'Map settings'}
        </button>
        {onDraw && (
          <button type="button" className="phone-btn-ghost" onClick={onDraw}>
            Draw
          </button>
        )}
        <button type="button" className="phone-btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
