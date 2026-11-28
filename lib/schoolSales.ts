import 'server-only';
import { sql } from './db';

// Ventes par école (28/11, demandé par un associé) : les paiements Stripe réels de chaque école, sur 24 h, 7 jours et
// depuis le début. Lecture seule, affiché dans /admin › Réglages › Rapprochement.
export type SchoolSalesRow = { name: string; jour: number; semaine: number; total: number; euros: number; dernier: string };

export async function salesBySchool(): Promise<SchoolSalesRow[]> {
  return (await sql(`
    select u.name,
      count(*) filter (where r.paid_at > now() - interval '1 day')::int as jour,
      count(*) filter (where r.paid_at > now() - interval '7 days')::int as semaine,
      count(*)::int as total,
      coalesce(sum(coalesce(r.eur_cents, r.amount_cents)), 0)::int as euros,
      max(r.paid_at) as dernier
    from registrations r join universities u on u.id = r.university_id
    where r.status = 'paid' and coalesce(r.payment_id, '') like 'cs\\_live\\_%'
    group by u.name order by total desc, dernier desc limit 200
  `)) as unknown as SchoolSalesRow[];
}
