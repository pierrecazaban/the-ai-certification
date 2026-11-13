'use client';

import { useState } from 'react';

// Today's Smart Mail access code, big and copyable, at the top of the admin console.
export default function ToolCode({ code }: { code: string | null }) {
  const [done, setDone] = useState(false);
  async function onCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      /* clipboard refused: the code stays readable on screen */
    }
  }
  return (
    <section className="cx-toolcode" aria-label="Smart Mail code of the day">
      <div>
        <span className="cx-toolcode-label">Smart Mail · code du jour</span>
        <strong className="cx-toolcode-value">{code ? `${code.slice(0, 3)} ${code.slice(3)}` : 'Non configuré'}</strong>
        <small>À donner aux ambassadeurs pour the-ai-certification.com/tool · change à minuit (Paris)</small>
      </div>
      <div className="cx-toolcode-actions">
        {code && (
          <button type="button" className={`btn btn-sm ${done ? 'btn-ghost' : 'btn-green'}`} onClick={onCopy} aria-live="polite">
            {done ? '✓ Copié' : 'Copier'}
          </button>
        )}
        <a className="btn btn-sm btn-ghost" href="/tool/admin">Console Smart Mail →</a>
      </div>
    </section>
  );
}
