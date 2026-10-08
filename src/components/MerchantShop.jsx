import React, { useEffect, useMemo, useState } from 'react';
import { useCatalog } from '../lib/catalog.js';
import { defaultCharacterSheet, SPELL_LEVELS } from '../data/characterSheet.js';
import { spellLevelLabel } from '../data/spells.js';
import {
  MAX_SHOP_WARES,
  WARE_SOURCES,
  WARE_TEXT_MAX,
  bagCount,
  goldOf,
  hasIngredients,
  knowsSpell,
  merchantRole,
  newWare,
  sheetAfterMaking,
  sheetAfterPurchase,
  sheetWithGoods,
  shopWares,
  sourceEntries,
  wareDescription,
  wareFromEntry,
  wareGoods,
  warePrice,
  wareRecipe,
} from '../data/merchants.js';

// How many compendium entries the stocking list shows at once. The rest are
// a search away.
const BROWSE_LIMIT = 40;
// "Add ten at random": a shelf filled in one press.
const RANDOM_BATCH = 10;

// What a ware the DM writes for this shop is filed under: the shop's own
// compendium when it has just the one (a Wizard's is a spell, and goes to the
// buyer's Spells tab like any other), a map for the Cartographer, else a
// plain custom item.
function customSourceFor(role) {
  if (role.key === 'maps') return 'maps';
  return role.sources.length === 1 ? role.sources[0] : 'custom';
}

