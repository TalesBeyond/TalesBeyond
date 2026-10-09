import React, { useRef, useState } from 'react';
import ModalIcon from './ModalIcon.jsx';
import { Hint } from './Hints.jsx';
import { DEFAULT_HEROES, makeIconDataUrl } from '../data/defaultTokens.js';
import { SPRITE_HEROES, spriteForUrl } from '../data/spriteTokens.js';
import { resizeImageToDataUrl } from '../utils/image.js';
import { CHEST_SIZES } from '../data/chests.js';
import ChestContentsEditor from './ChestContentsEditor.jsx';
import AmbushMonstersEditor from './AmbushMonstersEditor.jsx';
import { AMBUSH_ICON, AMBUSH_COLOR, clampAmbushQty } from '../data/ambush.js';
import { NPC_ICON, NPC_COLOR, NPC_MAX_HP } from '../data/tokenKinds.js';
import { MERCHANTS } from '../data/merchants.js';
import { ShopWaresEditor } from './MerchantShop.jsx';
import { emptyTrapDraft, parseTrapNumber, normalizeDice, clampTrapSize, MAX_TRAP_SIZE, DAMAGE_TYPES } from '../data/traps.js';
import { tokenSizesUpTo } from '../data/tokenSizes.js';
import DiceInput from './DiceInput.jsx';
import { emitFx } from '../lib/fx.js';

const TOKEN_IMAGE_MAX_DIM = 256; // tokens render small; no need to keep a multi-megapixel upload

// One captioned block of the sidebar (Default heroes / Default monsters /
// Placeable / Add your own image). Always open — the palette is short enough
// to read at a glance, so there is nothing to fold away.
function SidebarSection({ title, tour, children }) {
  return (
    <section className="sidebar-block" data-tour={tour}>
      <div className="cap">{title}</div>
      {children}
    </section>
  );
}

// A token card is one button: the whole tile places the token on the map,
// or opens what has to be set up first (a shopkeeper's shelves, a
// placeable's modal), which `label` then says. An animated token
// (data/spriteTokens.js) plays its frames while the pointer is over its tile.
function TokenCard({ name, imageUrl, shape, onPlace, label = `Place ${name}`, title }) {
  const sprite = spriteForUrl(imageUrl);
  return (
    <button type="button" className={`token-card ${shape}`} aria-label={label} title={title} onClick={onPlace}>
      {sprite ? (
        <span className="sprite" style={{ backgroundImage: `url(${sprite.sheet})`, '--sprite-frames': sprite.frames }} aria-hidden="true" />
      ) : (
        <img src={imageUrl} alt="" />
      )}
      <span>{name}</span>
    </button>
  );
}

