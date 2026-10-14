import React, { useEffect, useState } from 'react';
import { newBulletin, MAX_BULLETINS, MAX_BULLETIN_TITLE, MAX_BULLETIN_TEXT } from '../data/bulletins.js';

// What is pinned to a bulletin board (data/bulletins.js), and the form to pin
// more: a title and some text. Shared between the placement modal
// (TokenSidebar) and the in-place editor on a placed board's inspector
// (RightPanel), the way ChestContentsEditor is for a chest.
//
// onPendingChange (optional): told the title of a bulletin that has been
// typed but not pinned yet ('' when there is none), so the placement modal
// can hold "Place" back until it is pinned or cleared.
export default function BulletinsEditor({ bulletins, onChange, onPendingChange }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState(null);

  const editing = editingId ? bulletins.find((b) => b.id === editingId) : null;
  const full = bulletins.length >= MAX_BULLETINS && !editing;
  const typed = Boolean(title.trim() || text.trim());
  const pending = typed ? title.trim() || 'Untitled' : '';
  useEffect(() => {
    onPendingChange?.(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  function clearForm() {
    setTitle('');
    setText('');
    setEditingId(null);
  }

  function save() {
    if (!typed) return;
    const next = newBulletin({ title, text });
    onChange(editing ? bulletins.map((b) => (b.id === editing.id ? { ...next, id: b.id } : b)) : [...bulletins, next]);
    clearForm();
  }

  function startEdit(bulletin) {
    setEditingId(bulletin.id);
    setTitle(bulletin.title);
    setText(bulletin.text);
  }

  function remove(id) {
    if (id === editingId) clearForm();
    onChange(bulletins.filter((b) => b.id !== id));
  }

  return (
    <div className="chest-editor bulletins-editor">
      <div className="chest-capacity">
        {bulletins.length === 0 ? 'Nothing pinned to this board yet' : `${bulletins.length}/${MAX_BULLETINS} bulletin${bulletins.length === 1 ? '' : 's'} pinned`}
      </div>

      {bulletins.length > 0 && (
        <div className="chest-item-list">
          {bulletins.map((b) => (
            <div className={`chest-item-row bulletin-row${b.id === editingId ? ' editing' : ''}`} key={b.id}>
              <div className="chest-item-info">
                <span className="chest-item-name">{b.title}</span>
                {b.text && <span className="chest-item-meta bulletin-row-text">{b.text}</span>}
              </div>
              <button type="button" className="btn btn-secondary btn-sm" aria-label={`Edit the bulletin ${b.title}`} onClick={() => startEdit(b)}>
                Edit
              </button>
              <button type="button" className="btn btn-danger btn-sm" aria-label={`Take down the bulletin ${b.title}`} onClick={() => remove(b.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="section-label" style={{ marginTop: 14 }}>
        {editing ? `Editing “${editing.title}”` : 'Pin a bulletin'}
      </div>
      {full ? (
        <p className="footer-note" style={{ border: 'none', padding: '6px 0', margin: 0 }}>
          The board is full. Take a bulletin down to pin another.
        </p>
      ) : (
        <>
          <label className="field-label">Title</label>
          <input className="field" maxLength={MAX_BULLETIN_TITLE} placeholder="e.g. Wanted: rat catcher" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="field-label" style={{ marginTop: 8 }}>
            Text
          </label>
          <textarea
            className="field"
            rows={4}
            style={{ resize: 'vertical' }}
            maxLength={MAX_BULLETIN_TEXT}
            placeholder="News, a rumour, a quest…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="bulletins-editor-actions">
            {(editing || typed) && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={clearForm}>
                {editing ? 'Cancel' : 'Clear'}
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" disabled={!typed} onClick={save}>
              {editing ? 'Save bulletin' : '+ Pin bulletin'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
