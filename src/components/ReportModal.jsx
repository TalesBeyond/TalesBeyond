import React, { useState } from 'react';
import ModalShell from './ModalShell.jsx';
import { LEGAL } from '../data/legal.js';
import { reportTableRemote } from '../lib/remoteApi.js';

// "Report this table", for anyone seated at it (the table menu on desktop and
// phone). A cloud table's report is saved for the operator through
// report_table (71_moderation.sql). A guest or local table has no row on the
// server to attach one to, so it goes by email instead, with the table's code
// already written in.

// The keys are what content_reports.reason accepts.
export const REPORT_REASONS = [
  { key: 'sexual', label: 'Pornographic or sexually explicit content' },
  { key: 'minor', label: 'Sexual content involving a minor' },
  { key: 'harassment', label: 'Harassment or threats' },
  { key: 'illegal', label: 'Something else that is illegal' },
  { key: 'other', label: 'Something else that breaks the rules' },
];

const DETAILS_MAX = 1000;

function mailtoHref(code, reasonLabel, details) {
  const subject = `Report: table ${code || '(no code)'}`;
  const body = [`Table code: ${code || 'unknown'}`, `Reason: ${reasonLabel}`, '', details].join('\n');
  return `mailto:${LEGAL.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function ReportModal({ mode, tableId, code, onClose }) {
  const [reason, setReason] = useState(REPORT_REASONS[0].key);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const stored = mode === 'remote' && Boolean(tableId);
  const reasonLabel = REPORT_REASONS.find((r) => r.key === reason)?.label ?? '';
  const mailto = mailtoHref(code, reasonLabel, details.trim());

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await reportTableRemote(tableId, reason, details.trim());
      setSent(true);
    } catch (err) {
      setError(err.message || 'The report could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <ModalShell title="Report this table" icon="warn" onClose={onClose}>
        <p style={{ margin: '0 0 14px', lineHeight: 1.55 }}>
          Your report was sent. We review reports and remove what breaks the rules. You can leave this table at any
          time from the table menu.
        </p>
        <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
          Close
        </button>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Report this table" icon="warn" onClose={onClose}>
      <form onSubmit={stored ? submit : (e) => e.preventDefault()}>
        <p style={{ margin: '0 0 14px', lineHeight: 1.55 }}>
          Tell us what is wrong at this table. The DM and the other players are not told that you reported it.
        </p>

        {error && (
          <div className="error-note">
            {error} You can also <a href={mailto}>send it by email</a>.
          </div>
        )}

        <label className="field-label" htmlFor="report-reason">
          What is it?
        </label>
        <select id="report-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
          {REPORT_REASONS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>

        <label className="field-label" htmlFor="report-details">
          What did you see? (optional)
        </label>
        <textarea
          id="report-details"
          className="field"
          rows={4}
          maxLength={DETAILS_MAX}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Where it was (a map, a token, a name, a song) and who added it, if you know."
        />
        <p className="footer-note" style={{ border: 'none', padding: '0 2px 12px', margin: 0 }}>
          Describe it in words. Do not copy, attach or send the material itself.
        </p>

        {stored ? (
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send report'}
          </button>
        ) : (
          <>
            <a className="btn btn-primary btn-block" href={mailto} style={{ textAlign: 'center', textDecoration: 'none' }}>
              Write the report by email
            </a>
            <p className="footer-note" style={{ border: 'none', padding: '10px 2px 0', margin: 0 }}>
              This table is not saved on our servers, so its report goes by email to {LEGAL.contactEmail}
              {code ? (
                <>
                  . Include the table code <code style={{ fontFamily: 'var(--font-mono)' }}>{code}</code>
                </>
              ) : null}
              .
            </p>
          </>
        )}
      </form>
    </ModalShell>
  );
}
