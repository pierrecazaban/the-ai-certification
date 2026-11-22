'use client';

import { useState } from 'react';
import { deleteShortAmbassadorAction } from '@/lib/privateActions';

// Bouton « supprimer » d'un ambassadeur court terme (19/11), pour l'admin. Sans fenêtre du navigateur (22/11) :
// un premier tap le passe en « Delete? » rouge, un second supprime.
export default function DeleteShortButton({ id, name }: { id: number; name: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <form action={deleteShortAmbassadorAction} className="st-del-form"
      onSubmit={(e) => { if (!armed) { e.preventDefault(); setArmed(true); setTimeout(() => setArmed(false), 4000); } }}>
      <input type="hidden" name="smartmail_id" value={id} />
      <button type="submit" className={`st-del${armed ? ' is-armed' : ''}`} aria-label={armed ? `Confirm: delete ${name}` : `Delete ${name}`} title="Delete">
        {armed ? 'Delete?' : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
          </svg>
        )}
      </button>
    </form>
  );
}
