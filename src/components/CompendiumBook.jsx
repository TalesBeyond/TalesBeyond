import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CLASSES } from '../data/weapons.js';
import { ITEM_CATEGORIES } from '../data/items.js';
import { TOME_CATEGORIES } from '../data/tomes.js';
import { spellLevelLabel } from '../data/spells.js';
import { POTION_CATEGORIES, INGREDIENT_CATEGORY } from '../data/potions.js';
import { recipesUsing } from '../data/merchants.js';
import { SPELL_LEVELS } from '../data/characterSheet.js';
import { monsterToDraft, customMonsterToDraft } from '../data/monsters.js';
import { resizeImageToDataUrl } from '../utils/image.js';
import { useCatalog, entryImage } from '../lib/catalog.js';
import { compendiumDefaultImage } from '../data/compendiumImages.js';
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

// The compendiums, drawn as one open book. Its chapters (CHAPTERS below) are
// the tabs on its fore edge. The left page is the index: the search, the
// filters and every entry, in a list that scrolls. The right page is the
// chosen entry, with what the DM can do with it at its foot: Buy or Give it
// to a hero — onGiveItem(hero, item, isBuy, kind) — or, for a monster, place
// it on the map. A spell given to a hero is written into its Spells tab; a
// tome, food, drink, potion or ingredient goes in its Bag. Nothing sits
// beside the book. (A phone gets one scrolling page instead, see below.)
// The Potions and Food & Drink chapters also hold what their entries are
// made from: a potion's or a dish's page prints its recipe, an ingredient's
// what it goes into (recipeChapterEntries below).
// Tomes, Food & Drink, Spells and Potions each have a button that opens
// Asset Storage on that chapter's own tab: onAddOwn(kind).

// `tab` is the name on the fore edge, `one` the heading over a single entry.
const CHAPTERS = [
  { kind: 'weapons', tab: 'Weapons', chapter: 'Weapons Compendium', noun: 'weapons', one: 'Weapon' },
  { kind: 'items', tab: 'Items', chapter: 'Item Compendium', noun: 'items', one: 'Item' },
  { kind: 'monsters', tab: 'Monsters', chapter: 'Monster Compendium', noun: 'monsters', one: 'Monster' },
  { kind: 'tomes', tab: 'Tomes', chapter: 'Tomes Compendium', noun: 'tomes', one: 'Tome' },
  { kind: 'foods', tab: 'Food', chapter: 'Food & Drink Compendium', noun: 'food and drink', one: 'Food & Drink' },
  { kind: 'spells', tab: 'Spells', chapter: 'Spells Compendium', noun: 'spells', one: 'Spell' },
  { kind: 'potions', tab: 'Potions', chapter: 'Potions Compendium', noun: 'potions and ingredients', one: 'Potion' },
];

// The chapters a table can add entries of its own to from the book.
const OWN_CHAPTERS = { tomes: 'Write your own', foods: 'Add your own', spells: 'Add your own', potions: 'Add your own' };

const POTION_KIND_LABELS = { potion: 'Potions', elixir: 'Elixirs', 'magic potion': 'Magic potions', venom: 'Venoms', [INGREDIENT_CATEGORY]: 'Ingredients' };

const FOOD_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'food', label: 'Food' },
  { key: 'drink', label: 'Drink' },
  { key: INGREDIENT_CATEGORY, label: 'Ingredients' },
];

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

const isIngredient = (entry) => entry.category === INGREDIENT_CATEGORY;

