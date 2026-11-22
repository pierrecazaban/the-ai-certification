'use client';

import { useState } from 'react';

// Inviter un ambassadeur « court terme » (18/11) : le lien du tool Smart Mail + le code personnel de l'ambassadeur.
// Ce code ne change pas : la personne qui le tape à l'entrée du tool se retrouve sous lui dans l'arbre.
export default function ShortInvite({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = 'https://the-ai-certification.com/tool';
  const message = `Salut ! Tu peux devenir ambassadeur The AI Certification pour ton école : ${link}\nCode d'accès : ${code}`;
  async function copy() {
    try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the text stays readable */ }
  }
  async function share() {
    try { await navigator.share({ text: message }); } catch { copy(); }
  }
  return (
    <li className="st-node st-invite">
      <button type="button" className="st-invite-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="st-av st-plus">+</span>
        <div><strong>Invite someone</strong><small>Your code: <b className="st-code">{code}</b></small></div>
      </button>
      {open && (
        <div className="st-invite-pop">
          <pre>{message}</pre>
          <small>Your code never changes. Whoever enters it at the tool is added under you.</small>
          <div className="st-invite-actions">
            <button type="button" className={`btn btn-sm ${copied ? 'btn-ghost' : 'btn-green'}`} onClick={copy}>{copied ? '✓ Copied' : 'Copy the message'}</button>
            {typeof navigator !== 'undefined' && 'share' in navigator && <button type="button" className="btn btn-sm btn-ghost" onClick={share}>Share…</button>}
          </div>
        </div>
      )}
    </li>
  );
}
