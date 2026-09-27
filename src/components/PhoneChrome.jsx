import React, { useEffect, useState } from 'react';
import { getIslandCondition } from '../data/islandConditions.js';
import { PALETTES } from '../state/theme.js';

// The phone layout (MOBILE_DESIGN.md): islands first. GameView swaps its
// desktop chrome (toolbar, side panels, layer strip) for these pieces when the
// viewport is phone-sized; the map itself is the same MapBoard.

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
};

export function PhoneIcon({ name, size = 22, strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

// Heroes and monsters standing on an island, for the chips and the atlas.
function occupantsOf(entities, islandId) {
  return Object.values(entities || {}).filter((e) => e.islandId === islandId && (e.kind === 'hero' || e.kind === 'mob'));
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

// ---------- top bar: the island you're on, over the layer it's part of ----------

export function PhoneTopBar({ islandName, layerName, layerIndex, layerCount, feetPerSquare, onAtlas, onLayers, onMenu }) {
  return (
    <header className="phone-topbar">
      <button type="button" className="phone-topbar-title" onClick={onAtlas} aria-label={`${islandName}, open the island overview`}>
        <span className="phone-topbar-island">
          {islandName}
          <PhoneIcon name="down" size={13} strokeWidth={3} />
        </span>
        <span className="phone-topbar-sub">
          {layerName} · {layerCount > 1 ? `Layer ${layerIndex + 1} of ${layerCount} · ` : ''}
          {feetPerSquare} ft squares
        </span>
      </button>
      <button type="button" className="phone-icon-btn" onClick={onLayers} aria-label="Maps and layers">
        <PhoneIcon name="layers" />
      </button>
      <button type="button" className="phone-icon-btn" onClick={onMenu} aria-label="Table menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
    </header>
  );
}

// ---------- island chips ----------

export function PhoneIslandStrip({ layer, entities, activeIslandId, onPick, onAddIsland }) {
  return (
    <nav className="phone-strip" aria-label="Islands on this layer">
      {layer.islandOrder.map((id) => {
        const island = layer.islands[id];
        if (!island) return null;
        const count = occupantsOf(entities, id).length;
        const group = groupNameOf(layer, id);
        const active = id === activeIslandId;
        return (
          <button key={id} type="button" className={`phone-chip${active ? ' active' : ''}`} aria-pressed={active} onClick={() => onPick(id)}>
            <span className="phone-chip-name">{island.name}</span>
            <span className="phone-chip-sub">
              {group || `${island.cols} × ${island.rows}`}
              {count ? ` · ${count} here` : ''}
            </span>
          </button>
        );
      })}
      {onAddIsland && (
        <button type="button" className="phone-chip phone-chip-add" onClick={onAddIsland}>
          <PhoneIcon name="plus" size={16} strokeWidth={2.2} />
          Island
        </button>
      )}
    </nav>
  );
}

// ---------- mini-map: every island, and the part the screen shows ----------

export function PhoneMiniMap({ layer, zoom, stageRef, originX, originY, stagePadding, activeIslandId, onOpen }) {
  const [view, setView] = useState(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setView({
          x: originX + (stage.scrollLeft - stagePadding) / zoom,
          y: originY + (stage.scrollTop - stagePadding) / zoom,
          w: stage.clientWidth / zoom,
          h: stage.clientHeight / zoom,
        })
      );
    };
    measure();
    stage.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      stage.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [stageRef, zoom, originX, originY, stagePadding]);

  const b = islandBounds(layer);
  const pad = Math.max(b.w, b.h) * 0.06;
  return (
    <button type="button" className="phone-minimap" onClick={onOpen} aria-label="Island overview">
      <svg viewBox={`${b.minX - pad} ${b.minY - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {layer.islandOrder.map((id) => {
          const i = layer.islands[id];
          if (!i) return null;
          return (
            <rect
              key={id}
              x={i.x}
              y={i.y}
              width={i.cols * i.cellSize}
              height={i.rows * i.cellSize}
              className={id === activeIslandId ? 'phone-minimap-island active' : 'phone-minimap-island'}
            />
          );
        })}
        {view && <rect x={view.x} y={view.y} width={view.w} height={view.h} className="phone-minimap-view" vectorEffect="non-scaling-stroke" />}
      </svg>
    </button>
  );
}

// ---------- the island's conditions (Fog, Darkness…) ----------

export function PhoneIslandConditions({ island }) {
  const labels = (island?.conditions || []).map((key) => getIslandCondition(key)?.label).filter(Boolean);
  if (!labels.length) return null;
  return (
    <div className="phone-conditions" role="status" aria-label={`Island conditions: ${labels.join(', ')}`}>
      <PhoneIcon name="fog" size={16} strokeWidth={2} />
      {labels.join(' · ')}
    </div>
  );
}

// ---------- the selected token, one tap from its card ----------

export function PhoneTokenCard({ entity, isHost, onOpen, onHp }) {
  if (!entity) return null;
  const hasHp = entity.kind !== 'door' && entity.kind !== 'chest' && entity.maxHp;
  const pct = hasHp ? Math.max(0, Math.min(1, entity.hp / entity.maxHp)) : 0;
  const ac = entity.kind === 'mob' ? entity.armorClass : entity.kind === 'hero' ? entity.sheet?.armorClass : null;
  const kindLabel = { hero: 'Hero', mob: 'Monster', door: 'Door', chest: 'Chest', trap: 'Trap' }[entity.kind] || '';
  return (
    <div className="phone-token-card">
      <button type="button" className="phone-token-main" onClick={onOpen} aria-label={`${entity.name}. Open its card`}>
        <span className="phone-token-avatar" style={{ backgroundImage: entity.imageUrl ? `url(${entity.imageUrl})` : undefined, '--token-color': entity.color || 'transparent' }} />
        <span className="phone-token-text">
          <span className="phone-token-name">
            <b>{entity.name}</b>
            <span>{kindLabel}</span>
          </span>
          {hasHp ? (
            <span className="phone-token-stats">
              <span className="phone-token-bar">
                <span style={{ width: `${pct * 100}%`, background: pct > 0.5 ? 'var(--moss)' : pct > 0.25 ? 'var(--gold-hi)' : 'var(--danger)' }} />
              </span>
              <span className="phone-token-hp">
                {entity.hp}/{entity.maxHp}
              </span>
              {ac != null && <span className="phone-token-ac">AC {ac}</span>}
            </span>
          ) : (
            <span className="phone-token-hint">Tap for details</span>
          )}
        </span>
        {!(isHost && hasHp) && <PhoneIcon name="chev" size={18} strokeWidth={2.4} />}
      </button>
      {isHost && hasHp && (
        <div className="phone-token-steppers" role="group" aria-label={`${entity.name} hit points`}>
          <button type="button" aria-label={`${entity.name} gains 1 hit point`} onClick={() => onHp(Math.min(entity.maxHp, entity.hp + 1))}>
            <PhoneIcon name="plus" size={16} strokeWidth={2.4} />
          </button>
          <button type="button" aria-label={`${entity.name} loses 1 hit point`} onClick={() => onHp(Math.max(0, entity.hp - 1))}>
            <PhoneIcon name="minus" size={16} strokeWidth={2.4} />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- bottom nav ----------

export function PhoneNav({ isHost, tool, onTool, onOpen }) {
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
  return (
    <nav className="phone-nav" aria-label="Tools">
      {tools.map(([id, label]) => (
        <button key={id} type="button" className={tool === id ? 'active' : ''} aria-pressed={tool === id} onClick={() => onTool(id)}>
          <PhoneIcon name={id} />
          {label}
        </button>
      ))}
      {isHost && (
        <button type="button" onClick={() => onOpen('add')}>
          <PhoneIcon name="add" />
          Add
        </button>
      )}
      <button type="button" onClick={() => onOpen('panel')}>
        <PhoneIcon name="party" />
        Party
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
    <PhoneSheet title="Maps" onClose={onClose}>
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
                  {layer.islandOrder.length} {layer.islandOrder.length === 1 ? 'island' : 'islands'} · {layer.feetPerSquare} ft squares
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
          Add, rename or remove maps
        </button>
      ) : (
        <p className="phone-caption">Walk through a door to take your hero to another map. Only the DM can add, rename or remove maps.</p>
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

export function PhoneAtlas({ layer, entities, activeIslandId, myHeroId, layerLabel, onPick, onClose }) {
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
    <div className="phone-atlas" role="dialog" aria-modal="true" aria-label="Island overview">
      <header className="phone-atlas-header">
        <button type="button" className="phone-icon-btn" onClick={onClose} aria-label="Back to the island">
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
          if (!i || (e.kind !== 'hero' && e.kind !== 'mob')) return null;
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
        <h3>Islands</h3>
        <ul>
          {layer.islandOrder.map((id, index) => {
            const i = layer.islands[id];
            if (!i) return null;
            const who = occupantsOf(entities, id);
            const group = groupNameOf(layer, id);
            const conds = (i.conditions || []).map((k) => getIslandCondition(k)?.label).filter(Boolean);
            return (
              <li key={id}>
                <button type="button" onClick={() => onPick(id)}>
                  <span className={`phone-atlas-swatch${id === activeIslandId ? ' active' : ''}`} style={{ backgroundImage: i.backgroundImage ? `url(${i.backgroundImage})` : undefined }} aria-hidden="true" />
                  <span className="phone-atlas-row-text">
                    <b>{i.name}</b>
                    <span>
                      {i.cols} × {i.rows}
                      {index === 0 ? ' · base island' : ''}
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
        <p className="phone-caption">Tokens walk straight across where two islands touch. Doors lead to other maps.</p>
      </div>
    </div>
  );
}

// ---------- palette choice (the desktop header's PalettesMenu, as a row) ----------

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