// A shop's shelves, and the two ways to fill them: from the compendium the
// shopkeeper sells out of, or a ware the DM writes. Shared between the
// placement modal (TokenSidebar) and the Shop tab on a placed shopkeeper's
// card (ShopTab below), the way ChestContentsEditor is for a chest.
//
// onPendingCustomChange (optional): told the name of a ware that has been
// typed but not added yet ('' when there is none), so the placement modal
// can hold "Place" back until it is added or cleared.
export function ShopWaresEditor({ role, wares, customAssets, onChange, onPendingCustomChange }) {
  const catalog = useCatalog();
  const fromCompendium = role.sources.length > 0;
  const [tab, setTab] = useState(fromCompendium ? 'compendium' : 'custom');
  const [source, setSource] = useState(role.sources[0] || null);
  const [search, setSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState(5);
  const [customText, setCustomText] = useState('');
  const [customLevel, setCustomLevel] = useState(1);

  const customSource = customSourceFor(role);
  const full = wares.length >= MAX_SHOP_WARES;
  const stocked = useMemo(() => new Set(wares.map((w) => `${w.source}/${w.name}`)), [wares]);

  const pendingCustom = tab === 'custom' && !full ? customName.trim() : '';
  useEffect(() => {
    onPendingCustomChange?.(pendingCustom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCustom]);

  const entries = useMemo(() => (source ? sourceEntries(source, catalog, customAssets) : []), [source, catalog, customAssets]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? entries.filter((entry) => entry.name.toLowerCase().includes(q)) : entries;
  }, [entries, search]);
  const unstocked = entries.filter((entry) => !stocked.has(`${source}/${entry.name}`));

  function addEntry(entry) {
    if (full || stocked.has(`${source}/${entry.name}`)) return;
    onChange([...wares, wareFromEntry(source, entry)]);
  }

  function addRandom() {
    const pool = [...unstocked];
    const picked = [];
    while (pool.length && picked.length < RANDOM_BATCH && wares.length + picked.length < MAX_SHOP_WARES) {
      picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    if (picked.length) onChange([...wares, ...picked.map((entry) => wareFromEntry(source, entry))]);
  }

  function addCustom() {
    const name = customName.trim();
    if (full || !name) return;
    const isSpell = customSource === 'spells';
    onChange([
      ...wares,
      newWare({
        name,
        price: Math.max(0, Math.round(Number(customPrice) || 0)),
        source: customSource,
        meta: isSpell ? spellLevelLabel(customLevel) : '',
        description: customText.trim().slice(0, WARE_TEXT_MAX),
        ...(isSpell ? { spellLevel: customLevel } : {}),
      }),
    ]);
    setCustomName('');
    setCustomText('');
  }

  function setPrice(id, value) {
    onChange(wares.map((w) => (w.id === id ? { ...w, price: Math.max(0, Math.round(Number(value) || 0)) } : w)));
  }

  const customForm = (
    <div className="chest-add-panel" role={fromCompendium ? 'tabpanel' : undefined} aria-label={`Your own ${role.thing}`}>
      <label className="field-label">{role.thing[0].toUpperCase() + role.thing.slice(1)} name</label>
      <input
        className="field"
        maxLength={80}
        placeholder={full ? 'The shop is full' : role.key === 'maps' ? 'e.g. Map of the Sunken Road' : 'e.g. Something only this shop sells'}
        value={customName}
        onChange={(e) => setCustomName(e.target.value)}
        disabled={full}
      />
      <div className="field-row">
        <div>
          <label className="field-label">Price (gp)</label>
          <input type="number" className="field" min={0} step={1} value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} disabled={full} />
        </div>
        {customSource === 'spells' && (
          <div>
            <label className="field-label">Spell level</label>
            <select className="field" value={customLevel} onChange={(e) => setCustomLevel(Number(e.target.value))} disabled={full}>
              {SPELL_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {spellLevelLabel(lvl)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <label className="field-label">{role.key === 'maps' ? 'What the map shows' : 'Description'}</label>
      <textarea
        className="field"
        rows={3}
        style={{ resize: 'vertical' }}
        maxLength={WARE_TEXT_MAX}
        placeholder={role.key === 'maps' ? 'Where it leads, what is marked on it, what it leaves out…' : 'What the buyer is told about it'}
        value={customText}
        onChange={(e) => setCustomText(e.target.value)}
        disabled={full}
      />
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: 4 }}
        disabled={full || !customName.trim()}
        title={full ? 'The shop is full' : !customName.trim() ? 'Give it a name first' : 'Put this on the shelves'}
        onClick={addCustom}
      >
        + Add {role.thing}
      </button>
    </div>
  );

  return (
    <div className="chest-editor shop-editor">
      <div className="chest-capacity">
        {wares.length === 0 ? 'Nothing on the shelves yet' : `${wares.length} on the shelves`} (room for {MAX_SHOP_WARES}). A shop never runs out of what it sells.
      </div>

      {wares.length > 0 && (
        <div className="chest-item-list shop-ware-list">
          {wares.map((ware) => (
            <div className="chest-item-row shop-ware-row" key={ware.id}>
              <div className="chest-item-info">
                <span className="chest-item-name">{ware.name}</span>
                <span className="chest-item-meta">{[role.sources.length > 1 ? WARE_SOURCES[ware.source]?.label : '', ware.meta].filter(Boolean).join(' · ')}</span>
              </div>
              <label className="shop-price-field" title="What the shop charges, in gold pieces">
                <input type="number" className="field chest-item-qty" min={0} step={1} value={ware.price} aria-label={`Price of ${ware.name}, in gold`} onChange={(e) => setPrice(ware.id, e.target.value)} />
                <span>gp</span>
              </label>
              <button type="button" className="btn btn-danger btn-sm" aria-label={`Take ${ware.name} off the shelves`} onClick={() => onChange(wares.filter((w) => w.id !== ware.id))}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {!fromCompendium && customForm}

      {fromCompendium && (
        <>
          <div className="dm-seg chest-add-tabs" role="tablist" aria-label="Add to the shop">
            <button type="button" role="tab" aria-selected={tab === 'compendium'} className={tab === 'compendium' ? 'on' : ''} onClick={() => setTab('compendium')}>
              From the compendium
            </button>
            <button type="button" role="tab" aria-selected={tab === 'custom'} className={tab === 'custom' ? 'on' : ''} onClick={() => setTab('custom')}>
              Your own {role.thing}
            </button>
          </div>

          {tab === 'compendium' && (
            <div className="chest-add-panel" role="tabpanel" aria-label="From the compendium">
              {role.sources.length > 1 && (
                <div className="shop-source-chips" role="group" aria-label="Which chapter">
                  {role.sources.map((key) => (
                    <button key={key} type="button" className={`tool-btn${source === key ? ' active' : ''}`} aria-pressed={source === key} onClick={() => setSource(key)}>
                      {WARE_SOURCES[key].label}
                    </button>
                  ))}
                </div>
              )}
              <div className="shop-search-row">
                <input
                  className="field"
                  placeholder={full ? 'The shop is full' : `Search ${WARE_SOURCES[source].label.toLowerCase()}…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={full}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={full || unstocked.length === 0}
                  title={`Stock ${RANDOM_BATCH} ${WARE_SOURCES[source].label.toLowerCase()} picked at random`}
                  onClick={addRandom}
                >
                  + {RANDOM_BATCH} at random
                </button>
              </div>
              <div className="chest-search-results">
                {matches.slice(0, BROWSE_LIMIT).map((entry, i) => {
                  const ware = wareFromEntry(source, entry);
                  const has = stocked.has(`${source}/${entry.name}`);
                  return (
                    <div className="chest-search-row" key={`${entry.name}-${i}`}>
                      <span className="chest-item-name">{entry.name}</span>
                      <span className="chest-item-meta">
                        {ware.meta ? `${ware.meta} · ` : ''}
                        {ware.price} gp
                      </span>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={full || has} onClick={() => addEntry(entry)}>
                        {has ? 'Stocked' : '+ Add'}
                      </button>
                    </div>
                  );
                })}
                {matches.length === 0 && <p className="shop-empty">Nothing by that name.</p>}
                {matches.length > BROWSE_LIMIT && (
                  <p className="shop-empty">
                    Showing {BROWSE_LIMIT} of {matches.length}. Search to narrow it down.
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === 'custom' && customForm}
        </>
      )}
    </div>
  );
}

// The Shop section of a shopkeeper's card (data/merchants.js).
//
// The DM picks a hero as the customer, then sells (the hero pays the ware's
// price in gold) or gives (free), and can restock the shelves in place. A
// player buys into a hero of their own: a purchase only ever changes that
// hero's Bag, Spells and gold, which its player may already write (GameView's
// isHeroOwnerSheetPatch), and never the shop.
//
// A shopkeeper that makes what it sells (`role.makes`: the Potion Brewer, the
// Food Salesman) also shows each ware's recipe, and Brew or Make makes it
// from the customer's own ingredients for no gold: the same kind of write as
// a purchase, since only that hero's Bag changes.
//
// `heroes` is every hero at the table (GameView's `heroes`); `onUpdate` is
// GameView's updateEntity.
export function ShopTab({ entity, isHost, meId, heroes, customAssets, onUpdate }) {
  const catalog = useCatalog();
  const role = merchantRole(entity);
  const wares = shopWares(entity);
  const [stocking, setStocking] = useState(false);
  const [heroId, setHeroId] = useState('');
  const [openId, setOpenId] = useState(null);
  const [feedback, setFeedback] = useState(null); // { id, text }

  const customers = isHost ? heroes || [] : (heroes || []).filter((h) => h.ownerId === meId);
  const hero = customers.find((h) => h.id === heroId) || customers[0] || null;
  const sheet = hero ? hero.sheet || defaultCharacterSheet() : null;
  const gold = sheet ? goldOf(sheet) : 0;

  if (!role) return null;

  function say(id, text) {
    setFeedback({ id, text });
    setTimeout(() => setFeedback((f) => (f && f.id === id ? null : f)), 2200);
  }

  function hand(ware, paid) {
    if (!hero) return;
    const description = wareDescription(ware, catalog, customAssets);
    const next = paid ? sheetAfterPurchase(sheet, ware, description) : sheetWithGoods(sheet, wareGoods(ware, description));
    if (!next) return;
    onUpdate(hero.id, { sheet: next });
    const taught = ware.spellLevel != null;
    say(ware.id, isHost ? `${taught ? 'Taught to' : paid ? 'Sold to' : 'Given to'} ${hero.name}` : taught ? 'Written into your Spells' : 'Added to your Bag');
  }

  function make(ware, recipe) {
    if (!hero) return;
    const next = sheetAfterMaking(sheet, ware, recipe, wareDescription(ware, catalog, customAssets));
    if (!next) return;
    onUpdate(hero.id, { sheet: next });
    say(ware.id, isHost ? `${role.makes.done} for ${hero.name}` : `${role.makes.done} and added to your Bag`);
  }

  if (isHost && stocking) {
    return (
      <div className="shop-tab">
        <ShopWaresEditor role={role} wares={wares} customAssets={customAssets} onChange={(next) => onUpdate(entity.id, { shop: { ...entity.shop, wares: next } })} />
        <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 12 }} onClick={() => setStocking(false)}>
          Done stocking
        </button>
      </div>
    );
  }

  return (
    <div className="shop-tab">
      <div className="shop-customer">
        {customers.length > 1 || (isHost && customers.length === 1) ? (
          <label className="shop-customer-pick">
            <span>{isHost ? 'Customer' : 'Buying as'}</span>
            <select className="field" value={hero?.id || ''} onChange={(e) => setHeroId(e.target.value)}>
              {customers.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {isHost && h.ownerName ? ` (${h.ownerName})` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : hero ? (
          <span className="shop-customer-pick">
            <span>Buying as</span>
            <b>{hero.name}</b>
          </span>
        ) : (
          <span className="shop-note">{isHost ? 'No heroes on the map yet, so there is nobody to sell to.' : 'You need a hero of your own to buy here. Ask your DM to pick you under “played by”.'}</span>
        )}
        {hero && (
          <span className="shop-gold" title={`${hero.name}’s gold`}>
            {gold} gp
          </span>
        )}
      </div>

      {wares.length === 0 && <p className="shop-note">{isHost ? 'The shelves are empty. Stock the shop below.' : 'Nothing for sale just now.'}</p>}
      {role.makes && wares.length > 0 && <p className="shop-note">Bring everything in a recipe and the {role.name} makes it for no gold.</p>}

      <div className="shop-ware-list">
        {wares.map((ware) => {
          const price = warePrice(ware);
          const description = wareDescription(ware, catalog, customAssets);
          const known = sheet ? knowsSpell(sheet, wareGoods(ware, '')) : false;
          const short = gold < price;
          const open = openId === ware.id;
          const recipe = role.makes ? wareRecipe(ware, catalog, customAssets) : [];
          const canMake = sheet ? hasIngredients(sheet, recipe) : false;
          return (
            <div className="shop-ware" key={ware.id}>
              <div className="shop-ware-head">
                <button
                  type="button"
                  className="shop-ware-name"
                  aria-expanded={description ? open : undefined}
                  disabled={!description}
                  title={description ? (open ? 'Hide the description' : 'Read the description') : undefined}
                  onClick={() => setOpenId(open ? null : ware.id)}
                >
                  <span className="chest-item-name">{ware.name}</span>
                  <span className="chest-item-meta">{[role.sources.length > 1 ? WARE_SOURCES[ware.source]?.label : '', ware.meta].filter(Boolean).join(' · ')}</span>
                </button>
                <span className="shop-ware-price">{price === 0 ? 'Free' : `${price} gp`}</span>
                <span className="shop-ware-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!hero || known || short}
                    title={!hero ? 'Nobody to sell to' : known ? `${hero.name} already knows this spell` : short ? `${hero.name} has only ${gold} gp` : `${hero.name} pays ${price} gp`}
                    onClick={() => hand(ware, true)}
                  >
                    {known ? 'Known' : isHost ? 'Sell' : 'Buy'}
                  </button>
                  {isHost && (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!hero || known} title={hero ? `Hand it to ${hero.name} for nothing` : 'Nobody to give it to'} onClick={() => hand(ware, false)}>
                      Give
                    </button>
                  )}
                </span>
              </div>
              {recipe.length > 0 && (
                <div className="shop-recipe">
                  <span className="shop-recipe-parts">
                    <span className="shop-recipe-label">Recipe</span>
                    {recipe.map((part) => {
                      const held = sheet ? bagCount(sheet, part.name) : 0;
                      const enough = Boolean(hero) && held >= part.qty;
                      return (
                        <span key={part.name} className={`shop-recipe-part${enough ? ' have' : ''}`} title={hero ? `${hero.name} has ${held}` : undefined}>
                          {enough ? '✓ ' : ''}
                          {part.qty} × {part.name}
                        </span>
                      );
                    })}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={!canMake}
                    title={!hero ? 'Nobody to make it for' : canMake ? `Made from ${hero.name}’s ingredients, for no gold` : `${hero.name} doesn’t carry everything in the recipe`}
                    onClick={() => make(ware, recipe)}
                  >
                    {role.makes.verb}
                  </button>
                </div>
              )}
              {feedback?.id === ware.id && (
                <span className="shop-feedback" role="status">
                  {feedback.text}
                </span>
              )}
              {open && description && <p className="shop-ware-text">{description}</p>}
            </div>
          );
        })}
      </div>

      {isHost && (
        <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 12 }} onClick={() => setStocking(true)}>
          Stock the shop
        </button>
      )}
    </div>
  );
}
