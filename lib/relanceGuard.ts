import 'server-only';
import { sql } from './db';
import { emailConfigured } from './email';
import { stripeMode } from './stripe';
import { sameName } from './nameMatch';

// Garde-fous communs à toutes les relances (23/11). Une relance sert à faire finir la formation (et, à la fin, à
// recueillir un avis) ou à faire payer une inscription commencée : elle ne doit jamais agacer. Un bouton de relance
// n'apparaît dans l'admin que si TOUT ce qui suit est vrai, et chaque condition est relue au moment où le mail part.
//
// Pour tout le monde :
//   - l'envoi d'e-mails et Stripe (clé live) sont réglés, et il est entre 9 h et 22 h à Paris ;
//   - le quota d'envoi n'est pas entamé au point de menacer les mails indispensables (confirmation d'achat, connexion,
//     tickets) : les relances s'arrêtent à RELANCES_PLAFOND_24H mails partis en 24 h, tous types confondus, et tout
//     envoi s'arrête au premier mail que le fournisseur refuse pour quota (nouvel essai, d'un seul mail, 10 min après) ;
//   - la personne n'a aucun ticket (remboursement, plainte, problème d'accès : on ne relance pas quelqu'un qui attend une réponse),
//     reconnu par l'adresse, par la référence de commande ou, quand la relance donne le nom (26/11), par le prénom et le
//     nom tapés dans le ticket : une demande de remboursement envoyée d'une autre adresse, sans référence, compte aussi ;
//   - elle n'a jamais été remboursée, et n'a pas cliqué « ne plus recevoir de rappel » ;
//   - son adresse est valide et aucun mail ne lui est revenu en échec ;
//   - elle n'a pas déjà reçu cette relance.
// Les conditions propres à chaque relance sont dans lib/finishNudge.ts (formation) et lib/payReminder.ts (paiement).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HOURS: [number, number] = [9, 22];
// 23/11 : les relances ont épuisé le quota quotidien du forfait gratuit de Resend (vers 200 mails) et plus aucun mail ne
// partait. Pierre est passé au forfait payant le jour même (plus de limite par jour, un volume par mois) : le plafond
// est relevé de 120 à 600 mails en 24 h, tous types confondus, ce qui laisse le volume du mois aux mails indispensables.
const CEILING_24H = Number(process.env.RELANCES_PLAFOND_24H ?? 600);
export const QUOTA_ERROR = 'quota|rate_limit|too_many|"statusCode":429';

/** How many reminder mails may still leave now without eating into the room kept for the essential mails. */
export async function relanceAllowance(): Promise<number> {
  const [row] = await sql(`select count(*)::int as n from emails where status = 'sent' and created_at > now() - interval '24 hours'`);
  return Math.max(0, CEILING_24H - Number(row?.n ?? 0));
}

/** Whether reminders may leave at all right now. `why` is shown to the admin instead of the buttons. */
export async function relanceOpen(): Promise<{ ok: true } | { ok: false; why: string }> {
  if (!(await emailConfigured())) return { ok: false, why: 'envoi d’e-mails non configuré' };
  if ((await stripeMode()) !== 'live') return { ok: false, why: 'Stripe n’est pas réglé en mode réel : impossible de vérifier les paiements' };
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Paris' }).format(new Date()));
  if (hour < HOURS[0] || hour >= HOURS[1]) return { ok: false, why: `pas de relance entre ${HOURS[1]} h et ${HOURS[0]} h` };
  // The provider refused a mail for quota in the last 10 minutes and none has left since: closed. After that, one mail
  // is tried again, and the send stops at once if it is refused too (quotaHit), so a full quota costs one try per 10 minutes.
  const [quota] = await sql(
    `select 1 from emails e where e.status = 'failed' and e.error ~* $1 and e.created_at > now() - interval '10 minutes'
        and not exists (select 1 from emails s where s.status = 'sent' and s.created_at > e.created_at) limit 1`,
    [QUOTA_ERROR],
  );
  if (quota) return { ok: false, why: 'quota d’envoi du fournisseur d’e-mails atteint' };
  if ((await relanceAllowance()) <= 0) return { ok: false, why: `déjà ${CEILING_24H} mails partis en 24 h : le reste du quota est gardé pour les confirmations et les connexions` };
  return { ok: true };
}

