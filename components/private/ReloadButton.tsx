'use client';

import { useState } from 'react';

// Reload the page: the installed app (PWA) has no browser reload button, and closing it each time is tedious.
export default function ReloadButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={`cx-reload${busy ? ' busy' : ''}`}
      onClick={() => { setBusy(true); window.location.reload(); }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      {busy ? 'Actualisation…' : 'Actualiser'}
    </button>
  );
}
