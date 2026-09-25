import React, { useRef, useState } from 'react';
import ModalIcon from './ModalIcon.jsx';
import { DEFAULT_HEROES, makeIconDataUrl } from '../data/defaultTokens.js';
import { resizeImageToDataUrl } from '../utils/image.js';
import { CHEST_SIZES } from '../data/chests.js';
import ChestContentsEditor from './ChestContentsEditor.jsx';
import { emptyTrapDraft, parseTrapNumber, normalizeDice, clampTrapSize, MAX_TRAP_SIZE, DAMAGE_TYPES } from '../data/traps.js';
import { tokenSizesUpTo } from '../data/tokenSizes.js';
import DiceInput from './DiceInput.jsx';

const TOKEN_IMAGE_MAX_DIM = 256; // tokens render small; no need to keep a multi-megapixel upload

// One captioned block of the sidebar (Default heroes / Default monsters /
// Placeable / Add your own image). Always open — the palette is short enough
// to read at a glance, so there is nothing to fold away.
function SidebarSection({ title, children }) {
  return (
    <section className="sidebar-block">
      <div className="cap">{title}</div>
      {children}
    </section>
  );
}

// A token card is one button: the whole tile places the token on the map.
function TokenCard({ name, imageUrl, shape, onPlace }) {
  return (
    <button type="button" className={`token-card ${shape}`} aria-label={`Place ${name}`} onClick={onPlace}>
      <img src={imageUrl} alt="" />
      <span>{name}</span>
    </button>
  );
}

