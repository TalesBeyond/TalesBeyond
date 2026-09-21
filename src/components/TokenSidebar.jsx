import React, { useRef, useState } from 'react';
import { DEFAULT_HEROES, DEFAULT_MOBS, makeIconDataUrl } from '../data/defaultTokens.js';
import { resizeImageToDataUrl } from '../utils/image.js';
import { CHEST_SIZES } from '../data/chests.js';
import ChestContentsEditor from './ChestContentsEditor.jsx';
import { emptyTrapDraft, parseTrapNumber, normalizeDice, clampTrapSize, MAX_TRAP_SIZE, DAMAGE_TYPES } from '../data/traps.js';
import { tokenSizesUpTo } from '../data/tokenSizes.js';
import DiceInput from './DiceInput.jsx';

const TOKEN_IMAGE_MAX_DIM = 256; // tokens render small; no need to keep a multi-megapixel upload

// An expand/collapse wrapper for one block of the sidebar (Add your own
// image / Default heroes / Default monsters / Doors) — each opens and
// closes independently so a long token gallery doesn't force scrolling
// past sections you don't currently need.
function CollapsibleSection({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sidebar-section">
      <button type="button" className="sidebar-section-header" onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span className="sidebar-section-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="sidebar-section-body">{children}</div>}
    </div>
  );
}

export default function TokenSidebar({ onAddEntity, layers, layerOrder, currentLayerId, isHost, collapsed, onToggleCollapsed }) {
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
        <button className="panel-collapse-btn" onClick={onToggleCollapsed} title="Collapse tokens panel">
          «
        </button>
      </div>
      <div className="panel-scroll">
        <CollapsibleSection title="Add your own image">
          <div className="two-col" style={{ marginBottom: 10 }}>
            <button
              className={`tool-btn ${pendingKind === 'hero' ? 'active' : ''}`}
              onClick={() => setPendingKind('hero')}
            >
              Hero
            </button>
            <button
              className={`tool-btn ${pendingKind === 'mob' ? 'active' : ''}`}
              onClick={() => setPendingKind('mob')}
            >
              Monster
            </button>
          </div>
          <button className="upload-drop btn-block" onClick={() => fileInputRef.current?.click()} style={{ border: '1px dashed var(--ink-700)', background: 'transparent', color: 'var(--parchment-300)', width: '100%' }}>
            Upload image &amp; place on map
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChosen} />
        </CollapsibleSection>

        <CollapsibleSection title="Default heroes">
          <div className="token-grid">
            {DEFAULT_HEROES.map((h) => (
              <div className="token-card" key={h.key}>
                <img src={h.imageUrl} alt={h.name} />
                <span>{h.name}</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    onAddEntity({ kind: 'hero', name: h.name, imageUrl: h.imageUrl, color: h.color, maxHp: 20 })
                  }
                >
                  Place
                </button>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Default monsters">
          <div className="token-grid">
            {DEFAULT_MOBS.map((m) => (
              <div className="token-card" key={m.key}>
                <img src={m.imageUrl} alt={m.name} />
                <span>{m.name}</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    onAddEntity({ kind: 'mob', name: m.name, imageUrl: m.imageUrl, color: m.color, maxHp: 15, mobKey: m.key })
                  }
                >
                  Place
                </button>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Placeable">
          <div className="two-col" style={{ marginBottom: 10, gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <button className={`tool-btn ${placeableKind === 'door' ? 'active' : ''}`} onClick={() => setPlaceableKind('door')}>
              Door
            </button>
            <button className={`tool-btn ${placeableKind === 'chest' ? 'active' : ''}`} onClick={() => setPlaceableKind('chest')}>
              Chest
            </button>
            <button className={`tool-btn ${placeableKind === 'trap' ? 'active' : ''}`} onClick={() => setPlaceableKind('trap')}>
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
        </CollapsibleSection>
      </div>

      {showTrapModal && (
        <div className="book-backdrop" onClick={() => setShowTrapModal(false)}>
          <div className="book-card" style={{ background: 'linear-gradient(180deg, var(--ink-900), var(--ink-800))' }} onClick={(e) => e.stopPropagation()}>
            <div className="book-card-header">
              <span className="book-title">&#9888;&#65039; Configure Trap</span>
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
                📦 Configure {CHEST_SIZES.find((s) => s.key === chestSize)?.label} Chest
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
