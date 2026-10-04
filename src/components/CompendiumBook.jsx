import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CLASSES } from '../data/weapons.js';
import { ITEM_CATEGORIES } from '../data/items.js';
import { monsterToDraft, customMonsterToDraft } from '../data/monsters.js';
import { resizeImageToDataUrl } from '../utils/image.js';
import { useCatalog, entryImage } from '../lib/catalog.js';
import { emitFx } from '../lib/fx.js';
import { Hint } from './Hints.jsx';
import { usePhoneLayout } from './PhoneChrome.jsx';

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
// Items, and Monsters are the tabs on its fore edge. The left page is the
// index: the search, the filters and every entry, in a list that scrolls. The
// right page is the chosen entry, with what the DM can do with it at its
// foot: Buy or Give it to a hero — the same onGive(hero, item, isBuy) contract
// the old modals used — or, for a monster, place it on the map. Nothing sits
// beside the book. (A phone gets one scrolling page instead, see below.)

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
  const [heroId, setHeroId] = useState('');
  const [feedback, setFeedback] = useState('');
  const rowsRef = useRef(null);
  const timers = useRef([]);
  const isPhone = usePhoneLayout();

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
        facts: [['Hit points', m.maxHp || 15]],
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
        facts: [
          ['Hit points', m.hp],
          ['Armor class', m.ac],
          ['Speed', `${m.speed} ft`],
          ['Challenge', m.cr],
        ],
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
          facts: [
            ['Damage', weaponDiceLabel(w)],
            ['Type', cap(w.type)],
            ['Cost', formatCost(w.cost)],
          ],
          text: w.equipableClass.length >= CLASSES.length ? 'Any class can use it.' : `Classes that can use it: ${w.equipableClass.join(', ')}.`,
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
        facts: [
          ['Category', cap(it.category)],
          ['Cost', formatCost(it.cost)],
          ['Weight', formatWeight(it.weight)],
        ],
        item: it,
        image: it.id ? null : entryImage('items', it.name),
      }));
  }, [isWeapons, isMonsters, weapons, items, monsters, customWeapons, customItems, customMonsters, monsterImages, search, typeFilter, categoryFilter, crFilter]);

  const totalCount = isWeapons
    ? weapons.length + (customWeapons || []).length
    : isMonsters
      ? monsters.length + (customMonsters || []).length
      : items.length + (customItems || []).length;
  const picked = entries.find((e) => e.key === selectedKey) || null;
  // The book opens ready to read: until an entry is picked, the first one in
  // the index is on the right page. (A phone's detail panel stays shut.)
  const selected = picked || (isPhone ? null : entries[0]) || null;
  const selectedAt = selected ? entries.indexOf(selected) : -1;

  // A new search or filter starts the index from the top.
  useEffect(() => {
    if (rowsRef.current) rowsRef.current.scrollTop = 0;
  }, [kind, search, typeFilter, categoryFilter, crFilter]);

  useEffect(() => {
    rowsRef.current?.querySelector('.cbook-row.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selected?.key]);

  useEffect(() => {
    setHeroId((prev) => (heroes.some((h) => h.id === prev) ? prev : (heroes[0] && heroes[0].id) || ''));
  }, [heroes]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    []
  );

  // Up and Down walk the index, from the search box too.
  const stepRef = useRef(null);
  stepRef.current = (by) => {
    if (entries.length === 0) return;
    setSelectedKey(entries[Math.max(0, Math.min(entries.length - 1, selectedAt + by))].key);
  };
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      else if (isPhone || e.target?.tagName === 'SELECT') return;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        stepRef.current(e.key === 'ArrowDown' ? 1 : -1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, isPhone]);

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

  // On a phone the open book doesn't fit: one scrolling page instead, the
  // tabs and filters above it, and the chosen entry's details and actions
  // in a panel along the bottom.
  if (isPhone) {
    const filters = isMonsters ? MONSTER_CR_FILTERS : isWeapons ? WEAPON_TYPE_FILTERS : null;
    return (
      <div className="cphone" role="dialog" aria-modal="true" aria-label={chapter}>
        <header className="cphone-head">
          <h2>{chapter}</h2>
          <button type="button" className="cphone-close" aria-label="Close compendium" onClick={onClose}>
            &times;
          </button>
        </header>
        <div className="cphone-tabs" role="tablist" aria-label="Compendium">
          {[
            ['weapons', 'Weapons'],
            ['items', 'Items'],
            ['monsters', 'Monsters'],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={kind === k ? 'active' : ''}
              onClick={() => {
                if (kind === k) return;
                setSelectedKey(null);
                onSwitchKind(k);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="cphone-controls">
          <input
            className="cphone-search"
            type="search"
            aria-label={`Search ${noun}`}
            placeholder={`Search ${noun}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="cphone-filter-row">
            {filters ? (
              <div className="cphone-chips">
                {filters.map((t) => {
                  const on = (isMonsters ? crFilter : typeFilter) === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      aria-pressed={on}
                      className={on ? 'active' : ''}
                      onClick={() => (isMonsters ? setCrFilter(t.key) : setTypeFilter(t.key))}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <select className="cphone-select" aria-label="Category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">All categories</option>
                {ITEM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {cap(c)}
                  </option>
                ))}
              </select>
            )}
            <span className="cphone-count">
              {entries.length} of {totalCount}
            </span>
          </div>
        </div>

        <div className="cphone-list" role="list">
          {entries.map((e) => (
            <button
              key={e.key}
              type="button"
              role="listitem"
              className={`cphone-row${e.key === selectedKey ? ' selected' : ''}`}
              aria-pressed={e.key === selectedKey}
              onClick={() => setSelectedKey(e.key === selectedKey ? null : e.key)}
            >
              {e.image ? <img className="cphone-row-img" src={e.image} alt="" loading="lazy" /> : <span className="cphone-row-img" aria-hidden="true" />}
              <span className="cphone-row-main">
                <span className="cphone-row-name">{e.name}</span>
                <span className="cphone-row-sub">{e.sub}</span>
              </span>
              <span className="cphone-row-side">
                <span className="cphone-row-big">{e.big}</span>
                {e.small && <span className="cphone-row-small">{e.small}</span>}
              </span>
            </button>
          ))}
          {entries.length === 0 && <p className="cphone-empty">Nothing in the book matches that search.</p>}
        </div>

        <footer className={`cphone-detail${selected ? ' open' : ''}`}>
          {!selected ? (
            <p className="cphone-detail-empty">Tap an entry to see it and {isMonsters ? 'place it on the map' : 'give it to a hero'}.</p>
          ) : (
            <>
              <div className="cphone-detail-head">
                <b>{selected.name}</b>
                <button type="button" className="cphone-detail-close" aria-label="Back to the list" onClick={() => setSelectedKey(null)}>
                  &times;
                </button>
              </div>
              {selected.monster && (
                <div className="cphone-stats" aria-label="Stat block">
                  <span>HP {selected.monster.hp}</span>
                  <span>AC {selected.monster.ac}</span>
                  <span>Speed {selected.monster.speed} ft</span>
                  {Object.entries(selected.monster.abilities).map(([k, v]) => (
                    <span key={k}>
                      {k.toUpperCase()} {v} ({abilityMod(v)})
                    </span>
                  ))}
                </div>
              )}
              {selected.detail && <p className="cphone-detail-text">{selected.detail}</p>}
              {selected.monster && <p className="cphone-detail-text cphone-attack">{selected.monster.attack}</p>}
              {isMonsters ? (
                <div className="cphone-actions">
                  {selected.monster && (
                    <>
                      <button type="button" className="cphone-btn" onClick={() => imageInputRef.current?.click()}>
                        Use my own image
                      </button>
                      {selected.ownImage && (
                        <button type="button" className="cphone-btn" onClick={resetMonsterImage}>
                          Reset image
                        </button>
                      )}
                      <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleMonsterImage} />
                    </>
                  )}
                  <button type="button" className="cphone-btn primary" disabled={!onAddMonster} onClick={addToMap}>
                    Add to the map
                  </button>
                </div>
              ) : heroes.length === 0 ? (
                <Hint
                  action="Open Tokens"
                  onAction={() => {
                    emitFx({ type: 'open', panel: 'tokens' });
                    onClose?.();
                  }}
                >
                  Loot goes to a hero. Place one from <b>Add → Heroes</b> first.
                </Hint>
              ) : (
                <div className="cphone-give">
                  <label className="cphone-give-to">
                    <span>Give to</span>
                    <select className="cphone-select" value={heroId} onChange={(e) => setHeroId(e.target.value)}>
                      {heroes.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                          {h.ownerName ? ` (${h.ownerName})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="cphone-actions">
                    <button type="button" className="cphone-btn primary" disabled={!heroId} onClick={() => give(false)}>
                      Give
                    </button>
                    <button type="button" className="cphone-btn" disabled={!heroId} onClick={() => give(true)}>
                      Buy ({formatCost(selected.item.cost)})
                    </button>
                  </div>
                </div>
              )}
              {feedback && (
                <p className="cphone-feedback" role="status">
                  {feedback}
                </p>
              )}
            </>
          )}
        </footer>
      </div>
    );
  }

  const filters = isMonsters ? MONSTER_CR_FILTERS : isWeapons ? WEAPON_TYPE_FILTERS : null;
  const picture = selected ? selected.draft?.imageUrl || selected.image : null;

  return (
    <div className="cbook-backdrop" onClick={onClose}>
      <div className="cbook-stage" role="dialog" aria-modal="true" aria-label={chapter} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cbook-close" aria-label="Close compendium" title="Close" onClick={onClose}>
          &times;
        </button>
        <div className="cbook-cover">
          <div className="cbook-cover-line" />
          <div className="cbook-stack left" />
          <div className="cbook-stack right" />
          <div className="cbook-ribbon" />
          <div className="cbook-pages">
            <div className="cbook-page left">
              <div className="cbook-page-head">
                <span className="cbook-chapter">{chapter}</span>
                <span className="cbook-range">
                  {entries.length} of {totalCount}
                </span>
              </div>
              <div className="cbook-controls">
                <input
                  className="cbook-search"
                  type="search"
                  aria-label={`Search ${noun}`}
                  placeholder={`Search ${noun}…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {filters ? (
                  <div className="cbook-filter">
                    {filters.map((t) => {
                      const on = (isMonsters ? crFilter : typeFilter) === t.key;
                      return (
                        <button key={t.key} type="button" aria-pressed={on} className={on ? 'active' : ''} onClick={() => (isMonsters ? setCrFilter(t.key) : setTypeFilter(t.key))}>
                          {t.label}
                        </button>
                      );
                    })}
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
              </div>
              <div className="cbook-rows" ref={rowsRef}>
                {entries.map((e) => {
                  const on = Boolean(selected && e.key === selected.key);
                  return (
                    <button key={e.key} type="button" className={`cbook-row${on ? ' selected' : ''}`} aria-pressed={on} onClick={() => setSelectedKey(e.key)}>
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
                  );
                })}
                {entries.length === 0 && <p className="cbook-empty">Nothing in the book matches that search.</p>}
              </div>
            </div>

            <div className="cbook-page right">
              <div className="cbook-page-head">
                <span className="cbook-chapter">{isWeapons ? 'Weapon' : isMonsters ? 'Monster' : 'Item'}</span>
                <span className="cbook-range">{selected ? `${selectedAt + 1} of ${entries.length}` : ''}</span>
              </div>
              {!selected ? (
                <p className="cbook-empty">Nothing to show. Try another search, or clear the filter.</p>
              ) : (
                <>
                  <div className="cbook-entry">
                    <div className="cbook-entry-top">
                      {picture && <img className={`cbook-entry-img${isMonsters ? ' round' : ''}`} src={picture} alt="" />}
                      <div className="cbook-entry-title">
                        <h3 className="cbook-entry-name">{selected.name}</h3>
                        <span className="cbook-entry-sub">{selected.sub}</span>
                      </div>
                    </div>
                    <dl className="cbook-facts">
                      {selected.facts.map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {selected.monster && (
                      <dl className="cbook-facts abilities" aria-label="Ability scores">
                        {Object.entries(selected.monster.abilities).map(([k, v]) => (
                          <div key={k}>
                            <dt>{k.toUpperCase()}</dt>
                            <dd>
                              {v} <small>{abilityMod(v)}</small>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {/* A weapon's own line only repeats the boxes above, so it
                        prints who can use it instead. */}
                    {(selected.text || selected.detail) && <p className="cbook-entry-text">{selected.text || selected.detail}</p>}
                    {selected.monster && <p className="cbook-entry-text cbook-attack">{selected.monster.attack}</p>}
                  </div>

                  {isMonsters ? (
                    <div className="cbook-entry-actions">
                      {selected.monster && (
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
                      <button type="button" className="cbook-btn primary" disabled={!onAddMonster} onClick={addToMap}>
                        Add to the map
                      </button>
                      <span className="cbook-feedback" role="status">
                        {feedback}
                      </span>
                    </div>
                  ) : heroes.length === 0 ? (
                    <div className="cbook-entry-actions">
                      <Hint
                        className="cbook-hint"
                        action="Open Tokens"
                        onAction={() => {
                          emitFx({ type: 'open', panel: 'tokens' });
                          onClose?.();
                        }}
                      >
                        Loot goes to a hero. Place one from <b>Tokens → Default heroes</b> first.
                      </Hint>
                    </div>
                  ) : (
                    <div className="cbook-entry-actions">
                      <label htmlFor="cbook-hero">Give to</label>
                      <select id="cbook-hero" className="cbook-select" value={heroId} onChange={(e) => setHeroId(e.target.value)}>
                        {heroes.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                            {h.ownerName ? ` (${h.ownerName})` : ''}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="cbook-btn primary" disabled={!heroId} onClick={() => give(false)}>
                        Give
                      </button>
                      <button type="button" className="cbook-btn" disabled={!heroId} onClick={() => give(true)}>
                        Buy ({formatCost(selected.item.cost)})
                      </button>
                      <span className="cbook-feedback" role="status">
                        {feedback}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
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
      </div>
    </div>
  );
}
