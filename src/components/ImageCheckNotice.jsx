import React from 'react';
import { clearBlockedNotice, useImageCheckStatus } from '../lib/imageSafety.js';

// What the picture filter (lib/imageSafety.js) is doing, over the bottom of
// the table: a line while a picked picture is being checked (the first check
// also fetches the classifier, which takes a few seconds), and a notice when
// a picture another browser sent was refused on this device.
export default function ImageCheckNotice() {
  const { busy, blockedReceived } = useImageCheckStatus();
  if (!busy && !blockedReceived) return null;
  return (
    <div className="image-check-notice" role="status">
      {busy > 0 && <span>Checking the picture…</span>}
      {blockedReceived > 0 && (
        <>
          <span>
            {blockedReceived === 1 ? 'A picture at this table was' : `${blockedReceived} pictures at this table were`} blocked on this
            device: {blockedReceived === 1 ? 'it looks' : 'they look'} sexual or explicit.
          </span>
          <button type="button" className="link-btn" onClick={clearBlockedNotice}>
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}
