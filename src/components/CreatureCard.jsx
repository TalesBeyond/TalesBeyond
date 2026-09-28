import React, { useEffect, useRef, useState } from 'react';
import { CONDITIONS } from '../data/conditions.js';
import { ABILITIES, abilityModifier, formatModifier } from '../data/characterSheet.js';
import { tokenSizesUpTo } from '../data/tokenSizes.js';
import { acOf, attackPreview } from '../utils/combat.js';

// A hero's or monster's whole inspector, drawn as one collectible card: the
// name on the title bar, the token's art with its armor (shield) and hit
// point (heart) gems, the life bar, initiative / speed / size, the six
// ability scores, death saves, conditions, and a tab ribbon whose sections
// (Battle, Spells, Bag, Loot, Skills, DM) the caller supplies as `tabs`.
//
// Every value the viewer may change is click-to-edit (Editable below): it
// shows a pencil on hover, turns into an input on click, and saves on Enter
// or when focus leaves (Esc cancels). A viewer who can't edit a value gets
// plain text — no pencil, no outline — so nothing promises an edit it can't
// make.

const PENCIL = (
  <span className="card-pen" aria-hidden="true">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    </svg>
  </span>
);

// One click-to-edit value. `type` is 'number' | 'text' | 'textarea' |
// 'select' (with `options: [{ value, label }]`). `display` is what shows at
// rest (defaults to the value itself); `className` styles the resting
// button, `inputClassName` the field that replaces it while editing.
export function Editable({ value, display, onCommit, type = 'number', label, disabled, className = '', inputClassName = '', options, min, max, placeholder }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const shown = display ?? value;

  if (disabled) return <span className={`card-ed static ${className}`}>{shown}</span>;

  function start() {
    setDraft(value == null ? '' : String(value));
    setEditing(true);
  }
  function commit(next = draft) {
    setEditing(false);
    if (type === 'number') {
      let n = parseInt(next, 10);
      if (Number.isNaN(n)) return;
      if (min != null) n = Math.max(min, n);
      if (max != null) n = Math.min(max, n);
      if (n !== value) onCommit(n);
    } else if (next !== value) {
      onCommit(next);
    }
  }
  function onKeyDown(e) {
    if (e.key === 'Escape') setEditing(false);
    else if (e.key === 'Enter' && type !== 'textarea') commit();
  }

  if (editing) {
    const common = {
      className: `card-ed-input ${inputClassName}`,
      'aria-label': label,
      autoFocus: true,
      onKeyDown,
    };
    if (type === 'select') {
      return (
        <select {...common} value={draft} onChange={(e) => commit(e.target.value)} onBlur={() => setEditing(false)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    if (type === 'textarea') {
      return <textarea {...common} rows={4} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit()} />;
    }
    return (
      <input
        {...common}
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => commit()}
      />
    );
  }

  return (
    <button type="button" className={`card-ed ${className}`} aria-label={`${label}: ${value ?? ''} — edit`} onClick={start}>
      {shown}
      {PENCIL}
    </button>
  );
}

// The heart gem: click to edit current, maximum and temporary hit points
// together.
function HpGem({ hp, max, temp, disabled, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ hp: '', max: '', temp: '' });
  const boxRef = useRef(null);

  const gem = (
    <svg width="62" height="58" viewBox="0 0 24 23" aria-hidden="true">
      <path d="M12 21.5S2 15.5 2 8.2A5.2 5.2 0 0 1 12 5.6a5.2 5.2 0 0 1 10 2.6c0 7.3-10 13.3-10 13.3z" />
      <text x="12" y="13.5" textAnchor="middle">
        {hp}/{max}
      </text>
    </svg>
  );

  function save() {
    setEditing(false);
    const nextMax = parseInt(draft.max, 10);
    const nextHp = parseInt(draft.hp, 10);
    const nextTemp = draft.temp.trim() === '' ? 0 : parseInt(draft.temp, 10);
    const patch = {};
    if (!Number.isNaN(nextMax) && nextMax !== max) patch.maxHp = Math.max(0, nextMax);
    if (!Number.isNaN(nextHp) && nextHp !== hp) patch.hp = Math.max(0, nextHp);
    if (!Number.isNaN(nextTemp) && nextTemp !== temp) patch.tempHp = Math.max(0, nextTemp);
    if (Object.keys(patch).length) onCommit(patch);
  }
  function onKeyDown(e) {
    if (e.key === 'Enter') save();
    else if (e.key === 'Escape') setEditing(false);
  }
  // Leaving the little editor (not just hopping between its two fields) saves.
  function onBlur(e) {
    if (!boxRef.current?.contains(e.relatedTarget)) save();
  }

  if (disabled) {
    return (
      <span className="card-gem gem-hp" role="img" aria-label={`Hit points ${hp} of ${max}`}>
        {gem}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className="card-ed card-gem gem-hp"
        aria-label={`Hit points ${hp} of ${max} — edit`}
        onClick={() => {
          setDraft({ hp: String(hp), max: String(max), temp: temp ? String(temp) : '' });
          setEditing(true);
        }}
      >
        {gem}
        {PENCIL}
      </button>
      {editing && (
        <div className="card-hp-editor" ref={boxRef} onBlur={onBlur}>
          <input
            className="card-ed-input"
            type="number"
            aria-label="Current hit points"
            autoFocus
            value={draft.hp}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setDraft((d) => ({ ...d, hp: e.target.value }))}
            onKeyDown={onKeyDown}
          />
          <span aria-hidden="true">/</span>
          <input
            className="card-ed-input"
            type="number"
            aria-label="Maximum hit points"
            value={draft.max}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setDraft((d) => ({ ...d, max: e.target.value }))}
            onKeyDown={onKeyDown}
          />
          <span aria-hidden="true">+</span>
          <input
            className="card-ed-input card-hp-temp-input"
            type="number"
            aria-label="Temporary hit points"
            placeholder="temp"
            min={0}
            value={draft.temp}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setDraft((d) => ({ ...d, temp: e.target.value }))}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="card-hp-done" aria-label="Save hit points" onClick={save}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12l5 5 9-10" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}

function sizeName(size) {
  const label = tokenSizesUpTo().find((s) => s.size === (size || 1))?.label || '';
  return label.match(/\(([^)]+)\)/)?.[1] || `${size || 1} × ${size || 1}`;
}

// canEdit: this viewer may edit the card's own fields (the DM). The tab
// contents handle their own permissions (a hero's owner edits Battle,
// Spells and Bag). showStats: false hides a monster's initiative, speed and
// ability scores from players, who never receive a monster's sheet.
export default function CreatureCard({
  entity,
  sheet,
  updateSheet,
  onUpdate,
  canEdit,
  showStats = true,
  showDeathSaves = false,
  typeLine,
  owner,
  actor,
  tabs = [],
  tabNote,
}) {
  const isMob = entity.kind === 'mob';
  const [tabKey, setTabKey] = useState(tabs[0]?.key);
  const [addingCondition, setAddingCondition] = useState(false);
  const activeTab = tabs.find((t) => t.key === tabKey) || tabs[0];
  useEffect(() => {
    if (!canEdit) setAddingCondition(false);
  }, [canEdit]);

  const max = entity.maxHp || 0;
  const hp = entity.hp ?? max;
  const temp = entity.tempHp || 0;
  const hpPct = max ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  const ac = acOf(entity);
  const abilities = sheet?.abilities || {};
  const conditions = entity.conditions || [];

  const attack = actor && actor.kind === 'hero' && actor.id !== entity.id ? (actor.sheet?.attacks || [])[0] : null;
  const preview = attack && max ? attackPreview(attack, entity) : null;
  // Temporary HP soaks the blow first, so it only reaches real HP past that.
  const leaves = preview ? Math.max(0, Math.round(Math.max(0, hp) - Math.max(0, preview.averageDamage - temp))) : null;
  const pct = (n) => `${max ? Math.max(0, Math.min(100, (n / max) * 100)) : 0}%`;

  function setAc(n) {
    if (isMob) onUpdate(entity.id, { armorClass: n });
    else updateSheet({ armorClass: n });
  }
  function stepHp(delta) {
    onUpdate(entity.id, { hp: Math.max(0, (entity.hp || 0) + delta) });
  }
  function toggleCondition(key) {
    if (!canEdit) return;
    onUpdate(entity.id, { conditions: conditions.includes(key) ? conditions.filter((c) => c !== key) : [...conditions, key] });
  }
  function setDeathSave(kind, count) {
    updateSheet({ deathSaves: { ...sheet.deathSaves, [kind]: count } });
  }

  const conditionChip = (c, active) => (
    <button
      key={c.key}
      type="button"
      className={`card-condition${active ? ' active' : ''}`}
      title={`${c.label} — ${c.description}`}
      disabled={!canEdit}
      aria-pressed={active}
      aria-label={active && canEdit ? `Remove ${c.label}` : c.label}
      onClick={() => toggleCondition(c.key)}
    >
      <span className="card-condition-chit" style={{ backgroundImage: `url(${c.imageUrl})` }} aria-hidden="true" />
      {c.label}
      {active && canEdit && <span aria-hidden="true">×</span>}
    </button>
  );

  const plaques = [
    showStats && {
      key: 'init',
      label: 'Initiative',
      node: <Editable label="Initiative" value={sheet.initiative ?? 0} display={formatModifier(sheet.initiative ?? 0)} disabled={!canEdit} className="card-plaque-value" inputClassName="card-plaque-input" onCommit={(n) => updateSheet({ initiative: n })} />,
    },
    showStats && {
      key: 'speed',
      label: 'Speed',
      node: <Editable label="Speed in feet" value={sheet.speed ?? 30} display={`${sheet.speed ?? 30} ft`} min={0} disabled={!canEdit} className="card-plaque-value" inputClassName="card-plaque-input" onCommit={(n) => updateSheet({ speed: n })} />,
    },
    {
      key: 'size',
      label: 'Size',
      node: (
        <Editable
          label="Token size"
          type="select"
          value={String(entity.size || 1)}
          display={sizeName(entity.size)}
          options={tokenSizesUpTo().map((s) => ({ value: String(s.size), label: s.label }))}
          disabled={!canEdit}
          className="card-plaque-value"
          inputClassName="card-plaque-input"
          onCommit={(v) => onUpdate(entity.id, { size: parseInt(v, 10) })}
        />
      ),
    },
  ].filter(Boolean);

  return (
    <div className="creature-card">
      <article className={`target-card ${isMob ? 'foe' : 'ally'}`}>
        <header className="target-card-title">
          {/* The Grimoire palette's illuminated capital — hidden in every other palette. */}
          <span className="inspector-dropcap" aria-hidden="true">
            {(entity.name || '').trim().charAt(0) || '?'}
          </span>
          <Editable
            type="text"
            label="Name"
            value={entity.name}
            disabled={!canEdit}
            className="card-name on-dark"
            inputClassName="card-name-input"
            onCommit={(name) => onUpdate(entity.id, { name })}
          />
          {!isMob && (
            <Editable
              label="Level"
              value={sheet.level ?? 1}
              display={`LV ${sheet.level ?? 1}`}
              min={1}
              max={20}
              disabled={!canEdit}
              className="card-level on-dark"
              inputClassName="card-level-input"
              onCommit={(level) => updateSheet({ level })}
            />
          )}
        </header>

        <div className="target-card-art" style={{ backgroundImage: `url(${entity.imageUrl})` }}>
          <span className="card-gem-slot left">
            {canEdit ? (
              <Editable
                label="Armor class"
                value={ac}
                min={0}
                className="card-gem gem-ac"
                inputClassName="card-gem-input"
                onCommit={setAc}
                display={
                  <svg width="54" height="58" viewBox="0 0 24 26" aria-hidden="true">
                    <path d="M12 1l10 4v7c0 6-4.5 10-10 12C6.5 22 2 18 2 12V5z" />
                    <text x="12" y="16.5" textAnchor="middle">
                      {ac}
                    </text>
                  </svg>
                }
              />
            ) : (
              <span className="card-gem gem-ac" role="img" aria-label={`Armor class ${ac}`}>
                <svg width="54" height="58" viewBox="0 0 24 26" aria-hidden="true">
                  <path d="M12 1l10 4v7c0 6-4.5 10-10 12C6.5 22 2 18 2 12V5z" />
                  <text x="12" y="16.5" textAnchor="middle">
                    {ac}
                  </text>
                </svg>
              </span>
            )}
          </span>
          <span className="card-gem-slot right">
            <HpGem hp={hp} max={max} temp={temp} disabled={!canEdit} onCommit={(patch) => onUpdate(entity.id, patch)} />
          </span>
        </div>

        <div className="target-card-type">
          <span>{typeLine}</span>
          {owner}
        </div>

        <div className="card-life">
          {canEdit && (
            <button type="button" className="card-step" aria-label="Lose 1 hit point" onClick={() => stepHp(-1)}>
              −
            </button>
          )}
          {/* The life bar anatomy: current HP, the chunk just lost draining
              after a beat (the ghost), temporary HP as a blue layer on top,
              and a glow + heartbeat below a quarter. */}
          <div className="card-life-bar" aria-hidden="true">
            {temp > 0 && (
              <div className="card-tempbar">
                <span style={{ width: pct(temp) }} />
              </div>
            )}
            <div className={`target-card-hp${hpPct < 25 ? ' critical' : ''}`}>
              <span className="target-hp-ghost" style={{ width: `${hpPct}%` }} />
              {preview ? (
                <>
                  <span className="target-hp-fill" style={{ width: pct(leaves) }} />
                  <span className="target-hp-preview" style={{ width: pct(Math.max(0, hp) - leaves) }} />
                </>
              ) : (
                <span className="target-hp-fill" style={{ width: `${hpPct}%` }} />
              )}
            </div>
          </div>
          {temp > 0 && <span className="card-temp-chip" title="Temporary hit points — spent before real ones">+{temp}</span>}
          {canEdit && (
            <button type="button" className="card-step" aria-label="Gain 1 hit point" onClick={() => stepHp(1)}>
              +
            </button>
          )}
        </div>

        <div className="card-plaques" style={{ gridTemplateColumns: `repeat(${plaques.length}, minmax(0, 1fr))` }}>
          {plaques.map((p) => (
            <div key={p.key} className="card-plaque">
              {p.node}
              <span className="card-plaque-label">{p.label}</span>
            </div>
          ))}
        </div>

        {showStats && (
          <div className="target-card-stats">
            {ABILITIES.map((a) => {
              const score = abilities[a.key] ?? 10;
              return (
                <div key={a.key} title={a.label}>
                  <Editable
                    label={a.label}
                    value={score}
                    min={1}
                    max={30}
                    disabled={!canEdit}
                    className="card-ability"
                    inputClassName="card-ability-input"
                    onCommit={(n) => updateSheet({ abilities: { ...abilities, [a.key]: n } })}
                    display={
                      <>
                        <span>{a.key.toUpperCase()}</span>
                        <b>{score}</b>
                        <i>{formatModifier(abilityModifier(score))}</i>
                      </>
                    }
                  />
                </div>
              );
            })}
          </div>
        )}

        {showDeathSaves && (
          <div className="card-death-saves">
            <span className="card-mini-label">Death saves</span>
            <div className="card-death-pips">
              {['successes', 'failures'].map((kind) => (
                <span key={kind} className={`card-death-group ${kind}`}>
                  {[1, 2, 3].map((i) => {
                    const count = sheet.deathSaves?.[kind] ?? 0;
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`card-death-pip${count >= i ? ' filled' : ''}`}
                        aria-label={`${kind === 'successes' ? 'Success' : 'Failure'} ${i}`}
                        aria-pressed={count >= i}
                        disabled={!canEdit}
                        onClick={() => setDeathSave(kind, count >= i ? i - 1 : i)}
                      />
                    );
                  })}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="card-conditions" aria-label="Conditions">
          {conditions.length === 0 && !canEdit && <span className="card-none">No conditions</span>}
          {CONDITIONS.filter((c) => conditions.includes(c.key)).map((c) => conditionChip(c, true))}
          {canEdit && (
            <button type="button" className="card-condition add" aria-expanded={addingCondition} onClick={() => setAddingCondition((a) => !a)}>
              {addingCondition ? 'Done' : '+ Condition'}
            </button>
          )}
          {canEdit && addingCondition && (
            <div className="card-condition-picker">{CONDITIONS.filter((c) => !conditions.includes(c.key)).map((c) => conditionChip(c, false))}</div>
          )}
        </div>

        {tabs.length > 0 && (
          <>
            <div className="card-tabs" role="tablist" aria-label="Sheet sections" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab.key === t.key}
                  className={`card-tab${activeTab.key === t.key ? ' active' : ''}`}
                  onClick={() => setTabKey(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="card-tab-body" role="tabpanel" aria-label={activeTab.label}>
              {tabNote && <p className="card-tab-note">{tabNote}</p>}
              {activeTab.content}
            </div>
          </>
        )}
      </article>

      {preview && (
        <div className="target-preview" aria-label={`${actor.name}'s ${preview.weaponName} against ${entity.name}`}>
          <div>
            <span>To hit</span>
            <b className="accent">{Math.round(preview.hitChance * 100)}%</b>
          </div>
          <div>
            <span>Damage</span>
            <b>{preview.damageLabel}</b>
          </div>
          <div>
            <span>Leaves</span>
            <b className="danger">≈{leaves} HP</b>
          </div>
        </div>
      )}
    </div>
  );
}
