import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RULE_CHAPTERS, TABLE_RULES } from '../data/tableRules.js';
import { usePhoneLayout } from './PhoneChrome.jsx';

// The Game table rules (Configurations → Game table rules): what every
// button and tool at the table does, to read at any time. The tips and the
// tutorial (Hints.jsx, Tour.jsx) show once; this stays.
//
// It is the compendium's book (CompendiumBook.jsx) with different pages: the
// same cover, tabs and styles. Chapters are its tabs, the left page lists a
// chapter's buttons, and the right page explains the one that is picked.
// Searching looks through every chapter at once. A player's book leaves out
// the DM's buttons.

export default function RulesBook({ isHost, onClose }) {
  const [chapter, setChapter] = useState(RULE_CHAPTERS[0].key);
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const rowsRef = useRef(null);
  const isPhone = usePhoneLayout();

  const q = search.trim().toLowerCase();
  const searching = q !== '';

  const { entries, totalCount } = useMemo(() => {
    const mine = (list) => list.filter((e) => isHost || !e.dm);
    const all = RULE_CHAPTERS.flatMap((c) => mine(TABLE_RULES[c.key]).map((e) => ({ ...e, key: `${c.key}:${e.key}` })));
    if (!searching) return { entries: all.filter((e) => e.key.startsWith(`${chapter}:`)), totalCount: all.length };
    const hit = (e) =>
      [e.name, e.sub, e.where, e.text, ...(e.items || []).flat()].some((s) => s.toLowerCase().includes(q));
    return { entries: all.filter(hit), totalCount: all.length };
  }, [isHost, chapter, searching, q]);

  const title = searching ? 'Search' : RULE_CHAPTERS.find((c) => c.key === chapter).title;
  // The book opens ready to read: the first entry in the index is on the
  // right page until another is picked.
  const selected = entries.find((e) => e.key === selectedKey) || (isPhone ? null : entries[0]) || null;
  const selectedAt = selected ? entries.indexOf(selected) : -1;

  useEffect(() => {
    if (rowsRef.current) rowsRef.current.scrollTop = 0;
  }, [chapter, search]);

  useEffect(() => {
    rowsRef.current?.querySelector('.cbook-row.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selected?.key]);

  // Up and Down walk the index, from the search box too.
  const stepRef = useRef(null);
  stepRef.current = (by) => {
    if (entries.length === 0) return;
    setSelectedKey(entries[Math.max(0, Math.min(entries.length - 1, selectedAt + by))].key);
  };
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      else if (isPhone) return;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        stepRef.current(e.key === 'ArrowDown' ? 1 : -1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, isPhone]);

  function openChapter(key) {
    setSearch('');
    setSelectedKey(null);
    setChapter(key);
  }

  const tabs = RULE_CHAPTERS.map((c) => {
    const active = !searching && chapter === c.key;
    return { ...c, active, onClick: () => !active && openChapter(c.key) };
  });

  const who = (e) => (e.dm ? 'DM only' : isHost ? 'Everyone' : '');

  function ruleBody(e, textClass, listClass) {
    return (
      <>
        <p className={textClass}>{e.text}</p>
        {e.items && (
          <ul className={listClass}>
            {e.items.map(([name, what]) => (
              <li key={name}>
                <b>{name}:</b> {what}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  // On a phone the open book doesn't fit: one scrolling page instead, the
  // tabs and search above it, and the chosen entry in a panel along the bottom.
  if (isPhone) {
    return (
      <div className="cphone" role="dialog" aria-modal="true" aria-label="Game table rules">
        <header className="cphone-head">
          <h2>Game table rules</h2>
          <button type="button" className="cphone-close" aria-label="Close the rules" onClick={onClose}>
            &times;
          </button>
        </header>
        <div className="cphone-tabs" role="tablist" aria-label="Chapters">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={t.active} className={t.active ? 'active' : ''} onClick={t.onClick}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="cphone-controls">
          <input
            className="cphone-search"
            type="search"
            aria-label="Search the rules"
            placeholder="Search every chapter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="cphone-filter-row">
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
              <span className="cphone-row-main">
                <span className="cphone-row-name">{e.name}</span>
                <span className="cphone-row-sub">{e.sub}</span>
              </span>
              {e.dm && (
                <span className="cphone-row-side">
                  <span className="cphone-row-small">DM only</span>
                </span>
              )}
            </button>
          ))}
          {entries.length === 0 && <p className="cphone-empty">Nothing in the rules matches that search.</p>}
        </div>

        <footer className={`cphone-detail${selected ? ' open' : ''}`}>
          {!selected ? (
            <p className="cphone-detail-empty">Tap an entry to read how it works.</p>
          ) : (
            <>
              <div className="cphone-detail-head">
                <b>{selected.name}</b>
                <button type="button" className="cphone-detail-close" aria-label="Back to the list" onClick={() => setSelectedKey(null)}>
                  &times;
                </button>
              </div>
              <div className="cphone-stats">
                <span>{selected.where}</span>
                {who(selected) && <span>{who(selected)}</span>}
              </div>
              {ruleBody(selected, 'cphone-detail-text', 'cphone-detail-text rules-list')}
            </>
          )}
        </footer>
      </div>
    );
  }

  return (
    <div className="cbook-backdrop" onClick={onClose}>
      <div className="cbook-stage" role="dialog" aria-modal="true" aria-label="Game table rules" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="cbook-close" aria-label="Close the rules" title="Close" onClick={onClose}>
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
                <span className="cbook-chapter">{title}</span>
                <span className="cbook-range">
                  {entries.length} of {totalCount}
                </span>
              </div>
              <div className="cbook-controls">
                <input
                  className="cbook-search"
                  type="search"
                  aria-label="Search the rules"
                  placeholder="Search every chapter…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="cbook-rows" ref={rowsRef}>
                {entries.map((e) => {
                  const on = Boolean(selected && e.key === selected.key);
                  return (
                    <button key={e.key} type="button" className={`cbook-row${on ? ' selected' : ''}`} aria-pressed={on} onClick={() => setSelectedKey(e.key)}>
                      <span className="cbook-row-lead">
                        <span className="cbook-row-main">
                          <span className="cbook-row-name">{e.name}</span>
                          <span className="cbook-row-sub">{e.sub}</span>
                        </span>
                      </span>
                      {e.dm && (
                        <span className="cbook-row-side">
                          <span className="cbook-row-small">DM only</span>
                        </span>
                      )}
                    </button>
                  );
                })}
                {entries.length === 0 && <p className="cbook-empty">Nothing in the rules matches that search.</p>}
              </div>
            </div>

            <div className="cbook-page right">
              <div className="cbook-page-head">
                <span className="cbook-chapter">Game table rules</span>
                <span className="cbook-range">{selected ? `${selectedAt + 1} of ${entries.length}` : ''}</span>
              </div>
              {!selected ? (
                <p className="cbook-empty">Nothing to show. Try another search.</p>
              ) : (
                <div className="cbook-entry">
                  <div className="cbook-entry-title">
                    <h3 className="cbook-entry-name">{selected.name}</h3>
                    <span className="cbook-entry-sub">{selected.sub}</span>
                  </div>
                  <div className="cbook-chips">
                    <span>{selected.where}</span>
                    {who(selected) && <span>{who(selected)}</span>}
                  </div>
                  {ruleBody(selected, 'cbook-entry-text', 'cbook-entry-text rules-list')}
                </div>
              )}
            </div>
            <div className="cbook-gutter" />
          </div>
        </div>

        <div className="cbook-tabs" role="tablist" aria-label="Chapters">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={t.active} className={`cbook-tab${t.active ? ' active' : ''}`} onClick={t.onClick}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