// The index of a chapter whose entries are made from a recipe (Potions, Food
// & Drink): what is `made`, then the `larder` it is made from, with this
// table's `own` of either sort among them. A search also
// finds something by what goes into it. `filter` is the kind picked ('all'
// for every one), `q` the search in lower case, `folder` the chapter's
// picture folder, `maker` the shopkeeper who makes these, and `one` the
// heading over a made thing's page.
function recipeChapterEntries({ made, larder, own = [], filter, q, keyPrefix, folder, maker, one }) {
  const makeable = [...made, ...own.filter((e) => !isIngredient(e))];
  const found = (e) => e.name.toLowerCase().includes(q) || (e.recipe || []).some((part) => part.name.toLowerCase().includes(q));
  return [...made, ...larder, ...own]
    .filter((e) => (filter === 'all' || e.category === filter) && (!q || found(e)))
    .sort((a, b) => isIngredient(a) - isIngredient(b) || a.name.localeCompare(b.name))
    .map((e) => {
      const recipe = e.recipe || [];
      // A dish can go into another one: a mug of cider into hot spiced cider.
      const goesInto = recipesUsing(e.name, makeable);
      return {
        key: e.id || `${keyPrefix}:${e.category}:${e.name}`,
        name: e.name + (e.id ? ' (Custom)' : ''),
        sub: cap(e.category),
        big: formatCost(e.cost),
        small: '',
        detail: e.description,
        one: isIngredient(e) ? 'Ingredient' : one,
        recipe,
        note: [recipe.length ? `A ${maker} makes it for a hero who carries every ingredient.` : '', goesInto.length ? `Goes into: ${goesInto.join(', ')}.` : ''].filter(Boolean).join(' '),
        facts: [
          ['Kind', cap(e.category)],
          ['Cost', formatCost(e.cost)],
        ],
        item: e,
        // Its own picture, else the chapter's stand-in for a made thing.
        image: (e.id ? null : entryImage(folder, e.name)) || (isIngredient(e) ? null : compendiumDefaultImage(folder)),
      };
    });
}

