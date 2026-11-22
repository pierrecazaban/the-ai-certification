'use client';

import { useEffect, useState } from 'react';

// Today's Smart Mail access code, big and copyable, at the top of the admin console.
// Without TOOL_GATE_SECRET on this site, the code is asked to the Smart Mail server itself (/tool is the
// same origin), with the console session this browser already has (localStorage "smartmail").
export default function ToolCode({ code: duServeur, compact = false }: { code: string | null; compact?: boolean }) {
  const [done, setDone] = useState(false);
  const [code, setCode] = useState<string | null>(duServeur);
  const [sansSession, setSansSession] = useState(false);
  useEffect(() => {
    if (duServeur) return;
    // 1) Your admin login on this site is enough: the Smart Mail server checks it with this site.
    fetch('/tool/v1/porte/code-admin', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { code?: string }) => { if (d.code) setCode(d.code); else throw new Error('vide'); })
      .catch(() => essaiConsole());
  }, [duServeur]);
  function essaiConsole() {
    // 2) Otherwise, the Smart Mail console session saved in this browser.
    let jeton = '';
    try { jeton = JSON.parse(localStorage.getItem('smartmail') || '{}').code || ''; } catch { /* storage blocked */ }
    if (!jeton) { setSansSession(true); return; }
    fetch('/tool/v1/admin/porte', { headers: { Authorization: `Bearer ${jeton}` }, cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { code?: string }) => (d.code ? setCode(d.code) : setSansSession(true)))
      .catch(() => setSansSession(true));
  }
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
  if (compact) {
    // Dans le header (18/11) : petit, à côté du réglage ; un clic copie le code.
    return (
      <button type="button" className={`cx-toolpill${done ? ' done' : ''}`} onClick={onCopy}
        title={code ? 'Code Smart Mail du jour : cliquer pour copier (change à minuit, Paris)' : 'Ouvrez une fois la console Smart Mail sur cet appareil'}
        aria-label={code ? `Code Smart Mail du jour ${code}, copier` : 'Code Smart Mail indisponible'}>
        <span>SM</span>
        <strong>{done ? 'Copié ✓' : code ? `${code.slice(0, 3)} ${code.slice(3)}` : sansSession ? '—' : '…'}</strong>
      </button>
    );
  }
  return (
    <section className="cx-toolcode" aria-label="Smart Mail code of the day">
      <div>
        <span className="cx-toolcode-label">Smart Mail · code du jour</span>
        <strong className="cx-toolcode-value">{code ? `${code.slice(0, 3)} ${code.slice(3)}` : sansSession ? '— — —' : '…'}</strong>
        <small>{code || !sansSession
          ? 'À donner aux ambassadeurs pour the-ai-certification.com/tool · change à minuit (Paris)'
          : 'Ouvrez une fois la console Smart Mail sur cet appareil : le code s’affichera ici ensuite.'}</small>
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
