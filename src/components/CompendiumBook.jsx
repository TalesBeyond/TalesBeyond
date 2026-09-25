import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CLASSES } from '../data/weapons.js';
import { ITEM_CATEGORIES } from '../data/items.js';
import { monsterToDraft, customMonsterToDraft } from '../data/monsters.js';
import { resizeImageToDataUrl } from '../utils/image.js';
import { useCatalog, entryImage } from '../lib/catalog.js';

// A DM's own picture for a built-in monster is kept in this browser (not in the
// table), so it is there next time the book opens on any table.
const MONSTER_IMAGES_KEY = 'hearthbound.monsterImages';
const MONSTER_IMAGE_MAX_DIM = 256;

function loadMonsterImages() {
  try {
    return JSON.parse(localStorage.getItem(MONSTER_IMAGES_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveMonsterImages(images) {
  try {
    localStorage.setItem(MONSTER_IMAGES_KEY, JSON.stringify(images));
    return true;
  } catch (e) {
    return false;
  }
}

// The weapon, item, and monster compendiums, drawn as one open book. Weapons,
// Items, and Monsters are its tabs; entries are laid out six-or-so to a page, and the arrows in
// the page footers turn the page (a real 3D flip, see the leaf slots below).
// Picking an entry puts it on the desk tray, where the DM can Buy or Give it
// to a hero — the same onGive(hero, item, isBuy) contract the old modals used.
// A monster is picked the same way, but the tray's button places it on the map.

const ROW_H = 86;
const FLIP_MS = 750;

const WEAPON_TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'melee', label: 'Melee' },
  { key: 'ranged', label: 'Ranged' },
];

const MONSTER_CR_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'low', label: 'CR 1 or less' },
  { key: 'mid', label: 'CR 2 to 5' },
  { key: 'high', label: 'CR 6+' },
];

function crValue(cr) {
  if (typeof cr === 'number') return cr;
  const [n, d] = String(cr).split('/');
  return d ? Number(n) / Number(d) : Number(n);
}

function crBand(cr) {
  const v = crValue(cr);
  return v <= 1 ? 'low' : v <= 5 ? 'mid' : 'high';
}

function abilityMod(score) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function baseWeaponName(name) {
  return name.replace(/^\+\d+ /, '');
}

function weaponDiceLabel(w) {
  const mod = w.modifier ? (w.modifier > 0 ? `+${w.modifier}` : `${w.modifier}`) : '';
  return `${w.numberOfDice}${w.diceType}${mod}`;
}

function formatCost(gp) {
  if (gp >= 1) return `${Math.round(gp * 100) / 100} gp`;
  const cp = Math.round(gp * 100);
  return cp % 10 === 0 ? `${cp / 10} sp` : `${cp} cp`;
}

function formatWeight(lb) {
  return lb > 0 ? `${lb} lb` : 'no weight';
}

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

function shortName(name) {
  return name.split(' ')[0];
}