export default function CompendiumBook({ kind, onClose, onSwitchKind, heroes, onGiveItem, customWeapons, customItems, customMonsters, customTomes, customFoods, customSpells, customPotions, onAddMonster, onAddOwn }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [crFilter, setCrFilter] = useState('all');
  const [tomeFilter, setTomeFilter] = useState('all');
  const [foodFilter, setFoodFilter] = useState('all');
  const [spellFilter, setSpellFilter] = useState('all');
  const [potionFilter, setPotionFilter] = useState('all');
  const [monsterImages, setMonsterImages] = useState(loadMonsterImages);
  const imageInputRef = useRef(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [heroId, setHeroId] = useState('');
  const [feedback, setFeedback] = useState('');
  const rowsRef = useRef(null);
  const timers = useRef([]);
  const isPhone = usePhoneLayout();

  const { weapons, items, monsters, tomes, foods, foodIngredients, spells, potions, ingredients } = useCatalog();
  const isWeapons = kind === 'weapons';
  const isMonsters = kind === 'monsters';
  const { chapter, noun, one } = CHAPTERS.find((c) => c.kind === kind) || CHAPTERS[0];

  // Each chapter's own filter beside the search: a row of chips, or a list
  // to pick from when there are too many for chips.
  const filter = {
    weapons: { chips: WEAPON_TYPE_FILTERS, value: typeFilter, set: setTypeFilter },
    monsters: { chips: MONSTER_CR_FILTERS, value: crFilter, set: setCrFilter },
    foods: { chips: FOOD_FILTERS, value: foodFilter, set: setFoodFilter },
    items: { label: 'Category', all: 'All categories', options: ITEM_CATEGORIES.map((c) => [c, cap(c)]), value: categoryFilter, set: setCategoryFilter },
    tomes: { label: 'Category', all: 'All categories', options: TOME_CATEGORIES.map((c) => [c, cap(c)]), value: tomeFilter, set: setTomeFilter },
    spells: { label: 'Level', all: 'All levels', options: SPELL_LEVELS.map((l) => [String(l), spellLevelLabel(l)]), value: spellFilter, set: setSpellFilter },
    potions: { label: 'Kind', all: 'All kinds', options: [...POTION_CATEGORIES, INGREDIENT_CATEGORY].map((c) => [c, POTION_KIND_LABELS[c]]), value: potionFilter, set: setPotionFilter },
  }[kind];

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
    if (kind === 'tomes') {
      return [...tomes, ...(customTomes || [])]
        .filter((t) => (tomeFilter === 'all' || t.category === tomeFilter) && (!q || t.name.toLowerCase().includes(q) || (t.author || '').toLowerCase().includes(q)))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => ({
          key: t.id || `t:${t.name}`,
          name: t.name + (t.id ? ' (Custom)' : ''),
          sub: `${cap(t.category)}${t.author ? ` · ${t.author}` : ''}`,
          big: formatCost(t.cost),
          small: '',
          detail: t.description,
          // A DM's own tome can run to pages, with its line breaks kept.
          lore: true,
          facts: [
            ['Category', cap(t.category)],
            ['Author', t.author || 'Unknown'],
            ['Cost', formatCost(t.cost)],
          ],
          item: t,
          image: t.id ? null : entryImage('tomes', t.name),
        }));
    }
    if (kind === 'foods') {
      return recipeChapterEntries({ made: foods, larder: foodIngredients, own: customFoods || [], filter: foodFilter, q, keyPrefix: 'f', folder: 'foods', maker: 'Food Salesman', one: 'Food & Drink' });
    }
    if (kind === 'spells') {
      return [...spells, ...(customSpells || [])]
        .filter((s) => (spellFilter === 'all' || String(s.level) === spellFilter) && (!q || s.name.toLowerCase().includes(q)))
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
        .map((s) => ({
          key: s.id || `s:${s.name}`,
          name: s.name + (s.id ? ' (Custom)' : ''),
          sub: `${spellLevelLabel(s.level)} · ${cap(s.school)}`,
          big: s.level === 0 ? 'Cantrip' : `Lv ${s.level}`,
          small: formatCost(s.cost),
          detail: s.description,
          note: 'Given or bought, it is written into the hero’s Spells tab.',
          facts: [
            ['Level', spellLevelLabel(s.level)],
            ['School', cap(s.school)],
            ['Cost', formatCost(s.cost)],
          ],
          item: s,
          image: s.id ? null : entryImage('spells', s.name),
        }));
    }
    if (kind === 'potions') {
      return recipeChapterEntries({ made: potions, larder: ingredients, own: customPotions || [], filter: potionFilter, q, keyPrefix: 'p', folder: 'potions', maker: 'Potion Brewer', one: 'Potion' });
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
  }, [kind, isWeapons, isMonsters, weapons, items, monsters, tomes, foods, foodIngredients, spells, potions, ingredients, customWeapons, customItems, customMonsters, customTomes, customFoods, customSpells, customPotions, monsterImages, search, typeFilter, categoryFilter, crFilter, tomeFilter, foodFilter, spellFilter, potionFilter]);

  const totalCount = {
    weapons: weapons.length + (customWeapons || []).length,
    items: items.length + (customItems || []).length,
    monsters: monsters.length + (customMonsters || []).length,
    tomes: tomes.length + (customTomes || []).length,
    foods: foods.length + foodIngredients.length + (customFoods || []).length,
    spells: spells.length + (customSpells || []).length,
    potions: potions.length + ingredients.length + (customPotions || []).length,
  }[kind];
  const picked = entries.find((e) => e.key === selectedKey) || null;
  // The book opens ready to read: until an entry is picked, the first one in
  // the index is on the right page. (A phone's detail panel stays shut.)
  const selected = picked || (isPhone ? null : entries[0]) || null;
  const selectedAt = selected ? entries.indexOf(selected) : -1;

  // A new search or filter starts the index from the top.
  useEffect(() => {
    if (rowsRef.current) rowsRef.current.scrollTop = 0;
  }, [kind, search, filter.value]);

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
    // False when there was nothing to hand over: the hero knows the spell.
    const done = onGiveItem(hero, selected.item, isBuy, kind);
    setFeedback(done === false ? `${hero.name} already knows it` : `${isBuy ? 'Sold to' : kind === 'spells' ? 'Taught to' : 'Given to'} ${hero.name}`);
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
    return (
      <div className="cphone" role="dialog" aria-modal="true" aria-label={chapter}>
        <header className="cphone-head">
          <h2>{chapter}</h2>
          <button type="button" className="cphone-close" aria-label="Close compendium" onClick={onClose}>
            &times;
          </button>
        </header>
        <div className="cphone-tabs" role="tablist" aria-label="Compendium">
          {CHAPTERS.map(({ kind: k, tab: label }) => (
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
            {filter.chips ? (
              <div className="cphone-chips">
                {filter.chips.map((t) => {
                  const on = filter.value === t.key;
                  return (
                    <button key={t.key} type="button" aria-pressed={on} className={on ? 'active' : ''} onClick={() => filter.set(t.key)}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <select className="cphone-select" aria-label={filter.label} value={filter.value} onChange={(e) => filter.set(e.target.value)}>
                <option value="all">{filter.all}</option>
                {filter.options.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            <span className="cphone-count">
              {entries.length} of {totalCount}
            </span>
          </div>
          {OWN_CHAPTERS[kind] && onAddOwn && (
            <button type="button" className="cphone-btn" onClick={() => onAddOwn(kind)}>
              + {OWN_CHAPTERS[kind]}
            </button>
          )}
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
              {selected.detail && <p className={`cphone-detail-text${selected.lore ? ' lore' : ''}`}>{selected.detail}</p>}
              {selected.monster && <p className="cphone-detail-text cphone-attack">{selected.monster.attack}</p>}
              {selected.recipe?.length > 0 && (
                <p className="cphone-detail-text">
                  <b>Recipe:</b> {selected.recipe.map((part) => `${part.qty} × ${part.name}`).join(', ')}
                </p>
              )}
              {selected.note && <p className="cphone-detail-text cphone-attack">{selected.note}</p>}
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
                {filter.chips ? (
                  <div className="cbook-filter">
                    {filter.chips.map((t) => {
                      const on = filter.value === t.key;
                      return (
                        <button key={t.key} type="button" aria-pressed={on} className={on ? 'active' : ''} onClick={() => filter.set(t.key)}>
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <select className="cbook-select" aria-label={filter.label} value={filter.value} onChange={(e) => filter.set(e.target.value)}>
                    <option value="all">{filter.all}</option>
                    {filter.options.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
                {OWN_CHAPTERS[kind] && onAddOwn && (
                  <button
                    type="button"
                    className="cbook-btn"
                    title={kind === 'tomes' ? 'Write a tome of your own, with its story or lore, in Asset Storage' : `Add ${noun} of your own to this table, in Asset Storage`}
                    onClick={() => onAddOwn(kind)}
                  >
                    + {OWN_CHAPTERS[kind]}
                  </button>
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
                <span className="cbook-chapter">{selected?.one || one}</span>
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
                    {(selected.text || selected.detail) && <p className={`cbook-entry-text${selected.lore ? ' lore' : ''}`}>{selected.text || selected.detail}</p>}
                    {selected.monster && <p className="cbook-entry-text cbook-attack">{selected.monster.attack}</p>}
                    {selected.recipe?.length > 0 && (
                      <div className="cbook-recipe">
                        <h4 className="cbook-recipe-title">Recipe</h4>
                        <div className="cbook-chips">
                          {selected.recipe.map((part) => (
                            <span key={part.name}>
                              {part.qty} × {part.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selected.note && <p className="cbook-entry-text cbook-attack">{selected.note}</p>}
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
          {CHAPTERS.map(({ kind: k, tab: label }) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={`cbook-tab${kind === k ? ' active' : ''}`} onClick={() => kind !== k && onSwitchKind(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
