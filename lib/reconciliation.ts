import 'server-only';
import { sql } from './db';

// Rapprochement (28/11, demandé par un associé) : les comptes élèves d'un côté, les inscriptions payées par Stripe et les
// invités de l'autre, et tout ce qui ne colle pas. Lecture seule, affiché dans /admin › Réglages.

export type ReconSummary = {
  eleves: number; ambassadeurs: number; payees_stripe: number; invites: number; payees_autres: number;
  remboursees: number; en_cours: number; comptes_sans_paiement: number; payees_sans_compte: number; payees_plus_tard: number;
};
export type ReconRow = Record<string, string | number | boolean | null>;

const PAID_LIVE = `coalesce(r.payment_id, '') like 'cs\\_live\\_%'`;
const OWN = `(r.user_id = u.id or lower(r.email) = lower(u.email))`;

export async function reconSummary(): Promise<ReconSummary> {
  const [s] = await sql(`
    select
      (select count(*) from users where role = 'student')::int as eleves,
      (select count(*) from users where role = 'ambassador')::int as ambassadeurs,
      (select count(*) from registrations r where r.status = 'paid' and ${PAID_LIVE})::int as payees_stripe,
      (select count(*) from registrations r where r.status = 'paid' and r.payment_id = 'guest')::int as invites,
      (select count(*) from registrations r where r.status = 'paid' and not ${PAID_LIVE} and coalesce(r.payment_id, '') <> 'guest')::int as payees_autres,
      (select count(*) from registrations r where r.status = 'refunded')::int as remboursees,
      (select count(*) from registrations r where r.status = 'held' and r.hold_expires_at > now())::int as en_cours,
      (select count(*) from users u where u.role = 'student'
         and not exists (select 1 from registrations r where ${OWN} and r.status in ('paid', 'refunded')))::int as comptes_sans_paiement,
      (select count(*) from registrations r where r.status = 'paid' and r.user_id is null)::int as payees_sans_compte,
      (select count(*) from registrations r where r.status = 'paid' and ${PAID_LIVE}
         and (r.paid_at at time zone 'Europe/Paris')::date > (r.created_at at time zone 'Europe/Paris')::date)::int as payees_plus_tard
  `);
  return s as unknown as ReconSummary;
}

/** Student accounts with neither a paid registration nor an invitation. */
export async function accountsWithoutPayment(): Promise<ReconRow[]> {
  return (await sql(`
    select u.email, u.first_name, u.last_name, u.created_at, u.last_login_at, (u.password_hash is not null) as mot_de_passe,
      (select string_agg(r.reference || ' ' || r.status, ', ' order by r.created_at desc) from registrations r where ${OWN}) as inscriptions
    from users u
    where u.role = 'student' and not exists (select 1 from registrations r where ${OWN} and r.status in ('paid', 'refunded'))
    order by u.created_at desc limit 200
  `)) as unknown as ReconRow[];
}

/** Registrations marked paid without a live Stripe payment or an invitation. */
export async function paidOtherwise(): Promise<ReconRow[]> {
  return (await sql(`
    select r.reference, r.email, r.first_name, r.last_name, r.created_at, r.paid_at, r.amount_cents, r.currency, r.program,
      coalesce(left(r.payment_id, 12), '(aucun)') as paiement
    from registrations r
    where r.status = 'paid' and not ${PAID_LIVE} and coalesce(r.payment_id, '') <> 'guest'
    order by coalesce(r.paid_at, r.created_at) desc limit 200
  `)) as unknown as ReconRow[];
}

/** Paid by Stripe on a later day than the registration (not in that day's seat counter), last 30 days. */
export async function paidLater(): Promise<ReconRow[]> {
  return (await sql(`
    select r.reference, r.email, r.first_name, r.last_name, r.created_at, r.paid_at, r.amount_cents, r.currency
    from registrations r
    where r.status = 'paid' and ${PAID_LIVE} and r.paid_at > now() - interval '30 days'
      and (r.paid_at at time zone 'Europe/Paris')::date > (r.created_at at time zone 'Europe/Paris')::date
    order by r.paid_at desc limit 200
  `)) as unknown as ReconRow[];
}

/** Last session openings: who signed in, when, and what they paid. */
export async function latestSignIns(): Promise<ReconRow[]> {
  return (await sql(`
    select s.created_at, u.email, u.first_name, u.last_name, u.role,
      (select string_agg(r.reference || ' ' || case when r.payment_id = 'guest' then 'invité' when r.payment_id like 'cs\\_live\\_%' then 'Stripe' else coalesce(left(r.payment_id, 8), 'sans paiement') end
         || ' (' || to_char(coalesce(r.paid_at, r.created_at) at time zone 'Europe/Paris', 'DD/MM HH24:MI') || ')', ', ' order by r.created_at desc)
       from registrations r where ${OWN} and r.status = 'paid') as payee
    from sessions s join users u on u.id = s.user_id
    where u.role <> 'admin'
    order by s.created_at desc limit 40
  `)) as unknown as ReconRow[];
}