export default function CompendiumBook({ kind, onClose, onSwitchKind, heroes, onGiveItem, customWeapons, customItems, customMonsters, onAddMonster }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [crFilter, setCrFilter] = useState('all');
  const [monsterImages, setMonsterImages] = useState(loadMonsterImages);
  const imageInputRef = useRef(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [spread, setSpread] = useState(0);
  const [flip, setFlip] = useState({ phase: 'idle', dir: 'fwd' }); // phase: idle | prep | go
  const [perPage, setPerPage] = useState(6);
  const [heroId, setHeroId] = useState('');
  const [feedback, setFeedback] = useState('');
  const pagesRef = useRef(null);
  const timers = useRef([]);

  const { weapons, items, monsters } = useCatalog();
  const isWeapons = kind === 'weapons';
  const isMonsters = kind === 'monsters';
  const chapter = isWeapons ? 'Weapons Compendium' : isMonsters ? 'Monster Compendium' : 'Item Compendium';
  const noun = isWeapons ? 'weapons' : isMonsters ? 'monsters' : 'items';

  // The DM's custom assets sit alongside the built-in catalog, never instead of it.
  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (isMonsters) {
      const custom = (customMonsters || []).map((m) => ({
        key: m.id,
        name: `${m.name} (Custom)`,
        sub: 'Custom monster',
        big: `HP ${m.maxHp || 15}`,
        small: '',
        detail: 'A monster from this table\'s Asset Storage.',
        image: m.imageUrl || null,
        draft: customMonsterToDraft(m),
        custom: true,
      }));
      const builtIn = monsters.filter((m) => crFilter === 'all' || crBand(m.cr) === crFilter).map((m) => ({
        key: `m:${m.key}`,
        name: m.name,
        sub: `${m.kind} · CR ${m.cr}`,
        big: `AC ${m.ac}`,
        small: `HP ${m.hp}`,
        detail: m.description,
        monster: m,
        draft: { ...monsterToDraft(m), ...(monsterImages[m.key] ? { imageUrl: monsterImages[m.key] } : {}) },
        ownImage: Boolean(monsterImages[m.key]),
        image: monsterImages[m.key] || entryImage('monsters', m.key, m.name),
      }));
      return [...builtIn, ...(crFilter === 'all' ? custom : [])].filter((e) => !q || e.name.toLowerCase().includes(q));
    }
    if (isWeapons) {
      const all = [...weapons, ...(customWeapons || [])];
      return all
        .filter((w) => (typeFilter === 'all' || w.type === typeFilter) && (!q || w.name.toLowerCase().includes(q)))
        .sort((a, b) => baseWeaponName(a.name).localeCompare(baseWeaponName(b.name)) || a.modifier - b.modifier)
        .map((w) => ({
          key: w.id || `w:${w.name}`,
          name: w.name + (w.id ? ' (Custom)' : ''),
          sub: cap(w.type),
          big: weaponDiceLabel(w),
          small: formatCost(w.cost),
          detail: `${cap(w.type)} weapon, ${weaponDiceLabel(w)} damage, ${formatCost(w.cost)}. ${
            w.equipableClass.length >= CLASSES.length ? 'Any class.' : cap(w.equipableClass.join(', '))
          }`,
          item: w,
          image: w.id ? null : entryImage('weapons', w.name, baseWeaponName(w.name)),
        }));
    }
    const all = [...items, ...(customItems || [])];
    return all
      .filter((it) => (categoryFilter === 'all' || it.category === categoryFilter) && (!q || it.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((it) => ({
        key: it.id || `i:${it.name}`,
        name: it.name + (it.id ? ' (Custom)' : ''),
        sub: cap(it.category),
        big: formatCost(it.cost),
        small: formatWeight(it.weight),
        detail: it.description,
        item: it,
        image: it.id ? null : entryImage('items', it.name),
      }));
  }, [isWeapons, isMonsters, weapons, items, monsters, customWeapons, customItems, customMonsters, monsterImages, search, typeFilter, categoryFilter, crFilter]);

  const totalCount = isWeapons
    ? weapons.length + (customWeapons || []).length
    : isMonsters
      ? monsters.length + (customMonsters || []).length
      : items.length + (customItems || []).length;
  const pageCount = Math.max(2, Math.ceil(entries.length / perPage));
  const spreads = Math.ceil(pageCount / 2);
  const shownSpread = Math.min(spread, spreads - 1);
  const selected = entries.find((e) => e.key === selectedKey) || null;
  const idle = flip.phase === 'idle';

  // Rows that fit on a page depend on how tall the book is on this screen.
  useLayoutEffect(() => {
    const el = pagesRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const fit = Math.floor((el.clientHeight - 120) / ROW_H);
      setPerPage(Math.max(3, Math.min(8, fit)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setSpread(0);
    setFlip({ phase: 'idle', dir: 'fwd' });
  }, [kind, search, typeFilter, categoryFilter, crFilter, perPage]);

  useEffect(() => {
    setHeroId((prev) => (heroes.some((h) => h.id === prev) ? prev : (heroes[0] && heroes[0].id) || ''));
  }, [heroes]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    []
  );

  function turn(dir) {
    if (flip.phase !== 'idle') return;
    if (dir === 'fwd' ? shownSpread >= spreads - 1 : shownSpread <= 0) return;
    setFlip({ phase: 'prep', dir });
    timers.current.push(setTimeout(() => setFlip({ phase: 'go', dir }), 40));
    timers.current.push(
      setTimeout(() => {
        setSpread(shownSpread + (dir === 'fwd' ? 1 : -1));
        setFlip({ phase: 'idle', dir });
      }, FLIP_MS + 60)
    );
  }

  const turnRef = useRef(turn);
  turnRef.current = turn;
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') turnRef.current('fwd');
      else if (e.key === 'ArrowLeft') turnRef.current('back');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function give(isBuy) {
    const hero = heroes.find((h) => h.id === heroId);
    if (!hero || !selected) return;
    onGiveItem(hero, selected.item, isBuy);
    setFeedback(`${isBuy ? 'Sold to' : 'Given to'} ${hero.name}`);
    timers.current.push(setTimeout(() => setFeedback(''), 2000));
  }

  async function handleMonsterImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selected?.monster) return;
    try {
      const url = await resizeImageToDataUrl(file, MONSTER_IMAGE_MAX_DIM);
      const next = { ...monsterImages, [selected.monster.key]: url };
      setMonsterImages(next);
      if (!saveMonsterImages(next)) setFeedback('Image used for now; this browser could not save it');
    } catch (err) {
      setFeedback('Could not read that image');
    }
  }

  function resetMonsterImage() {
    if (!selected?.monster) return;
    const next = { ...monsterImages };
    delete next[selected.monster.key];
    setMonsterImages(next);
    saveMonsterImages(next);
  }

  function addToMap() {
    if (!selected || !selected.draft || !onAddMonster) return;
    onAddMonster(selected.draft);
    setFeedback(`Placed ${selected.name} on the map`);
    timers.current.push(setTimeout(() => setFeedback(''), 2000));
  }

  function renderPage(p, role, extraClass, style, interactive) {
    const slice = entries.slice(p * perPage, p * perPage + perPage);
    const range = slice.length
      ? slice.length === 1
        ? shortName(slice[0].name)
        : `${shortName(slice[0].name)} to ${shortName(slice[slice.length - 1].name)}`
      : '';
    const left = role === 'L';
    return (
      <div
        key={`${extraClass}-${p}`}
        className={`cbook-page ${left ? 'left' : 'right'} ${extraClass}`}
        style={style}
        aria-hidden={interactive ? undefined : true}
      >
        <div className="cbook-page-head">
          <span className="cbook-chapter">{chapter}</span>
          <span className="cbook-range">{range}</span>
        </div>
        <div className="cbook-rows">
          {slice.map((e) => (
            <button
              key={e.key}
              type="button"
              className={`cbook-row${e.key === selectedKey ? ' selected' : ''}`}
              aria-pressed={e.key === selectedKey}
              tabIndex={interactive ? 0 : -1}
              onClick={() => setSelectedKey(e.key)}
            >
              <span className="cbook-row-lead">
                {e.image && <img className="cbook-row-img" src={e.image} alt="" loading="lazy" />}
                <span className="cbook-row-main">
                  <span className="cbook-row-name">{e.name}</span>
                  <span className="cbook-row-sub">{e.sub}</span>
                </span>
              </span>
              <span className="cbook-row-side">
                <span className="cbook-row-big">{e.big}</span>
                <span className="cbook-row-small">{e.small}</span>
              </span>
            </button>
          ))}
          {slice.length === 0 && p === 0 && <p className="cbook-empty">Nothing in the book matches that search.</p>}
        </div>
        <div className={`cbook-page-foot ${left ? 'left' : 'right'}`}>
          {interactive && left && idle && shownSpread > 0 && (
            <button type="button" className="cbook-turn" aria-label="Previous page" onClick={() => turn('back')}>
              &#8249;
            </button>
          )}
          <span className="cbook-num">{p + 1}</span>
          {interactive && !left && idle && shownSpread < spreads - 1 && (
            <button type="button" className="cbook-turn" aria-label="Next page" onClick={() => turn('fwd')}>
              &#8250;
            </button>
          )}
        </div>
      </div>
    );
  }

  const L = shownSpread * 2;
  const go = flip.phase === 'go';
  const trans = go ? `transform ${FLIP_MS}ms cubic-bezier(0.45, 0.05, 0.25, 1)` : 'none';
  let slots;
  if (idle) {
    slots = [renderPage(L, 'L', 'base', { left: 0 }, true), renderPage(L + 1, 'R', 'base', { left: '50%' }, true)];
  } else if (flip.dir === 'fwd') {
    const ang = go ? -180 : 0;
    slots = [
      renderPage(L, 'L', 'base', { left: 0 }, false),
      renderPage(L + 3, 'R', 'base', { left: '50%' }, false),
      renderPage(L + 1, 'R', 'leaf', { left: '50%', transformOrigin: 'left center', transition: trans, transform: `rotateY(${ang}deg)` }, false),
      renderPage(L + 2, 'L', 'leaf', { left: '50%', transformOrigin: 'left center', transition: trans, transform: `rotateY(${ang}deg) translateX(100%) rotateY(180deg)` }, false),
    ];
  } else {
    const ang = go ? 180 : 0;
    slots = [
      renderPage(L - 2, 'L', 'base', { left: 0 }, false),
      renderPage(L + 1, 'R', 'base', { left: '50%' }, false),
      renderPage(L, 'L', 'leaf', { left: 0, transformOrigin: 'right center', transition: trans, transform: `rotateY(${ang}deg)` }, false),
      renderPage(L - 1, 'R', 'leaf', { left: 0, transformOrigin: 'right center', transition: trans, transform: `rotateY(${ang}deg) translateX(-100%) rotateY(180deg)` }, false),
    ];
  }

  return (
    <div className="cbook-backdrop" onClick={onClose}>
      <div className="cbook-stage" role="dialog" aria-modal="true" aria-label={chapter} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cbook-close" aria-label="Close compendium" onClick={onClose}>
          &times;
        </button>

        <div className="cbook-cover">
          <div className="cbook-cover-line" />
          <div className="cbook-stack left" />
          <div className="cbook-stack right" />
          <div className="cbook-ribbon" />
          <div className="cbook-pages" ref={pagesRef}>
            {slots}
            <div className="cbook-gutter" />
          </div>
        </div>

        <div className="cbook-tabs" role="tablist" aria-label="Compendium">
          {[
            ['weapons', 'Weapons'],
            ['items', 'Items'],
            ['monsters', 'Monsters'],
          ].map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={`cbook-tab${kind === k ? ' active' : ''}`} onClick={() => kind !== k && onSwitchKind(k)}>
              {label}
            </button>
          ))}
        </div>

        <div className="cbook-tray">
          <div className="cbook-tray-controls">
            <input
              className="cbook-search"
              type="search"
              aria-label={`Search ${noun}`}
              placeholder={`Search ${noun}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {isMonsters ? (
              <div className="cbook-filter">
                {MONSTER_CR_FILTERS.map((t) => (
                  <button key={t.key} type="button" aria-pressed={crFilter === t.key} className={crFilter === t.key ? 'active' : ''} onClick={() => setCrFilter(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
            ) : isWeapons ? (
              <div className="cbook-filter">
                {WEAPON_TYPE_FILTERS.map((t) => (
                  <button key={t.key} type="button" aria-pressed={typeFilter === t.key} className={typeFilter === t.key ? 'active' : ''} onClick={() => setTypeFilter(t.key)}>
                    {t.label}
                  </button>
                ))}
              </div>
            ) : (
              <select className="cbook-select" aria-label="Category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">All categories</option>
                {ITEM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {cap(c)}
                  </option>
                ))}
              </select>
            )}
            <span className="cbook-count">
              {entries.length} of {totalCount}
            </span>
          </div>

          <div className="cbook-selection">
            <span className="cbook-selection-name">{selected ? selected.name : 'Nothing chosen yet'}</span>
            {selected && selected.monster && (
              <span className="cbook-stats" aria-label="Stat block">
                <span>HP {selected.monster.hp}</span>
                <span>AC {selected.monster.ac}</span>
                <span>Speed {selected.monster.speed} ft</span>
                {Object.entries(selected.monster.abilities).map(([k, v]) => (
                  <span key={k}>
                    {k.toUpperCase()} {v} ({abilityMod(v)})
                  </span>
                ))}
              </span>
            )}
            <span className="cbook-selection-line" title={selected ? selected.detail : undefined}>
              {selected ? selected.detail : 'Tap an entry in the book to pick it.'}
            </span>
            {selected && selected.monster && <span className="cbook-attack">{selected.monster.attack}</span>}
          </div>

          {isMonsters ? (
            <div className="cbook-give">
              {selected && selected.draft && <img className="cbook-token-preview" src={selected.draft.imageUrl} alt="" />}
              {selected && selected.monster && (
                <>
                  <button type="button" className="cbook-btn" onClick={() => imageInputRef.current?.click()}>
                    Use my own image
                  </button>
                  {selected.ownImage && (
                    <button type="button" className="cbook-btn" onClick={resetMonsterImage}>
                      Reset image
                    </button>
                  )}
                  <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleMonsterImage} />
                </>
              )}
              <button type="button" className="cbook-btn primary" disabled={!selected || !onAddMonster} onClick={addToMap}>
                {selected ? `Add ${selected.name} to the map` : 'Add to the map'}
              </button>
              <span className="cbook-feedback" role="status">
                {feedback}
              </span>
            </div>
          ) : (
          <div className="cbook-give">
            <label htmlFor="cbook-hero">Give to</label>
            <select id="cbook-hero" className="cbook-select" value={heroId} onChange={(e) => setHeroId(e.target.value)} disabled={heroes.length === 0}>
              {heroes.length === 0 && <option value="">No heroes on the map</option>}
              {heroes.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {h.ownerName ? ` (${h.ownerName})` : ''}
                </option>
              ))}
            </select>
            <button type="button" className="cbook-btn primary" disabled={!selected || !heroId} onClick={() => give(false)}>
              Give
            </button>
            <button type="button" className="cbook-btn" disabled={!selected || !heroId} onClick={() => give(true)} title={selected ? `Buy for ${formatCost(selected.item.cost)}` : undefined}>
              {selected ? `Buy (${formatCost(selected.item.cost)})` : 'Buy'}
            </button>
            <span className="cbook-feedback" role="status">
              {feedback}
            </span>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