export type Blocked = { why: (email: string, reference?: string, name?: string) => string | null };

/** People no reminder is ever sent to, read in one go for a whole list. */
export async function blockedPeople(): Promise<Blocked> {
  const [tickets, refunded, failed, stops] = await Promise.all([
    sql(`select reference, lower(email) as email, upper(registration_ref) as registration_ref, name from tickets`),
    sql(`select distinct lower(email) as email from registrations where status = 'refunded'`),
    // Only a refusal about the address itself. A quota refusal says nothing about the person.
    sql(`select distinct lower(to_email) as email from emails where status = 'failed' and error ~* 'validation_error|invalid'`),
    sql(`select email from relance_stops`),
  ]);
  const stopSet = new Set(stops.map((r) => String(r.email)));
  const refundedSet = new Set(refunded.map((r) => String(r.email)));
  const failedSet = new Set(failed.map((r) => String(r.email)));
  return {
    why(email, reference, name) {
      const e = email.toLowerCase();
      const ref = (reference ?? '').toUpperCase();
      if (!EMAIL_RE.test(e) || e.endsWith('@no-email.invalid')) return 'adresse e-mail invalide';
      if (refundedSet.has(e)) return 'remboursé';
      if (stopSet.has(e)) return 'a demandé à ne plus être rappelé';
      const t = tickets.find((x) => x.email === e || (ref && x.registration_ref === ref));
      if (t) return `ticket ${t.reference}`;
      const byName = name ? tickets.find((x) => sameName(String(x.name ?? ''), name)) : undefined;
      if (byName) return `ticket ${byName.reference} (même nom, autre adresse)`;
      if (failedSet.has(e)) return 'adresse refusée par le fournisseur d’e-mails';
      return null;
    },
  };
}

/** The same checks for one person, read again from the database right before a mail leaves. */
export async function blockedNow(email: string, reference: string, name?: string): Promise<string | null> {
  const e = email.toLowerCase();
  if (!EMAIL_RE.test(e) || e.endsWith('@no-email.invalid')) return 'adresse e-mail invalide';
  const [row] = await sql(
    `select
       (select reference from tickets t where lower(t.email) = $1 or (t.registration_ref <> '' and upper(t.registration_ref) = $2) limit 1) as ticket,
       exists (select 1 from registrations where lower(email) = $1 and status = 'refunded') as refunded,
       exists (select 1 from relance_stops where email = $1) as stopped,
       exists (select 1 from emails where lower(to_email) = $1 and status = 'failed' and error ~* 'validation_error|invalid') as failed`,
    [e, reference.toUpperCase()],
  );
  if (row?.refunded) return 'remboursé';
  if (row?.stopped) return 'a demandé à ne plus être rappelé';
  if (row?.ticket) return `ticket ${row.ticket}`;
  if (name) {
    const byName = (await sql('select reference, name from tickets')).find((x) => sameName(String(x.name ?? ''), name));
    if (byName) return `ticket ${byName.reference} (même nom, autre adresse)`;
  }
  if (row?.failed) return 'adresse refusée par le fournisseur d’e-mails';
  return null;
}

/** After a mail was refused: true when the provider refused it for quota. The whole send stops at once. */
export async function quotaHit(email: string): Promise<boolean> {
  const [row] = await sql(`select error from emails where lower(to_email) = $1 and status = 'failed' order by created_at desc limit 1`, [email.toLowerCase()]);
  return new RegExp(QUOTA_ERROR, 'i').test(String(row?.error ?? ''));
}
