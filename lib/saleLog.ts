// Registre des ventes (28/11, demandé par un associé) : une ligne « [vente] {...} » dans les journaux Vercel à chaque page
// Stripe créée, paiement confirmé, abandon, mot de passe choisi après paiement et accès gratuit par invitation. Numéro
// d'inscription, montant, dates et identifiant de la session Stripe seulement : ni nom, ni e-mail, ni jeton. La Sentinelle
// de l'associé recopie ces lignes hors de la base, pour qu'une vente ne puisse pas disparaître sans laisser de trace.
type Reg = { reference?: unknown; amount_cents?: unknown; currency?: unknown; program?: unknown; created_at?: unknown; intake_id?: unknown; university_id?: unknown };

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

export function saleLog(step: string, r: Reg, session: unknown, paidAt: unknown = null) {
  try {
    console.log('[vente] ' + JSON.stringify({
      etape: step,
      ref: String(r.reference ?? ''),
      session: String(session ?? '').slice(0, 40),
      montant: Number(r.amount_cents ?? 0),
      devise: String(r.currency ?? ''),
      programme: String(r.program ?? ''),
      session_du: String(r.intake_id ?? ''),
      // École de l'inscription (28/11) : son identifiant, le nom est dans la liste publique des écoles du formulaire.
      ecole_id: String(r.university_id ?? ''),
      inscrite: iso(r.created_at),
      payee: iso(paidAt),
    }));
  } catch {
    // a log line must never break a payment
  }
}

/** Connexions et arrivées dans l'espace (28/11) : les numéros d'inscription payés du compte, son rôle. Ni nom ni e-mail. */
export function memberLog(step: string, refs: string[], role: string) {
  try {
    console.log('[vente] ' + JSON.stringify({ etape: step, ref: refs.join(' '), role }));
  } catch {
    // never break a page
  }
}