export default function TokenSidebar({ onAddEntity, layers, layerOrder, currentLayerId, isHost, customAssets, collapsed, onToggleCollapsed }) {
  const fileInputRef = useRef(null);
  const [pendingKind, setPendingKind] = useState('hero');
  const otherLayerIds = (layerOrder || []).filter((id) => id !== currentLayerId);
  const [placeableKind, setPlaceableKind] = useState('door');
  const [doorName, setDoorName] = useState('Door');
  const [doorTarget, setDoorTarget] = useState('');
  const [chestName, setChestName] = useState('Chest');
  const [chestSize, setChestSize] = useState('small');
  const [showChestModal, setShowChestModal] = useState(false);
  const [pendingChestItems, setPendingChestItems] = useState([]);
  const [showTrapModal, setShowTrapModal] = useState(false);
  const [trapDraft, setTrapDraft] = useState(emptyTrapDraft);

  if (collapsed) {
    return (
      <div className="panel collapsed">
        <div className="panel-header">
          <button className="panel-collapse-btn" onClick={onToggleCollapsed} title="Expand tokens panel">
            »
          </button>
        </div>
      </div>
    );
  }

  // Placing tokens (heroes, monsters, doors, chests, traps) is DM-only — a player
  // only moves their own hero, opens doors, and opens chests (see
  // GameView.jsx's canMoveEntity/canUpdateEntity, and PITFALLS.md #1).
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
  }

  function openChestModal() {
    setPendingChestItems([]);
    setShowChestModal(true);
  }

  function confirmPlaceChest() {
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
        color: pendingKind === 'mob' ? '#762f2f' : '#4c7a86',
        maxHp: pendingKind === 'mob' ? 15 : 20,
      });
    } catch (err) {
      alert('Could not read that image — try a different file.');
    }
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
        <SidebarSection title="Default heroes">
          <div className="token-grid">
            {DEFAULT_HEROES.map((h) => (
              <TokenCard
                key={h.key}
                name={h.name}
                imageUrl={h.imageUrl}
                shape="round"
                onPlace={() => onAddEntity({ kind: 'hero', name: h.name, imageUrl: h.imageUrl, color: h.color, maxHp: 20 })}
              />
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="Placeable">
          <div className="side-btn-row">
            <button className={`side-btn${placeableKind === 'door' ? ' active' : ''}`} aria-pressed={placeableKind === 'door'} onClick={() => setPlaceableKind('door')}>
              Door
            </button>
            <button className={`side-btn${placeableKind === 'chest' ? ' active' : ''}`} aria-pressed={placeableKind === 'chest'} onClick={() => setPlaceableKind('chest')}>
              Chest
            </button>
            <button className={`side-btn${placeableKind === 'trap' ? ' active' : ''}`} aria-pressed={placeableKind === 'trap'} onClick={() => setPlaceableKind('trap')}>
              Trap
            </button>
          </div>

          {placeableKind === 'door' &&
            (otherLayerIds.length === 0 ? (
              <p className="footer-note" style={{ border: 'none', padding: '4px 0' }}>
                Create another layer first to link a door to it.
              </p>
            ) : (
              <>
                <label className="field-label">Door name</label>
                <input className="field" value={doorName} onChange={(e) => setDoorName(e.target.value)} />

                <label className="field-label" style={{ marginTop: 8 }}>Leads to</label>
                <select className="field" value={doorTarget} onChange={(e) => setDoorTarget(e.target.value)}>
                  <option value="">Choose a layer…</option>
                  {otherLayerIds.map((id) => (
                    <option key={id} value={id}>
                      {layers?.[id]?.name || 'Untitled layer'}
                    </option>
                  ))}
                </select>

                <button className="btn btn-secondary btn-block" style={{ marginTop: 8 }} disabled={!doorTarget} onClick={placeDoor}>
                  Place door
                </button>
              </>
            ))}

          {placeableKind === 'chest' && (
            <>
              <label className="field-label">Chest name</label>
              <input className="field" value={chestName} onChange={(e) => setChestName(e.target.value)} />

              <label className="field-label" style={{ marginTop: 8 }}>Size</label>
              <select className="field" value={chestSize} onChange={(e) => setChestSize(e.target.value)}>
                {CHEST_SIZES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label} ({s.slots} slot{s.slots === 1 ? '' : 's'})
                  </option>
                ))}
              </select>

              <button className="btn btn-secondary btn-block" style={{ marginTop: 8 }} onClick={openChestModal}>
                Configure &amp; place chest
              </button>
            </>
          )}

          {placeableKind === 'trap' && (
            <>
              <p className="footer-note" style={{ border: 'none', padding: '4px 0' }}>
                Traps are hidden from players until you tick &ldquo;Reveal trap&rdquo; on the trap&rsquo;s inspector.
              </p>
              <button className="btn btn-secondary btn-block" style={{ marginTop: 8 }} onClick={openTrapModal}>
                Configure &amp; place trap
              </button>
            </>
          )}
        </SidebarSection>

        <SidebarSection title="Add your own image">
          <div className="side-btn-row two">
            <button type="button" className={`side-btn${pendingKind === 'hero' ? ' active' : ''}`} aria-pressed={pendingKind === 'hero'} onClick={() => setPendingKind('hero')}>
              Hero
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
        </SidebarSection>
      </div>

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

      {showChestModal && (
        <div className="book-backdrop" onClick={() => setShowChestModal(false)}>
          <div className="book-card" style={{ background: 'linear-gradient(180deg, var(--ink-900), var(--ink-800))' }} onClick={(e) => e.stopPropagation()}>
            <div className="book-card-header">
              <span className="book-title">
                <ModalIcon name="box" />Configure {CHEST_SIZES.find((s) => s.key === chestSize)?.label} Chest
              </span>
              <button className="popover-close" onClick={() => setShowChestModal(false)} aria-label="Close" title="Close">
                ×
              </button>
            </div>
            <div style={{ padding: 16, flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <ChestContentsEditor
                items={pendingChestItems}
                capacity={CHEST_SIZES.find((s) => s.key === chestSize)?.slots ?? 1}
                onAddItem={(item) => setPendingChestItems((prev) => [...prev, item])}
                onRemoveItem={(id) => setPendingChestItems((prev) => prev.filter((it) => it.id !== id))}
                onUpdateQty={(id, qty) => setPendingChestItems((prev) => prev.map((it) => (it.id === id ? { ...it, qty } : it)))}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowChestModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmPlaceChest}>
                  Place chest
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
