import 'server-only';
import { sql } from './db';

// Choix d'école (28/11, demandé par un associé) : chaque fois qu'une école est choisie dans la liste du formulaire
// d'inscription, que la personne paie ensuite ou non. L'école et l'heure, rien d'autre : ni nom, ni e-mail, ni adresse IP.
// Gardé 180 jours. Affiché dans /admin › Réglages › Rapprochement, à côté des réservations et des ventes de chaque école.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function noteSchoolChoice(input: { university_id?: unknown; locale?: unknown }) {
  const id = String(input.university_id ?? '');
  if (!UUID_RE.test(id)) return { result: 'invalid' as const };
  const [u] = await sql('select id, name from universities where id = $1 and active', [id]);
  if (!u) return { result: 'invalid' as const };
  await sql('insert into school_choices (university_id, locale) values ($1, $2)', [u.id, String(input.locale ?? '').slice(0, 8)]);
  console.log('[vente] ' + JSON.stringify({ etape: 'ecole-choisie', ecole: String(u.name) }));
  if (Math.random() < 0.01) await sql(`delete from school_choices where at < now() - interval '180 days'`);
  return { result: 'ok' as const };
}

export type SchoolChoiceRow = { name: string; jour: number; semaine: number; dernier: string; reservations: number; payees: number };
export type ChoiceRow = { at: string; name: string };

/** Per school over 7 days: choices in the list, reservations made, live Stripe sales. */
export async function schoolChoicesBySchool(): Promise<SchoolChoiceRow[]> {
  return (await sql(`
    with c as (
      select university_id, count(*) filter (where at > now() - interval '1 day')::int as jour, count(*)::int as semaine, max(at) as dernier
      from school_choices where at > now() - interval '7 days' group by university_id
    )
    select u.name, c.jour, c.semaine, c.dernier,
      (select count(*) from registrations r where r.university_id = u.id and r.created_at > now() - interval '7 days')::int as reservations,
      (select count(*) from registrations r where r.university_id = u.id and r.status = 'paid'
         and coalesce(r.payment_id, '') like 'cs\\_live\\_%' and r.paid_at > now() - interval '7 days')::int as payees
    from c join universities u on u.id = c.university_id
    order by c.semaine desc, c.dernier desc limit 80
  `)) as unknown as SchoolChoiceRow[];
}

export async function latestSchoolChoices(limit = 40): Promise<ChoiceRow[]> {
  return (await sql(
    `select c.at, u.name from school_choices c join universities u on u.id = c.university_id order by c.at desc limit $1`,
    [limit],
  )) as unknown as ChoiceRow[];
}
