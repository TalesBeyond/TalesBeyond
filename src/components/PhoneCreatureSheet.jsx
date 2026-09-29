import React, { useState } from 'react';
import { useFx } from '../lib/fx.js';
import { ABILITIES, abilityModifier, formatModifier, defaultCharacterSheet } from '../data/characterSheet.js';
import { CONDITIONS } from '../data/conditions.js';
import { tokenSizesUpTo } from '../data/tokenSizes.js';
import { acOf } from '../utils/combat.js';
import { Editable } from './CreatureCard.jsx';
import DroppablesEditor from './DroppablesEditor.jsx';
import { BattleEquipmentTab, SpellsTab, BagTab, SavesSkillsTab, DmTab } from './RightPanel.jsx';
import { PhoneSheet } from './PhoneChrome.jsx';

// A hero's or monster's card on a phone (MOBILE_DESIGN.md): the numbers a
// turn needs up top — hit points, armor, initiative, speed, conditions, death
// saves — then the sheet in tabs. Permissions are the desktop card's: the DM
// edits everything; a hero's own player edits its attacks, spells and bag;
// everyone else looks. A player sees a monster's name, AC, HP, size and
// conditions only.
export default function PhoneCreatureSheet({ entity, isHost, meId, players, entities, audio, onUpdate, onRemove, onClose }) {
  const isHero = entity.kind === 'hero';
  const isOwner = isHero && !!meId && entity.ownerId === meId;
  const canEdit = isHost;
  const canEditOwnTabs = isHost || isOwner;
  const sheet = (isHero ? entity.sheet : entity.mobSheet) || defaultCharacterSheet();
  const sheetKey = isHero ? 'sheet' : 'mobSheet';
  const showSheet = isHero || isHost;

  const tabs = isHero
    ? [
        { key: 'fight', label: 'Fight' },
        { key: 'magic', label: 'Magic' },
        { key: 'bag', label: 'Bag' },
        { key: 'stats', label: 'Stats' },
        ...(isHost ? [{ key: 'dm', label: 'DM' }] : []),
      ]
    : isHost
      ? [
          { key: 'fight', label: 'Fight' },
          { key: 'loot', label: 'Loot' },
          { key: 'stats', label: 'Stats' },
          { key: 'dm', label: 'DM' },
        ]
      : [];
  const [tab, setTab] = useState('fight');
  // A hint's "Open the Bag" switches to that tab here too.
  useFx((event) => {
    if (event.type === 'cardTab' && tabs.some((t) => t.key === event.key)) setTab(event.key);
  });

  function updateSheet(patch) {
    onUpdate(entity.id, { [sheetKey]: { ...sheet, ...patch } });
  }

  const max = entity.maxHp || 0;
  const hp = entity.hp ?? max;
  const temp = entity.tempHp || 0;
  const pct = max ? Math.max(0, Math.min(1, hp / max)) : 0;
  const conditions = entity.conditions || [];
  const owner = isHero ? players?.[entity.ownerId] : null;
  const targets = Object.values(entities || {}).filter((e) => (isHero ? e.kind === 'mob' : e.kind === 'hero'));
  const droppables = entity.droppables || [];

  function setAc(n) {
    if (isHero) updateSheet({ armorClass: n });
    else onUpdate(entity.id, { armorClass: n });
  }
  function toggleCondition(key) {
    if (!canEdit) return;
    onUpdate(entity.id, { conditions: conditions.includes(key) ? conditions.filter((c) => c !== key) : [...conditions, key] });
  }
  function setDeathSave(kind, count) {
    updateSheet({ deathSaves: { ...sheet.deathSaves, [kind]: count } });
  }

  const paper = (node, editable = true) => (
    <article className="target-card phone-card-page">
      <div className="card-tab-body">
        <fieldset disabled={!editable} className="card-fieldset">
          {node}
        </fieldset>
      </div>
    </article>
  );

  const typeLine = isHero
    ? `Level ${sheet.level ?? 1} hero${owner ? ` · played by ${owner.id === meId ? 'you' : owner.name}` : ' · no player yet'}`
    : 'Monster';

  return (
    <PhoneSheet title={entity.name} onClose={onClose} className="phone-sheet-creature">
      <div className="phone-creature">
        <header className="phone-creature-head">
          <span className="phone-token-avatar phone-creature-avatar" style={{ backgroundImage: entity.imageUrl ? `url(${entity.imageUrl})` : undefined, '--token-color': entity.color || 'transparent' }} />
          <div className="phone-creature-id">
            {canEdit ? (
              <Editable type="text" label="Name" value={entity.name} display={entity.name} className="phone-creature-name" onCommit={(name) => name.trim() && onUpdate(entity.id, { name: name.trim() })} />
            ) : (
              <b className="phone-creature-name">{entity.name}</b>
            )}
            <span className="phone-caption phone-caption-flush">{typeLine}</span>
            {isHero && isHost && (
              <label className="phone-owner">
                <span>Played by</span>
                <select value={entity.ownerId || ''} onChange={(e) => onUpdate(entity.id, { ownerId: e.target.value || null })}>
                  <option value="">nobody (DM)</option>
                  {Object.values(players || {}).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.isHost ? ' (DM)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </header>

        {tabs.length > 0 && (
          <div className="phone-segment phone-creature-tabs" role="tablist" aria-label="Sheet sections">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {(tab === 'fight' || !showSheet) && (
          <div className="phone-creature-body">
            <section className="phone-hp" aria-label="Hit points">
              <span className="phone-label">Hit points</span>
              <div className="phone-hp-row">
                {canEdit && (
                  <button type="button" className="phone-hp-step" aria-label="Lose 1 hit point" onClick={() => onUpdate(entity.id, { hp: Math.max(0, hp - 1) })}>
                    −
                  </button>
                )}
                <span className="phone-hp-value" aria-live="polite">
                  {canEdit ? (
                    <Editable label="Hit points" value={hp} display={hp} min={0} className="phone-hp-now" onCommit={(n) => onUpdate(entity.id, { hp: Math.max(0, n) })} />
                  ) : (
                    <b className="phone-hp-now">{hp}</b>
                  )}
                  <span className="phone-hp-max">
                    /{' '}
                    {canEdit ? <Editable label="Maximum hit points" value={max} display={max} min={1} onCommit={(n) => onUpdate(entity.id, { maxHp: Math.max(1, n) })} /> : max}
                  </span>
                  {temp > 0 && <span className="phone-hp-temp">+{temp} temp</span>}
                </span>
                {canEdit && (
                  <button type="button" className="phone-hp-step" aria-label="Gain 1 hit point" onClick={() => onUpdate(entity.id, { hp: Math.min(max || hp + 1, hp + 1) })}>
                    +
                  </button>
                )}
              </div>
              <span className="phone-token-bar phone-hp-bar">
                <span style={{ width: `${pct * 100}%`, background: pct > 0.5 ? 'var(--moss)' : pct > 0.25 ? 'var(--gold-hi)' : 'var(--danger)' }} />
              </span>
              {!canEdit && isHero && <span className="phone-caption phone-caption-flush">Your DM keeps track of hit points.</span>}
            </section>

            <div className="phone-plaques">
              <div>
                {canEdit ? <Editable label="Armor class" value={acOf(entity)} display={acOf(entity)} min={0} onCommit={setAc} /> : <b>{acOf(entity)}</b>}
                <span>Armor</span>
              </div>
              {showSheet && (
                <div>
                  {canEdit ? (
                    <Editable label="Initiative" value={sheet.initiative ?? 0} display={formatModifier(sheet.initiative ?? 0)} onCommit={(n) => updateSheet({ initiative: n })} />
                  ) : (
                    <b>{formatModifier(sheet.initiative ?? 0)}</b>
                  )}
                  <span>Initiative</span>
                </div>
              )}
              {showSheet && (
                <div>
                  {canEdit ? (
                    <Editable label="Speed in feet" value={sheet.speed ?? 30} display={`${sheet.speed ?? 30} ft`} min={0} onCommit={(n) => updateSheet({ speed: n })} />
                  ) : (
                    <b>{sheet.speed ?? 30} ft</b>
                  )}
                  <span>Speed</span>
                </div>
              )}
              <div>
                {canEdit ? (
                  <Editable
                    label="Token size"
                    type="select"
                    value={String(entity.size || 1)}
                    display={tokenSizesUpTo().find((s) => s.size === (entity.size || 1))?.label || 'Medium'}
                    options={tokenSizesUpTo().map((s) => ({ value: String(s.size), label: s.label }))}
                    onCommit={(v) => onUpdate(entity.id, { size: Number(v) })}
                  />
                ) : (
                  <b>{tokenSizesUpTo().find((s) => s.size === (entity.size || 1))?.label || 'Medium'}</b>
                )}
                <span>Size</span>
              </div>
            </div>

            <section className="phone-conditions-list" aria-label="Conditions">
              <span className="phone-label">Conditions{canEdit ? ' · tap to toggle' : ''}</span>
              <div className="phone-chip-row">
                {CONDITIONS.map((c) => {
                  const on = conditions.includes(c.key);
                  if (!canEdit && !on) return null;
                  return (
                    <button key={c.key} type="button" className={`phone-cond${on ? ' on' : ''}`} aria-pressed={on} disabled={!canEdit} onClick={() => toggleCondition(c.key)} title={c.description}>
                      <span className="phone-cond-chit" style={{ backgroundImage: `url(${c.imageUrl})` }} aria-hidden="true" />
                      {c.label}
                    </button>
                  );
                })}
                {!canEdit && conditions.length === 0 && <span className="phone-caption phone-caption-flush">None</span>}
              </div>
            </section>

            {isHero && (
              <section className="phone-death" aria-label="Death saves">
                <span className="phone-label">Death saves</span>
                {['successes', 'failures'].map((kind) => {
                  const count = sheet.deathSaves?.[kind] ?? 0;
                  return (
                    <span key={kind} className={`phone-death-row ${kind}`}>
                      <span className="phone-caption phone-caption-flush">{kind === 'successes' ? 'Successes' : 'Failures'}</span>
                      {[1, 2, 3].map((i) => (
                        <button
                          key={i}
                          type="button"
                          className={`phone-death-pip${count >= i ? ' filled' : ''}`}
                          aria-label={`${kind === 'successes' ? 'Success' : 'Failure'} ${i}`}
                          aria-pressed={count >= i}
                          disabled={!canEdit}
                          onClick={() => setDeathSave(kind, count >= i ? i - 1 : i)}
                        />
                      ))}
                    </span>
                  );
                })}
              </section>
            )}

            {showSheet && (
              <section aria-label="Attacks">
                <span className="phone-label">{isHero ? 'Attacks' : 'Battle'}</span>
                {paper(
                  <BattleEquipmentTab sheet={sheet} updateSheet={updateSheet} targets={targets} onAttackTarget={onUpdate} playSoundOnHit={isHero} attackerName={entity.name} />,
                  canEditOwnTabs
                )}
              </section>
            )}
          </div>
        )}

        {tab === 'magic' && isHero && <div className="phone-creature-body">{paper(<SpellsTab sheet={sheet} updateSheet={updateSheet} />, canEditOwnTabs)}</div>}
        {tab === 'bag' && isHero && <div className="phone-creature-body">{paper(<BagTab sheet={sheet} updateSheet={updateSheet} />, canEditOwnTabs)}</div>}
        {tab === 'loot' && !isHero && isHost && (
          <div className="phone-creature-body">
            {paper(
              <DroppablesEditor
                items={droppables}
                onAddItem={(item) => onUpdate(entity.id, { droppables: [...droppables, item] })}
                onRemoveItem={(id) => onUpdate(entity.id, { droppables: droppables.filter((it) => it.id !== id) })}
                onUpdateItem={(id, patch) => onUpdate(entity.id, { droppables: droppables.map((it) => (it.id === id ? { ...it, ...patch } : it)) })}
              />
            )}
          </div>
        )}
        {tab === 'stats' && showSheet && (
          <div className="phone-creature-body">
            <section className="phone-abilities" aria-label="Abilities">
              {ABILITIES.map((a) => {
                const score = sheet.abilities?.[a.key] ?? 10;
                return (
                  <div key={a.key}>
                    <span className="phone-label">{a.label.slice(0, 3)}</span>
                    <b>{formatModifier(abilityModifier(score))}</b>
                    {canEdit ? (
                      <Editable label={a.label} value={score} display={score} min={1} max={30} className="phone-ability-score" onCommit={(n) => updateSheet({ abilities: { ...sheet.abilities, [a.key]: n } })} />
                    ) : (
                      <span className="phone-ability-score">{score}</span>
                    )}
                  </div>
                );
              })}
            </section>
            {paper(<SavesSkillsTab sheet={sheet} updateSheet={updateSheet} />, canEdit)}
            {!canEdit && <p className="phone-caption phone-caption-flush">Only the DM edits abilities, saves and skills.</p>}
          </div>
        )}
        {tab === 'dm' && isHost && (
          <div className="phone-creature-body">
            {paper(<DmTab entity={entity} audio={audio} onUpdate={onUpdate} onRemove={(id) => { onRemove(id); onClose(); }} placeholder={isHero ? 'Private notes about this player…' : 'Private notes about this monster…'} />)}
          </div>
        )}
      </div>
    </PhoneSheet>
  );
}
