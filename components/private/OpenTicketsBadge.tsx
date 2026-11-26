import { Suspense } from 'react';
import { sql } from '@/lib/db';

// La pastille rouge de l'onglet Tickets (24/11) : les tickets à traiter, dont les demandes de virement des ambassadeurs.
// Rien ne signalait un nouveau ticket jusque-là (pas de mail à l'admin, pas de compteur).
async function Count() {
  const n = await sql(`select count(*)::int as n from tickets where status = 'open'`).then((r) => Number(r[0]?.n ?? 0), () => 0);
  return n ? <span className="cx-dot" title={`${n} ticket${n > 1 ? 's' : ''} à traiter`} aria-label={`${n} à traiter`}>{n}</span> : null;
}

export default function OpenTicketsBadge() {
  return <Suspense fallback={null}><Count /></Suspense>;
}