export default function TokenSidebar({ onAddEntity, onCreateLayer, layers, layerOrder, currentLayerId, isHost, customAssets, collapsed, onToggleCollapsed, layout = 'panel' }) {
  const fileInputRef = useRef(null);
  const [pendingKind, setPendingKind] = useState('hero');
  const otherLayerIds = (layerOrder || []).filter((id) => id !== currentLayerId);
  const [showDoorModal, setShowDoorModal] = useState(false);
  const [doorName, setDoorName] = useState('Door');
  const [doorTarget, setDoorTarget] = useState('');
  const [chestName, setChestName] = useState('Chest');
  const [chestSize, setChestSize] = useState('small');
  const [showChestModal, setShowChestModal] = useState(false);
  const [pendingChestItems, setPendingChestItems] = useState([]);
  // A custom item typed into the chest modal but not added yet (ChestContentsEditor).
  const [pendingCustomItem, setPendingCustomItem] = useState('');
  const [showTrapModal, setShowTrapModal] = useState(false);
  const [trapDraft, setTrapDraft] = useState(emptyTrapDraft);
  const [ambushName, setAmbushName] = useState('Ambush');
  const [showAmbushModal, setShowAmbushModal] = useState(false);
  const [pendingAmbushMonsters, setPendingAmbushMonsters] = useState([]);
  // The shopkeeper being stocked before it is placed (data/merchants.js), or
  // null: { role, name, wares }.
  const [merchantDraft, setMerchantDraft] = useState(null);
  // A ware typed into that modal but not added yet (ShopWaresEditor).
  const [pendingWare, setPendingWare] = useState('');
  const customMonsters = Object.values(customAssets || {})
    .filter((item) => item.assetType === 'monster')
    .map((item) => ({ id: item.id, ...item.data }));
  const [phoneTab, setPhoneTab] = useState('heroes');
  // A door needs a second map: the hint's "Create a layer" opens this form
  // right here, and the door form then picks the new map.
  const [newMapOpen, setNewMapOpen] = useState(false);
  const [newMapName, setNewMapName] = useState('');
  const [madeLayerId, setMadeLayerId] = useState(null);

  if (collapsed) {
    return (
      <div className="panel collapsed">
        <button type="button" className="panel-rail" onClick={onToggleCollapsed} title="Expand tokens panel">
          <span className="panel-rail-chevron" aria-hidden="true">»</span>
          <span className="panel-rail-label">Tokens</span>
        </button>
      </div>
    );
  }

  // Placing tokens (heroes, NPCs, monsters, doors, chests, traps) is DM-only — a player
  // only moves their own hero, opens doors, and opens chests (see
  // GameView.jsx's canMoveEntity/canUpdateEntity, and PITFALLS.md #1).
  // GameView doesn't show this panel to players at all; this is a fallback.
  if (!isHost) {
    return (
      <div className="panel">
        <div className="panel-header">
          <span>Tokens</span>
          <button className="panel-collapse-btn" onClick={onToggleCollapsed} title="Collapse tokens panel">
            «
          </button>
        </div>
        <div className="panel-scroll">
          <div className="empty-state">Only the DM can add tokens to the map.</div>
        </div>
      </div>
    );
  }

  function placeDoor() {
    if (!doorTarget) return;
    onAddEntity({
      kind: 'door',
      name: doorName.trim() || 'Door',
      imageUrl: makeIconDataUrl('door', '#5c4a2e'),
      color: '#5c4a2e',
      targetLayerId: doorTarget,
    });
    setShowDoorModal(false);
  }

  function openDoorModal() {
    setNewMapOpen(false);
    // A world picked last time may have been deleted since.
    if (doorTarget && !otherLayerIds.includes(doorTarget)) setDoorTarget('');
    setShowDoorModal(true);
  }

  function openChestModal() {
    setPendingChestItems([]);
    setPendingCustomItem('');
    setShowChestModal(true);
  }

  // The size can be changed in the modal after items went in: a chest that
  // holds more than its new size has room for can't be placed as it is.
  const chestCapacity = CHEST_SIZES.find((s) => s.key === chestSize)?.slots ?? 1;
  const chestOverfull = pendingChestItems.length > chestCapacity;

  function confirmPlaceChest() {
    if (pendingCustomItem || chestOverfull) return;
    onAddEntity({
      kind: 'chest',
      name: chestName.trim() || 'Chest',
      imageUrl: makeIconDataUrl('chest', '#c98a3b'),
      color: '#c98a3b',
      chestSize,
      items: pendingChestItems,
    });
    setShowChestModal(false);
  }

  // An NPC (data/tokenKinds.js): a character the DM runs, with a hero's
  // sheet. Placed from a tile like a hero's, in grey; it is named on its card.
  const npcImage = makeIconDataUrl(NPC_ICON, NPC_COLOR);
  function placeNpc() {
    onAddEntity({ kind: 'npc', name: 'NPC', imageUrl: npcImage, color: NPC_COLOR, maxHp: NPC_MAX_HP });
  }

  // A shopkeeper is an NPC with a shop: its tile opens the shelves to stock
  // first, the way a chest's does.
  function openMerchantModal(role) {
    setPendingWare('');
    setMerchantDraft({ role, name: role.name, wares: [] });
  }

  function confirmPlaceMerchant() {
    if (!merchantDraft || pendingWare) return;
    const { role, name, wares } = merchantDraft;
    onAddEntity({
      kind: 'npc',
      name: name.trim() || role.name,
      imageUrl: makeIconDataUrl(role.icon, role.color),
      color: role.color,
      maxHp: NPC_MAX_HP,
      shop: { role: role.key, wares },
    });
    setMerchantDraft(null);
  }

  function openAmbushModal() {
    setPendingAmbushMonsters([]);
    setShowAmbushModal(true);
  }

  function confirmPlaceAmbush() {
    onAddEntity({
      kind: 'ambush',
      name: ambushName.trim() || 'Ambush',
      imageUrl: makeIconDataUrl(AMBUSH_ICON, AMBUSH_COLOR),
      color: AMBUSH_COLOR,
      ambushMonsters: pendingAmbushMonsters,
    });
    setShowAmbushModal(false);
  }

  function openTrapModal() {
    setTrapDraft(emptyTrapDraft());
    setShowTrapModal(true);
  }

  function confirmPlaceTrap() {
    onAddEntity({
      kind: 'trap',
      name: trapDraft.name.trim() || 'Trap',
      imageUrl: makeIconDataUrl('trap', '#8f1f1f'),
      color: '#8f1f1f',
      size: clampTrapSize(trapDraft.size),
      trapDescription: trapDraft.description,
      trapSave: trapDraft.saveNumber,
      trapFail: trapDraft.failNumber,
      trapDice: normalizeDice(trapDraft.dice),
      trapDamage: trapDraft.damage.trim(),
      trapDamageType: trapDraft.damageType,
    });
    setShowTrapModal(false);
  }

  function setTrapField(patch) {
    setTrapDraft((prev) => ({ ...prev, ...patch }));
  }

  async function handleFileChosen(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const imageUrl = await resizeImageToDataUrl(file, TOKEN_IMAGE_MAX_DIM);
      onAddEntity({
        kind: pendingKind,
        name: file.name.replace(/\.[^/.]+$/, '').slice(0, 24) || 'New token',
        imageUrl,
        color: pendingKind === 'mob' ? '#762f2f' : pendingKind === 'npc' ? NPC_COLOR : '#4c7a86',
        maxHp: pendingKind === 'mob' ? 15 : 20,
      });
    } catch (err) {
      alert('Could not read that image — try a different file.');
    }
  }

  const heroesBody = (
          <div className="token-grid">
            {[...DEFAULT_HEROES, ...SPRITE_HEROES].map((h) => (
              <TokenCard
                key={h.key}
                name={h.name}
                imageUrl={h.imageUrl}
                shape="round"
                onPlace={() => onAddEntity({ kind: 'hero', name: h.name, imageUrl: h.imageUrl, color: h.color, maxHp: 20 })}
              />
            ))}
          </div>
  );
  const npcBody = (
    <>
      <div className="token-grid">
        <TokenCard name="NPC" imageUrl={npcImage} shape="round" onPlace={placeNpc} />
      </div>
      <div className="sidebar-sublabel">Shopkeepers</div>
      <div className="token-grid merchants">
        {MERCHANTS.map((role) => (
          <TokenCard
            key={role.key}
            name={role.name}
            imageUrl={makeIconDataUrl(role.icon, role.color)}
            shape="round"
            label={`Stock and place a ${role.name}`}
            title={role.blurb}
            onPlace={() => openMerchantModal(role)}
          />
        ))}
      </div>
    </>
  );
  // A placeable is set up before it goes on the map, so each tile opens its
  // own modal: where a door leads, what a chest holds, a trap's save and
  // damage, an ambush's monsters.
  const placeableBody = (
    <div className="token-grid placeables">
      <TokenCard name="Door" imageUrl={makeIconDataUrl('door', '#5c4a2e')} shape="square" label="Configure and place a door" title="A way through to another world" onPlace={openDoorModal} />
      <TokenCard name="Chest" imageUrl={makeIconDataUrl('chest', '#c98a3b')} shape="square" label="Configure and place a chest" title="Loot for players to open and take" onPlace={openChestModal} />
      <TokenCard name="Trap" imageUrl={makeIconDataUrl('trap', '#8f1f1f')} shape="square" label="Configure and place a trap" title="Hidden from players until you reveal it" onPlace={openTrapModal} />
      <TokenCard name="Ambush" imageUrl={makeIconDataUrl(AMBUSH_ICON, AMBUSH_COLOR)} shape="square" label="Configure and place an ambush" title="A hidden band of monsters, revealed all at once" onPlace={openAmbushModal} />
    </div>
  );
  // What the door modal holds: with no second world to lead to yet, the way
  // to make one; otherwise the door's name and where it goes.
  const doorFormEl =
    otherLayerIds.length === 0 ? (
      newMapOpen ? (
        <form
          className="hint-form"
          onSubmit={(e) => {
            e.preventDefault();
            const id = onCreateLayer?.({ name: newMapName, cols: 20, rows: 15 });
            if (id) {
              setMadeLayerId(id);
              setDoorTarget(id);
            }
            setNewMapOpen(false);
            setNewMapName('');
          }}
        >
          <label className="field-label" style={{ marginTop: 0 }}>
            New world name
            <input className="field" autoFocus value={newMapName} placeholder="e.g. The Undercroft" onChange={(e) => setNewMapName(e.target.value)} />
          </label>
          <div className="hint-form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setNewMapOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create world
            </button>
          </div>
          <p className="hint-form-note">It starts with one 20 × 15 map. You stay in this world.</p>
        </form>
      ) : (
        <>
          <Hint action={onCreateLayer ? (layout === 'phone' ? 'Create a world' : 'Create a layer') : null} onAction={() => setNewMapOpen(true)}>
            Doors connect two worlds. This table has only <b>{layers?.[currentLayerId]?.name || 'this world'}</b> so far.{' '}
            {layout === 'phone' ? (
              <>Add a second world now, or later from the <b>worlds</b> button at the top.</>
            ) : (
              <>
                Add a second world here, or later in <b>Mapping → Layers</b>.
              </>
            )}
          </Hint>
          <div className="chest-modal-actions">
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowDoorModal(false)}>
              Cancel
            </button>
          </div>
        </>
      )
    ) : (
      <>
        {madeLayerId && layers?.[madeLayerId] && (
          <p role="status" className="hint-done">
            ✓ <b>{layers[madeLayerId].name}</b> is ready.
          </p>
        )}
        <label className="field-label">Door name</label>
        <input className="field" value={doorName} onChange={(e) => setDoorName(e.target.value)} autoFocus />

        <label className="field-label" style={{ marginTop: 8 }}>Leads to</label>
        <select className="field" value={doorTarget} onChange={(e) => setDoorTarget(e.target.value)}>
          <option value="">Choose a layer…</option>
          {otherLayerIds.map((id) => (
            <option key={id} value={id}>
              {layers?.[id]?.name || 'Untitled layer'}
            </option>
          ))}
        </select>

        {!doorTarget && <Hint className="hint-tight">Pick the world this door opens onto. Its partner door appears there.</Hint>}
        {madeLayerId && doorTarget === madeLayerId && (
          <p className="hint-form-note">
            The door lands on the map you’re viewing. Its partner appears on {layers?.[madeLayerId]?.name} — drag both where you want them.
          </p>
        )}
        <div className="chest-modal-actions">
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowDoorModal(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={!doorTarget} title={doorTarget ? undefined : 'Choose where the door leads first'} onClick={placeDoor}>
            Place door
          </button>
        </div>
      </>
    );
  const ownImageBody = (
    <>
          <div className="side-btn-row">
            <button type="button" className={`side-btn${pendingKind === 'hero' ? ' active' : ''}`} aria-pressed={pendingKind === 'hero'} onClick={() => setPendingKind('hero')}>
              Hero
            </button>
            <button type="button" className={`side-btn${pendingKind === 'npc' ? ' active' : ''}`} aria-pressed={pendingKind === 'npc'} onClick={() => setPendingKind('npc')}>
              NPC
            </button>
            <button type="button" className={`side-btn${pendingKind === 'mob' ? ' active' : ''}`} aria-pressed={pendingKind === 'mob'} onClick={() => setPendingKind('mob')}>
              Monster
            </button>
          </div>
          <button type="button" className="add-image-drop" onClick={() => fileInputRef.current?.click()}>
            Add your own image
            <span>PNG or JPG, placed on the map</span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChosen} />
    </>
  );
  const modalsEl = (
    <>
      {showDoorModal && (
        <div className="book-backdrop" onClick={() => setShowDoorModal(false)}>
          <div className="book-card" style={{ background: 'linear-gradient(180deg, var(--ink-900), var(--ink-800))' }} onClick={(e) => e.stopPropagation()}>
            <div className="book-card-header">
              <span className="book-title"><ModalIcon name="door" />Configure Door</span>
              <button className="popover-close" onClick={() => setShowDoorModal(false)} aria-label="Close" title="Close">
                ×
              </button>
            </div>
            <div style={{ padding: 16, flex: 1, minHeight: 0, overflowY: 'auto' }}>{doorFormEl}</div>
          </div>
        </div>
      )}

      {showTrapModal && (
        <div className="book-backdrop" onClick={() => setShowTrapModal(false)}>
          <div className="book-card" style={{ background: 'linear-gradient(180deg, var(--ink-900), var(--ink-800))' }} onClick={(e) => e.stopPropagation()}>
            <div className="book-card-header">
              <span className="book-title"><ModalIcon name="warn" />Configure Trap</span>
              <button className="popover-close" onClick={() => setShowTrapModal(false)} aria-label="Close" title="Close">
                ×
              </button>
            </div>
            <div style={{ padding: 16, flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <p className="shop-modal-blurb">Traps are hidden from players until you tick &ldquo;Reveal trap&rdquo; on the trap&rsquo;s inspector.</p>
              <label className="field-label">Trap name</label>
              <input className="field" value={trapDraft.name} onChange={(e) => setTrapField({ name: e.target.value })} autoFocus />

              <label className="field-label" style={{ marginTop: 10 }}>Description</label>
              <textarea
                className="field"
                rows={3}
                style={{ resize: 'vertical' }}
                placeholder="What the trap is and what triggers it"
                value={trapDraft.description}
                onChange={(e) => setTrapField({ description: e.target.value })}
              />

              <label className="field-label" style={{ marginTop: 10 }}>Token size (squares wide)</label>
              <select className="field" value={trapDraft.size} onChange={(e) => setTrapField({ size: clampTrapSize(e.target.value) })}>
                {tokenSizesUpTo(MAX_TRAP_SIZE).map((s) => (
                  <option key={s.size} value={s.size}>
                    {s.label}
                  </option>
                ))}
              </select>

              <div className="two-col" style={{ marginTop: 10 }}>
                <div>
                  <label className="field-label">Save number</label>
                  <input
                    className="field"
                    type="number"
                    value={trapDraft.saveNumber ?? ''}
                    onChange={(e) => setTrapField({ saveNumber: parseTrapNumber(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="field-label">Fail number</label>
                  <input
                    className="field"
                    type="number"
                    value={trapDraft.failNumber ?? ''}
                    onChange={(e) => setTrapField({ failNumber: parseTrapNumber(e.target.value) })}
                  />
                </div>
              </div>

              <div className="two-col" style={{ marginTop: 10 }}>
                <div>
                  <label className="field-label">Dice to roll</label>
                  <DiceInput value={trapDraft.dice} onChange={(dice) => setTrapField({ dice })} />
                </div>
                <div>
                  <label className="field-label">Damage</label>
                  <input
                    className="field"
                    placeholder="e.g. 2d6"
                    value={trapDraft.damage}
                    onChange={(e) => setTrapField({ damage: e.target.value })}
                  />
                </div>
              </div>

              <label className="field-label" style={{ marginTop: 10 }}>Damage type</label>
              <select className="field" value={trapDraft.damageType} onChange={(e) => setTrapField({ damageType: e.target.value })}>
                {DAMAGE_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>

              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowTrapModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmPlaceTrap}>
                  Place trap
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAmbushModal && (
        <div className="book-backdrop" onClick={() => setShowAmbushModal(false)}>
          <div className="book-card" style={{ background: 'linear-gradient(180deg, var(--ink-900), var(--ink-800))' }} onClick={(e) => e.stopPropagation()}>
            <div className="book-card-header">
              <span className="book-title">
                <ModalIcon name="warn" />Set the ambush
              </span>
              <button className="popover-close" onClick={() => setShowAmbushModal(false)} aria-label="Close" title="Close">
                ×
              </button>
            </div>
            <div style={{ padding: 16, flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <p className="shop-modal-blurb">
                An ambush holds a band of monsters and stays hidden from players. &ldquo;Reveal the ambush&rdquo; on its inspector puts them all around it.
              </p>
              <label className="field-label">Ambush name</label>
              <input className="field" value={ambushName} onChange={(e) => setAmbushName(e.target.value)} />
              <AmbushMonstersEditor
                monsters={pendingAmbushMonsters}
                customMonsters={customMonsters}
                onAdd={(monster) => setPendingAmbushMonsters((prev) => [...prev, monster])}
                onRemove={(id) => setPendingAmbushMonsters((prev) => prev.filter((m) => m.id !== id))}
                onUpdateQty={(id, qty) => setPendingAmbushMonsters((prev) => prev.map((m) => (m.id === id ? { ...m, qty: clampAmbushQty(qty) } : m)))}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAmbushModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmPlaceAmbush}>
                  Place ambush
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {merchantDraft && (
        <div className="book-backdrop" onClick={() => setMerchantDraft(null)}>
          <div className="book-card fit-modal" style={{ background: 'linear-gradient(180deg, var(--ink-900), var(--ink-800))' }} onClick={(e) => e.stopPropagation()}>
            <div className="book-card-header">
              <span className="book-title">
                <ModalIcon name="box" />Stock the {merchantDraft.role.name}
              </span>
              <button className="popover-close" onClick={() => setMerchantDraft(null)} aria-label="Close" title="Close">
                ×
              </button>
            </div>
            <div className="fit-modal-body">
              <p className="shop-modal-blurb">{merchantDraft.role.blurb} Players buy from its card; you can sell, give and restock from there too.</p>
              <label className="field-label">Name</label>
              <input
                className="field"
                maxLength={60}
                value={merchantDraft.name}
                placeholder={merchantDraft.role.name}
                onChange={(e) => setMerchantDraft((prev) => ({ ...prev, name: e.target.value }))}
              />
              <ShopWaresEditor
                role={merchantDraft.role}
                wares={merchantDraft.wares}
                customAssets={customAssets}
                onChange={(wares) => setMerchantDraft((prev) => ({ ...prev, wares }))}
                onPendingCustomChange={setPendingWare}
              />
              <div className="chest-modal-actions">
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setMerchantDraft(null)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={Boolean(pendingWare)}
                  title={pendingWare ? 'Add what you typed first, or clear its name' : undefined}
                  onClick={confirmPlaceMerchant}
                >
                  Place {merchantDraft.role.name}
                </button>
              </div>
              {pendingWare && (
                <p className="chest-modal-pending" role="status">
                  <b>{pendingWare}</b> isn’t on the shelves yet. Press <b>Add {merchantDraft.role.thing}</b>, or clear its name, before placing.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {showChestModal && (
        <div className="book-backdrop" onClick={() => setShowChestModal(false)}>
          <div className="book-card fit-modal" style={{ background: 'linear-gradient(180deg, var(--ink-900), var(--ink-800))' }} onClick={(e) => e.stopPropagation()}>
            <div className="book-card-header">
              <span className="book-title">
                <ModalIcon name="box" />Configure Chest
              </span>
              <button className="popover-close" onClick={() => setShowChestModal(false)} aria-label="Close" title="Close">
                ×
              </button>
            </div>
            <div className="fit-modal-body">
              <div className="field-row">
                <div>
                  <label className="field-label">Chest name</label>
                  <input className="field" value={chestName} onChange={(e) => setChestName(e.target.value)} />
                </div>
                <div>
                  <label className="field-label">Size</label>
                  <select className="field" value={chestSize} onChange={(e) => setChestSize(e.target.value)}>
                    {CHEST_SIZES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label} ({s.slots} slot{s.slots === 1 ? '' : 's'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <ChestContentsEditor
                items={pendingChestItems}
                capacity={chestCapacity}
                onAddItem={(item) => setPendingChestItems((prev) => [...prev, item])}
                onRemoveItem={(id) => setPendingChestItems((prev) => prev.filter((it) => it.id !== id))}
                onUpdateQty={(id, qty) => setPendingChestItems((prev) => prev.map((it) => (it.id === id ? { ...it, qty } : it)))}
                onPendingCustomChange={setPendingCustomItem}
              />
              <div className="chest-modal-actions">
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowChestModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={Boolean(pendingCustomItem) || chestOverfull}
                  title={pendingCustomItem ? 'Add the custom item first, or clear its name' : chestOverfull ? 'Too many items for a chest this size' : undefined}
                  onClick={confirmPlaceChest}
                >
                  Place chest
                </button>
              </div>
              {pendingCustomItem && (
                <p className="chest-modal-pending" role="status">
                  <b>{pendingCustomItem}</b> isn’t in the chest yet. Press <b>Add custom item</b>, or clear its name, before placing the chest.
                </p>
              )}
              {chestOverfull && (
                <p className="chest-modal-pending" role="status">
                  A chest this size holds {chestCapacity}. Take {pendingChestItems.length - chestCapacity} out, or pick a bigger size.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );

  // On a phone the same sections sit behind tabs in the Add sheet; monsters
  // come from the compendium's bestiary and asset storage, opened over lib/fx.js.
  if (layout === 'phone') {
    const tabs = [
      ['heroes', 'Heroes'],
      ['npc', 'NPCs'],
      ['monsters', 'Monsters'],
      ['place', 'Placeables'],
      ['own', 'Your own'],
    ];
    return (
      <div className="phone-add">
        <div className="phone-segment phone-add-tabs" role="tablist" aria-label="What to add">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={phoneTab === key}
              className={phoneTab === key ? 'active' : ''}
              onClick={() => setPhoneTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="phone-add-body sidebar-blocks">
          {phoneTab === 'heroes' && (
            <>
              <p className="phone-caption phone-caption-flush">Tap a hero to place it on the map you’re viewing.</p>
              {heroesBody}
            </>
          )}
          {phoneTab === 'npc' && (
            <>
              <p className="phone-caption phone-caption-flush">Tap the NPC to place it on the map you’re viewing. Name it on its card. A shopkeeper asks what it sells first.</p>
              {npcBody}
            </>
          )}
          {phoneTab === 'monsters' && (
            <>
              <p className="phone-caption phone-caption-flush">Monsters come from the compendium’s bestiary, or from the ones you saved in asset storage.</p>
              <button type="button" className="phone-btn-primary phone-btn-block-primary" onClick={() => emitFx({ type: 'open', panel: 'bestiary' })}>
                Open the bestiary
              </button>
              <button type="button" className="phone-btn-ghost phone-btn-full" onClick={() => emitFx({ type: 'open', panel: 'assetStorage' })}>
                Asset storage
              </button>
            </>
          )}
          {phoneTab === 'place' && (
            <>
              <p className="phone-caption phone-caption-flush">Tap a door, chest, trap or ambush to set it up, then place it on the map you’re viewing.</p>
              {placeableBody}
            </>
          )}
          {phoneTab === 'own' && ownImageBody}
        </div>
        {modalsEl}
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span>Tokens</span>
        <span className="panel-header-note">DM only</span>
        <button className="panel-collapse-btn" onClick={onToggleCollapsed} title="Collapse tokens panel">
          «
        </button>
      </div>
      <div className="panel-scroll sidebar-blocks">
        <SidebarSection title="Default heroes" tour="side-heroes">
          {heroesBody}
        </SidebarSection>

        <SidebarSection title="NPC">{npcBody}</SidebarSection>

        <SidebarSection title="Placeable" tour="side-placeable">
          {placeableBody}
        </SidebarSection>

        <SidebarSection title="Add your own image" tour="side-own">
          {ownImageBody}
        </SidebarSection>
      </div>
      {modalsEl}
    </div>
  );
}
